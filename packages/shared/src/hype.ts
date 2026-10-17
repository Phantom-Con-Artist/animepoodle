import type { Format, Title } from './index';

export const HYPE_DAILY_LIMIT = 10;
export const HYPE_FORMATS: readonly Format[] = ['Anime', 'Donghua', 'Manga', 'Manhwa', 'Manhua'];
export const hypeDay = (date = new Date()) => date.toISOString().slice(0, 10);
export interface HypeWallet {
  day: string;
  spent: number;
  remaining: number;
}
export interface HypeEntry {
  item: Title;
  points: number;
}
export interface HypeBoard {
  year: number;
  day: string;
  format: Format;
  votingAvailable: boolean;
  siteKey: string | null;
  entries: HypeEntry[];
  mode: 'popular' | 'hype';
  fetchedAt: string;
}
export interface HypeReceipt extends HypeWallet {
  requestId: string;
  anilistId: number;
  format: Format;
  points: number;
}
export function rankHype(entries: HypeEntry[]) {
  const unique = new Map<string, HypeEntry>();
  for (const entry of entries) {
    const key = `${entry.item.format}:${entry.item.anilistId || entry.item.id}`;
    const previous = unique.get(key);
    if (!previous || entry.points > previous.points) unique.set(key, entry);
  }
  return [...unique.values()].sort(
    (a, b) =>
      b.points - a.points ||
      (b.item.popularity || 0) - (a.item.popularity || 0) ||
      a.item.id - b.item.id,
  );
}
