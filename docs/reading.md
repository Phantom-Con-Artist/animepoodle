# Reading

Manga, manhwa and manhua chapters come from [MangaDex](https://mangadex.org) through the Pages Function at `/api/read/*`. Nothing is stored on animepoodle: chapter lists, pages and covers are fetched from MangaDex when someone reads, and cached.

## MangaDex rules this follows

From the [usage policy](https://api.mangadex.org/docs/) and [limitations](https://api.mangadex.org/docs/2-limitations/):

- **Credit.** Every chapter end and title page names the scanlation group and MangaDex.
- **No ads or paid features.** animepoodle has none. Donations are allowed if you ever add them.
- **Proxy, don't hotlink.** MangaDex sends no CORS headers to other sites and serves the wrong image to hotlinks, so API calls and images go through `/api/read`. The image proxy accepts only MangaDex chapter pages (`*.mangadex.network`, `uploads.mangadex.org/data*`) and covers (`uploads.mangadex.org/covers`), so it can't be used as an open proxy.
- **Rate limit.** About 5 requests/second per IP. Requests are spaced 250 ms apart per isolate, a 429 pauses MangaDex calls until its retry time, and every response is cached (series 6 h, chapter lists 5 min, page lists 10 min, updates 10 min). A real `User-Agent` is sent; there is no `Via` header.
- **MangaDex@Home reports.** Each page fetched from a `mangadex.network` node is reported to `api.mangadex.network/report` (success, bytes, duration, cache hit), in the background.
- **Removal requests.** Groups' removal requests must be honoured even if the chapter stays on MangaDex. Add the MangaDex group, series or chapter ID to the `READ_BLOCKLIST` Pages environment variable (comma separated) and redeploy or wait for the next request: those chapters disappear from lists, search and updates, and the reader returns 451.

## Matching titles

A title page finds its MangaDex series by searching MangaDex with the title's names and keeping only an entry whose own AniList (`al`) or MyAnimeList (`mal`) link matches. Titles never match on name alone. Series MangaDex lists without either link are shown as MangaDex-only titles (search and the Home rail), skipping any whose name matches an AniList result.

Licensed series often have no English scanlations on MangaDex; their official chapters (MangaPlus, Webnovel and others) appear as links to the publisher.

Light novels have no open source for their text, so they get official links instead of a reader.

## Cost on the Cloudflare free plan

Each page image is one Function request. A 40-page chapter costs about 42 requests (page list, index, pages), which is roughly 2,400 chapters a day within the free 100,000 requests. Things that keep it down:

- Data saver is the default quality, and images are cached at the edge (`caches.default`, keyed by image hash so changing page servers doesn't miss) and in the browser for a year.
- Pages lazy-load as you scroll; only the next chapter's first two images are preloaded.
- Update checks run at most every 30 minutes per browser while visible, two cached requests in the usual case.

If reading outgrows the free plan, move `/api/read/page` to a Worker on the paid plan, or ask MangaDex in `#dev-talk-api` about options.

## Your data

Reading progress, read chapters, new-chapter notes and the quality setting live in this browser's localStorage (`animepoodle-reading`). There are no accounts. New-chapter checks send only the MangaDex series IDs being checked.
