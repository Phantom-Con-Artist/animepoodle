import {
  scoreTitle,
  rankByVectors,
  type Title,
  type Taste,
  type Feedback,
} from '@animepoodle/shared';
type Scorer = (...args: number[]) => number;
interface Engine {
  score: Scorer;
  cosine: (a: Float64Array, b: Float64Array) => number;
  posterior: (alpha: number, beta: number) => { mean: number; variance: number };
}
let wasm: Promise<Engine | null> | undefined;
function loadEngine() {
  return (wasm ??= (async () => {
    try {
      const res = await fetch('/wasm/recommender.wasm');
      if (!res.ok) return null;
      const { instance } = await WebAssembly.instantiate(await res.arrayBuffer());
      const score = instance.exports.score as Scorer;
      const buffer = instance.exports.vector_buffer as () => number;
      const cosine = instance.exports.vector_cosine as (length: number) => number;
      const memory = instance.exports.memory as WebAssembly.Memory;
      const mean = instance.exports.posterior_mean as (a: number, b: number) => number;
      const variance = instance.exports.posterior_variance as (a: number, b: number) => number;
      if (!score || !buffer || !cosine || !memory || !mean || !variance) return null;
      const pointer = buffer();
      return {
        score,
        posterior: (a: number, b: number) => ({ mean: mean(a, b), variance: variance(a, b) }),
        cosine: (a: Float64Array, b: Float64Array) => {
          const view = new Float64Array(memory.buffer, pointer, 1024);
          view.set(a, 0);
          view.set(b, 512);
          return cosine(a.length);
        },
      };
    } catch {
      return null;
    }
  })());
}
self.onmessage = async (
  event: MessageEvent<{
    id: number;
    items: Title[];
    taste: Taste;
    saved: string[];
    feedback: Feedback[];
    variety: number;
  }>,
) => {
  const { id, items, taste, saved, feedback = [], variety } = event.data;
  const engine = await loadEngine();
  const ranked = rankByVectors({
    items,
    taste,
    saved,
    feedback,
    variety,
    scoreTaste: (item, profile) =>
      engine
        ? engine.score(...item.features, ...profile, item.rating, 0)
        : scoreTitle(item.features, profile, item.rating, 0),
    ...(engine ? { cosine: engine.cosine, posterior: engine.posterior } : {}),
  });
  self.postMessage({
    id,
    items: ranked,
    engine: engine ? 'Rust / WebAssembly' : 'JavaScript fallback',
  });
};
