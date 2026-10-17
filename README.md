# animepoodle 🐩

An anime and manga discovery app with a playful dark interface, AniList search, a local library, and browser-side recommendations. Built with **Next.js + React + Tailwind CSS**, **Hono**, and **Rust → WebAssembly**. No Vite. Deploys to **Cloudflare Pages (`pages.dev`)** without managing a server.

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

- Search the curated collection instantly, or explicitly search AniList's public catalog.
- Filter anime, manga, Korean manhwa, Chinese manhua, and donghua using media type and country of origin.
- Sort by rating or year and filter by genre.
- Read synopses and save stories to a library that survives reloads.
- Click a card’s trailer control to start a muted, looping YouTube background; stop it to restore the cover. Players never mount before that click.
- Watch trailers in story details and browse public AniList review summaries, authors, scores, and helpfulness counts, three reviews per page. Summaries stay collapsed until revealed; full reviews link to AniList.
- Dailymotion trailers open on their provider site because embedded players require a separately configured Dailymotion Player ID.
- Tune six taste dimensions, choose a mood, and control recommendation variety.
- View a match score and an explanation; discover a random pick with “Surprise me.”
- Use desktop and mobile layouts, keyboard navigation, and native modal dialogs.

The initial collection contains 18 editorial selections with bundled cover art. Ratings and publication metadata in that collection are snapshots, not live rankings. Live search retrieves current metadata from AniList. Saved live-search titles are added to the candidate set for local recommendations.

## Clean boundaries

```text
apps/web/                 Next.js static app + Tailwind + React components
  src/components/         Discovery, cards, story details, taste mixer, modal
  src/lib/                Web Worker and React recommendation bridge
  public/wasm/            Committed Rust engine, ready for deployment
apps/api/src/
  app.ts                  Portable Hono routes, no Node dependency
  anilist.ts              GraphQL adapter, trailers/reviews, cache, cooldown
  index.ts                Local-only Node development adapter
functions/api/[[route]].ts Cloudflare Pages adapter for the same Hono app
packages/shared/          Shared models, curated catalog, JS fallback
crates/recommender/        Rust scoring implementation and unit tests
scripts/                  WASM build, verification, and parity tests
```

The UI calls `/api/search`; Hono queries AniList and normalizes the response. A Web Worker learns a taste vector from **70% explicit preferences + 30% saved-story features**. Rust computes a score using **65% cosine similarity + 25% absolute-distance affinity + 10% catalog rating**. A greedy diversity pass discourages repeated genres according to the variety slider. The JavaScript fallback uses the same formula and is tested against the shipped WASM binary.

This is a transparent **content-based recommendation baseline**, not a trained deep-learning model or collaborative filtering system. Genre-derived vectors are used for live titles, with hand-curated vectors for the bundled collection. A future engine can add embeddings, ratings, negative feedback, and collaborative signals behind the same worker interface.

All taste and library data stays in `localStorage` on the device; it is not synced between browsers. Search terms are sent through the Pages Function to AniList. There is no sign-in or account-sync flow in this version.

## AniList credentials

**Public search needs no API key or client secret.** AniList's endpoint is `https://graphql.anilist.co`. The `/api/media/:id` endpoint resolves media using a verified AniList ID (negative identifier) or a legacy MAL ID (positive identifier), with format and review-page validation. Searches preserve the canonical AniList ID for subsequent detail requests.

The adapter caches identical searches and media-detail pages for five minutes per warm runtime, coalesces concurrent requests, and honors upstream `429` cooldowns. This is an in-memory cache, not a shared durable cache.

OAuth credentials are needed only for a future sign-in/account-sync feature. Store an OAuth secret in **Cloudflare Pages → Settings → Variables and Secrets** and use it only in Hono. Never use a `NEXT_PUBLIC_` variable for secrets. No client secret is stored in this repository.

- [AniList API guide](https://docs.anilist.co/guide/graphql/)
- [AniList rate limits](https://docs.anilist.co/guide/rate-limiting)
- [Cloudflare Next.js static-export guide](https://developers.cloudflare.com/pages/framework-guides/nextjs/deploy-a-static-nextjs-site/)

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

`npm test` includes API validation, AniList normalization/cache behavior, Rust unit tests, and WASM/JavaScript parity. Browser tests exercise the Pages artifact at port 4173 on desktop and mobile, including persistence, filters, errors, dialog access, and actual WebAssembly loading.

## Artwork

Bundled cover images are sourced from MyAnimeList and AniList; the featured Frieren landscape is from [Alpha Coders](https://wall.alphacoders.com/big.php?i=1343996). See `ASSETS.md` for exact asset URLs. Artwork belongs to its respective creators and rights holders. The poodle illustration is a project-native SVG component.
