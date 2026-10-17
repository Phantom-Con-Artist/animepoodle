import { formats, mangaDexId, type Format, type Title } from '@animepoodle/shared';
import { validTitle } from './local-catalog';

const STASH_KEY = 'animepoodle-story';

export const keyOf = (t: Title) => `${t.format}:${t.id}`;

/** Shareable story URL. Works with static export because it is a query string. */
export function storyHref(item: Title) {
  const params = new URLSearchParams({ format: item.format });
  if (item.anilistId) params.set('anilist', String(item.anilistId));
  if (item.malId || item.id > 0) params.set('mal', String(item.malId || item.id));
  // Series only MangaDex lists have neither ID.
  if (!item.anilistId && !item.malId && item.id <= 0 && item.mangadexId)
    params.set('md', item.mangadexId);
  return `/story?${params}`;
}

/** Keep the clicked title so the story page can paint before the API answers. */
export function stashStory(item: Title) {
  try {
    sessionStorage.setItem(STASH_KEY, JSON.stringify(item));
  } catch {}
}

export interface StoryParams {
  format: Format;
  anilistId?: number;
  malId?: number;
  mangadexId?: string;
}

export function parseStoryParams(search: URLSearchParams): StoryParams | null {
  const format = search.get('format') as Format | null;
  if (!format || format === ('All' as Format) || !formats.includes(format)) return null;
  const id = (name: string) => {
    const raw = search.get(name);
    return raw && /^[1-9]\d{0,9}$/.test(raw) ? Number(raw) : undefined;
  };
  const anilistId = id('anilist');
  const malId = id('mal');
  const md = search.get('md');
  const mangadexId = md && mangaDexId(md) ? md : undefined;
  if (!anilistId && !malId && !mangadexId) return null;
  return { format, anilistId, malId, mangadexId };
}

export function readStash(params: StoryParams): Title | null {
  try {
    const item = JSON.parse(sessionStorage.getItem(STASH_KEY) || 'null');
    if (!validTitle(item) || item.format !== params.format) return null;
    if (params.anilistId && item.anilistId === params.anilistId) return item;
    if (params.malId && (item.malId === params.malId || item.id === params.malId)) return item;
    if (params.mangadexId && item.mangadexId === params.mangadexId) return item;
  } catch {}
  return null;
}
