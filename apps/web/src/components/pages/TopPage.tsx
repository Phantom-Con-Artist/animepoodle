'use client';
import { useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import useSWRInfinite from 'swr/infinite';
import { Star } from 'lucide-react';
import {
  animeKinds,
  bookKinds,
  isWatchFormat,
  kindLabel,
  seasonLabel,
  type BrowseResponse,
  uniqueTitles,
} from '@animepoodle/shared';
import { useApp } from '@/lib/app-state';
import { getJson } from '@/lib/useApi';
import { acceptGenre, useGenres } from '@/lib/useGenres';
import { useRemember } from '@/lib/taste-engine';
import { stashStory, storyHref } from '@/lib/story';
import { releaseLabel } from '../TitleCard';
import StatusMenu from '../StatusMenu';

const api = process.env.NEXT_PUBLIC_API_URL || '';
const thisYear = new Date().getFullYear();
const years = Array.from({ length: thisYear + 1 - 1960 }, (_, i) => thisYear - i);

export default function TopPage() {
  const app = useApp();
  const { section } = app;
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const genres = useGenres();
  const watch = isWatchFormat(section.format);
  const kindOptions: readonly string[] = watch ? animeKinds : bookKinds;
  const kind = kindOptions.includes(params.get('kind') || '') ? params.get('kind')! : '';
  const year = years.includes(Number(params.get('year'))) ? params.get('year')! : '';
  const genre = acceptGenre(params.get('genre'), genres);
  const update = (next: Record<string, string | null>) => {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(next)) v ? p.set(k, v) : p.delete(k);
    router.replace(`${pathname}${p.size ? `?${p}` : ''}`, { scroll: false });
  };
  const query = useMemo(() => {
    const p = new URLSearchParams({ format: section.format, sort: 'SCORE_DESC' });
    if (kind) p.set('kind', kind);
    if (year) p.set('year', year);
    if (genre) p.set('genre', genre);
    return p.toString();
  }, [section.format, kind, year, genre]);
  const pages = useSWRInfinite<BrowseResponse, Error>(
    (i, prev: BrowseResponse | null) =>
      prev && !prev.pageInfo.hasNextPage ? null : `${api}/api/browse?${query}&page=${i + 1}`,
    (url: string) => getJson<BrowseResponse>(url, 'The chart is unavailable right now.'),
    { revalidateFirstPage: false, revalidateOnFocus: false, dedupingInterval: 300000 },
  );
  const items = useMemo(
    () => uniqueTitles(pages.data?.flatMap((p) => p.items) || []),
    [pages.data],
  );
  useRemember(pages.data?.[pages.data.length - 1]?.items);
  const hasMore = !!pages.data?.[pages.data.length - 1]?.pageInfo.hasNextPage && items.length < 100;
  const loadingMore = pages.isValidating && pages.size > (pages.data?.length || 0);

  const scope = [year || 'All time', genre, kind ? kindLabel(kind) : ''].filter(Boolean).join(', ');
  return (
    <main className="page top-page">
      <div className="page-head">
        <div>
          <h1>Top rated {section.plural}</h1>
          <p>
            Ranked by AniList score. We skip titles with only a handful of ratings, so this is what
            lots of people genuinely love.
          </p>
        </div>
      </div>
      <div className="chart-filters">
        <div className="kind-chips" role="group" aria-label="Type">
          <button
            aria-pressed={!kind}
            className={!kind ? 'selected' : ''}
            onClick={() => update({ kind: null })}
          >
            All types
          </button>
          {kindOptions.map((k) => (
            <button
              key={k}
              aria-pressed={kind === k}
              className={kind === k ? 'selected' : ''}
              onClick={() => update({ kind: kind === k ? null : k })}
            >
              {kindLabel(k)}
            </button>
          ))}
        </div>
        <div className="chart-selects">
          <label>
            Year
            <select value={year} onChange={(e) => update({ year: e.target.value || null })}>
              <option value="">All time</option>
              {years.map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </label>
          <label>
            Genre
            <select value={genre} onChange={(e) => update({ genre: e.target.value || null })}>
              <option value="">Any genre</option>
              {genres.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <h2 className="chart-scope">{scope}</h2>
      {pages.isLoading ? (
        <ol className="chart" aria-busy="true">
          {Array.from({ length: 8 }, (_, i) => (
            <li key={i} className="chart-row chart-skeleton" />
          ))}
        </ol>
      ) : items.length ? (
        <ol className="chart">
          {items.map((item, i) => (
            <li key={`${item.format}:${item.id}`} className={`chart-row ${i < 3 ? 'podium' : ''}`}>
              <span className="chart-rank" aria-label={`Rank ${i + 1}`}>
                {i + 1}
              </span>
              <Link
                className="chart-cover"
                href={storyHref(item)}
                onClick={() => stashStory(item)}
                tabIndex={-1}
                aria-hidden="true"
              >
                <img src={item.image} alt="" loading="lazy" />
              </Link>
              <div className="chart-main">
                <Link
                  className="chart-title"
                  href={storyHref(item)}
                  onClick={() => stashStory(item)}
                >
                  {app.name(item)}
                </Link>
                <div className="chart-meta">
                  <span className="chip">{kindLabel(item.mediaFormat)}</span>
                  <span>
                    {item.season && item.seasonYear
                      ? `${seasonLabel(item.season)} ${item.seasonYear}`
                      : item.year || 'TBA'}
                  </span>
                  <span>{item.episodes}</span>
                  {item.status && <span>{releaseLabel[item.status]}</span>}
                </div>
                <div className="chart-genres">{item.genres.slice(0, 4).join(', ')}</div>
              </div>
              <div className="chart-score">
                <Star size={16} fill="currentColor" />
                <strong>{item.rating ? item.rating.toFixed(1) : '—'}</strong>
                {item.popularity ? (
                  <small>
                    {new Intl.NumberFormat('en', { notation: 'compact' }).format(item.popularity)}{' '}
                    members
                  </small>
                ) : null}
              </div>
              <StatusMenu item={item} compact />
            </li>
          ))}
        </ol>
      ) : pages.error ? (
        <div className="extras-error" role="status">
          <p>{pages.error.message}</p>
          <button className="text-button" onClick={() => void pages.mutate()}>
            Try again
          </button>
        </div>
      ) : (
        <p className="extras-empty">Nothing’s ranked here yet. Try another year or type.</p>
      )}
      {hasMore && (
        <div className="load-more">
          <button
            className="subtle-button"
            disabled={loadingMore}
            onClick={() => void pages.setSize(pages.size + 1)}
          >
            {loadingMore
              ? 'Loading…'
              : `Show ${items.length + 1}–${Math.min(items.length + 30, 100)}`}
          </button>
        </div>
      )}
    </main>
  );
}
