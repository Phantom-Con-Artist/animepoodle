'use client';
import { useEffect, useRef, useState } from 'react';
import { type Title, type Taste, type RankedTitle } from '@animepoodle/shared';
export function useRecommendations(items: Title[], taste: Taste, saved: string[], variety: number) {
  const [ranked, setRanked] = useState<RankedTitle[]>([]);
  const [engine, setEngine] = useState('Loading engine…');
  const worker = useRef<Worker | null>(null);
  const request = useRef(0);
  useEffect(() => {
    const w = new Worker(new URL('./recommend.worker.ts', import.meta.url));
    worker.current = w;
    w.onmessage = (e) => {
      if (e.data.id === request.current) {
        setRanked(e.data.items);
        setEngine(e.data.engine);
      }
    };
    return () => {
      w.terminate();
      worker.current = null;
    };
  }, []);
  useEffect(() => {
    worker.current?.postMessage({ id: ++request.current, items, taste, saved, variety });
  }, [items, taste, saved, variety]);
  return { ranked, engine };
}
