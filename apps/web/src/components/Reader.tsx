'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR, { preload } from 'swr';
import {
  ArrowLeft,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  LoaderCircle,
  RotateCw,
  Settings2,
} from 'lucide-react';
import {
  chapterLabel,
  mangaDexId,
  type ChapterIndexResponse,
  type ChapterPagesResponse,
  type Title,
} from '@animepoodle/shared';
import { useApp } from '@/lib/app-state';
import { getJson } from '@/lib/useApi';
import { parseStoryParams, readStash, storyHref } from '@/lib/story';
import { markRead, readingState, saveProgress, setReadingPrefs, useReading } from '@/lib/reading';

const api = process.env.NEXT_PUBLIC_API_URL || '';
const pagesUrl = (id: string, quality: string) =>
  `${api}/api/read/pages/${id}?quality=${quality === 'data' ? 'data' : 'data-saver'}`;
const fetchPages = (url: string) =>
  getJson<ChapterPagesResponse>(url, 'This chapter didn’t load. Please try again.');
export const readHref = (chapterId: string, item?: Title | null) => {
  const p = new URLSearchParams({ c: chapterId });
  if (item) {
    p.set('format', item.format);
    if (item.anilistId) p.set('anilist', String(item.anilistId));
    if (item.malId) p.set('mal', String(item.malId));
  }
  return `/read?${p}`;
};

export default function Reader() {
  const search = useSearchParams();
  const chapterId = search.get('c');
  if (!mangaDexId(chapterId))
    return (
      <main className="reader reader-message">
        <h1>This chapter link is broken.</h1>
        <Link className="primary-button" href="/">
          Back to home
        </Link>
      </main>
    );
  return <ReaderView key={chapterId} chapterId={chapterId!} search={search} />;
}

