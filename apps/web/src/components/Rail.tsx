'use client';
import { useRef } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { uniqueTitles, type RankedTitle, type Title } from '@animepoodle/shared';
import TitleCard from './TitleCard';

/** A titled, horizontally scrolling row of cards with a "See all" link. */
export default function Rail({
  id,
  title,
  description,
  items,
  href,
  loading,
  error,
  matches,
  ranked = false,
  empty = 'Nothing here yet.',
}: {
  id: string;
  title: string;
  description?: string;
  items: Title[] | undefined;
  href?: string;
  loading?: boolean;
  error?: string;
  matches?: Map<string, RankedTitle>;
  ranked?: boolean;
  empty?: string;
}) {
  const track = useRef<HTMLDivElement>(null);
  const scroll = (dir: 1 | -1) =>
    track.current?.scrollBy({ left: dir * track.current.clientWidth * 0.85, behavior: 'smooth' });
  return (
    <section className="rail" aria-labelledby={`${id}-title`}>
      <div className="rail-head">
        <div>
          <h2 id={`${id}-title`}>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        <div className="rail-actions">
          {href && (
            <Link className="text-button" href={href}>
              See all
            </Link>
          )}
          <button
            className="icon-button"
            aria-label={`Scroll ${title} back`}
            onClick={() => scroll(-1)}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            className="icon-button"
            aria-label={`Scroll ${title} forward`}
            onClick={() => scroll(1)}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>
      {items?.length ? (
        <div className="rail-track" ref={track}>
          {uniqueTitles(items).map((item, i) => (
            <TitleCard
              key={`${item.format}:${item.id}`}
              item={item}
              layout="rail"
              rank={ranked ? i + 1 : undefined}
              match={matches?.get(`${item.format}:${item.id}`)}
            />
          ))}
        </div>
      ) : loading ? (
        <div className="rail-track" aria-busy="true" aria-label={`Loading ${title}`}>
          {Array.from({ length: 6 }, (_, i) => (
            <span key={i} className="card-skeleton" />
          ))}
        </div>
      ) : (
        <p className={error ? 'extras-error' : 'extras-empty'}>{error || empty}</p>
      )}
    </section>
  );
}
