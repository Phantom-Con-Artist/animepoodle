import { CatalogError } from './anilist';
const agent = 'animepoodle/1.0 (https://github.com/Phantom-Con-Artist/animepoodle)';
/** Bounded warm-instance cache, request coalescing, pacing and provider cooldowns. */
export function createProviderClient(name: string, base: string, ttl: number, spacing = 0) {
  const cache = new Map<string, { at: number; data: unknown }>();
  const pending = new Map<string, Promise<unknown>>();
  let cooldown = 0;
  let queue = Promise.resolve();
  let lastStart = 0;
  return async function request<T>(path: string): Promise<T> {
    const hit = cache.get(path);
    if (hit && Date.now() - hit.at < ttl) return hit.data as T;
    const active = pending.get(path);
    if (active) return active as Promise<T>;
    const run = async () => {
      if (cooldown > Date.now())
        throw new CatalogError(
          `${name} is taking a short break. Please try again shortly.`,
          429,
          Math.ceil((cooldown - Date.now()) / 1000),
        );
      const delay = lastStart + spacing - Date.now();
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      lastStart = Date.now();
      let res: Response;
      try {
        res = await fetch(`${base}${path}`, {
          headers: { Accept: 'application/json', 'User-Agent': agent },
          signal: AbortSignal.timeout(7000),
        });
      } catch {
        throw new CatalogError(`${name} is unavailable right now. Please try again shortly.`);
      }
      if (res.status === 429) {
        const retry = Math.min(300, Math.max(1, Number(res.headers.get('Retry-After')) || 60));
        cooldown = Date.now() + retry * 1000;
        throw new CatalogError(
          `${name} is taking a short break. Please try again shortly.`,
          429,
          retry,
        );
      }
      if (res.status === 404)
        throw new CatalogError(`No ${name} entry is available for this story.`, 404);
      if (!res.ok || !res.headers.get('content-type')?.includes('application/json'))
        throw new CatalogError(`${name} is unavailable right now. Please try again shortly.`);
      let data: unknown;
      try {
        data = await res.json();
      } catch {
        throw new CatalogError(
          `${name} returned an unreadable response. Please try again shortly.`,
        );
      }
      if (cache.size >= 150) cache.delete(cache.keys().next().value!);
      cache.set(path, { at: Date.now(), data });
      return data;
    };
    const work = spacing ? queue.then(run) : run();
    if (spacing)
      queue = work.then(
        () => undefined,
        () => undefined,
      );
    pending.set(path, work);
    try {
      return (await work) as T;
    } finally {
      pending.delete(path);
    }
  };
}
