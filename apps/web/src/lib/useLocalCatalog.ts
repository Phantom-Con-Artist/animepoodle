'use client';
import { useEffect, useState } from 'react';
import { type Title, titleKey } from '@animepoodle/shared';
import { readLocalCatalog, rememberTitles } from './local-catalog';
function merge(a: Title[], b: Title[]) {
  const map = new Map(a.map((item) => [titleKey(item), item]));
  for (const item of b) {
    map.delete(titleKey(item));
    map.set(titleKey(item), item);
  }
  return [...map.values()].slice(-500);
}
export function useLocalCatalog(live: Title[] | null) {
  const [history, setHistory] = useState<Title[]>([]);
  useEffect(() => {
    let active = true;
    readLocalCatalog()
      .then((items) => {
        if (active) setHistory((current) => merge(items, current));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!live?.length) return;
    setHistory((current) => merge(current, live));
    rememberTitles(live).catch(() => {});
  }, [live]);
  return history;
}