function ReaderView({
  chapterId,
  search,
}: {
  chapterId: string;
  search: ReturnType<typeof useSearchParams>;
}) {
  const app = useApp();
  const router = useRouter();
  const reading = useReading();
  const quality = reading.quality;
  const pages = useSWR(pagesUrl(chapterId, quality), fetchPages, {
    revalidateOnFocus: false,
    dedupingInterval: 240000,
  });
  const data = pages.data;
  const mangaId = data?.mangaId;
  const language = data?.chapter.language;
  const index = useSWR(
    mangaId && language ? `${api}/api/read/index/${mangaId}?lang=${language}` : null,
    (url: string) => getJson<ChapterIndexResponse>(url, 'The chapter list didn’t load.'),
    { revalidateOnFocus: false, dedupingInterval: 300000 },
  );
  const [stashed, setStashed] = useState<Title | null>(null);
  useEffect(() => {
    const params = parseStoryParams(new URLSearchParams(search.toString()));
    setStashed(params ? readStash(params) : null);
  }, [search]);
  const item = stashed || (mangaId ? reading.series[mangaId]?.item : null) || null;

  // Neighbours in reading order. Several groups can share a number; skip to a new number.
  const order = index.data?.chapters || [];
  const at = order.findIndex((c) => c.id === chapterId);
  const here = order[at];
  const prev =
    at > 0
      ? order
          .slice(0, at)
          .reverse()
          .find((c) => c.chapter !== here?.chapter)
      : undefined;
  const next = at >= 0 ? order.slice(at + 1).find((c) => c.chapter !== here?.chapter) : undefined;
  const go = useCallback(
    (id: string | undefined) => {
      if (id) router.push(readHref(id, item));
    },
    [router, item],
  );

  // Bars hide while scrolling down and come back on scroll up or a tap.
  const [bars, setBars] = useState(true);
  const [settings, setSettings] = useState(false);
  useEffect(() => {
    let last = window.scrollY;
    const scroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - last) < 12) return;
      if (y > last && y > 80) {
        setBars(false);
        setSettings(false);
      } else setBars(true);
      last = y;
    };
    window.addEventListener('scroll', scroll, { passive: true });
    return () => window.removeEventListener('scroll', scroll);
  }, []);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'SELECT') return;
      if (e.key === 'ArrowRight') go(next?.id);
      if (e.key === 'ArrowLeft') go(prev?.id);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [go, next?.id, prev?.id]);

  // Progress: remember the page on screen, and the chapter once its end is reached.
  const [page, setPage] = useState(0);
  const resumeAt = useRef<number | null>(null);
  useEffect(() => {
    if (!data || !mangaId) return;
    const saved = readingState().series[mangaId];
    resumeAt.current = saved?.chapterId === chapterId && saved.page > 0 ? saved.page : null;
  }, [data, mangaId, chapterId]);
  useEffect(() => {
    if (!data || !mangaId) return;
    const t = setTimeout(
      () => saveProgress({ item, mangaId, chapter: data.chapter, page, pages: data.pages.length }),
      400,
    );
    return () => clearTimeout(t);
  }, [data, mangaId, item, page]);
  const finished = useCallback(() => {
    if (mangaId) markRead(mangaId, chapterId);
  }, [mangaId, chapterId]);
  useEffect(() => {
    if (item)
      document.title = `${app.name(item)}, ${data ? chapterLabel(data.chapter) : 'reading'} · animepoodle`;
  }, [item, data, app]);

  // Near the end, fetch the next chapter's page list and first images ahead of time.
  const nearEnd = !!data && page >= data.pages.length - 4;
  useEffect(() => {
    if (!nearEnd || !next) return;
    preload(pagesUrl(next.id, quality), fetchPages)
      .then((d) =>
        d.pages.slice(0, 2).forEach((src) => {
          new Image().src = `${api}${src}`;
        }),
      )
      .catch(() => {});
  }, [nearEnd, next, quality]);

  const title = item ? app.name(item) : 'Reading';
  const back = item ? storyHref(item) : '/library';
  const external = data && !data.pages.length ? data.chapter.externalUrl : null;

  return (
    <main className={`reader ${bars ? 'bars-on' : 'bars-off'}`}>
      <header className="reader-top" aria-hidden={!bars}>
        <Link className="reader-icon" href={back} aria-label={`Back to ${title}`}>
          <ArrowLeft size={20} />
        </Link>
        <div className="reader-heading">
          <strong>{title}</strong>
          <small>
            {data
              ? `${chapterLabel(data.chapter)}${data.chapter.title ? ` · ${data.chapter.title}` : ''}`
              : 'Loading…'}
          </small>
        </div>
        <button
          type="button"
          className="reader-icon"
          aria-label="Reading settings"
          aria-expanded={settings}
          onClick={() => setSettings((s) => !s)}
        >
          <Settings2 size={20} />
        </button>
        {settings && (
          <div className="reader-settings" role="group" aria-label="Reading settings">
            <span>Image quality</span>
            <div className="reader-toggle">
              {(
                [
                  ['data-saver', 'Data saver'],
                  ['data', 'Full quality'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={quality === value}
                  onClick={() => setReadingPrefs({ quality: value })}
                >
                  {label}
                </button>
              ))}
            </div>
            <small>Data saver loads faster and uses less of your plan.</small>
          </div>
        )}
      </header>

      <div className="reader-pages" onClick={() => setBars((b) => !b)}>
        {pages.error && !data ? (
          <div className="reader-message">
            <p>{pages.error.message}</p>
            <button className="primary-button" onClick={() => void pages.mutate()}>
              <RotateCw size={16} /> Try again
            </button>
          </div>
        ) : !data ? (
          <div className="reader-message" role="status">
            <LoaderCircle className="hype-spinner" size={28} />
            <p>Opening the chapter…</p>
          </div>
        ) : external ? (
          <div className="reader-message">
            <h1>{chapterLabel(data.chapter)} is published officially</h1>
            <p>
              Read it free on {new URL(external).hostname.replace(/^www\./, '')}. Reading there
              supports the people who make it.
            </p>
            <a className="primary-button" href={external} target="_blank" rel="noopener noreferrer">
              Read on the official site <ArrowUpRight size={16} />
            </a>
          </div>
        ) : (
          data.pages.map((src, i) => (
            <ReaderPage
              key={src}
              src={`${api}${src}`}
              index={i}
              total={data.pages.length}
              eager={i < 3}
              onSeen={setPage}
              resume={resumeAt}
              onRetry={() => void pages.mutate()}
            />
          ))
        )}
        {data && (
          <ChapterEnd
            data={data}
            next={next ? chapterLabel(next) : null}
            onNext={() => go(next?.id)}
            onSeen={finished}
            back={back}
            title={title}
          />
        )}
      </div>

      <nav className="reader-bottom" aria-label="Chapters" aria-hidden={!bars}>
        <button
          type="button"
          className="reader-icon"
          disabled={!prev}
          aria-label="Previous chapter"
          onClick={() => go(prev?.id)}
        >
          <ChevronLeft size={22} />
        </button>
        <label className="reader-picker">
          <span className="sr-only">Jump to chapter</span>
          <select value={chapterId} onChange={(e) => go(e.target.value)} disabled={!order.length}>
            {!order.length && (
              <option value={chapterId}>{data ? chapterLabel(data.chapter) : '…'}</option>
            )}
            {order.map((c) => (
              <option key={c.id} value={c.id}>
                {chapterLabel(c)}
                {c.volume ? ` · Vol. ${c.volume}` : ''}
              </option>
            ))}
          </select>
        </label>
        <span className="reader-count" aria-live="polite">
          {data?.pages.length ? `${page + 1} / ${data.pages.length}` : ''}
        </span>
        <button
          type="button"
          className="reader-icon"
          disabled={!next}
          aria-label="Next chapter"
          onClick={() => go(next?.id)}
        >
          <ChevronRight size={22} />
        </button>
      </nav>
    </main>
  );
}

