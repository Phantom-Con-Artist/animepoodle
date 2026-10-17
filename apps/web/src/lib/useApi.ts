'use client';
import { useEffect, useState } from 'react';
import useSWR from 'swr';

const api = process.env.NEXT_PUBLIC_API_URL || '';
const store = 'animepoodle-api:';

export async function getJson<T>(url: string, fallback: string): Promise<T> {
  const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
  if (!res.headers.get('content-type')?.includes('application/json')) throw new Error(fallback);
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || fallback);
  return data as T;
}

/**
 * SWR with a localStorage copy: the last response paints instantly on the next visit, then
 * refreshes in the background. `check` rejects responses that don't have the expected shape.
 */
export function useApi<T>(
  path: string | null,
  check: (data: T) => boolean,
  fallback = 'This section is unavailable right now.',
) {
  const key = path ? `${api}${path}` : null;
  const [saved, setSaved] = useState<{ key: string; data: T } | null>(null);
  useEffect(() => {
    if (!key) return;
    try {
      const raw = localStorage.getItem(store + key);
      if (raw) {
        const data = JSON.parse(raw) as T;
        if (check(data)) setSaved({ key, data });
      }
    } catch {}
    // `check` is a stable validator per call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return useSWR<T, Error>(
    key,
    async (url: string) => {
      const data = await getJson<T>(url, fallback);
      if (!check(data)) throw new Error(fallback);
      try {
        localStorage.setItem(store + url, JSON.stringify(data));
      } catch {}
      return data;
    },
    {
      fallbackData: saved?.key === key ? saved.data : undefined,
      keepPreviousData: true,
      revalidateOnFocus: false,
      dedupingInterval: 120000,
      errorRetryCount: 1,
    },
  );
}
