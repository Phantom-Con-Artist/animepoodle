'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import useSWRInfinite from 'swr/infinite';
import { ArrowUpRight, Heart } from 'lucide-react';
import { kindLabel, type StudioResponse, type Title, uniqueTitles } from '@animepoodle/shared';
import { getJson } from '@/lib/useApi';
import { useRemember } from '@/lib/taste-engine';
import TitleCard from '../TitleCard';
import TitleGrid from '../TitleGrid';
import LoadingShelf from '../LoadingShelf';
import { pageKanji } from '@/lib/kanji';

const api = process.env.NEXT_PUBLIC_API_URL || '';
const sorts = [
  ['START_DATE_DESC', 'Newest first'],
  ['POPULARITY_DESC', 'Most popular'],
  ['SCORE_DESC', 'Highest scored'],
] as const;

export default function StudioPage() {
  const params = useSearchParams();
  const raw = params.get('id') || '';
  const id = /^[1-9]\d{0,8}$/.test(raw) ? raw : null;
  const [sort, setSort] = useState<string>('START_DATE_DESC');
  const [kind, setKind] = useState('');
  const pages = useSWRInfinite<StudioResponse, Error>(
    (i, prev: StudioResponse | null) =>
      !id || (prev && !prev.pageInfo.hasNextPage)
        ? null
        : `${api}/api/studio/${id}?sort=${sort}&page=${i + 1}`,
    (url: string) => getJson<StudioResponse>(url, 'Studio details are unavailable right now.'),
    { revalidateFirstPage: false, revalidateOnFocus: false },
  );
  const studio = pages.data?.[0];
  const all = useMemo(() => uniqueTitles(pages.data?.flatMap((p) => p.items) || []), [pages.data]);
  useRemember(pages.data?.[pages.data.length - 1]?.items);
  const kinds = useMemo(() => [...new Set(all.map((t) => t.mediaFormat || 'TV'))], [all]);
  const items = kind ? all.filter((t) => (t.mediaFormat || 'TV') === kind) : all;
  // Newest-first lists read best as a timeline, grouped by year.
  const byYear = useMemo(() => {
    if (sort !== 'START_DATE_DESC') return null;
    const map = new Map<string, Title[]>();
    for (const t of items) {
      const y = t.year ? String(t.year) : 'Not yet dated';
      map.set(y, [...(map.get(y) || []), t]);
    }
    return [...map.entries()];
  }, [items, sort]);

  if (!id)
    return (
      <main className="page">
        <div className="empty-state">
          <h3>We couldn’t find that studio.</h3>
          <p>The link is missing a studio ID.</p>
          <Link className="primary-button" href="/">
            Back to home
          </Link>
        </div>
      </main>
    );
  return (
    <main className="page studio-page">
      <div className="page-head" data-kanji={pageKanji.studio}>
        <div>
          <span className="feature-label">
            {studio ? (studio.isAnimationStudio ? 'Animation studio' : 'Producer') : 'Studio'}
          </span>
          <h1>{studio?.name || 'Loading studio…'}</h1>
          {studio && (
            <p className="studio-facts">
              {studio.pageInfo.total && studio.pageInfo.total < 5000 ? (
                <span>{studio.pageInfo.total} titles as main studio</span>
              ) : null}
              <span>
                <Heart size={14} /> {studio.favourites.toLocaleString()} AniList favourites
              </span>
              <a href={studio.url} target="_blank" rel="noopener noreferrer">
                AniList page <ArrowUpRight size={13} />
              </a>
            </p>
          )}
        </div>
      </div>
      <div className="library-toolbar">
        <div className="kind-chips" role="group" aria-label="Type">
          <button
            aria-pressed={!kind}
            className={!kind ? 'selected' : ''}
            onClick={() => setKind('')}
          >
            All types
          </button>
          {kinds.map((k) => (
            <button
              key={k}
              aria-pressed={kind === k}
              className={kind === k ? 'selected' : ''}
              onClick={() => setKind(kind === k ? '' : k)}
            >
              {kindLabel(k)}
            </button>
          ))}
        </div>
        <select aria-label="Sort works" value={sort} onChange={(e) => setSort(e.target.value)}>
          {sorts.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </div>
      {pages.error && !studio ? (
        <div className="extras-error" role="status">
          <p>{pages.error.message}</p>
          <button className="text-button" onClick={() => void pages.mutate()}>
            Try again
          </button>
        </div>
      ) : pages.isLoading ? (
        <LoadingShelf label={'this studio’s titles'} />
      ) : byYear ? (
        byYear.map(([y, list]) => (
          <section key={y} className="kind-group">
            <h2>
              {y} <span>{list.length}</span>
            </h2>
            <TitleGrid>
              {list.map((t) => (
                <TitleCard key={`${t.format}:${t.id}`} item={t} />
              ))}
            </TitleGrid>
          </section>
        ))
      ) : (
        <TitleGrid>
          {items.map((t) => (
            <TitleCard key={`${t.format}:${t.id}`} item={t} />
          ))}
        </TitleGrid>
      )}
      {!!pages.data?.[pages.data.length - 1]?.pageInfo.hasNextPage && (
        <div className="load-more">
          <button
            className="subtle-button"
            disabled={pages.isValidating}
            onClick={() => void pages.setSize(pages.size + 1)}
          >
            {pages.isValidating ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </main>
  );
}