function ReaderPage({
  src,
  index,
  total,
  eager,
  onSeen,
  resume,
  onRetry,
}: {
  src: string;
  index: number;
  total: number;
  eager: boolean;
  onSeen: (i: number) => void;
  resume: React.MutableRefObject<number | null>;
  onRetry: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // A page counts as on screen once it crosses the middle of the viewport.
    const observer = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) onSeen(index);
      },
      { rootMargin: '-50% 0px -50% 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [index, onSeen]);
  useEffect(() => {
    if (resume.current === index) ref.current?.scrollIntoView({ block: 'start' });
  }, [resume, index]);
  return (
    <div ref={ref} className={`reader-page is-${state}`} data-page={index + 1}>
      <img
        key={attempt}
        src={attempt ? `${src}&retry=${attempt}` : src}
        alt={`Page ${index + 1} of ${total}`}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        onLoad={() => {
          setState('ready');
          // Keep the resumed page in place as earlier pages finish loading above it.
          if (resume.current === index) {
            ref.current?.scrollIntoView({ block: 'start' });
            resume.current = null;
          }
        }}
        onError={() => setState('error')}
      />
      {state === 'error' && (
        <button
          type="button"
          className="reader-retry"
          onClick={(e) => {
            e.stopPropagation();
            setState('loading');
            // Page server addresses expire, so a second failure fetches fresh ones.
            if (attempt >= 1) onRetry();
            setAttempt((a) => a + 1);
          }}
        >
          <RotateCw size={16} /> Page {index + 1} didn’t load. Tap to retry
        </button>
      )}
    </div>
  );
}

function ChapterEnd({
  data,
  next,
  onNext,
  onSeen,
  back,
  title,
}: {
  data: ChapterPagesResponse;
  next: string | null;
  onNext: () => void;
  onSeen: () => void;
  back: string;
  title: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([e]) => e.isIntersecting && onSeen());
    observer.observe(el);
    return () => observer.disconnect();
  }, [onSeen]);
  const groups = data.chapter.groups;
  const credit = useMemo(
    () => (groups.length ? groups.join(', ') : 'an uncredited group'),
    [groups],
  );
  return (
    <div ref={ref} className="reader-end" onClick={(e) => e.stopPropagation()}>
      <p className="reader-credit">
        {chapterLabel(data.chapter)} translated by <strong>{credit}</strong>, shared on{' '}
        <a href="https://mangadex.org" target="_blank" rel="noopener noreferrer">
          MangaDex
        </a>
        . If you can, support the official release too.
      </p>
      {next ? (
        <button type="button" className="primary-button reader-next" onClick={onNext}>
          Next: {next} <ChevronRight size={18} />
        </button>
      ) : (
        <p className="reader-caught-up">
          You’re all caught up. We’ll flag the next chapter for you.
        </p>
      )}
      <Link className="text-button" href={back}>
        Back to {title}
      </Link>
    </div>
  );
}
