# animepoodle 🐩

An anime and manga discovery app with a playful dark interface, AniList-first search, AnimeThemes music, Jikan extras, a local library, and browser-side recommendations. Built with **Next.js + React + Tailwind CSS**, **Hono**, and **Rust → WebAssembly**. No Vite. Deploys to **Cloudflare Pages (`pages.dev`)** without managing a server.

## Run locally

Requires Node.js 22+ and npm. Rust is only needed when changing the recommendation engine.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. The development command starts Next.js and the separate Hono development adapter on port 8787. In production, Hono runs as a Cloudflare Pages Function at `/api/*` on the same domain.

```sh
npm run build
npm run preview
```

Open http://localhost:4173 to test the **actual Pages artifact**, including the edge API. `next start` is not used for this static export.

## Deploy to pages.dev

The compiled `.wasm` file is included in `apps/web/public/wasm/`, so the Cloudflare build needs **no Rust installation**.

For a Pages project connected to this Git repository:

| Setting                        | Value                         |
| ------------------------------ | ----------------------------- |
| Framework preset               | None                          |
| Root directory                 | Repository root (leave blank) |
| Build command                  | `npm run build`               |
| Build output directory         | `apps/web/out`                |
| Node version                   | 22 or newer                   |
| Required environment variables | None                          |

Alternatively, deploy from your computer:

```sh
npm run build
npx wrangler login
npm run deploy
```

The first deployment may prompt you to create a Pages project named `animepoodle`. If you choose a different project name, update `wrangler.jsonc` and the `deploy` script.

`npm run build` packages the Hono Functions into `apps/web/out/_worker.js`. Upload the **complete output**, including `_worker.js`, `_routes.json`, and `wasm/`. Wrangler deployment or Git integration are the recommended paths; uploading only the HTML files loses live search. The `_routes.json` file limits Function execution to `/api/*`; other requests are served as static assets.

## What works

- Discover live trending titles and search AniList’s public catalog. SWR instantly restores cached queries, then refreshes on demand, focus, or reconnect. Use “Broaden with Jikan” for additional matches; AniList results win deduplication. Search falls back to Jikan when AniList fails or has no matches.
- Filter anime, manga, Korean manhwa, Chinese manhua, and donghua using media type and country of origin.
- Query live trending, top-rated, or newest releases. Filter by Airing / ongoing, Aired / completed, TBA / upcoming, hiatus, or cancelled, plus genre.
- Read synopses and save stories to a library that survives reloads.
- Click a card’s trailer control to start a muted, looping YouTube background; stop it to restore the cover. Players never mount before that click.
- Watch trailers in story details and browse public AniList review summaries, authors, scores, and helpfulness counts, three reviews per page. Summaries stay collapsed until revealed; full reviews link to AniList.
- Dailymotion trailers open on their provider site because embedded players require a separately configured Dailymotion Player ID.
- Explore opening and ending songs, artists, native audio streams, and WebM videos from AnimeThemes. Media players mount only after a click.
- Discover promotional clips and music videos from Jikan, with direct YouTube links, plus API-provided covers, banners, and thumbnails.
- Tune six taste dimensions, choose a mood, and control recommendation variety.
- Give private 1–5 ratings to learn liked and disliked themes; revisited discoveries become local recommendation candidates without another fetch.
- View a match score and an explanation; discover a random pick with “Surprise me.”
- Use desktop and mobile layouts, keyboard navigation, and native modal dialogs.

Discovery, featured stories, covers, ratings, and release statuses come from live APIs. The old sample collection exists only as test fixtures. When a refresh fails, the UI labels cached discoveries and keeps them available. Recommendation candidates grow from discoveries on this device.

## Clean boundaries

