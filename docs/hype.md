# Hype

`/hype` is a statically exported Next.js page. Only `/api/hype*` uses Pages Functions. Existing `_routes.json` keeps HTML, JS, artwork and other static assets out of Functions.

Each anonymous browser gets **10 points per UTC day, shared across Anime, Chinese anime, Manga, Manhwa and Manhua**. A click spends one point. Each section has its own yearly ranking. Any catalog title can receive Hype, including older releases; points belong to the year they were sent. A new year gets new scores; the daily allowance is independent of that yearly reset.

Until votes arrive, the page shows that section’s popular releases from the current year with **zero** Hype points. Once actual votes arrive they sort above zero-point seeds. Popularity breaks score ties. There are no fabricated seed votes or weighted popularity scores mixed into community points.

## Local development

`npm run dev` starts the existing app and Node API. The API creates `.wrangler/hype.sqlite` and applies the schema automatically. Local voting works without a challenge, only when `HYPE_LOCAL_DEV=true` and the request hostname is localhost/127.0.0.1. The Node adapter binds to loopback. The deployed Function never imports this Node-only adapter.

Local development needs Node 24 (built-in SQLite). `npm run test:hype` tests the actual SQL transaction and triggers in SQLite. `npm run test:e2e -- tests/hype.spec.ts` covers desktop and mobile controls and mocked Turnstile rendering.

## Enable Cloudflare production voting

The project currently has no authenticated Cloudflare session. These steps require the project owner’s account; do not use test Turnstile keys for public voting.

1. `npx wrangler login`.
2. Run `npm run hype:database` **once**. Wrangler creates the D1 database and adds the real `HYPE_DB` binding/UUID to `wrangler.jsonc`; keep the resulting binding in source control. If the database already exists, use its existing ID rather than creating another one.
3. `npm run hype:migrate` applies `migrations/0001_hype.sql` to the bound remote database.
4. Create a managed Turnstile widget for the production hostname. Add runtime Pages variable `TURNSTILE_SITE_KEY`, encrypted secret `TURNSTILE_SECRET_KEY`, and encrypted secret `HYPE_HASH_SECRET` (at least 32 random characters). Generate that last value in a password manager and paste it into the encrypted setting; do not commit it. Keep the same HMAC secret across deployments so existing browser allowances remain recognizable.
5. Add the edge rate-limiting rule below on the production Cloudflare zone **before enabling public voting**. Ensure preview environments have separate D1 storage and real or test keys appropriate to their audience. Never set `HYPE_LOCAL_DEV` in Pages.
6. Build/deploy using the existing workflow. The `/hype` route remains static. Test one vote, a page reload and a section change against production.

Missing bindings, missing keys, database failures and failed verification disable voting without falling back to fake local community scores. The popularity chart can still render when the database is unavailable and the catalog provider is reachable.

References: [D1 Pages bindings](https://developers.cloudflare.com/pages/functions/bindings/#d1-databases), [database creation](https://developers.cloudflare.com/d1/wrangler-commands/#create), [Turnstile server validation](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).

## Abuse controls and practical limits

Use a Cloudflare **WAF rate-limiting rule**, matched to `starts_with(http.request.uri.path, "/api/hype")`, counting by IP. A starting setting is 30 requests in 10 seconds, blocking for the mitigation duration available on your plan. Check the plan-specific controls in the dashboard. This protects Worker invocation quota; blocking only inside a Worker cannot undo the request that already invoked it. WAF rules require a zone you control; the shared `pages.dev` hostname does not provide your zone’s WAF protections. Protect/restrict direct preview origins too; otherwise they can bypass a custom-domain rule. No anonymous voting implementation can guarantee immunity to a distributed attack or to exhaustion of a shared Free-plan request quota.

Application controls add:

- A bounded 2,048-entry in-memory admission filter, before database/provider work: 15 vote attempts/minute/IP, 30 wallet reads/minute/IP, 60 uncached board reads/minute/IP. These are supplementary per-isolate limits, **not** a global distributed quota.
- Single-use Turnstile verification on every new accepted vote, checked server-side for hostname and `hype` action. The browser loads its script only after a Hype click. Old request receipts are returned idempotently without a new write or repeated challenge.
- Strict origin, identifier and format checks; JSON requests limited to 4 KiB, including when Content-Length is missing. Catalog identity and section are verified server-side. Browser-supplied metadata and point totals are never trusted.
- Transactional D1 constraints/triggers enforce the ten-point daily wallet even across racing tabs/devices reusing an identity. A request ID can be counted once only. All increments and receipts commit or roll back together.
- A persistent limit of 100 accepted votes/IP/day (shared networks can hit this) and a site-wide write circuit breaker of 2,000 accepted votes/day by default. `HYPE_DAILY_VOTE_CAP` can be set from 1–5,000; increasing it needs quota review. This intentionally prefers pausing Hype to exhausting D1 write quota. Other site features stay usable when voting pauses.
- IP addresses and voter UUIDs are HMAC-hashed; raw IPs are not stored in Hype tables. The salt for IP hashing includes the UTC day. Browser identity is anonymous, not proof of a person. Clearing storage, using another browser/device or completing more challenges with new identities can obtain another allowance. The product accepts this limitation and does not present the ranking as unique-person voting.

Check current [D1 limits](https://developers.cloudflare.com/d1/platform/limits/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), and [WAF rate-limiting support](https://developers.cloudflare.com/waf/rate-limiting-rules/) before changing caps. Quotas may be shared with other projects in the same account.

## Cost and freshness

No card fetches its own Hype count. Browsing a grid makes zero Hype calls until interaction. The chart makes one request per minute while visible; hidden/offline tabs do not poll. Public boards use a canonical edge cache key (format + UTC day), 60-second edge caching and 30-second browser caching. The seed provider lookup is coalesced/cached per format/year for 30 minutes per isolate. Private wallets and vote receipts are never publicly cached. New votes update the sender’s chart immediately; other visitors see changes on a later chart refresh, normally within roughly two minutes with layered caching.

Votes only fetch provider details the first time a title receives a vote that year. Ranking reads use the `(year, format, points, popularity)` index and return at most 50 entries. There is no full vote-table scan per request. Accepted votes update a small fixed set of rows. Scores/metadata persist independently from the daily allowance.

The raw vote ledger, wallets and daily budgets can be pruned after your chosen dispute/retry retention period (for example, 35 days), deleting old votes first because of foreign keys, then old wallets/budgets. Retain `hype_titles` for yearly totals. Pages has no built-in scheduled handler here, so retention maintenance must be scheduled separately rather than run in the hot voting path.

## See global metrics in Cloudflare

Open **Storage & databases → D1 → animepoodle-hype → Console**. The database, not browser storage, contains shared totals. For example:

```sql
-- Yearly totals by section, aggregating every accepted browser vote.
SELECT format, SUM(points) AS hype_points
FROM hype_titles
WHERE year = CAST(strftime('%Y', 'now') AS INTEGER)
GROUP BY format;

-- Accepted votes today; the same row enforces the daily write circuit breaker.
SELECT used AS votes_today FROM hype_budgets
WHERE day = date('now') AND bucket = 'global';

-- Daily active browser identities, not unique people.
SELECT COUNT(*) AS active_browsers, SUM(spent) AS points_sent
FROM hype_wallets WHERE day = date('now');
```

D1’s dashboard analytics reports rows read/written and storage usage. Workers/Pages analytics reports requests, errors and CPU usage; Turnstile analytics reports challenges. Those operational metrics are separate from the vote totals above. Run these aggregate SQL queries occasionally in the dashboard, not once for every card rendered.
