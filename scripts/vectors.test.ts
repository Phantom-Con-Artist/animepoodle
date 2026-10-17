import { catalog } from '../tests/fixtures/catalog';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  defaultTaste,
  rankByVectors,
  vectorizeCatalog,
  cosineSimilarity,
  posteriorStats,
  titleKey,
  type Title,
  VECTOR_SIZE,
} from '../packages/shared/src/index';
function item(id: number, tag: string): Title {
  return {
    ...catalog[0],
    id,
    anilistId: undefined,
    title: `Test ${id}`,
    genres: ['Fantasy'],
    tags: [{ name: tag, rank: 95 }],
    features: [0.5, 0.5, 0.5, 0.5, 0.5, 0.5],
  };
}
const baseline = (title: Title) => 75;
test('metadata vectors have fixed dimensions and unit length', () => {
  const { vectors } = vectorizeCatalog([item(1, 'Time Travel'), item(2, 'School Life')]);
  const a = vectors.get('Anime:1')!;
  assert.equal(a.length, VECTOR_SIZE);
  assert.ok(Math.abs(cosineSimilarity(a, a) - 1) < 1e-10);
  assert.ok(cosineSimilarity(a, vectors.get('Anime:2')!) < 0.9);
});
test('positive and negative feedback distinguish stories with the same genres', () => {
  const favorite = item(1, 'Time Travel'),
    similar = item(2, 'Time Travel'),
    other = item(3, 'School Life');
  const liked = rankByVectors({
    items: [favorite, similar, other],
    taste: defaultTaste,
    saved: [],
    feedback: [{ item: favorite, rating: 5 }],
    variety: 0,
    scoreTaste: baseline,
  });
  assert.equal(liked[0].item.id, 2);
  assert.ok(liked[0].reason.includes('time travel'));
  assert.equal(
    liked.some((r) => r.item.id === 1),
    false,
  );
  const disliked = rankByVectors({
    items: [favorite, similar, other],
    taste: defaultTaste,
    saved: [],
    feedback: [{ item: favorite, rating: 1 }],
    variety: 0,
    scoreTaste: baseline,
  });
  assert.equal(disliked[0].item.id, 3);
});
test('Bayesian estimates remain conservative and uncertainty falls with evidence', () => {
  const prior = posteriorStats(1.5, 1.5);
  assert.equal(prior.mean, 0.5);
  assert.equal(prior.variance, 0.0625);
  const learned = posteriorStats(6, 1.5);
  assert.ok(learned.mean > prior.mean && learned.mean < 1);
  assert.ok(learned.variance < prior.variance);
  assert.deepEqual(posteriorStats(NaN, 1), prior);
  const favorite = item(1, 'Time Travel');
  const ranked = rankByVectors({
    items: [favorite, item(2, 'Time Travel')],
    taste: defaultTaste,
    saved: [],
    feedback: [{ item: favorite, rating: 5 }],
    variety: 0,
    scoreTaste: baseline,
  });
  assert.ok(ranked[0].evidence!.confidence > 0 && ranked[0].evidence!.confidence < 0.3);
});
test('diversity scoring changes redundant shelves without discarding candidates', () => {
  const items = [item(1, 'Space Opera'), item(2, 'Space Opera'), item(3, 'Cozy Cooking')];
  const options = {
    items,
    taste: defaultTaste,
    saved: [],
    feedback: [],
    scoreTaste: (t: Title) => (t.id === 3 ? 70 : 75),
  };
  const plain = rankByVectors({ ...options, variety: 0 });
  const varied = rankByVectors({ ...options, variety: 3 });
  assert.equal(plain.length, 3);
  assert.equal(varied.length, 3);
  assert.equal(new Set(varied.map((r) => titleKey(r.item))).size, 3);
  assert.notDeepEqual(
    plain.map((r) => r.item.id),
    varied.map((r) => r.item.id),
  );
});
test('large candidate sets remain finite and preserve every unconsumed title', () => {
  const items = Array.from({ length: 500 }, (_, i) => item(1000 + i, `Theme ${i % 31}`));
  const ranked = rankByVectors({
    items,
    taste: defaultTaste,
    saved: [],
    feedback: [],
    variety: 1.2,
    scoreTaste: baseline,
  });
  assert.equal(ranked.length, 500);
  assert.ok(ranked.every((r) => Number.isFinite(r.score) && r.score >= 0 && r.score <= 100));
});
test('Rust vector similarity, posterior statistics, and full rankings match JavaScript', async () => {
  const { instance } = await WebAssembly.instantiate(
    await readFile('apps/web/public/wasm/recommender.wasm'),
  );
  const cosine = instance.exports.vector_cosine as (n: number) => number;
  const pointer = (instance.exports.vector_buffer as () => number)();
  const memory = instance.exports.memory as WebAssembly.Memory;
  const native = (a: Float64Array, b: Float64Array) => {
    const view = new Float64Array(memory.buffer, pointer, 1024);
    view.set(a, 0);
    view.set(b, 512);
    return cosine(a.length);
  };
  const { vectors } = vectorizeCatalog(catalog);
  for (const a of vectors.values())
    for (const b of vectors.values())
      assert.ok(Math.abs(native(a, b) - cosineSimilarity(a, b)) < 1e-10);
  const mean = instance.exports.posterior_mean as (a: number, b: number) => number;
  const variance = instance.exports.posterior_variance as (a: number, b: number) => number;
  for (const [alpha, beta] of [
    [1.5, 1.5],
    [6, 1.5],
    [1.5, 8],
    [4, 4],
  ]) {
    const expected = posteriorStats(alpha, beta);
    assert.ok(Math.abs(mean(alpha, beta) - expected.mean) < 1e-12);
    assert.ok(Math.abs(variance(alpha, beta) - expected.variance) < 1e-12);
  }
  const options = {
    items: catalog,
    taste: defaultTaste,
    saved: [titleKey(catalog[0])],
    feedback: [{ item: catalog[2], rating: 2 }],
    variety: 1.2,
    scoreTaste: baseline,
  };
  const js = rankByVectors(options);
  const wasm = rankByVectors({
    ...options,
    cosine: native,
    posterior: (a, b) => ({ mean: mean(a, b), variance: variance(a, b) }),
  });
  assert.deepEqual(
    wasm.map((r) => r.item.id),
    js.map((r) => r.item.id),
  );
  for (let i = 0; i < js.length; i++) assert.ok(Math.abs(js[i].score - wasm[i].score) < 1e-8);
});
test('refreshed metadata overrides rating snapshots and changes learned affinities', async () => {
  const { mergeTitleMetadata } = await import('../packages/shared/src/index');
  const old = item(1, 'Time Travel'),
    updated = item(1, 'School Life');
  const items = mergeTitleMetadata([
    [old, item(2, 'Time Travel'), item(3, 'School Life')],
    [updated],
  ]);
  assert.equal(items.length, 3);
  assert.equal(items.find((t) => t.id === 1)!.tags![0].name, 'School Life');
  const ranked = rankByVectors({
    items,
    taste: defaultTaste,
    saved: [],
    feedback: [{ item: old, rating: 5 }],
    variety: 0,
    scoreTaste: baseline,
  });
  assert.equal(ranked[0].item.id, 3);
});
