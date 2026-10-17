'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { type CatalogResponse } from '@animepoodle/shared';
import { readCatalogResponse, storeCatalogResponse, validTitle } from './local-catalog';
export function useCatalogSWR(path: string | null) {
  const key = path ? `${process.env.NEXT_PUBLIC_API_URL || ''}${path}` : null;
  const [disk, setDisk] = useState<{ key: string; data: CatalogResponse } | null>(null);
  const fresh = useRef(new Set<string>());
  const fetcher = useCallback(async (url: string): Promise<CatalogResponse> => {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.headers.get('content-type')?.includes('application/json'))
      throw new Error('The live catalog is unavailable right now.');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'The live catalog is unavailable right now.');
    if (!Array.isArray(data.items) || !data.items.every(validTitle))
      throw new Error('The live catalog returned an unreadable response.');
    fresh.current.add(url);
    storeCatalogResponse(url, data).catch(() => {});
    return data;
  }, []);
  useEffect(() => {
    if (!key) return;
    let active = true;
    readCatalogResponse(key)
      .then((data) => {
        if (active && data && !fresh.current.has(key)) setDisk({ key, data });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [key]);
  return useSWR<CatalogResponse, Error>(key, fetcher, {
    fallbackData: disk?.key === key ? disk.data : undefined,
    keepPreviousData: true,
    dedupingInterval: 60000,
    focusThrottleInterval: 300000,
    revalidateOnFocus: true,
    revalidateOnReconnect: true,
    refreshInterval: 0,
    errorRetryCount: 1,
    errorRetryInterval: 30000,
  });
}
