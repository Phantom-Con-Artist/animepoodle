# animepoodle 🐩

A place to discover and track anime, Chinese anime (donghua), manga, manhwa and manhua. Soft neo-brutalist design with light and dark themes, live AniList data, AnimeThemes music, a private local library, and recommendations computed in the browser. Built with **Next.js + React + Tailwind CSS**, **Hono**, and **Rust → WebAssembly**. No Vite. Deploys to **Cloudflare Pages (`pages.dev`)** without managing a server.

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

## Deploy to Cloudflare Pages

The live site is https://animepoodle.mavern.in (a custom domain on the `animepoodle` Pages project; `animepoodle.pages.dev` also works). If the domain changes, add it to `origins` in `giscus.json`, or comments won't load there.

The compiled `.wasm` file is included in `apps/web/public/wasm/`, so the Cloudflare build needs **no Rust installation**.

For a Pages project connected to this Git repository:

| Setting                | Value                         |
| ---------------------- | ----------------------------- |
| Framework preset       | None                          |
| Root directory         | Repository root (leave blank) |
| Build command          | `npm run build`               |
| Build output directory | `apps/web/out`                |
| Node version           | 22 or newer                   |
| Environment variables  | Giscus settings (see below)   |

Alternatively, deploy from your computer:

```sh
npm run build
npx wrangler login
npm run deploy
```

### Comments (Giscus)

Comments are optional and stay switched off until these build-time variables are set in **Pages → Settings → Environment variables** (or `.env.local` for development):

| Variable                         | Value                                         |
| -------------------------------- | --------------------------------------------- |
| `NEXT_PUBLIC_GISCUS_REPO`        | `Phantom-Con-Artist/animepoodle`              |
| `NEXT_PUBLIC_GISCUS_REPO_ID`     | `R_kgDOVNeddA`                                |
| `NEXT_PUBLIC_GISCUS_CATEGORY`    | `Story threads`                               |
| `NEXT_PUBLIC_GISCUS_CATEGORY_ID` | From https://giscus.app after the steps below |

1. Repository **Settings → General → Features**: tick **Discussions**.
2. Install the Giscus app: https://github.com/apps/giscus (only this repository).
3. **Discussions → Categories → New category**: name `Story threads`, format **Announcement** (so only Giscus and maintainers open threads, while everyone can reply).
4. Visit https://giscus.app, enter the repository, choose the category, and copy `data-category-id`.
5. Pin the welcome post from `.github/DISCUSSIONS_WELCOME.md` in that category.

Reading comments needs no account. Posting requires a GitHub sign-in inside the widget; Giscus has no anonymous mode.

The first deployment may prompt you to create a Pages project named `animepoodle`. If you choose a different project name, update `wrangler.jsonc` and the `deploy` script.

`npm run build` packages the Hono Functions into `apps/web/out/_worker.js`. Upload the **complete output**, including `_worker.js`, `_routes.json`, and `wasm/`. Wrangler deployment or Git integration are the recommended paths; uploading only the HTML files loses live search. The `_routes.json` file limits Function execution to `/api/*`; other requests are served as static assets.

## What works

- **Home**: Top highlights that rotate every 9 seconds. Hovering one expands the picture into a landscape player and plays its trailer once, then the next highlight takes over. Rows below: Continue watching, This week, Fresh this month, Best of the year, This season, Anime of the Year winners, Coming soon, your list and your matches.
- **Separate sections** for Anime, Chinese anime, Manga, Manhwa and Manhua. Recommendations, moods and Surprise me never mix them.
- **Browse**: every AniList title, filtered by type (TV series, Movie, OVA, Special, Short, Web series; Series, One-shot, Novel for comics), year, season, genre and status. Filters live in the URL, so views can be shared. Search is forgiving: besides titles it understands studios (“mappa”, even “kyoto animaton”), genres and tags (“isekai romcom”, “shonen sports”, “psycho thriller”), with small typos and common shorthand. What it read into the query is shown above the results.
- **Top rated**: a ranked chart by AniList score, ignoring titles with too few votes; filter by year, genre and type.
- **Seasonal**: any anime season, grouped by type.
- **My library**: Watching / Reading, Next on my list, Watched / Read, On hold and Dropped, across every section, with counts, grid or list view, and sorting. Older bookmarks migrate to "Next on my list".
- **Reading**: manga, manhwa and manhua chapters from MangaDex in a mobile-first reader at `/read`: one continuous vertical scroll, bars that hide while you read, data-saver or full quality, resume at the page you left, next chapter preloaded. Title pages get **Read here** with a full table of contents (volumes, newest/oldest, chapter finder) and a language choice; official chapters open on the publisher’s site; light novels link to official releases. New chapters are checked from the browser and show on Home, in your library and on the My library button. Series only MangaDex lists appear in search and in a New chapters on MangaDex rail. No sign-in, no ads. See [docs/reading.md](docs/reading.md).
- **Title pages**: synopsis, where to watch or read (official links from AniList), characters with voice actors, staff, seasons and related titles, studios (each with its own page), AniList rankings, next-episode countdown, trailer, AniList and MyAnimeList reviews, MAL forum threads, music, artwork, Fandom wiki search and Giscus comments.
- **Award winners** are read live from Wikipedia’s Crunchyroll Anime of the Year table and matched to AniList, so new ceremonies appear without code changes. Genres come live from AniList too.
- **Settings**: titles in English, Romaji or original script; trailers on hover on/off; trailer sound. Remembered in the browser.
- Hover trailers widen cards into a 16:9 player in place while neighbours slide along. On touch screens, the Trailer button does the same.
- Light, dark and system themes; mobile-first layout; keyboard navigation and visible focus; reduced motion respected.

