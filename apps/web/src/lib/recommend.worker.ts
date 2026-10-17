import {
  scoreTitle,
  reasonFor,
  type Title,
  type Taste,
  type RankedTitle,
} from '@animepoodle/shared';
type Scorer = (...args: number[]) => number;
let wasm: Promise<Scorer | null> | undefined;
function loadEngine() {
  return (wasm ??= (async () => {
    try {
      const res = await fetch('/wasm/recommender.wasm');
      if (!res.ok) return null;
      const { instance } = await WebAssembly.instantiate(await res.arrayBuffer());
      return instance.exports.score as Scorer;
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
    variety: number;
  }>,
) => {
  const { id, items, taste, saved, variety } = event.data;
  const engine = await loadEngine();
  const favorites = items.filter((i) => saved.includes(`${i.format}:${i.id}`));
  const learned = taste.map((v, index) =>
    favorites.length
      ? v * 0.7 + (favorites.reduce((a, i) => a + i.features[index], 0) / favorites.length) * 0.3
      : v,
  ) as Taste;
  const ranked: RankedTitle[] = items
    .filter((i) => !saved.includes(`${i.format}:${i.id}`))
    .map((item) => ({
      item,
      score: engine
        ? engine(...item.features, ...learned, item.rating, 0)
        : scoreTitle(item.features, learned, item.rating, 0),
      reason: reasonFor(item, learned),
    }));
  // Keep the shelf varied across genres and adaptations of the same story.
  const result: RankedTitle[] = [];
  const used = new Map<string, number>();
  const selectedNames = new Set<string>();
  const adjustedScore = (entry: RankedTitle) => {
    const genrePenalty = entry.item.genres.reduce((sum, genre) => sum + (used.get(genre) || 0), 0);
    const adaptationPenalty = selectedNames.has(entry.item.title.toLowerCase()) ? 10 : 0;
    return entry.score - (genrePenalty + adaptationPenalty) * variety;
  };
  while (ranked.length) {
    ranked.sort((a, b) => adjustedScore(b) - adjustedScore(a));
    const next = ranked.shift()!;
    result.push(next);
    selectedNames.add(next.item.title.toLowerCase());
    next.item.genres.forEach((genre) => used.set(genre, (used.get(genre) || 0) + 1));
  }
  self.postMessage({
    id,
    items: result,
    engine: engine ? 'Rust / WebAssembly' : 'JavaScript fallback',
  });
};
