'use client';
import { useEffect } from 'react';
import type { ChapterUpdatesResponse } from '@animepoodle/shared';
import { useApp } from './app-state';
import { keyOf } from './story';
import { readingState, recordUpdates } from './reading';

const api = process.env.NEXT_PUBLIC_API_URL || '';
const EVERY = 30 * 60000;
const MAX_AGE = 30 * 86400000;
// One check at a time for the whole page, however often the effect re-runs.
let busy = false;

/**
 * Looks for new chapters from this browser: series being read, plus library titles marked
 * as reading that a title page has matched to MangaDex. At most every 30 minutes, only
 * while the tab is visible; the server caches each check for everyone.
 */
export function useChapterUpdates() {
  const app = useApp();
  const library = app.library;
  useEffect(() => {
    const check = async () => {
      const s = readingState();
      if (busy || document.visibilityState !== 'visible' || Date.now() - s.checkedAt < EVERY)
        return;
      const fallbackLanguage = s.language || 'en';
      const watched = new Map<string, { language: string; since: number }>();
      for (const p of Object.values(s.series))
        watched.set(p.mangaId, { language: p.language, since: p.updatedAt });
      for (const entry of Object.values(library)) {
        const id = s.links[keyOf(entry.item)];
        if (id && entry.status === 'CURRENT' && !watched.has(id))
          watched.set(id, { language: fallbackLanguage, since: entry.updatedAt });
      }
      if (!watched.size) return;
      busy = true;
      try {
        const byLanguage = new Map<string, { ids: string[]; since: number }>();
        const recent = [...watched].sort((a, b) => b[1].since - a[1].since).slice(0, 100);
        for (const [id, w] of recent) {
          const group = byLanguage.get(w.language) || { ids: [], since: Date.now() };
          if (group.ids.length < 50) group.ids.push(id);
          group.since = Math.min(group.since, w.since);
          byLanguage.set(w.language, group);
        }
        const found = [];
        for (const [language, group] of byLanguage) {
          const since = new Date(Math.max(group.since, Date.now() - MAX_AGE)).toISOString();
          const res = await fetch(
            `${api}/api/read/updates?ids=${group.ids.join(',')}&lang=${language}&since=${since}`,
            { signal: AbortSignal.timeout(20000) },
          );
          if (!res.ok) return;
          const data = (await res.json()) as ChapterUpdatesResponse;
          found.push(...data.updates);
        }
        recordUpdates(found, Date.now());
      } catch {
        // Offline or busy: try again on the next visit or interval.
      } finally {
        busy = false;
      }
    };
    void check();
    const timer = setInterval(() => void check(), EVERY);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, [library]);
}
