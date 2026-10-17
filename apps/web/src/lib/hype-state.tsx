'use client';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import useSWR, { useSWRConfig } from 'swr';
import {
  HYPE_DAILY_LIMIT,
  hypeDay,
  rankHype,
  type Format,
  type HypeBoard,
  type HypeReceipt,
  type HypeWallet,
  type Title,
} from '@animepoodle/shared';
import { useApp } from './app-state';
import dynamic from 'next/dynamic';
const HypeVerification = dynamic(() => import('@/components/HypeVerification'), { ssr: false });

const api = process.env.NEXT_PUBLIC_API_URL || '';
const ID_KEY = 'animepoodle-hype-voter';
const WALLET_KEY = 'animepoodle-hype-wallet';
const PENDING_KEY = 'animepoodle-hype-pending';
const boardKey = (format: Format) => `${api}/api/hype?format=${format}&day=${hypeDay()}`;
const freshWallet = (): HypeWallet => ({ day: hypeDay(), spent: 0, remaining: HYPE_DAILY_LIMIT });
async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(20000) });
  const data = await response.json();
  if (!response.ok)
    throw Object.assign(new Error(data.error || 'Hype is unavailable right now.'), {
      data,
      status: response.status,
    });
  return data as T;
}
export function useHypeBoard(format: Format) {
  return useSWR<HypeBoard, Error>(boardKey(format), json, {
    dedupingInterval: 60000,
    revalidateOnFocus: false,
    refreshInterval: 60000,
    refreshWhenHidden: false,
    refreshWhenOffline: false,
    errorRetryCount: 0,
    keepPreviousData: false,
  });
}
function savedWallet(): HypeWallet {
  try {
    const value = JSON.parse(localStorage.getItem(WALLET_KEY) || 'null');
    if (
      value?.day === hypeDay() &&
      Number.isInteger(value.spent) &&
      value.spent >= 0 &&
      value.spent <= HYPE_DAILY_LIMIT
    )
      return { ...value, remaining: HYPE_DAILY_LIMIT - value.spent };
  } catch {}
  return freshWallet();
}
interface State {
  wallet: HypeWallet;
  busy: boolean;
  hype: (item: Title) => void;
  sync: () => void;
}
const Context = createContext<State | null>(null);
export function useHype() {
  const value = useContext(Context);
  if (!value) throw new Error('Missing HypeProvider');
  return value;
}
interface Pending {
  item: Title;
  id: string;
  requestId: string;
  board: HypeBoard;
}
export function HypeProvider({ children }: { children: ReactNode }) {
  const app = useApp();
  const { cache, mutate } = useSWRConfig();
  const [wallet, setWallet] = useState<HypeWallet>(freshWallet);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const synced = useRef('');
  const [verification, setVerification] = useState<Pending | null>(null);
  const submitted = useRef(false);
  const update = useCallback((value: HypeWallet) => {
    if (value.day !== hypeDay()) {
      setWallet(freshWallet());
      return;
    }
    const prior = savedWallet();
    const spent = prior.day === value.day ? Math.max(prior.spent, value.spent) : value.spent;
    const next = { day: value.day, spent, remaining: HYPE_DAILY_LIMIT - spent };
    try {
      localStorage.setItem(WALLET_KEY, JSON.stringify(next));
    } catch {}
    setWallet(next);
  }, []);
  const identity = () => {
    let id = localStorage.getItem(ID_KEY);
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
      id = crypto.randomUUID();
      localStorage.setItem(ID_KEY, id);
    }
    return id;
  };
  const sync = useCallback(async () => {
    try {
      const id = localStorage.getItem(ID_KEY);
      if (!id) return;
      update(await json<HypeWallet>(`${api}/api/hype/wallet`, { headers: { 'X-Hype-Voter': id } }));
      synced.current = `${hypeDay()}:${id}`;
    } catch {}
  }, [update]);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const read = () => {
      setWallet(savedWallet());
      clearTimeout(timer);
      const now = new Date();
      const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
      timer = setTimeout(read, midnight - now.getTime() + 100);
    };
    const storage = (event: StorageEvent) => {
      if ([WALLET_KEY, ID_KEY, null].includes(event.key)) {
        synced.current = '';
        read();
      }
    };
    const visible = () => {
      if (document.visibilityState === 'visible') read();
    };
    read();
    window.addEventListener('storage', storage);
    document.addEventListener('visibilitychange', visible);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('storage', storage);
      document.removeEventListener('visibilitychange', visible);
    };
  }, []);
  const finish = () => {
    locked.current = false;
    submitted.current = false;
    setBusy(false);
    setVerification(null);
  };
  const submit = async (pending: Pending, token?: string) => {
    if (submitted.current) return;
    submitted.current = true;
    try {
      const { item, id, requestId } = pending;
      const result = await json<HypeReceipt>(`${api}/api/hype/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          voterId: id,
          requestId,
          format: item.format,
          anilistId: item.anilistId,
          malId: item.malId || (item.id > 0 ? item.id : undefined),
          turnstileToken: token,
        }),
      });
      update(result);
      synced.current = `${result.day}:${id}`;
      try {
        localStorage.removeItem(PENDING_KEY);
      } catch {}
      const canonical = { ...item, anilistId: result.anilistId };
      await mutate(
        boardKey(item.format),
        (board: HypeBoard | undefined) =>
          board
            ? {
                ...board,
                mode: 'hype' as const,
                entries: rankHype([
                  { item: canonical, points: result.points },
                  ...board.entries.filter((entry) => entry.item.anilistId !== result.anilistId),
                ]).slice(0, 50),
              }
            : board,
        { revalidate: false },
      );
      app.notify(`+1 Hype for ${app.name(item)}. ${result.remaining} left today.`);
    } catch (error) {
      const failure = error as Error & { data?: HypeWallet; status?: number };
      if (failure.data?.day && Number.isInteger(failure.data.spent)) update(failure.data);
      app.notify(failure.message || 'Could not confirm Hype. Tap the same title to check again.');
    } finally {
      finish();
    }
  };
  const hype = async (item: Title) => {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    try {
      const id = identity();
      const key = boardKey(item.format);
      const cached = cache.get(key)?.data as HypeBoard | undefined;
      const board = cached || (await json<HypeBoard>(key));
      if (!cached) await mutate(key, board, { revalidate: false });
      if (!board.votingAvailable)
        throw new Error('Hype is temporarily unavailable. Your points have not been spent.');
      let current = savedWallet();
      if (synced.current !== `${hypeDay()}:${id}`) {
        current = await json<HypeWallet>(`${api}/api/hype/wallet`, {
          headers: { 'X-Hype-Voter': id },
        });
        update(current);
        synced.current = `${hypeDay()}:${id}`;
      }
      if (!current.remaining)
        throw new Error('You have used today’s 10 Hype points. They reset at midnight UTC.');
      const target = `${item.format}:${item.anilistId ? `ani:${item.anilistId}` : `mal:${item.malId || item.id}`}`;
      let previous: { day?: string; target?: string; requestId?: string } = {};
      try {
        previous = JSON.parse(localStorage.getItem(PENDING_KEY) || '{}') || {};
      } catch {}
      const requestId =
        previous.day === hypeDay() && previous.target === target && previous.requestId
          ? previous.requestId
          : crypto.randomUUID();
      localStorage.setItem(PENDING_KEY, JSON.stringify({ day: hypeDay(), target, requestId }));
      const pending = { item, id, requestId, board };
      if (board.siteKey) setVerification(pending);
      else await submit(pending);
    } catch (error) {
      app.notify(
        error instanceof Error
          ? error.message
          : 'Allow browser storage to keep track of your Hype.',
      );
      finish();
    }
  };
  return (
    <Context.Provider value={{ wallet, busy, hype, sync }}>
      {children}
      {verification && (
        <HypeVerification
          siteKey={verification.board.siteKey!}
          title={app.name(verification.item)}
          onVerify={(token) => void submit(verification, token)}
          onClose={() => {
            if (!submitted.current) finish();
          }}
        />
      )}
    </Context.Provider>
  );
}
