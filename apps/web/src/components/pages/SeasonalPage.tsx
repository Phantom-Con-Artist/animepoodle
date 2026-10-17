'use client';
import { useMemo } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import useSWRInfinite from 'swr/infinite';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import {
  animeKinds,
  currentSeason,
  isWatchFormat,
  mediaKinds,
  seasonLabel,
  seasons,
  type BrowseResponse,
  type Season,
  type Title,
  uniqueTitles,
} from '@animepoodle/shared';
import { useApp } from '@/lib/app-state';
import { getJson } from '@/lib/useApi';
import { useRemember } from '@/lib/taste-engine';
import TitleCard from '../TitleCard';
import TitleGrid from '../TitleGrid';
import LoadingShelf from '../LoadingShelf';

const api = process.env.NEXT_PUBLIC_API_URL || '';
const order = [...animeKinds, 'MUSIC'];

function shift(season: Season, year: number, by: 1 | -1) {
  const i = seasons.indexOf(season) + by;
  if (i < 0) return { season: seasons[3], year: year - 1 };
  if (i > 3) return { season: seasons[0], year: year + 1 };
  return { season: seasons[i], year };
}

export default function SeasonalPage() {
  const { section } = useApp();
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const now = currentSeason();
  const season = (seasons as readonly string[]).includes(params.get('season') || '')
    ? (params.get('season') as Season)
    : now.season;
  const rawYear = Number(params.get('year'));
  const year = rawYear >= 1960 && rawYear <= now.year + 2 ? rawYear : now.year;
  const go = (s: Season, y: number) =>
    router.replace(
      s === now.season && y === now.year ? pathname : `${pathname}?season=${s}&year=${y}`,
      { scroll: false },
    );
  const watch = isWatchFormat(section.format);
  const pages = useSWRInfinite<BrowseResponse, Error>(
    (i, prev: BrowseResponse | null) =>
      !watch || (prev && !prev.pageInfo.hasNextPage)
        ? null
        : `${api}/api/browse?format=${section.format}&season=${season}&year=${year}&sort=POPULARITY_DESC&page=${i + 1}`,
    (url: string) => getJson<BrowseResponse>(url, 'This season is unavailable right now.'),
    {
      initialSize: 2,
      revalidateFirstPage: false,
      revalidateOnFocus: false,
      dedupingInterval: 300000,
    },
  );
  const items = useMemo(
    () => uniqueTitles(pages.data?.flatMap((p) => p.items) || []),
    [pages.data],
  );
  useRemember(pages.data?.[pages.data.length - 1]?.items);
  const groups = useMemo(() => {
    const map = new Map<string, Title[]>();
    for (const item of items) {
      const k = item.mediaFormat && order.includes(item.mediaFormat) ? item.mediaFormat : 'TV';
      map.set(k, [...(map.get(k) || []), item]);
    }
    return order.filter((k) => map.has(k)).map((k) => ({ kind: k, items: map.get(k)! }));
  }, [items]);
  const prev = shift(season, year, -1);
  const next = shift(season, year, 1);
  const hasMore = !!pages.data?.[pages.data.length - 1]?.pageInfo.hasNextPage;
  const total = pages.data?.[0]?.pageInfo.total;

  if (!watch)
    return (
      <main className="page seasonal-page">
        <div className="page-head">
          <div>
            <h1>Seasonal</h1>
            <p>
              Seasons are how anime is scheduled. {section.label} doesn’t follow them, so browse new
              {` ${section.plural}`} by year instead.
            </p>
          </div>
        </div>
        <Link className="primary-button" href={`/browse?year=${now.year}&sort=START_DATE_DESC`}>
          New {section.plural} this year
        </Link>
      </main>
    );

  return (
    <main className="page seasonal-page">
      <div className="page-head">
        <div>
          <h1>
            {seasonLabel(season)} {year}
          </h1>
          <p>
            Everything that premiered this season, sorted by type: series, movies, OVAs, the lot.
            {season === now.season && year === now.year ? ' This one’s airing right now.' : ''}
          </p>
        </div>
      </div>
      <div className="season-picker">
        <button
          className="icon-button"
          aria-label={`${seasonLabel(prev.season)} ${prev.year}`}
          onClick={() => go(prev.season, prev.year)}
        >
          <ChevronLeft size={18} />
        </button>
        <div className="season-tabs" role="group" aria-label="Season">
          {seasons.map((s) => (
            <button
              key={s}
              aria-pressed={s === season}
              className={s === season ? 'selected' : ''}
              onClick={() => go(s, year)}
            >
              {seasonLabel(s)}
            </button>
          ))}
        </div>
        <select aria-label="Year" value={year} onChange={(e) => go(season, Number(e.target.value))}>
          {Array.from({ length: now.year + 2 - 1960 }, (_, i) => now.year + 1 - i).map((y) => (
            <option key={y}>{y}</option>
          ))}
        </select>
        <button
          className="icon-button"
          aria-label={`${seasonLabel(next.season)} ${next.year}`}
          onClick={() => go(next.season, next.year)}
        >
          <ChevronRight size={18} />
        </button>
        {(season !== now.season || year !== now.year) && (
          <button className="text-button" onClick={() => go(now.season, now.year)}>
            Current season
          </button>
        )}
      </div>
      {groups.length > 0 && (
        <nav className="kind-jump" aria-label="Jump to type">
          {groups.map((g) => (
            <a key={g.kind} href={`#kind-${g.kind}`}>
              {mediaKinds[g.kind]?.group || g.kind} <span>{g.items.length}</span>
            </a>
          ))}
          {total ? <small>{total} titles this season</small> : null}
        </nav>
      )}
      {pages.isLoading ? (
        <LoadingShelf label={`${seasonLabel(season)} ${year} anime`} />
      ) : groups.length ? (
        groups.map((g) => (
          <section key={g.kind} id={`kind-${g.kind}`} className="kind-group">
            <h2>
              {mediaKinds[g.kind]?.group || g.kind} <span>{g.items.length}</span>
            </h2>
            <TitleGrid>
              {g.items.map((item) => (
                <TitleCard key={`${item.format}:${item.id}`} item={item} />
              ))}
            </TitleGrid>
          </section>
        ))
      ) : pages.error ? (
        <div className="extras-error" role="status">
          <p>{pages.error.message}</p>
          <button className="text-button" onClick={() => void pages.mutate()}>
            Try again
          </button>
        </div>
      ) : (
        <p className="extras-empty">
          Nothing’s listed for this season yet. Check back closer to the date.
        </p>
      )}
      {hasMore && (
        <div className="load-more">
          <button
            className="subtle-button"
            disabled={pages.isValidating}
            onClick={() => void pages.setSize(pages.size + 1)}
          >
            {pages.isValidating ? 'Loading…' : 'Load more from this season'}
          </button>
        </div>
      )}
    </main>
  );
}
