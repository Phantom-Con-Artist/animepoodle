'use client';
import { useApi } from './useApi';

/** Genre list straight from AniList, so new genres show up without a code change. */
export function useGenres(): string[] {
  const { data } = useApi<{ genres: string[] }>(
    '/api/genres',
    (d) => Array.isArray(d?.genres) && d.genres.every((g) => typeof g === 'string'),
  );
  return data?.genres || [];
}
/** Accepts a genre from the URL before the live list has loaded, then checks it against it. */
export const acceptGenre = (raw: string | null, genres: string[]) =>
  raw && (genres.length ? genres.includes(raw) : /^[A-Za-z -]{2,30}$/.test(raw)) ? raw : '';
