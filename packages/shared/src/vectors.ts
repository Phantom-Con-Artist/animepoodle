import type { Title, Taste, Feedback, RankedTitle } from './index';
// Runtime imports intentionally stay one-way: this module is also used in workers/tests.
const key = (item: Title) => `${item.format}:${item.id}`;
export const VECTOR_SIZE = 512;
type Tokens = Map<string, number>;
function featureTokens(item: Title): Tokens {
  const result: Tokens = new Map();
  for (const genre of item.genres) result.set(`genre:${genre.toLowerCase().trim()}`, 2);
  for (const tag of Array.isArray(item.tags) ? item.tags : []) {
    if (typeof tag.name === 'string' && Number.isFinite(tag.rank) && tag.rank > 0)
      result.set(`tag:${tag.name.toLowerCase().trim()}`, (Math.min(100, tag.rank) / 100) * 2.5);
  }
  if (typeof item.mediaFormat === 'string')
    result.set(`format:${item.mediaFormat.toLowerCase()}`, 0.2);
  if (typeof item.origin === 'string') result.set(`origin:${item.origin.toLowerCase()}`, 0.1);
  return result;
}
function bucket(token: string) {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i++) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % VECTOR_SIZE;
}
function normalized(vector: Float64Array) {
  let sum = 0;
  for (const value of vector) sum += value * value;
  const norm = Math.sqrt(sum);
  if (norm > 0) for (let i = 0; i < vector.length; i++) vector[i] /= norm;
  return vector;
}
export function cosineSimilarity(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length || !a.length) return 0;
  let dot = 0,
    aa = 0,
    bb = 0;
  for (let i = 0; i < a.length; i++) {
    if (!Number.isFinite(a[i]) || !Number.isFinite(b[i])) return 0;
    dot += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
  }
  return aa > 0 && bb > 0 ? Math.max(-1, Math.min(1, dot / Math.sqrt(aa * bb))) : 0;
}
export function vectorizeCatalog(items: Title[]) {
  const tokens = items.map(featureTokens);
  const frequency = new Map<string, number>();
  for (const entry of tokens)
    for (const token of entry.keys()) frequency.set(token, (frequency.get(token) || 0) + 1);
  const vectors = new Map<string, Float64Array>();
  tokens.forEach((entry, index) => {
    const vector = new Float64Array(VECTOR_SIZE);
    for (const [token, weight] of entry) {
      const idf = 1 + Math.log((items.length + 1) / ((frequency.get(token) || 0) + 1));
      vector[bucket(token)] += weight * idf;
    }
    vectors.set(key(items[index]), normalized(vector));
  });
  return { vectors, tokens };
}
export function buildVectorProfile(
  items: Title[],
  vectors: Map<string, Float64Array>,
  saved: string[],
  feedback: Feedback[],
  taste: Taste,
) {
  const positive = new Float64Array(VECTOR_SIZE);
  const negative = new Float64Array(VECTOR_SIZE);
  // Manual mood preferences seed the model before any favorites or ratings exist.
  const seeds: [string, number][] = [
    ['adventure', taste[0]],
    ['drama', taste[1] * 0.7],
    ['romance', taste[1] * 0.3],
    ['action', taste[2]],
    ['mystery', taste[3]],
    ['slice of life', taste[4] * 0.7],
    ['comedy', taste[4] * 0.3],
    ['fantasy', taste[5]],
  ];
  for (const [genre, weight] of seeds) positive[bucket(`genre:${genre}`)] += weight * 0.5;
  let signals = 0;
  const rated = new Map(feedback.map((entry) => [key(entry.item), entry.rating]));
  for (const item of items) {
    const vector = vectors.get(key(item));
    if (!vector) continue;
    const rating = rated.get(key(item));
    const weight = rating === undefined ? (saved.includes(key(item)) ? 0.45 : 0) : (rating - 3) / 2;
    if (!weight) continue;
    signals++;
    const target = weight > 0 ? positive : negative;
    for (let i = 0; i < VECTOR_SIZE; i++) target[i] += vector[i] * Math.abs(weight);
  }
  return { positive: normalized(positive), negative: normalized(negative), signals };
}

