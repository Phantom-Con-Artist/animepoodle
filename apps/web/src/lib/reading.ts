'use client';
import { useSyncExternalStore } from 'react';
import type { ChapterInfo, Title } from '@animepoodle/shared';
import { validTitle } from './local-catalog';
import { keyOf } from './story';

/**
 * Reading progress, kept only in this browser like the rest of animepoodle. Nothing here
 * needs an account: progress, read chapters and new-chapter notes live in localStorage.
 */
export interface ReadingProgress {
  item: Title | null;
  mangaId: string;
  language: string;
  chapterId: string;
  chapter: string | null;
  volume: string | null;
  /** Page index the reader last had on screen, and the chapter's page count. */
  page: number;
  pages: number;
  updatedAt: number;
  /** Chapter IDs finished, newest last, capped. */
  read: string[];
}
export interface ChapterNote {
  latest: ChapterInfo;
  foundAt: number;
}
interface ReadingState {
  version: 1;
  /** By MangaDex manga ID. */
  series: Record<string, ReadingProgress>;
  /** Library title key → MangaDex ID, learned when a title page finds its chapters. */
  links: Record<string, string>;
  /** New chapters by MangaDex ID, cleared once read or opened. */
  fresh: Record<string, ChapterNote>;
  checkedAt: number;
  quality: 'data-saver' | 'data';
  language: string | null;
}
const KEY = 'animepoodle-reading';
const READ_CAP = 3000;
const empty = (): ReadingState => ({
  version: 1,
  series: {},
  links: {},
  fresh: {},
  checkedAt: 0,
  quality: 'data-saver',
  language: null,
});

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
function load(): ReadingState {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!raw || raw.version !== 1) return empty();
    const state = empty();
    for (const [id, p] of Object.entries(raw.series || {}) as [string, ReadingProgress][])
      if (uuid.test(id) && p && uuid.test(p.chapterId) && Array.isArray(p.read))
        state.series[id] = { ...p, item: validTitle(p.item) ? p.item : null };
    for (const [k, id] of Object.entries(raw.links || {}))
      if (typeof id === 'string' && uuid.test(id)) state.links[k] = id;
    for (const [id, n] of Object.entries(raw.fresh || {}) as [string, ChapterNote][])
      if (uuid.test(id) && n?.latest?.id) state.fresh[id] = n;
    state.checkedAt = Number(raw.checkedAt) || 0;
    state.quality = raw.quality === 'data' ? 'data' : 'data-saver';
    state.language = typeof raw.language === 'string' ? raw.language : null;
    return state;
  } catch {
    return empty();
  }
}

let state: ReadingState | null = null;
const listeners = new Set<() => void>();
const current = () => (state ??= load());
function commit(next: ReadingState) {
  state = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  listeners.forEach((l) => l());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  const storage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) {
      state = load();
      listener();
    }
  };
  window.addEventListener('storage', storage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', storage);
  };
}
const serverState = empty();
export const useReading = () => useSyncExternalStore(subscribe, current, () => serverState);
export const readingState = current;

export function saveProgress(p: {
  item: Title | null;
  mangaId: string;
  chapter: ChapterInfo;
  page: number;
  pages: number;
}) {
  const s = current();
  const prior = s.series[p.mangaId];
  const item = p.item || prior?.item || null;
  commit({
    ...s,
    links: item ? { ...s.links, [keyOf(item)]: p.mangaId } : s.links,
    series: {
      ...s.series,
      [p.mangaId]: {
        item,
        mangaId: p.mangaId,
        language: p.chapter.language,
        chapterId: p.chapter.id,
        chapter: p.chapter.chapter,
        volume: p.chapter.volume,
        page: p.page,
        pages: p.pages,
        updatedAt: Date.now(),
        read: prior?.read || [],
      },
    },
  });
}
export function markRead(mangaId: string, chapterId: string) {
  const s = current();
  const prior = s.series[mangaId];
  if (!prior || prior.read.includes(chapterId)) return;
  const fresh = { ...s.fresh };
  if (fresh[mangaId]?.latest.id === chapterId) delete fresh[mangaId];
  commit({
    ...s,
    fresh,
    series: {
      ...s.series,
      [mangaId]: { ...prior, read: [...prior.read, chapterId].slice(-READ_CAP) },
    },
  });
}
export function linkSeries(item: Title, mangaId: string) {
  const s = current();
  if (s.links[keyOf(item)] === mangaId) return;
  commit({ ...s, links: { ...s.links, [keyOf(item)]: mangaId } });
}
export function setReadingPrefs(prefs: Partial<Pick<ReadingState, 'quality' | 'language'>>) {
  commit({ ...current(), ...prefs });
}
export function dismissFresh(mangaId: string) {
  const s = current();
  if (!s.fresh[mangaId]) return;
  const fresh = { ...s.fresh };
  delete fresh[mangaId];
  commit({ ...s, fresh });
}
export function recordUpdates(
  found: { mangaId: string; latest: ChapterInfo }[],
  checkedAt: number,
) {
  const s = current();
  const fresh = { ...s.fresh };
  for (const u of found) {
    const p = s.series[u.mangaId];
    // Only chapters released after the reader last opened the series, and not read yet.
    if (p && (p.read.includes(u.latest.id) || +new Date(u.latest.readableAt) <= p.updatedAt))
      continue;
    fresh[u.mangaId] = { latest: u.latest, foundAt: Date.now() };
  }
  commit({ ...s, fresh, checkedAt });
}
/** The MangaDex series a title maps to, once a title page or the reader has found it. */
export const mangaIdFor = (s: ReadingState, item: Title) => s.links[keyOf(item)];
