import { Hono } from 'hono';
import {
  mangaDexId,
  type ChapterIndexResponse,
  type ChapterInfo,
  type ChapterListResponse,
  type ChapterPagesResponse,
  type ChapterUpdatesResponse,
  type MediaDetails,
  type ReadingSeries,
  type Title,
} from '@animepoodle/shared';
import { CatalogError, featuresFor } from './anilist.js';

/**
 * MangaDex reading. MangaDex sends no CORS headers and breaks hotlinked images, so every
 * call and page image goes through here. Rules: https://api.mangadex.org/docs/2-limitations/
 */
const API = 'https://api.mangadex.org';
const USER_AGENT = 'animepoodle/1.0 (+https://github.com/Phantom-Con-Artist/animepoodle)';
const ratings = 'contentRating[]=safe&contentRating[]=suggestive';

// About 5 requests/second per IP is allowed; stay under it per isolate and back off on 429.
let nextSlot = 0;
let cooldownUntil = 0;
async function md<T>(path: string): Promise<T> {
  const now = Date.now();
  if (cooldownUntil > now)
    throw new CatalogError(
      'MangaDex asked us to slow down. Please try again in a minute.',
      429,
      Math.ceil((cooldownUntil - now) / 1000),
    );
  const wait = Math.max(0, nextSlot - now);
  if (wait > 4000) throw new CatalogError('Reading is busy right now. Please try again shortly.');
  nextSlot = Math.max(now, nextSlot) + 250;
  if (wait) await new Promise((r) => setTimeout(r, wait));
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new CatalogError('MangaDex is unreachable right now. Please try again shortly.');
  }
  if (res.status === 429) {
    const reset = Number(res.headers.get('X-RateLimit-Retry-After'));
    cooldownUntil = reset > 1e9 ? reset * 1000 : Date.now() + 60000;
    throw new CatalogError('MangaDex asked us to slow down. Please try again in a minute.', 429);
  }
  if (res.status === 404) throw new CatalogError('MangaDex doesn’t have that chapter.', 404);
  if (!res.ok) throw new CatalogError('MangaDex is unavailable right now.');
  return (await res.json()) as T;
}

function memo<T>(ttl: number, limit = 300) {
  const cache = new Map<string, { at: number; value: T }>();
  const pending = new Map<string, Promise<T>>();
  return async (key: string, work: () => Promise<T>) => {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ttl) return hit.value;
    const active = pending.get(key);
    if (active) return active;
    const run = work().then((value) => {
      if (cache.size >= limit) cache.delete(cache.keys().next().value!);
      cache.set(key, { at: Date.now(), value });
      return value;
    });
    pending.set(key, run);
    try {
      return await run;
    } finally {
      pending.delete(key);
    }
  };
}

