import { Hono, type Context } from 'hono';
import {
  HYPE_DAILY_LIMIT,
  HYPE_FORMATS,
  hypeDay,
  rankHype,
  type HypeBoard,
  type HypeReceipt,
} from '../../../packages/shared/src/hype';
import type { Format, Title } from '@animepoodle/shared';
import { browseAniList } from './browse';
import { mediaFields, normalizeMedia, requestAniList } from './anilist';

// The small interface is implemented by D1 in production and SQLite in the local adapter.
export interface HypeStatement {
  bind(...values: unknown[]): HypeStatement;
  first<T>(): Promise<T | null>;
  all<T>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}
export interface HypeDatabase {
  prepare(sql: string): HypeStatement;
  batch<T = unknown>(statements: HypeStatement[]): Promise<T[]>;
}
export interface HypeBindings {
  HYPE_DB?: HypeDatabase;
  HYPE_HASH_SECRET?: string;
  TURNSTILE_SECRET_KEY?: string;
  TURNSTILE_SITE_KEY?: string;
  HYPE_DAILY_VOTE_CAP?: string;
  HYPE_LOCAL_DEV?: string;
}
type Env = { Bindings: HypeBindings };
type Ctx = Context<Env>;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const encoder = new TextEncoder();
const currentYear = () => new Date().getUTCFullYear();
const titleLookups = new Map<string, Promise<Title | undefined>>();
async function verifyTitle(format: Format, anilistId?: number, malId?: number) {
  const key = `${format}:${anilistId ? `ani:${anilistId}` : `mal:${malId}`}`;
  const previous = titleLookups.get(key);
  if (previous) return previous;
  if (titleLookups.size >= 64) throw new Error('Hype title verification busy');
  const lookup = requestAniList(
    `query HypeTitle($id:Int,$idMal:Int,$type:MediaType){Media(id:$id,idMal:$idMal,type:$type,isAdult:false){${mediaFields}}}`,
    {
      id: anilistId,
      idMal: anilistId ? undefined : malId,
      type: ['Anime', 'Donghua'].includes(format) ? 'ANIME' : 'MANGA',
    },
  ).then((data) => (data.data?.Media ? normalizeMedia(data.data.Media) : undefined));
  titleLookups.set(key, lookup);
  try {
    return await lookup;
  } finally {
    titleLookups.delete(key);
  }
}
const local = (c: Ctx) =>
  c.env?.HYPE_LOCAL_DEV === 'true' &&
  ['localhost', '127.0.0.1'].includes(new URL(c.req.url).hostname);
const available = (c: Ctx) =>
  !!c.env?.HYPE_DB &&
  (c.env.HYPE_HASH_SECRET?.length || 0) >= 32 &&
  (local(c) || (!!c.env.TURNSTILE_SECRET_KEY && !!c.env.TURNSTILE_SITE_KEY));
const wallet = (day: string, spent = 0) => ({ day, spent, remaining: HYPE_DAILY_LIMIT - spent });
const cap = (c: Ctx) => Math.max(1, Math.min(5000, Number(c.env?.HYPE_DAILY_VOTE_CAP) || 2000));

// A bounded, per-isolate admission filter precedes database and external requests.
// WAF rate limiting must also guard this path BEFORE Worker invocation in production.
const gates = new Map<string, { until: number; count: number }>();
function admit(key: string, limit: number) {
  const now = Date.now();
  const previous = gates.get(key);
  if (previous && previous.until > now) return ++previous.count <= limit;
  if (gates.size >= 2048) {
    for (const [k, value] of gates) if (value.until <= now) gates.delete(k);
    if (gates.size >= 2048) return false;
  }
  gates.set(key, { until: now + 60000, count: 1 });
  return true;
}
async function digest(c: Ctx, value: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(c.env.HYPE_HASH_SECRET!),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const bytes = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return Array.from(new Uint8Array(bytes), (n) => n.toString(16).padStart(2, '0')).join('');
}
const ip = (c: Ctx) => c.req.header('CF-Connecting-IP') || (local(c) ? 'local' : 'unknown');
const throttled = (c: Ctx) => {
  c.header('Retry-After', '60');
  return c.json({ error: 'Please wait a minute before trying Hype again.' }, 429);
};
const unavailable = (c: Ctx) =>
  c.json(
    { error: 'Hype voting is temporarily unavailable. Your points have not been spent.' },
    503,
  );

