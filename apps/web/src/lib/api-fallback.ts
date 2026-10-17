// When the deployed Function answers 502 ("AniList is blocking this server"), run the very
// same Hono app in this browser so AniList sees the visitor's own address instead.
// Hype and MangaDex reading stay server-side: they need the database and MangaDex has no CORS.
const SERVER_ONLY = /^\/api\/(hype|read|image|health)/;
let local: Promise<{ fetch: (req: Request) => Response | Promise<Response> }> | null = null;

if (typeof window !== 'undefined' && !(window as { __apiFallback?: boolean }).__apiFallback) {
  (window as { __apiFallback?: boolean }).__apiFallback = true;
  const network = window.fetch.bind(window);
  window.fetch = async (input, init) => {
    const res = await network(input, init);
    if (res.status !== 502) return res;
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