```text
apps/web/                 Next.js static app + Tailwind + React components
  src/components/         Discovery, cards, story details, taste mixer, modal
  src/lib/                Vector worker, IndexedDB catalog cache, React bridges
  public/wasm/            Committed Rust engine, ready for deployment
apps/api/src/
  app.ts                  Portable Hono routes, no Node dependency
  anilist.ts              Primary GraphQL metadata, trailers, reviews, banners
  catalog-service.ts      AniList-first search, source merging, supplemental orchestration
  animethemes.ts          OP/ED songs, artists, audio, videos, and cover artwork
  jikan.ts                Secondary search, promo/music videos, pictures, theme names
  provider-client.ts      Bounded caches, coalescing, pacing, rate-limit cooldowns
  index.ts                Local-only Node development adapter
functions/api/[[route]].ts Cloudflare Pages adapter for the same Hono app
packages/shared/          Shared models, metadata vectorization, Bayesian/MMR ranking
crates/recommender/        Rust scoring, vector cosine, posterior statistics, tests
scripts/                  WASM build, verification, and parity tests
```

The UI calls `/api/discover` and `/api/search`; Hono retrieves primarily AniList metadata, including ranked tags. A Web Worker creates **512-dimensional weighted metadata vectors**, learns positive/negative profiles from bookmarks and private 1–5 ratings, combines cosine similarity with **Bayesian feature preferences**, and reranks with **novelty, uncertainty and maximal marginal relevance**. Rust/WASM computes cosine similarity and posterior statistics; the JavaScript fallback is tested for parity.

The model uses evidence-dependent weighting to keep early estimates conservative. It is content-based feature vectorization, not a trained neural embedding model. Match percentages indicate affinity, not prediction accuracy.

The browser caches up to **500 discovered titles and 24 query responses in IndexedDB**. Production has no bundled title catalog. SWR shows cached responses immediately and revalidates on mount, focus (throttled to five minutes), reconnect, or **Check updates**. Requests deduplicate for 60 seconds; there is no polling. Successful responses replace changed metadata and automatically rebuild vectors, IDF weights, and taste rankings in the worker. Taste sliders, saved titles and ratings stay in `localStorage`. No hosted vector database or paid embedding service is used, and feedback updates make no network requests. See [the mathematics and free-tier design](docs/recommendations.md).

Catalog requests and media playback still contact their providers. The browser does not sync profiles between devices, and there is no account sign-in in this version.

## AniList credentials

**Public search needs no API key or client secret.** AniList's endpoint is `https://graphql.anilist.co`. The `/api/media/:id` endpoint resolves media using a verified AniList ID (negative identifier) or a legacy MAL ID (positive identifier), with format and review-page validation. Searches preserve the canonical AniList ID for subsequent detail requests.

The adapter caches identical searches and media-detail pages for five minutes per warm runtime, coalesces concurrent requests, and honors upstream `429` cooldowns. This is an in-memory cache, not a shared durable cache.

OAuth credentials are needed only for a future sign-in/account-sync feature. Store an OAuth secret in **Cloudflare Pages → Settings → Variables and Secrets** and use it only in Hono. Never use a `NEXT_PUBLIC_` variable for secrets. No client secret is stored in this repository.