const seeds = new Map<string, { until: number; promise: Promise<Title[]> }>();
async function popular(format: Format, year: number) {
  const key = `${year}:${format}`;
  const hit = seeds.get(key);
  if (hit && hit.until > Date.now()) return hit.promise;
  const promise = browseAniList({ format, year, sort: 'POPULARITY_DESC', kinds: [], page: 1 }).then(
    (data) => data.items,
  );
  seeds.set(key, { until: Date.now() + 1800000, promise });
  if (seeds.size > 10) seeds.delete(seeds.keys().next().value!);
  try {
    return await promise;
  } catch (error) {
    seeds.delete(key);
    throw error;
  }
}
interface ScoreRow {
  item_json: string;
  points: number;
}
interface ReceiptRow {
  requested_key: string;
  request_id: string;
  anilist_id: number;
  format: Format;
  points: number;
  spent: number;
}
function receipt(day: string, row: ReceiptRow): HypeReceipt {
  return {
    ...wallet(day, row.spent),
    requestId: row.request_id,
    anilistId: row.anilist_id,
    format: row.format,
    points: row.points,
  };
}
const receiptSql = `SELECT v.requested_key, v.request_id, v.anilist_id, v.format, t.points, w.spent
  FROM hype_votes v JOIN hype_wallets w ON w.day=v.day AND w.voter=v.voter
  JOIN hype_titles t ON t.year=v.year AND t.format=v.format AND t.anilist_id=v.anilist_id
  WHERE v.day=? AND v.voter=? AND v.request_id=?`;

export const hypeApp = new Hono<Env>();
hypeApp.onError((error, c) => {
  if (String(error).includes('HYPE_EXHAUSTED'))
    return c.json(
      {
        error: 'You have used today’s 10 Hype points.',
        code: 'exhausted',
        ...wallet(hypeDay(), 10),
      },
      409,
    );
  if (String(error).includes('HYPE_PAUSED'))
    return c.json(
      { error: 'Hype is taking a break today. Please try again tomorrow.', code: 'paused' },
      429,
    );
  return unavailable(c);
});
hypeApp.use('*', async (c, next) => {
  c.header('Cache-Control', 'no-store');
  try {
    await next();
  } catch (error) {
    if (String(error).includes('HYPE_EXHAUSTED'))
      return c.json(
        {
          error: 'You have used today’s 10 Hype points.',
          code: 'exhausted',
          ...wallet(hypeDay(), 10),
        },
        409,
      );
    if (String(error).includes('HYPE_PAUSED'))
      return c.json(
        { error: 'Hype is taking a break today. Please try again tomorrow.', code: 'paused' },
        429,
      );
    return unavailable(c);
  }
});