Everything shown comes from live APIs and is cached with SWR so repeat visits paint instantly. The sample collection exists only as test fixtures.

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

The integrations use public read-only endpoints; no API keys or client secrets are required.

| Provider            | Role                                                                                              | Warm-instance cache                              |
| ------------------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| AniList             | Primary catalog, country/type classification, reviews, trailer, banner and YouTube external links | Search/discovery: 60 seconds; details: 5 minutes |
| AnimeThemes         | OP/ED songs and artists, WebM video, audio streams, cover art                                     | 1 hour                                           |

`GET /api/discover?format=Anime&status=RELEASING&sort=TRENDING_DESC` retrieves current discovery results. Status values are `ALL`, `RELEASING`, `FINISHED`, `NOT_YET_RELEASED`, `HIATUS`, and `CANCELLED`; sorting also accepts `POPULARITY_DESC`, `SCORE_DESC`, and `START_DATE_DESC`. Upstream availability determines freshness; timestamps show when data was fetched.

`GET /api/search?q=...&format=Anime&status=ALL` always tries AniList first.

`GET /api/media/:id?format=Anime&page=1` returns primary details, including canonical `anilistId`, `malId`, `bannerImage`, and `youtubeLinks`. YouTube links come from AniList trailer metadata or enabled `externalLinks`; no YouTube API key or fabricated search links are used.

`GET /api/extras?anilistId=154587&malId=52991&format=Anime` gathers AnimeThemes songs and artwork. Open **Soundtrack & extras → Find songs & artwork** to load it. AnimeThemes uses an exact AniList/MAL resource mapping rather than a fuzzy title lookup. Flagged spoiler/NSFW theme versions are excluded.

The clients use timeouts, bounded caches, concurrent-request coalescing, and `Retry-After` cooldowns. Edge instances do not share a global rate limiter or cache.

Songs and videos stream directly from their source; the Pages Function proxies metadata only. They are not copied into the repository or rehosted. Native audio/video is click-to-play with `preload="none"`. Supplemental video embeds are also click-to-play, and card trailer backgrounds retain their muted-loop behavior.

The artwork gallery labels banners and covers accurately; these APIs do not promise arbitrary wallpapers or full-resolution production art. Full-size image links open the original API-supplied asset. Provider availability and browser media-format support can vary; source links remain available if playback fails.

- [AnimeThemes API resources and includes](https://github.com/AnimeThemes/animethemes-api-docs/blob/main/docs/jsonapi/reference/content/anime/index.md)
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

`npm test` includes API validation, provider normalization/cache behavior, AnimeThemes resource mapping, unsafe-link rejection, partial-provider failures, Rust unit tests, and WASM/JavaScript parity. Browser tests exercise the Pages artifact at port 4173 on desktop and mobile, including persistence, filters, errors, dialog access, actual WebAssembly loading, on-demand soundtrack media, YouTube links and artwork. Browser media tests use controlled responses and verify player mounting/URLs rather than asserting third-party streaming availability.

## Artwork

Bundled cover images are sourced from MyAnimeList and AniList; the featured Frieren landscape is from [Alpha Coders](https://wall.alphacoders.com/big.php?i=1343996). See `ASSETS.md` for exact asset URLs. Artwork belongs to its respective creators and rights holders. The poodle illustration is a project-native SVG component.
