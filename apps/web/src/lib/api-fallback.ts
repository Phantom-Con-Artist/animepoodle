// When the deployed Function answers 502/503/429 (AniList or Jikan blocking or rate-limiting this server), run the very
// same Hono app in this browser so AniList sees the visitor's own address instead.
// MangaDex reading stays server-side: MangaDex has no CORS.
const SERVER_ONLY = /^\/api\/(read|image|health)/;
let local: Promise<{ fetch: (req: Request) => Response | Promise<Response> }> | null = null;

if (typeof window !== 'undefined' && !(window as { __apiFallback?: boolean }).__apiFallback) {
  (window as { __apiFallback?: boolean }).__apiFallback = true;
  const network = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const res = await network(input, init);
    if (![429, 502, 503].includes(res.status)) return res;
    const request = new Request(input, init);
    const url = new URL(request.url, location.href);
    if (
      request.method !== 'GET' ||
      !url.pathname.startsWith('/api/') ||
      SERVER_ONLY.test(url.pathname)
    )
      return res;
    try {
      local ??= import('@animepoodle/api/browser').then((m) => m.app);
      const app = await local;
      return await app.fetch(new Request(url, { signal: request.signal }));
    } catch (error) {
      console.warn('Browser fallback failed', error);
      return res;
    }
  };
}