hypeApp.get('/', async (c) => {
  const format = c.req.query('format') as Format;
  if (!HYPE_FORMATS.includes(format)) return c.json({ error: 'Choose a valid section.' }, 400);
  const day = hypeDay();
  const year = currentYear();
  // Canonical key ignores arbitrary cache-busting query parameters; never caches wallets.
  const cacheKey = new Request(`${new URL(c.req.url).origin}/api/hype?format=${format}&day=${day}`);
  const edge = (globalThis.caches as (CacheStorage & { default?: Cache }) | undefined)?.default;
  const hit = edge && (await edge.match(cacheKey));
  if (hit) {
    c.header('Cache-Control', hit.headers.get('Cache-Control')!);
    return hit;
  }
  if (!admit(`board:${ip(c)}`, 60)) return throttled(c);
  const [seedResult, scoreResult] = await Promise.allSettled([
    popular(format, year),
    c.env?.HYPE_DB?.prepare(
      'SELECT item_json, points FROM hype_titles WHERE year=? AND format=? AND points>0 ORDER BY points DESC, popularity DESC, anilist_id LIMIT 50',
    )
      .bind(year, format)
      .all<ScoreRow>(),
  ]);
  const seed = seedResult.status === 'fulfilled' ? seedResult.value : [];
  const scores = scoreResult.status === 'fulfilled' ? scoreResult.value?.results || [] : [];
  if (!seed.length && !scores.length && seedResult.status === 'rejected') return unavailable(c);
  const entries = rankHype([
    ...scores.map((row) => ({ item: JSON.parse(row.item_json) as Title, points: row.points })),
    ...seed.map((item) => ({ item, points: 0 })),
  ]).slice(0, 50);
  const data: HypeBoard = {
    year,
    day,
    format,
    votingAvailable: available(c) && scoreResult.status === 'fulfilled',
    siteKey: local(c) ? null : c.env?.TURNSTILE_SITE_KEY || null,
    entries,
    mode: scores.length ? 'hype' : 'popular',
    fetchedAt: new Date().toISOString(),
  };
  const response = Response.json(data, {
    headers: { 'Cache-Control': 'public, max-age=30, s-maxage=60' },
  });
  c.header('Cache-Control', 'public, max-age=30, s-maxage=60');
  if (edge) c.executionCtx.waitUntil(edge.put(cacheKey, response.clone()));
  return response;
});

hypeApp.get('/wallet', async (c) => {
  if (!available(c)) return unavailable(c);
  const id = c.req.header('X-Hype-Voter') || '';
  if (!uuid.test(id)) return c.json({ error: 'Invalid browser identity.' }, 400);
  if (!admit(`wallet:${ip(c)}`, 30)) return throttled(c);
  const voter = await digest(c, `voter:${id}`);
  const day = hypeDay();
  const row = await c.env
    .HYPE_DB!.prepare('SELECT spent FROM hype_wallets WHERE day=? AND voter=?')
    .bind(day, voter)
    .first<{ spent: number }>();
  return c.json(wallet(day, row?.spent));
});

