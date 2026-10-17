# Private recommendations on Cloudflare Free

The engine is a client-side content-based model. AniList supplies metadata, and each browser learns its own preference profile. There is no trained neural model, hosted vector database, paid embedding API, GPU requirement, or server-side recommendation computation.

## Feature vectors

Each title contributes named feature tokens:

- Genre tokens: weight 2.
- AniList tag tokens: weight `2.5 × rank / 100`, with up to 32 highest-ranked tags. Adult and spoiler tags are excluded.
- Media-format tokens: weight 0.2.
- Country-of-origin tokens: weight 0.1.

Feature names are consistently hashed into **512 dimensions** with FNV-1a. This is feature hashing, not a learned semantic embedding: synonyms remain separate, and collisions are possible. Case and surrounding whitespace are normalized. Vectors use corpus-adaptive IDF weights:

```text
idf(feature) = 1 + ln((candidate_count + 1) / (feature_document_count + 1))
vector[hash(feature)] += feature_weight × idf(feature)
```

Each vector is L2-normalized. Specific themes can distinguish two stories that share the same broad genres. Jikan titles with no AniList tags still contribute genre vectors.

## Live metadata updates

No title catalog ships in the production bundle. Discovery and search query AniList on demand through Hono; Jikan supplies fallback results. SWR restores exact query responses from IndexedDB and refreshes on mount, focus, reconnect, or manual refresh, with 60-second request deduplication and no polling. Provider caches are opportunistic per isolate, not globally shared.

Fresh discovery/search metadata takes precedence over older local history, saved-title snapshots, and rating snapshots. Every changed candidate collection reruns vectorization and IDF weighting in the worker, then rebuilds the taste profile using existing feedback. Feature hashing keeps dimension identities stable, while weights adapt to the current local corpus. Browser storage stores metadata rather than stale precomputed vectors.

## Positive and negative taste vectors

Manual taste sliders seed a genre prior. Bookmarks add a weak positive signal with weight 0.45. Ratings use `(rating − 3) / 2`, producing separate positive and negative centroids. Explicit ratings override bookmark signals for that title.

The vector affinity is Rocchio-inspired:

```text
affinity = max(0, cosine(candidate, positive) − 0.35 × cosine(candidate, negative))
```

Already saved or rated titles are excluded from recommendation shelves. They remain available through search and the saved library as applicable.

## Bayesian per-feature estimates

Each feature starts with a neutral `Beta(1.5, 1.5)` prior. A bookmark supplies preference 0.7 with evidence weight 0.5. A rating supplies preference `(rating − 1) / 4` with evidence weight 1.5.

```text
alpha += evidence_weight × preference
beta  += evidence_weight × (1 − preference)
mean = alpha / (alpha + beta)
variance = alpha × beta / ((alpha + beta)² × (alpha + beta + 1))
```

Candidate Bayesian preference and uncertainty aggregate these estimates over its features. These are modeling assumptions for soft feedback, not calibrated probabilities that the user will enjoy a title.

## Evidence, novelty, and the final score

`confidence = total_feedback_weight / (total_feedback_weight + 6)` is a conservative **evidence-strength heuristic**, not prediction accuracy. It shifts weight from manual mood matching toward observed preferences as feedback accumulates.

```text
manual weight   = 0.65 − 0.40 × confidence
vector weight   = 0.25 + 0.15 × confidence
Bayesian weight = 0.10 + 0.25 × confidence
```

The manual component retains the original six-dimensional scorer: 65% cosine similarity, 25% absolute-distance affinity, 10% catalog rating. Hybrid scores also receive small novelty and uncertainty bonuses scaled by the variety slider, plus a penalty for proximity to disliked stories.

Novelty is `1 − maximum similarity to a positive example`, sampled over at most 64 positive vectors. The diversity pass uses maximal marginal relevance: subtract similarity to the most similar already-selected result, with an extra penalty for repeated adaptations of the same story. Work is bounded to 180 candidate titles and 60 reranked results; the remaining candidates follow in base-score order.

Match percentages are affinity scores, not a forecast of a star rating. The UI shows shared features, evidence strength, and novelty so users can understand the estimate.

## Where work and data live

- **Rust/WASM:** six-dimensional scoring, 512-dimensional cosine similarity, Beta posterior means and variances.
- **Web Worker:** feature hashing, IDF, profile updates, hybrid scoring orchestration and diversity reranking.
- **IndexedDB:** at most 500 recently discovered titles, stored as metadata and vectorized locally. Cached titles become recommendation candidates on later visits. An additional bounded cache holds 24 query responses for immediate SWR display. Discovery still revalidates against live APIs; local history is a fallback when the provider is unavailable.
- **localStorage:** explicit taste sliders, library, and up to 500 ratings with their metadata. Clearing ratings does not delete bookmarks.
- **Cloudflare Pages Functions:** public metadata requests and provider normalization only. Rating changes, taste-slider changes, and reranking trigger no API requests.

WASM and JavaScript calculations are tested for parity. The compiled WASM file is committed so deployment does not need Rust installed. If WASM cannot load, equivalent JavaScript calculations run in the same worker.

Browsers may evict or disable storage. The loaded page can still compute recommendations from its current data, but there is no cross-device sync or guaranteed offline app-shell loading.

## Free-tier boundary

Cloudflare currently documents 100,000 Workers/Pages Function requests per day on the Free plan and 10 ms CPU per request. Pages static asset requests that bypass Functions are free and unlimited. `_routes.json` limits Function invocation to `/api/*`; vectors and WASM are static assets, and the recommendation CPU runs on the user's device.

The engine adds **no hosted recommendation-service cost**. Catalog requests remain subject to Cloudflare's and each provider's quotas, and availability can be interrupted when quotas are reached. No paid plan, billing integration, D1, KV, Workers AI, or Vectorize binding is configured by this implementation.

Sources checked October 17, 2026:

- [Cloudflare Workers Free limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Pages Functions pricing and static assets](https://developers.cloudflare.com/pages/functions/pricing/)
- [AniList tag relevance ranks](https://docs.anilist.co/reference/object/mediatag)
