// The same API, run inside a visitor's browser. The site falls back to this when AniList
// blocks the shared Cloudflare addresses the deployed Function sends from; AniList allows
// browser calls, and each visitor then uses their own rate allowance.
export { app } from './app';