- [AniList API guide](https://docs.anilist.co/guide/graphql/)
- [AniList rate limits](https://docs.anilist.co/guide/rate-limiting)
- [Cloudflare Next.js static-export guide](https://developers.cloudflare.com/pages/framework-guides/nextjs/deploy-a-static-nextjs-site/)

## Providers and media

All three integrations use public read-only endpoints; no API keys or client secrets are required.

| Provider            | Role                                                                                              | Warm-instance cache                              |
| ------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| AniList             | Primary catalog, country/type classification, reviews, trailer, banner and YouTube external links | Search/discovery: 60 seconds; details: 5 minutes |
| AnimeThemes         | OP/ED songs and artists, WebM video, audio streams, cover art                                     | 1 hour                                           |
| Jikan / MyAnimeList | Search expansion/fallback, promos, music videos, artwork, fallback theme names                    | 15 minutes                                       |

`GET /api/discover?format=Anime&status=RELEASING&sort=TRENDING_DESC` retrieves current discovery results. Status values are `ALL`, `RELEASING`, `FINISHED`, `NOT_YET_RELEASED`, `HIATUS`, and `CANCELLED`; sorting also accepts `POPULARITY_DESC`, `SCORE_DESC`, and `START_DATE_DESC`. Upstream availability determines freshness; timestamps show when data was fetched.

`GET /api/search?q=...&format=Anime&status=ALL` always tries AniList first. Add `broaden=1` to append distinct Jikan matches. Deduplication uses the MAL media ID and media category so anime and manga remain distinct. No Jikan country inference is used: donghua remains on AniList, since Jikan does not provide a reliable country-of-origin filter.

`GET /api/media/:id?format=Anime&page=1` returns primary details, including canonical `anilistId`, `malId`, `bannerImage`, and `youtubeLinks`. YouTube links come from AniList trailer metadata or enabled `externalLinks`; no YouTube API key or fabricated search links are used.

`GET /api/extras?anilistId=154587&malId=52991&format=Anime` independently gathers AnimeThemes and Jikan media. Either provider may fail without failing the whole response. Open **Soundtrack & extras → Find songs, videos & artwork** to load it. AnimeThemes uses an exact AniList/MAL resource mapping rather than a fuzzy title lookup. Flagged spoiler/NSFW theme versions are excluded. Jikan theme strings are used as a metadata-only fallback if no playable AnimeThemes entries exist.

The clients use timeouts, bounded caches, concurrent-request coalescing, and `Retry-After` cooldowns. Jikan calls are serialized with at least 1.1 seconds between starts per warm instance. This respects its documented per-instance traffic budget; multiple edge instances do not share a global rate limiter or cache.

Songs and videos stream directly from their source; the Pages Function proxies metadata only. They are not copied into the repository or rehosted. Native audio/video is click-to-play with `preload="none"`. Supplemental video embeds are also click-to-play, and card trailer backgrounds retain their muted-loop behavior.

The artwork gallery labels banners and covers accurately; these APIs do not promise arbitrary wallpapers or full-resolution production art. Full-size image links open the original API-supplied asset. Provider availability and browser media-format support can vary; source links remain available if playback fails.

- [AnimeThemes API resources and includes](https://github.com/AnimeThemes/animethemes-api-docs/blob/main/docs/jsonapi/reference/content/anime/index.md)
- [Jikan API and rate limits](https://docs.api.jikan.moe/)
- [AniList media fields](https://docs.anilist.co/reference/object/media)

## Work on the Rust engine

```sh
rustup target add wasm32-unknown-unknown
npm run build:wasm
npm test
```

The Rust crate uses a small primitive WebAssembly ABI with no `wasm-bindgen`, npm WASM plugin, or external Rust dependency. Rebuild and commit `apps/web/public/wasm/recommender.wasm` after changing Rust source.

## Checks

```sh
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

`npm test` includes API validation, provider normalization/cache behavior, AniList-first merging and Jikan fallback, AnimeThemes resource mapping, unsafe-link rejection, partial-provider failures, Rust unit tests, and WASM/JavaScript parity. Browser tests exercise the Pages artifact at port 4173 on desktop and mobile, including persistence, filters, errors, dialog access, actual WebAssembly loading, on-demand soundtrack media, YouTube links, artwork, and opt-in search expansion. Browser media tests use controlled responses and verify player mounting/URLs rather than asserting third-party streaming availability.

## Artwork

Bundled cover images are sourced from MyAnimeList and AniList; the featured Frieren landscape is from [Alpha Coders](https://wall.alphacoders.com/big.php?i=1343996). See `ASSETS.md` for exact asset URLs. Artwork belongs to its respective creators and rights holders. The poodle illustration is a project-native SVG component.
