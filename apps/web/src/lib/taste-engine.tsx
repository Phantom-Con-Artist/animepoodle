'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { mergeTitleMetadata, type Format, type RankedTitle, type Title } from '@animepoodle/shared';
import { useApp } from './app-state';
import { useLocalCatalog } from './useLocalCatalog';
import { useRecommendations } from './useRecommendations';

interface Engine {
  ranked: RankedTitle[];
  engine: string;
  candidateCount: number;
  rankedFor: (format: Format) => RankedTitle[];
  matchFor: (key: string) => RankedTitle | undefined;
  remember: (items: Title[]) => void;
}
const Ctx = createContext<Engine | null>(null);
export const useEngine = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useEngine must be used inside EngineProvider');
  return ctx;
};
/** Pages call this with what they loaded so recommendations can draw on it later. */
export function useRemember(items: Title[] | undefined) {
  const { remember } = useEngine();
  useEffect(() => {
    if (items?.length) remember(items);
  }, [items, remember]);
}

export function EngineProvider({ children }: { children: React.ReactNode }) {
  const app = useApp();
  const [live, setLive] = useState<Title[] | null>(null);
  const local = useLocalCatalog(live);
  const remember = useCallback((items: Title[]) => setLive(items), []);
  const libraryItems = useMemo(() => Object.values(app.library).map((e) => e.item), [app.library]);
  const all = useMemo(
    () => mergeTitleMetadata([app.feedback.map((f) => f.item), libraryItems, local]),
    [app.feedback, libraryItems, local],
  );
  const { ranked, engine } = useRecommendations(
    all,
    app.taste,
    app.savedKeys,
    app.variety,
    app.feedback,
  );
  const byKey = useMemo(
    () => new Map(ranked.map((r) => [`${r.item.format}:${r.item.id}`, r])),
    [ranked],
  );
  const value = useMemo<Engine>(
    () => ({
      ranked,
      engine,
      candidateCount: all.length,
      rankedFor: (format) => ranked.filter((r) => r.item.format === format),
      matchFor: (key) => byKey.get(key),
      remember,
    }),
    [ranked, engine, all.length, byKey, remember],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