interface MdRelationship {
  id: string;
  type: string;
  attributes?: { name?: string };
}
interface MdChapter {
  id: string;
  attributes: {
    chapter: string | null;
    volume: string | null;
    title: string | null;
    translatedLanguage: string;
    pages: number;
    externalUrl: string | null;
    readableAt: string;
  };
  relationships: MdRelationship[];
}
interface MdManga {
  id: string;
  attributes: {
    title: Record<string, string>;
    altTitles?: Record<string, string>[];
    links: Record<string, string> | null;
    availableTranslatedLanguages: (string | null)[];
    description?: Record<string, string>;
    originalLanguage?: string;
    status?: string;
    year?: number | null;
    lastChapter?: string | null;
    tags?: { attributes: { name: Record<string, string>; group: string } }[];
  };
  relationships?: { id: string; type: string; attributes?: { fileName?: string } }[];
}
const httpsLink = (url: string | undefined) => {
  try {
    return url && new URL(url).protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
};
export function toChapter(c: MdChapter): ChapterInfo {
  const a = c.attributes;
  return {
    id: c.id,
    chapter: a.chapter,
    volume: a.volume,
    title: a.title || null,
    language: a.translatedLanguage,
    pages: a.pages,
    externalUrl: httpsLink(a.externalUrl || undefined),
    readableAt: a.readableAt,
    groups: c.relationships
      .filter((r) => r.type === 'scanlation_group' && r.attributes?.name)
      .map((r) => r.attributes!.name!),
    groupIds: c.relationships.filter((r) => r.type === 'scanlation_group').map((r) => r.id),
  };
}

const seriesMemo = memo<ReadingSeries | null>(6 * 3600000, 500);
/** The MangaDex entry whose AniList or MAL link matches. Titles only narrow the search. */
export function findSeries(
  anilistId: number | undefined,
  malId: number | undefined,
  titles: string[],
) {
  return seriesMemo(`${anilistId || ''}:${malId || ''}`, async () => {
    for (const title of titles.slice(0, 3)) {
      const data = await md<{ data: MdManga[] }>(
        `/manga?title=${encodeURIComponent(title)}&limit=10&${ratings}&order[relevance]=desc`,
      );
      const match = data.data.find(
        (m) =>
          (anilistId && m.attributes.links?.al === String(anilistId)) ||
          (malId && m.attributes.links?.mal === String(malId)),
      );
      if (match) return toSeries(match);
    }
    return null;
  });
}
function toSeries(match: MdManga): ReadingSeries {
  const a = match.attributes;
  const official = [
    ['engtl', 'Official English release'],
    ['raw', 'Original publisher'],
  ]
    .map(([key, label]) => ({ label, url: httpsLink(a.links?.[key]) }))
    .filter((l): l is { label: string; url: string } => !!l.url);
  return {
    id: match.id,
    title: a.title.en || Object.values(a.title)[0] || 'Untitled',
    languages: a.availableTranslatedLanguages.filter((l): l is string => !!l).sort(),
    official,
    url: `https://mangadex.org/title/${match.id}`,
  };
}
const byIdMemo = memo<MdManga>(3600000, 500);
const mangaById = (id: string) =>
  byIdMemo(id, async () => (await md<{ data: MdManga }>(`/manga/${id}?includes[]=cover_art`)).data);

/* MangaDex as a catalog: series AniList doesn't list, and the latest uploads. */
const languagesFor: Record<string, string[]> = {
  Manga: ['ja'],
  Manhwa: ['ko'],
  Manhua: ['zh', 'zh-hk'],
};
const formatFor = (lang?: string): Title['format'] =>
  lang === 'ko' ? 'Manhwa' : lang === 'zh' || lang === 'zh-hk' ? 'Manhua' : 'Manga';
const statusFor: Record<string, Title['status']> = {
  ongoing: 'RELEASING',
  completed: 'FINISHED',
  hiatus: 'HIATUS',
  cancelled: 'CANCELLED',
};
const plain = (text: string) =>
  text
    .split(/\n-{3,}|\n\*\*\*/)[0]
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*_#>]+/g, '')
    .trim();
// A stable negative number from the UUID, far below AniList's range, for Title.id.
const numericId = (uuid: string) =>
  -(1e13 + (parseInt(uuid.replace(/-/g, '').slice(0, 11), 16) % 1e12));
// Covers are shown by plain <img> anywhere in the app, so they carry the API's own origin.
let publicOrigin = '';
export const setPublicOrigin = (origin: string) => {
  publicOrigin ||= origin;
};
/**
 * Removal requests: MangaDex group, series or chapter IDs from READ_BLOCKLIST (comma or
 * space separated). Anything listed disappears from lists, search and the reader.
 */
let blockSource = '';
let blocklist = new Set<string>();
export function setBlocklist(value: string | undefined) {
  if ((value || '') === blockSource) return;
  blockSource = value || '';
  blocklist = new Set(blockSource.split(/[\s,]+/).filter(mangaDexId));
}
export const isBlocked = (...ids: (string | undefined)[]) =>
  blocklist.size > 0 && ids.some((id) => !!id && blocklist.has(id));
const chapterBlocked = (c: ChapterInfo, mangaId?: string) =>
  isBlocked(c.id, mangaId, ...(c.groupIds || []));
const visibleTitles = (items: Title[]) => items.filter((t) => !isBlocked(t.mangadexId));
export const coverUrl = (mangaId: string, file: string) =>
  `${publicOrigin}/api/read/cover?u=${encodeURIComponent(`https://uploads.mangadex.org/covers/${mangaId}/${file}.512.jpg`)}`;

export function mangaDexTitle(m: MdManga): Title {
  const a = m.attributes;
  const al = Number(a.links?.al) || undefined;
  const mal = Number(a.links?.mal) || undefined;
  const alt = (lang: string) => a.altTitles?.find((t) => t[lang])?.[lang];
  const original = a.originalLanguage || 'ja';
  const english = a.title.en || alt('en') || null;
  const romaji = a.title[`${original}-ro`] || alt(`${original}-ro`) || null;
  const native = a.title[original] || alt(original) || null;
  const name = english || romaji || native || Object.values(a.title)[0] || 'Untitled';
  const tags = a.tags || [];
  const genres = tags
    .filter((t) => t.attributes.group === 'genre')
    .map((t) => t.attributes.name.en);
  const cover = m.relationships?.find((r) => r.type === 'cover_art')?.attributes?.fileName;
  const format = formatFor(original);
  return {
    id: mal || (al ? -al : numericId(m.id)),
    anilistId: al,
    malId: mal,
    mangadexId: m.id,
    source: 'MangaDex',
    trailer: null,
    bannerImage: null,
    mediaFormat: tags.some((t) => t.attributes.name.en === 'Oneshot') ? 'ONE_SHOT' : 'MANGA',
    status: statusFor[a.status || ''],
    origin: original.toUpperCase().slice(0, 2),
    title: name,
    original: native || romaji || name,
    titles: { english, romaji, native },
    format,
    year: a.year || 0,
    rating: 0,
    episodes: a.lastChapter ? `${a.lastChapter} chapters` : a.status === 'ongoing' ? 'Ongoing' : '',
    genres,
    tags: tags
      .filter((t) => t.attributes.group === 'theme')
      .slice(0, 20)
      .map((t) => ({ name: t.attributes.name.en, rank: 60 })),
    description: plain(a.description?.en || Object.values(a.description || {})[0] || ''),
    image: cover ? coverUrl(m.id, cover) : '',
    color: '#c8c3e6',
    features: featuresFor(genres),
  };
}
const listQuery = (format: string) =>
  `limit=32&includes[]=cover_art&${ratings}&hasAvailableChapters=true&${(languagesFor[format] || []).map((l) => `originalLanguage[]=${l}`).join('&')}`;
const doujinshi = (m: MdManga) =>
  m.attributes.tags?.some((t) => t.attributes.name.en === 'Doujinshi');

const searchMemo = memo<Title[]>(600000);
/** Series only MangaDex has (no AniList or MAL link), for search to add after AniList's. */
export async function searchMangaDex(q: string, format: string) {
  return visibleTitles(await searchTitles(q, format));
}
function searchTitles(q: string, format: string) {
  return searchMemo(`${format}:${q.toLowerCase()}`, async () => {
    if (!languagesFor[format]) return [];
    const data = await md<{ data: MdManga[] }>(
      `/manga?title=${encodeURIComponent(q)}&${listQuery(format)}&order[relevance]=desc`,
    );
    return data.data
      .filter((m) => !m.attributes.links?.al && !m.attributes.links?.mal)
      .map(mangaDexTitle)
      .filter((t) => t.image);
  });
}
const latestMemo = memo<Title[]>(600000);
/** Series with the newest uploads in a language, for the Home rail. */
export async function latestMangaDex(format: string, language: string) {
  return visibleTitles(await latestTitles(format, language));
}
function latestTitles(format: string, language: string) {
  return latestMemo(`${format}:${language}`, async () => {
    const data = await md<{ data: MdManga[] }>(
      `/manga?${listQuery(format)}&availableTranslatedLanguage[]=${language}&order[latestUploadedChapter]=desc`,
    );
    return data.data
      .filter((m) => !doujinshi(m))
      .map(mangaDexTitle)
      .filter((t) => t.image)
      .slice(0, 24);
  });
}

const feedMemo = memo<ChapterListResponse>(300000);
export function chapterList(mangaId: string, language: string, offset: number) {
  return feedMemo(`${mangaId}:${language}:${offset}`, async () => {
    const data = await md<{ data: MdChapter[]; total: number; offset: number; limit: number }>(
      `/manga/${mangaId}/feed?translatedLanguage[]=${language}&order[volume]=desc&order[chapter]=desc&limit=100&offset=${offset}&includes[]=scanlation_group&${ratings}&includeFuturePublishAt=0`,
    );
    return { chapters: data.data.map(toChapter), total: data.total, offset, limit: 100 };
  });
}

const chapterNumber = (value: string | null) => {
  const n = Number(value);
  return value !== null && Number.isFinite(n) ? n : Number.POSITIVE_INFINITY;
};
const indexMemo = memo<ChapterIndexResponse>(300000);
/** Every chapter in one request, oldest first. */
export function chapterIndex(mangaId: string, language: string) {
  return indexMemo(`${mangaId}:${language}`, async () => {
    const data = await md<{
      volumes: Record<
        string,
        { volume: string; chapters: Record<string, { chapter: string; id: string }> }
      >;
    }>(`/manga/${mangaId}/aggregate?translatedLanguage[]=${language}`);
    const chapters = Object.values(data.volumes || {}).flatMap((v) =>
      Object.values(v.chapters || {}).map((c) => ({
        id: c.id,
        chapter: c.chapter === 'none' ? null : c.chapter,
        volume: v.volume === 'none' ? null : v.volume,
      })),
    );
    chapters.sort(
      (a, b) =>
        chapterNumber(a.chapter) - chapterNumber(b.chapter) ||
        chapterNumber(a.volume) - chapterNumber(b.volume),
    );
    return { chapters };
  });
}

const pagesMemo = memo<ChapterPagesResponse>(600000);
export function chapterPages(chapterId: string, quality: 'data' | 'data-saver') {
  return pagesMemo(`${chapterId}:${quality}`, async () => {
    const [info, server] = await Promise.all([
      md<{ data: MdChapter }>(`/chapter/${chapterId}?includes[]=scanlation_group`),
      md<{ baseUrl: string; chapter: { hash: string; data: string[]; dataSaver: string[] } }>(
        `/at-home/server/${chapterId}`,
      ).catch((error) => error as Error),
    ]);
    const chapter = toChapter(info.data);
    const mangaId = info.data.relationships.find((r) => r.type === 'manga')?.id || '';
    // Official chapters hosted by the publisher have no pages here, only their link.
    if (server instanceof Error) {
      if (chapter.externalUrl) return { chapter, mangaId, quality, pages: [] };
      throw server;
    }
    const files = quality === 'data' ? server.chapter.data : server.chapter.dataSaver;
    return {
      chapter,
      mangaId,
      quality,
      pages: files.map(
        (file) =>
          `/api/read/page?u=${encodeURIComponent(`${server.baseUrl}/${quality}/${server.chapter.hash}/${file}`)}`,
      ),
    };
  });
}

const pagePattern =
  /^(?:\/[A-Za-z0-9_-]+)*\/(data|data-saver)\/([0-9a-f]{32})\/([A-Za-z0-9._-]{1,200}\.(?:jpe?g|png|gif|webp))$/;
/** Only MangaDex chapter images pass, so this can't become an open proxy. */
export function parsePageUrl(raw: string | undefined) {
  try {
    const url = new URL(raw || '');
    const host = url.hostname;
    if (url.protocol !== 'https:' || url.search || url.username || url.password) return null;
    if (
      host !== 'uploads.mangadex.org' &&
      !/^[a-z0-9-]+(\.[a-z0-9-]+)*\.mangadex\.network$/.test(host)
    )
      return null;
    const m = url.pathname.match(pagePattern);
    if (!m) return null;
    return {
      url: url.toString(),
      host,
      cacheKey: `https://animepoodle.page/${m[1]}/${m[2]}/${m[3]}`,
    };
  } catch {
    return null;
  }
}

const coverPattern =
  /^\/covers\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(?:jpe?g|png|gif|webp)(?:\.(?:256|512)\.jpg)?$/;
export function parseCoverUrl(raw: string | undefined) {
  try {
    const url = new URL(raw || '');
    if (url.protocol !== 'https:' || url.hostname !== 'uploads.mangadex.org' || url.search)
      return null;
    return coverPattern.test(url.pathname)
      ? { url: url.toString(), host: url.hostname, cacheKey: url.toString() }
      : null;
  } catch {
    return null;
  }
}

const updatesMemo = memo<ChapterUpdatesResponse>(600000);
/**
 * New chapters since `since`. Two requests find which series uploaded anything at all;
 * only those (up to 10) are checked in the reader's language.
 */
export function chapterUpdates(ids: string[], language: string, since: Date) {
  const sinceText = since.toISOString().slice(0, 19);
  const key = `${[...ids].sort().join(',')}:${language}:${sinceText.slice(0, 13)}`;
  return updatesMemo(key, async () => {
    const manga = await md<{
      data: { id: string; attributes: { latestUploadedChapter?: string } }[];
    }>(`/manga?${ids.map((id) => `ids[]=${id}`).join('&')}&limit=100&${ratings}`);
    const latest = new Map(
      manga.data
        .filter((m) => mangaDexId(m.attributes.latestUploadedChapter))
        .map((m) => [m.attributes.latestUploadedChapter!, m.id]),
    );
    if (!latest.size) return { updates: [], checkedAt: new Date().toISOString() };
    const chapters = await md<{ data: MdChapter[] }>(
      `/chapter?${[...latest.keys()].map((id) => `ids[]=${id}`).join('&')}&limit=100&${ratings}&includeFuturePublishAt=0`,
    );
    const changed = chapters.data
      .filter((c) => new Date(c.attributes.readableAt) > since)
      .map((c) => latest.get(c.id)!)
      .filter(Boolean)
      .slice(0, 10);
    const updates = await Promise.all(
      changed.map(async (mangaId) => {
        const feed = await md<{ data: MdChapter[]; total: number }>(
          `/manga/${mangaId}/feed?translatedLanguage[]=${language}&publishAtSince=${sinceText}&order[readableAt]=desc&limit=1&includes[]=scanlation_group&${ratings}&includeFuturePublishAt=0`,
        );
        return feed.data[0]
          ? { mangaId, count: feed.total, latest: toChapter(feed.data[0]) }
          : null;
      }),
    );
    return {
      updates: updates.filter((u): u is NonNullable<typeof u> => !!u),
      checkedAt: new Date().toISOString(),
    };
  });
}

type Ctx = { waitUntil?: (p: Promise<unknown>) => void };
const later = (ctx: Ctx | undefined, work: Promise<unknown>) => {
  if (ctx?.waitUntil) ctx.waitUntil(work.catch(() => {}));
  else work.catch(() => {});
};
const edgeCache = () => (globalThis as unknown as { caches?: { default?: Cache } }).caches?.default;

const language = (value: string | undefined) =>
  value && /^[a-z]{2,3}(-[a-z]{2,4})?$/.test(value) ? value : null;
const fail = (error: unknown) => {
  if (error instanceof CatalogError)
    return Response.json(
      { error: error.message },
      {
        status: error.status,
        headers: error.status === 429 ? { 'Retry-After': String(error.retryAfter) } : {},
      },
    );
  return Response.json({ error: 'Reading is unavailable right now.' }, { status: 503 });
};
const cached = (data: unknown, seconds: number) =>
  Response.json(data, {
    headers: { 'Cache-Control': `public, max-age=${Math.min(seconds, 300)}, s-maxage=${seconds}` },
  });

export const readApp = new Hono();
readApp.get('/series', async (c) => {
  const id = (name: string) => {
    const raw = c.req.query(name);
    return raw && /^[1-9]\d{0,9}$/.test(raw) ? Number(raw) : undefined;
  };
  const anilist = id('anilist');
  const mal = id('mal');
  const titles = c.req
    .queries('title')
    ?.map((t) => t.trim().slice(0, 120))
    .filter((t) => t.length >= 1);
  const direct = c.req.query('md');
  if (mangaDexId(direct)) {
    try {
      return cached(
        { series: isBlocked(direct!) ? null : toSeries(await mangaById(direct!)) },
        21600,
      );
    } catch (error) {
      return fail(error);
    }
  }
  if ((!anilist && !mal) || !titles?.length)
    return c.json({ error: 'A title and an AniList or MAL ID are needed.' }, 400);
  try {
    const series = await findSeries(anilist, mal, titles);
    return cached({ series: series && !isBlocked(series.id) ? series : null }, 21600);
  } catch (error) {
    return fail(error);
  }
});
readApp.get('/chapters/:id', async (c) => {
  const id = c.req.param('id');
  const lang = language(c.req.query('lang'));
  const offset = Number(c.req.query('offset') || 0);
  if (!mangaDexId(id) || !lang || !Number.isInteger(offset) || offset < 0 || offset > 9900)
    return c.json({ error: 'Invalid chapter list request.' }, 400);
  try {
    if (isBlocked(id)) return cached({ chapters: [], total: 0, offset, limit: 100 }, 300);
    const list = await chapterList(id, lang, offset);
    const chapters = list.chapters.filter((ch) => !chapterBlocked(ch));
    return cached(
      { ...list, chapters, total: list.total - (list.chapters.length - chapters.length) },
      300,
    );
  } catch (error) {
    return fail(error);
  }
});
readApp.get('/index/:id', async (c) => {
  const id = c.req.param('id');
  const lang = language(c.req.query('lang'));
  if (!mangaDexId(id) || !lang) return c.json({ error: 'Invalid chapter index request.' }, 400);
  try {
    if (isBlocked(id)) return cached({ chapters: [] }, 300);
    const index = await chapterIndex(id, lang);
    return cached({ chapters: index.chapters.filter((ch) => !isBlocked(ch.id)) }, 300);
  } catch (error) {
    return fail(error);
  }
});
readApp.get('/pages/:id', async (c) => {
  const id = c.req.param('id');
  const quality = c.req.query('quality') === 'data' ? 'data' : 'data-saver';
  if (!mangaDexId(id)) return c.json({ error: 'Invalid chapter.' }, 400);
  try {
    // Page server addresses expire after about 15 minutes, so browsers keep these briefly.
    if (isBlocked(id))
      return c.json(
        { error: 'This chapter was removed at the request of its translators or owners.' },
        451,
      );
    const data = await chapterPages(id, quality);
    if (chapterBlocked(data.chapter, data.mangaId))
      return c.json(
        { error: 'This chapter was removed at the request of its translators or owners.' },
        451,
      );
    return c.json(data, { headers: { 'Cache-Control': 'private, max-age=300' } });
  } catch (error) {
    return fail(error);
  }
});
readApp.get('/updates', async (c) => {
  const ids = (c.req.query('ids') || '').split(',').filter(Boolean);
  const lang = language(c.req.query('lang'));
  const since = new Date(c.req.query('since') || '');
  if (!ids.length || ids.length > 50 || !ids.every(mangaDexId) || !lang || isNaN(+since))
    return c.json({ error: 'Invalid update check.' }, 400);
  const floor = Date.now() - 30 * 86400000;
  try {
    const data = await chapterUpdates(ids, lang, new Date(Math.max(+since, floor)));
    return cached(
      { ...data, updates: data.updates.filter((u) => !chapterBlocked(u.latest, u.mangaId)) },
      600,
    );
  } catch (error) {
    return fail(error);
  }
});
async function proxyImage(
  c: {
    executionCtx: unknown;
    json: (data: unknown, status?: number, headers?: Record<string, string>) => Response;
  },
  page: { url: string; host: string; cacheKey: string },
) {
  let ctx: Ctx | undefined;
  try {
    ctx = c.executionCtx as Ctx;
  } catch {}
  const cache = edgeCache();
  const key = new Request(page.cacheKey);
  const hit = await cache?.match(key);
  if (hit) return hit;
  const started = Date.now();
  let res: Response | null = null;
  let body: ArrayBuffer | null = null;
  try {
    res = await fetch(page.url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(20000),
    });
    if (res.ok) body = await res.arrayBuffer();
  } catch {}
  // MangaDex@Home nodes need to hear how each image went, success or not.
  if (!page.host.endsWith('mangadex.org'))
    later(
      ctx,
      fetch('https://api.mangadex.network/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
        body: JSON.stringify({
          url: page.url,
          success: !!body,
          cached: (res?.headers.get('X-Cache') || '').startsWith('HIT'),
          bytes: body?.byteLength || 0,
          duration: Date.now() - started,
        }),
      }),
    );
  if (!res || !body)
    return c.json({ error: 'This image didn’t load. Try again.' }, 502, {
      'Cache-Control': 'no-store',
    });
  const type = res.headers.get('Content-Type') || 'image/jpeg';
  const out = new Response(body, {
    headers: {
      'Content-Type': type.startsWith('image/') ? type : 'image/jpeg',
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
  if (cache) later(ctx, cache.put(key, out.clone()));
  return out;
}
readApp.get('/page', async (c) => {
  const page = parsePageUrl(c.req.query('u'));
  if (!page) return c.json({ error: 'Not a MangaDex page.' }, 400);
  return proxyImage(c, page);
});
readApp.get('/cover', async (c) => {
  const cover = parseCoverUrl(c.req.query('u'));
  if (!cover) return c.json({ error: 'Not a MangaDex cover.' }, 400);
  return proxyImage(c, cover);
});
readApp.get('/latest', async (c) => {
  const format = c.req.query('format') || '';
  const lang = language(c.req.query('lang')) || 'en';
  if (!languagesFor[format]) return c.json({ error: 'Pick a reading section.' }, 400);
  try {
    return cached({ items: await latestMangaDex(format, lang), source: 'MangaDex' }, 600);
  } catch (error) {
    return fail(error);
  }
});
readApp.get('/title/:id', async (c) => {
  const id = c.req.param('id');
  if (!mangaDexId(id)) return c.json({ error: 'Invalid MangaDex ID.' }, 400);
  try {
    if (isBlocked(id)) return c.json({ error: 'This series isn’t available here.' }, 404);
    const media = mangaDexTitle(await mangaById(id));
    const details: MediaDetails = {
      anilistId: 0,
      malId: null,
      url: `https://mangadex.org/title/${id}`,
      trailer: null,
      reviews: [],
      pageInfo: { currentPage: 1, hasNextPage: false },
      media,
    };
    return cached(details, 3600);
  } catch (error) {
    return fail(error);
  }
});
