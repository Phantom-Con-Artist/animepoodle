'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { ArrowDownUp, ArrowUpRight, BookOpen, Check, Sparkles } from 'lucide-react';
import {
  chapterLabel,
  languageName,
  type ChapterIndexResponse,
  type ChapterListResponse,
  type ReadingSeriesResponse,
  type Title,
} from '@animepoodle/shared';
import { getJson } from '@/lib/useApi';
import { stashStory } from '@/lib/story';
import { linkSeries, setReadingPrefs, useReading } from '@/lib/reading';
import { readHref } from './Reader';

const api = process.env.NEXT_PUBLIC_API_URL || '';
const when = (iso: string) =>
  new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });

export function seriesUrl(item: Title) {
  const p = new URLSearchParams();
  if (item.anilistId) p.set('anilist', String(item.anilistId));
  if (item.malId) p.set('mal', String(item.malId));
  const names = [item.titles?.romaji, item.titles?.english, item.title, item.original];
  for (const name of [...new Set(names.filter((n): n is string => !!n))].slice(0, 3))
    p.append('title', name);
  return `${api}/api/read/series?${p}`;
}

/** Chapters for this title from MangaDex, read inside animepoodle. */
export default function ReadPanel({ item }: { item: Title }) {
  const reading = useReading();
  const series = useSWR(
    item.anilistId || item.malId ? seriesUrl(item) : null,
    (url: string) => getJson<ReadingSeriesResponse>(url, 'Chapters are unavailable right now.'),
    { revalidateOnFocus: false, dedupingInterval: 3600000 },
  );
  const found = series.data?.series;
  useEffect(() => {
    if (found) linkSeries(item, found.id);
  }, [found, item]);

  const progress = found ? reading.series[found.id] : undefined;
  const language = useMemo(() => {
    if (!found?.languages.length) return null;
    const browser = typeof navigator === 'undefined' ? [] : navigator.languages || [];
    const wanted = [
      progress?.language,
      reading.language,
      ...browser.map((l) => l.toLowerCase()),
      ...browser.map((l) => l.toLowerCase().split('-')[0]),
      'en',
    ];
    return wanted.find((l) => l && found.languages.includes(l)) || found.languages[0];
  }, [found, progress?.language, reading.language]);

  // The table of contents comes from the index (every chapter, one request); the newest
  // hundred also bring titles, groups and dates from the feed.
  const index = useSWR(
    found && language ? `${api}/api/read/index/${found.id}?lang=${language}` : null,
    (url: string) => getJson<ChapterIndexResponse>(url, 'Chapters are unavailable right now.'),
    { revalidateOnFocus: false },
  );
  const feed = useSWR(
    found && language ? `${api}/api/read/chapters/${found.id}?lang=${language}&offset=0` : null,
    (url: string) => getJson<ChapterListResponse>(url, 'Chapters are unavailable right now.'),
    { revalidateOnFocus: false },
  );
  const [newestFirst, setNewestFirst] = useState(true);
  const [jump, setJump] = useState('');
  const details = useMemo(
    () => new Map((feed.data?.chapters || []).map((c) => [c.id, c])),
    [feed.data],
  );
  const all = index.data?.chapters || [];
  const first = all[0];
  const read = new Set(progress?.read || []);
  const fresh = found ? reading.fresh[found.id] : undefined;
  const volumes = useMemo(() => {
    const wanted = jump.trim();
    const shown = wanted ? all.filter((c) => (c.chapter || '').startsWith(wanted)) : all;
    const groups: { volume: string | null; chapters: typeof all }[] = [];
    for (const c of shown) {
      const last = groups[groups.length - 1];
      if (last && last.volume === c.volume) last.chapters.push(c);
      else groups.push({ volume: c.volume, chapters: [c] });
    }
    if (newestFirst) {
      groups.reverse();
      for (const g of groups) g.chapters = [...g.chapters].reverse();
    }
    return groups;
  }, [all, jump, newestFirst]);
  const readCount = all.filter((c) => read.has(c.id)).length;

  if (series.isLoading)
    return (
      <p className="extras-empty" role="status">
        Looking for chapters…
      </p>
    );
  if (series.error)
    return (
      <p className="extras-error" role="alert">
        {series.error.message}{' '}
        <button className="text-button" onClick={() => void series.mutate()}>
          Try again
        </button>
      </p>
    );
  if (!found)
    return (
      <p className="panel-note">
        No chapters to read here yet. The official places above are the best way to read this one.
      </p>
    );

  const open = () => stashStory(item);
  return (
    <div className="read-panel">
      <div className="read-actions">
        {progress ? (
          <Link className="primary-button" href={readHref(progress.chapterId, item)} onClick={open}>
            <BookOpen size={18} /> Continue {chapterLabel(progress).toLowerCase()}
            {progress.pages > 1 ? `, page ${progress.page + 1}` : ''}
          </Link>
        ) : first ? (
          <Link className="primary-button" href={readHref(first.id, item)} onClick={open}>
            <BookOpen size={18} /> Start reading
          </Link>
        ) : null}
        {fresh && (
          <Link className="read-new" href={readHref(fresh.latest.id, item)} onClick={open}>
            <Sparkles size={15} /> New: {chapterLabel(fresh.latest)}
          </Link>
        )}
        {found.languages.length > 1 && language && (
          <label className="read-language">
            <span>Language</span>
            <select
              value={language}
              onChange={(e) => setReadingPrefs({ language: e.target.value })}
            >
              {found.languages.map((l) => (
                <option key={l} value={l}>
                  {languageName(l)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>

      {index.error && !all.length ? (
        <p className="extras-error" role="alert">
          {index.error.message}{' '}
          <button className="text-button" onClick={() => void index.mutate()}>
            Try again
          </button>
        </p>
      ) : index.isLoading ? (
        <p className="extras-empty" role="status">
          Loading chapters…
        </p>
      ) : !all.length ? (
        <p className="panel-note">
          No {language ? languageName(language) : ''} chapters yet. Try another language above.
        </p>
      ) : (
        <div className="toc">
          <div className="toc-head">
            <p>
              <strong>
                {all.length} {all.length === 1 ? 'chapter' : 'chapters'}
              </strong>{' '}
              in {languageName(language!)}
              {readCount ? ` · ${readCount} read` : ''}
            </p>
            <label className="toc-jump">
              <span className="sr-only">Find a chapter number</span>
              <input
                inputMode="decimal"
                placeholder="Chapter no."
                value={jump}
                onChange={(e) => setJump(e.target.value.replace(/[^\d.]/g, ''))}
              />
            </label>
            <button
              type="button"
              className="subtle-button"
              onClick={() => setNewestFirst((n) => !n)}
              aria-label={newestFirst ? 'Show oldest first' : 'Show newest first'}
            >
              <ArrowDownUp size={15} /> {newestFirst ? 'Newest first' : 'Oldest first'}
            </button>
          </div>
          {!volumes.length && <p className="panel-note">No chapter {jump} in this language.</p>}
          {volumes.map((g, gi) => {
            const holdsProgress = g.chapters.some((c) => c.id === progress?.chapterId);
            const nums = g.chapters.map((c) => c.chapter).filter(Boolean);
            const range =
              nums.length > 1
                ? `Chapters ${nums[nums.length - 1]}–${nums[0]}`
                : nums[0]
                  ? `Chapter ${nums[0]}`
                  : '';
            const groupRead = g.chapters.filter((c) => read.has(c.id)).length;
            return (
              <details
                key={`${g.volume}-${gi}`}
                className="toc-volume"
                open={!!jump || holdsProgress || (gi === 0 && !progress) || volumes.length === 1}
              >
                <summary>
                  <strong>{g.volume ? `Volume ${g.volume}` : 'No volume yet'}</strong>
                  <small>
                    {newestFirst ? range : range.replace(/(\S+)–(\S+)$/, '$2–$1')}
                    {groupRead ? ` · ${groupRead}/${g.chapters.length} read` : ''}
                  </small>
                </summary>
                <ol className="chapter-list">
                  {g.chapters.map((c) => {
                    const d = details.get(c.id);
                    const external = d && !d.pages && d.externalUrl;
                    const current = c.id === progress?.chapterId;
                    const body = (
                      <>
                        <span className="chapter-name">
                          <strong>{chapterLabel(c)}</strong>
                          {d?.title && <span>{d.title}</span>}
                        </span>
                        {d && (
                          <small>
                            {d.groups.join(', ') || 'No group'} · {when(d.readableAt)}
                          </small>
                        )}
                        {current ? (
                          <BookOpen
                            size={16}
                            aria-label="Reading now"
                            className="chapter-current"
                          />
                        ) : read.has(c.id) ? (
                          <Check size={16} aria-label="Read" className="chapter-read" />
                        ) : external ? (
                          <ArrowUpRight size={16} aria-label="Official site" />
                        ) : null}
                      </>
                    );
                    return (
                      <li
                        key={c.id}
                        className={`${read.has(c.id) ? 'is-read' : ''} ${current ? 'is-current' : ''}`}
                      >
                        {external ? (
                          <a href={external} target="_blank" rel="noopener noreferrer">
                            {body}
                          </a>
                        ) : (
                          <Link href={readHref(c.id, item)} onClick={open}>
                            {body}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ol>
              </details>
            );
          })}
        </div>
      )}

      {found.official.length > 0 && (
        <div className="read-official">
          {found.official.map((l) => (
            <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer">
              {l.label} <ArrowUpRight size={13} />
            </a>
          ))}
        </div>
      )}
      <p className="read-credit">
        Chapters come from{' '}
        <a href={found.url} target="_blank" rel="noopener noreferrer">
          MangaDex
        </a>{' '}
        and the groups named on each one. Official chapters open on the publisher’s site.
      </p>
    </div>
  );
}
