/**
 * Loose search: reads genres and tags out of everyday queries ("isekai romcom",
 * "shonen sports", "psycho thriller") against AniList's live genre and tag lists.
 */
export interface SearchVocabulary {
  genres: string[];
  tags: string[];
}
export interface SearchTerms {
  genres: string[];
  tags: string[];
  /** Words that are not a genre or tag, kept for the title search. */
  rest: string;
}
type Entry = { name: string; kind: 'genre' | 'tag'; key: string; compact: string };

// Fan shorthand AniList does not list as names. Values must still exist in the live vocabulary.
const aliases: Record<string, string[]> = {
  romcom: ['Romance', 'Comedy'],
  'rom com': ['Romance', 'Comedy'],
  sol: ['Slice of Life'],
  bl: ["Boys' Love"],
  gl: ['Yuri'],
  scifi: ['Sci-Fi'],
  'time travel': ['Time Manipulation'],
};
const filler = new Set([
  'a',
  'an',
  'and',
  'the',
  'with',
  'of',
  'in',
  'about',
  'anime',
  'manga',
  'manhwa',
  'manhua',
  'donghua',
  'show',
  'shows',
  'series',
  'story',
  'stories',
]);

export const normalizeTerm = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Edit distance with transpositions, stopping early once it exceeds `max`. */
export function editDistance(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
        v = Math.min(v, prev2[j - 2] + 1);
      row[j] = v;
      best = Math.min(best, v);
    }
    if (best > max) return max + 1;
    prev2 = prev;
    prev = row;
  }
  return prev[b.length];
}
const allowedTypos = (length: number) => (length >= 10 ? 2 : length >= 5 ? 1 : 0);

const entriesFor = (vocab: SearchVocabulary): Entry[] =>
  [
    ...vocab.genres.map((name) => ({ name, kind: 'genre' as const })),
    ...vocab.tags.map((name) => ({ name, kind: 'tag' as const })),
  ].map((e) => {
    const key = normalizeTerm(e.name);
    return { ...e, key, compact: key.replace(/ /g, '') };
  });

function lookup(phrase: string, entries: Entry[], single: boolean): Entry[] {
  const compact = phrase.replace(/ /g, '');
  const exact = entries.find((e) => e.key === phrase || e.compact === compact);
  if (exact) return [exact];
  const alias = aliases[phrase];
  if (alias) return alias.flatMap((name) => entries.filter((e) => e.name === name).slice(0, 1));
  const typos = allowedTypos(compact.length);
  if (typos) {
    let best: Entry | undefined;
    let bestDistance = typos + 1;
    for (const e of entries) {
      const d = editDistance(compact, e.compact, typos);
      if (d < bestDistance) [best, bestDistance] = [e, d];
    }
    if (best) return [best];
  }
  // "psycho" → Psychological. Only single words, so title words aren't swallowed.
  if (single && phrase.length >= 5) {
    const prefixed = entries.filter((e) => !e.key.includes(' ') && e.key.startsWith(phrase));
    const genres = prefixed.filter((e) => e.kind === 'genre');
    if (genres.length === 1) return genres;
    if (prefixed.length === 1) return prefixed;
  }
  return [];
}

export function parseSearchTerms(query: string, vocab: SearchVocabulary | null): SearchTerms {
  const words = normalizeTerm(query).split(' ').filter(Boolean);
  if (!vocab || !words.length) return { genres: [], tags: [], rest: query.trim() };
  const entries = entriesFor(vocab);
  const genres = new Set<string>();
  const tags = new Set<string>();
  const rest: string[] = [];
  for (let i = 0; i < words.length;) {
    let matched = 0;
    for (let n = Math.min(4, words.length - i); n >= 1 && !matched; n--) {
      const phrase = words.slice(i, i + n).join(' ');
      if (n === 1 && filler.has(phrase)) break;
      const found = lookup(phrase, entries, n === 1);
      if (!found.length && !(phrase in aliases)) continue;
      for (const e of found) (e.kind === 'genre' ? genres : tags).add(e.name);
      matched = n;
    }
    if (matched) i += matched;
    else rest.push(words[i++]);
  }
  const anyTerms = genres.size + tags.size > 0;
  return {
    genres: [...genres],
    tags: [...tags],
    rest: (anyTerms ? rest.filter((w) => !filler.has(w)) : rest).join(' '),
  };
}