async function smallJson(request: Request): Promise<Record<string, unknown> | null> {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))
    return null;
  if (Number(request.headers.get('content-length')) > 4096) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 4096) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.byteLength;
  }
  try {
    const data = JSON.parse(new TextDecoder().decode(bytes));
    return data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

hypeApp.post('/vote', async (c) => {
  if (!available(c)) return unavailable(c);
  const origin = c.req.header('Origin');
  if (origin !== new URL(c.req.url).origin && !(local(c) && origin === 'http://localhost:3000'))
    return c.json({ error: 'Vote from the site itself.' }, 403);
  if (!admit(`vote:${ip(c)}`, 15)) return throttled(c);
  const body = await smallJson(c.req.raw);
  const validId = (n: unknown) =>
    n === undefined ||
    (typeof n === 'number' && Number.isSafeInteger(n) && n > 0 && n <= 2147483647);
  if (
    !body ||
    !uuid.test(String(body.voterId)) ||
    !uuid.test(String(body.requestId)) ||
    !HYPE_FORMATS.includes(body.format as Format) ||
    !validId(body.anilistId) ||
    !validId(body.malId) ||
    (!body.anilistId && !body.malId)
  )
    return c.json({ error: 'Invalid Hype request.' }, 400);
  const day = hypeDay();
  const year = currentYear();
  const format = body.format as Format;
  const voter = await digest(c, `voter:${body.voterId}`);
  const ipBucket = await digest(c, `ip:${day}:${ip(c)}`);
  const db = c.env.HYPE_DB!;
  const requestedKey = `${format}:${body.anilistId ? `ani:${body.anilistId}` : `mal:${body.malId}`}`;
  const previous = await db
    .prepare(receiptSql)
    .bind(day, voter, body.requestId)
    .first<ReceiptRow>();
  if (previous)
    return previous.requested_key === requestedKey
      ? c.json(receipt(day, previous))
      : c.json({ error: 'This request was already used for another title.' }, 409);
  const state = await db
    .prepare('SELECT spent FROM hype_wallets WHERE day=? AND voter=?')
    .bind(day, voter)
    .first<{ spent: number }>();
  if ((state?.spent || 0) >= HYPE_DAILY_LIMIT)
    return c.json(
      { error: 'You have used today’s 10 Hype points.', code: 'exhausted', ...wallet(day, 10) },
      409,
    );
  const budget = await db
    .prepare("SELECT bucket, used FROM hype_budgets WHERE day=? AND bucket IN ('global', ?)")
    .bind(day, ipBucket)
    .all<{ bucket: string; used: number }>();
  if (budget.results.some((row) => row.used >= (row.bucket === 'global' ? cap(c) : 100)))
    return c.json(
      { error: 'Hype is taking a break today. Please try again tomorrow.', code: 'paused' },
      429,
    );
  if (!local(c)) {
    if (
      typeof body.turnstileToken !== 'string' ||
      body.turnstileToken.length < 1 ||
      body.turnstileToken.length > 2048
    )
      return c.json({ error: 'Complete the verification to send Hype.' }, 403);
    const verified = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(6000),
      body: JSON.stringify({
        secret: c.env.TURNSTILE_SECRET_KEY,
        response: body.turnstileToken,
        remoteip: ip(c),
        idempotency_key: body.requestId,
      }),
    });
    const result = (await verified.json()) as {
      success?: boolean;
      hostname?: string;
      action?: string;
    };
    if (
      !result.success ||
      result.hostname !== new URL(c.req.url).hostname ||
      result.action !== 'hype'
    )
      return c.json({ error: 'Verification expired. Please try again.' }, 403);
  }
  // Only a new title needs provider verification. Never trust client-supplied names/scores.
  const known = await db
    .prepare(
      body.anilistId
        ? 'SELECT item_json FROM hype_titles WHERE year=? AND format=? AND anilist_id=?'
        : "SELECT item_json FROM hype_titles WHERE year=? AND format=? AND json_extract(item_json, '$.malId')=?",
    )
    .bind(year, format, body.anilistId || body.malId)
    .first<{ item_json: string }>();
  let item: Title | undefined = known ? JSON.parse(known.item_json) : undefined;
  if (!item) {
    item = await verifyTitle(
      format,
      body.anilistId as number | undefined,
      body.malId as number | undefined,
    );
  }
  if (!item?.anilistId || item.format !== format)
    return c.json({ error: 'This title could not be verified for this section.' }, 400);
  const canonical = item.anilistId;
  const results = await db.batch<{ results: ReceiptRow[] }>([
    db
      .prepare(
        'INSERT INTO hype_titles(year, format, anilist_id, item_json, popularity) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING',
      )
      .bind(year, format, canonical, JSON.stringify(item), item.popularity || 0),
    db
      .prepare('INSERT INTO hype_wallets(day, voter) VALUES (?, ?) ON CONFLICT DO NOTHING')
      .bind(day, voter),
    db
      .prepare(
        'INSERT INTO hype_votes(day, voter, request_id, requested_key, year, format, anilist_id, ip_bucket, daily_cap) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING',
      )
      .bind(day, voter, body.requestId, requestedKey, year, format, canonical, ipBucket, cap(c)),
    db.prepare(receiptSql).bind(day, voter, body.requestId),
  ]);
  const row = results[3].results[0];
  if (!row || row.requested_key !== requestedKey)
    return c.json({ error: 'This request was already used for another title.' }, 409);
  return c.json(receipt(day, row));
});
