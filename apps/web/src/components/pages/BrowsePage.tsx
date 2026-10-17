'use client';
import { useEffect, useMemo, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import useSWRInfinite from 'swr/infinite';
import { Globe2, RotateCcw, Search, SlidersHorizontal, X } from 'lucide-react';
import {
  animeKinds,
  bookKinds,
  isWatchFormat,
  kindLabel,
  seasonLabel,
  seasons,
  type BrowseResponse,
  type CatalogResponse,
  uniqueTitles,
} from '@animepoodle/shared';
import { useApp } from '@/lib/app-state';
import { getJson } from '@/lib/useApi';
import { useRemember } from '@/lib/taste-engine';
import { useCatalogSWR } from '@/lib/useCatalogSWR';
import { acceptGenre, useGenres } from '@/lib/useGenres';
import TitleCard from '../TitleCard';
import TitleGrid from '../TitleGrid';
import LoadingShelf from '../LoadingShelf';
import Poodle from '../Poodle';

const api = process.env.NEXT_PUBLIC_API_URL || '';
const sorts = [
  ['POPULARITY_DESC', 'Most popular'],
  ['TRENDING_DESC', 'Trending now'],
  ['SCORE_DESC', 'Highest scored'],
  ['START_DATE_DESC', 'Newest first'],
  ['START_DATE', 'Oldest first'],
  ['TITLE_ROMAJI', 'Title A–Z'],
] as const;
const statuses = [
  ['ALL', 'Any status'],
  ['RELEASING', 'Airing / ongoing'],
  ['FINISHED', 'Finished'],
  ['NOT_YET_RELEASED', 'Coming soon'],
  ['HIATUS', 'On hiatus'],
  ['CANCELLED', 'Cancelled'],
] as const;
const thisYear = new Date().getFullYear();
const years = Array.from({ length: thisYear + 2 - 1960 }, (_, i) => thisYear + 1 - i);

export default function BrowsePage() {
  const app = useApp();
  const { section } = app;
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const genres = useGenres();
  const watch = isWatchFormat(section.format);
  const kindOptions: readonly string[] = watch ? animeKinds : bookKinds;

  const q = params.get('q') || '';
  const kinds = (params.get('kind') || '').split(',').filter((k) => kindOptions.includes(k));
  const genre = acceptGenre(params.get('genre'), genres);
  const year = years.includes(Number(params.get('year'))) ? params.get('year')! : '';
  const season =
    watch && (seasons as readonly string[]).includes(params.get('season') || '')
      ? params.get('season')!
      : '';
  const status = statuses.some(([v]) => v === params.get('status')) ? params.get('status')! : 'ALL';
  const sort = sorts.some(([v]) => v === params.get('sort'))
    ? params.get('sort')!
    : 'POPULARITY_DESC';
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [draft, setDraft] = useState(q);
  useEffect(() => setDraft(q), [q]);

  function update(next: Record<string, string | null>) {
    const p = new URLSearchParams(params.toString());
    p.delete('section');
    for (const [k, v] of Object.entries(next)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    // A season only makes sense with a year.
    if (p.get('season') && !p.get('year')) p.set('year', String(thisYear));
    router.replace(`${pathname}${p.size ? `?${p}` : ''}`, { scroll: false });
  }
  const toggleKind = (k: string) =>
    update({
      kind: (kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k]).join(',') || null,
    });

  // Browse mode: paged AniList query.
  const query = useMemo(() => {
    const p = new URLSearchParams({ format: section.format, sort });
    if (kinds.length) p.set('kind', kinds.join(','));
    if (genre) p.set('genre', genre);
    if (year) p.set('year', year);
    if (season) p.set('season', season);
    if (status !== 'ALL') p.set('status', status);
    return p.toString();
  }, [section.format, sort, kinds, genre, year, season, status]);
  const pages = useSWRInfinite<BrowseResponse, Error>(
    (i, prev: BrowseResponse | null) =>
      q || (prev && !prev.pageInfo.hasNextPage) ? null : `${api}/api/browse?${query}&page=${i + 1}`,
    (url: string) => getJson<BrowseResponse>(url, 'Browsing is unavailable right now.'),
    { revalidateFirstPage: false, revalidateOnFocus: false, dedupingInterval: 120000 },
  );
  // Search mode: the existing search endpoint, cached for offline use.
  const [broaden, setBroaden] = useState(false);
  useEffect(() => setBroaden(false), [q, section.format]);
  const searchPath = q
    ? `/api/search?q=${encodeURIComponent(q)}&format=${section.format}&status=${status}${broaden ? '&broaden=1' : ''}`
    : null;
  const search = useCatalogSWR(searchPath);

  const browseItems = useMemo(
    () => uniqueTitles(pages.data?.flatMap((p) => p.items) || []),
    [pages.data],
  );
  const searchItems = useMemo(
    () =>
      uniqueTitles((search.data as CatalogResponse | undefined)?.items || []).filter(
        (t) =>
          t.format === section.format &&
          (!kinds.length || kinds.includes(t.mediaFormat || '')) &&
          (!genre || t.genres.includes(genre)) &&
          (!year || t.year === Number(year)),
      ),
    [search.data, section.format, kinds, genre, year],
  );
  const items = q ? searchItems : browseItems;
  const matched = (search.data as CatalogResponse | undefined)?.matched;
  const matchedTerms: [string, string][] = matched
    ? [
        ...matched.studios.map((n): [string, string] => ['studio', n]),
        ...matched.genres.map((n): [string, string] => ['genre', n]),
        ...matched.tags.map((n): [string, string] => ['tag', n]),
      ]
    : [];
  useRemember(q ? searchItems : pages.data?.[pages.data.length - 1]?.items);
  const total = pages.data?.[0]?.pageInfo.total;
  const loading = q ? search.isLoading : pages.isLoading;
  const loadingMore = !q && pages.isValidating && pages.size > (pages.data?.length || 0);
  const hasMore = !q && !!pages.data?.[pages.data.length - 1]?.pageInfo.hasNextPage;
  const error = q ? search.error : pages.error;
  const activeCount =
    kinds.length + (genre ? 1 : 0) + (year ? 1 : 0) + (season ? 1 : 0) + (status !== 'ALL' ? 1 : 0);

  const heading = q
    ? `Results for “${q}”`
    : [
        season && year ? `${seasonLabel(season)} ${year}` : year,
        genre,
        kinds.length === 1
          ? kindLabel(kinds[0]).toLowerCase() + (kinds[0] === 'MOVIE' ? 's' : '')
          : '',
        section.plural,
      ]
        .filter(Boolean)
        .join(' ')
        .replace(/^./, (c) => c.toUpperCase());

  return (
    <main className="page browse-page">
      <div className="page-head">
        <div>
          <h1>Browse</h1>
          <p>
            Everything on AniList in one place. Narrow it down by type, year,
            {watch ? ' season,' : ''} genre or status, then get happily lost.
          </p>
        </div>
      </div>

      <form
        className="browse-search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          update({ q: draft.trim().length >= 2 ? draft.trim() : null });
        }}
      >
        <Search size={19} />
        <input
          aria-label={`Search ${section.plural}`}
          placeholder={`Search ${section.plural} by title`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        {q && (
          <button
            type="button"
            className="icon-button"
            aria-label="Clear search"
            onClick={() => update({ q: null })}
          >
            <X size={16} />
          </button>
        )}
        <button type="submit" className="primary-button">
          Search
        </button>
      </form>

      <div className="kind-chips" role="group" aria-label="Type">
        <button
          aria-pressed={!kinds.length}
          className={!kinds.length ? 'selected' : ''}
          onClick={() => update({ kind: null })}
        >
          All types
        </button>
        {kindOptions.map((k) => (
          <button
            key={k}
            aria-pressed={kinds.includes(k)}
            className={kinds.includes(k) ? 'selected' : ''}
            onClick={() => toggleKind(k)}
          >
            {kindLabel(k)}
          </button>
        ))}
      </div>

      <button
        className={`filter-button filters-toggle ${filtersOpen ? 'selected' : ''}`}
        aria-expanded={filtersOpen}
        aria-controls="browse-filters"
        onClick={() => setFiltersOpen((o) => !o)}
      >
        <SlidersHorizontal size={17} />
        Filters{activeCount ? ` (${activeCount})` : ''}
      </button>
      <div id="browse-filters" className={`browse-filters ${filtersOpen ? 'open' : ''}`}>
        <label>
          Year
          <select
            value={year}
            onChange={(e) =>
              update({
                year: e.target.value || null,
                season: e.target.value ? season || null : null,
              })
            }
          >
            <option value="">Any year</option>
            {years.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </label>
        {watch && (
          <label>
            Season
            <select value={season} onChange={(e) => update({ season: e.target.value || null })}>
              <option value="">Any season</option>
              {seasons.map((s) => (
                <option key={s} value={s}>
                  {seasonLabel(s)}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Genre
          <select value={genre} onChange={(e) => update({ genre: e.target.value || null })}>
            <option value="">Any genre</option>
            {genres.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select
            aria-label="Release status"
            value={status}
            onChange={(e) => update({ status: e.target.value === 'ALL' ? null : e.target.value })}
          >
            {statuses.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          Sort by
          <select
            aria-label="Sort stories"
            value={sort}
            disabled={!!q}
            onChange={(e) => update({ sort: e.target.value })}
          >
            {sorts.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        {activeCount > 0 && (
          <button
            className="text-button"
            onClick={() =>
              update({ kind: null, genre: null, year: null, season: null, status: null })
            }
          >
            <RotateCcw size={14} /> Reset filters
          </button>
        )}
      </div>

      <div className="results-head">
        <h2>{heading}</h2>
        <span>
          {loading
            ? 'Loading…'
            : q
              ? `${items.length} ${items.length === 1 ? 'result' : 'results'}${search.data?.source ? ` from ${search.data.source}` : ''}`
              : total
                ? `${total.toLocaleString()} titles`
                : `${items.length} titles`}
        </span>
      </div>

      {q && matchedTerms.length > 0 && (
        <p className="search-matched">
          <span>Also searching</span>
          {matchedTerms.map(([kind, name]) => (
            <span key={`${kind}:${name}`} className="chip">
              {name} <small>{kind}</small>
            </span>
          ))}
        </p>
      )}
      {q && search.data && section.format !== 'Donghua' && !broaden && (
        <div className="live-search-bar">
          <span>
            <Globe2 size={15} /> Can’t find it? Let’s ask MyAnimeList too.
          </span>
          <button onClick={() => setBroaden(true)}>Broaden with Jikan</button>
        </div>
      )}
      {(search.data?.notice || (error && items.length > 0)) && (
        <p className="status-message" role="status">
          {search.data?.notice ||
            'Couldn’t refresh just now, so you’re seeing what we loaded earlier.'}
        </p>
      )}

      {loading && !items.length ? (
        <LoadingShelf label={section.plural} />
      ) : items.length ? (
        <TitleGrid>
          {items.map((item) => (
            <TitleCard key={`${item.format}:${item.id}`} item={item} />
          ))}
        </TitleGrid>
      ) : error ? (
        <div className="extras-error" role="status">
          <p>{error.message}</p>
          <button
            className="text-button"
            onClick={() => void (q ? search.mutate() : pages.mutate())}
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="empty-state">
          <Poodle />
          <h3>Nothing matched that.</h3>
          <p>Try loosening a filter or two. The good stuff might be hiding just outside them.</p>
        </div>
      )}

      {hasMore && (
        <div className="load-more">
          <button
            className="subtle-button"
            disabled={loadingMore}
            onClick={() => void pages.setSize(pages.size + 1)}
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </main>
  );
}