export function posteriorStats(alpha: number, beta: number) {
  if (!Number.isFinite(alpha) || !Number.isFinite(beta) || alpha <= 0 || beta <= 0)
    return { mean: 0.5, variance: 0.0625 };
  const total = alpha + beta;
  return { mean: alpha / total, variance: (alpha * beta) / (total * total * (total + 1)) };
}
interface RankOptions {
  items: Title[];
  taste: Taste;
  saved: string[];
  feedback: Feedback[];
  variety: number;
  scoreTaste: (item: Title, taste: Taste) => number;
  cosine?: (a: Float64Array, b: Float64Array) => number;
  posterior?: typeof posteriorStats;
}
export function rankByVectors({
  items,
  taste,
  saved,
  feedback,
  variety,
  scoreTaste,
  cosine = cosineSimilarity,
  posterior = posteriorStats,
}: RankOptions): RankedTitle[] {
  const { vectors, tokens } = vectorizeCatalog(items);
  const profile = buildVectorProfile(items, vectors, saved, feedback, taste);
  const excluded = new Set([...saved, ...feedback.map((f) => key(f.item))]);
  const favorites = new Set([
    ...saved.filter((id) => !feedback.some((f) => key(f.item) === id && f.rating < 4)),
    ...feedback.filter((f) => f.rating >= 4).map((f) => key(f.item)),
  ]);
  const favoriteTokens = new Map<string, number>();
  const posteriors = new Map<string, { alpha: number; beta: number }>();
  const ratings = new Map(feedback.map((f) => [key(f.item), f.rating]));
  let evidence = 0;
  tokens.forEach((entry, i) => {
    const id = key(items[i]);
    const rating = ratings.get(id);
    const bookmarked = saved.includes(id);
    if (rating === undefined && !bookmarked) return;
    const preference = rating === undefined ? 0.7 : (rating - 1) / 4;
    const weight = rating === undefined ? 0.5 : 1.5;
    evidence += weight;
    for (const [token, importance] of entry) {
      const state = posteriors.get(token) || { alpha: 1.5, beta: 1.5 };
      state.alpha += weight * preference;
      state.beta += weight * (1 - preference);
      posteriors.set(token, state);
      if (favorites.has(id))
        favoriteTokens.set(token, (favoriteTokens.get(token) || 0) + importance);
    }
  });
  // Evidence-dependent shrinkage prevents a single bookmark from defining a person.
  const confidence = evidence / (evidence + 6);
  const favoriteVectors = items
    .filter((item) => favorites.has(key(item)))
    .map((item) => vectors.get(key(item))!)
    .slice(-64);
  const ranked = items
    .filter((item) => !excluded.has(key(item)))
    .map((item) => {
      const vector = vectors.get(key(item))!;
      const similarity = Math.max(0, cosine(vector, profile.positive));
      const aversion = Math.max(0, cosine(vector, profile.negative));
      const affinity = Math.max(0, similarity - aversion * 0.35);
      let total = 0,
        bayesian = 0,
        variance = 0;
      const featureSet = featureTokens(item);
      for (const [token, weight] of featureSet) {
        const state = posteriors.get(token) || { alpha: 1.5, beta: 1.5 };
        const estimate = posterior(state.alpha, state.beta);
        total += weight;
        bayesian += estimate.mean * weight;
        variance += estimate.variance * weight;
      }
      bayesian = total ? bayesian / total : 0.5;
      const uncertainty = total ? Math.min(1, Math.sqrt(variance / total) / 0.25) : 1;
      const novelty = favoriteVectors.length
        ? 1 - Math.max(...favoriteVectors.map((other) => Math.max(0, cosine(vector, other))))
        : 0.5;
      const manualWeight = 0.65 - 0.4 * confidence,
        vectorWeight = 0.25 + 0.15 * confidence,
        bayesianWeight = 0.1 + 0.25 * confidence;
      const base =
        scoreTaste(item, taste) * manualWeight +
        affinity * 100 * vectorWeight +
        bayesian * 100 * bayesianWeight;
      const score = Math.max(
        0,
        Math.min(100, base + variety * (novelty * 2 + uncertainty) - aversion * 10),
      );
      const shared = [...featureSet]
        .filter(([token]) => favoriteTokens.has(token))
        .sort(
          (a, b) => (favoriteTokens.get(b[0]) || 0) * b[1] - (favoriteTokens.get(a[0]) || 0) * a[1],
        )
        .slice(0, 2)
        .map(([token]) => token.slice(token.indexOf(':') + 1));
      const reason = shared.length
        ? `Shares ${shared.join(' and ')} with stories you like`
        : `Matched to your ${item.genres.slice(0, 2).join(' / ').toLowerCase()} preferences`;
      return {
        item,
        score,
        reason,
        evidence: { confidence, similarity, bayesian, novelty, uncertainty },
      };
    });
  const result: RankedTitle[] = [];
  const names = new Set<string>();
  const redundancy = new Map<string, number>();
  ranked.sort((a, b) => b.score - a.score);
  const pool = ranked.splice(0, 180);
  // Bound MMR work to the visible recommendation shelf. Each selected vector
  // updates a candidate's maximum redundancy once rather than inside sorting.
  const adjusted = (entry: RankedTitle) =>
    entry.score -
    variety *
      ((redundancy.get(key(entry.item)) || 0) * 8 +
        (names.has(entry.item.title.toLowerCase()) ? 10 : 0));
  while (pool.length && result.length < 60) {
    pool.sort((a, b) => adjusted(b) - adjusted(a));
    const next = pool.shift()!;
    result.push(next);
    names.add(next.item.title.toLowerCase());
    const chosen = vectors.get(key(next.item))!;
    for (const entry of pool) {
      const id = key(entry.item);
      redundancy.set(
        id,
        Math.max(redundancy.get(id) || 0, Math.max(0, cosine(vectors.get(id)!, chosen))),
      );
    }
  }
  return [...result, ...[...pool, ...ranked].sort((a, b) => b.score - a.score)];
}
