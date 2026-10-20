'use client';
import { useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { BookOpen, Star } from 'lucide-react';
import { kindLabel, seasonLabel, type RankedTitle, type Title } from '@animepoodle/shared';
import { useApp } from '@/lib/app-state';
import { statusLabel, statusTone } from '@/lib/library';
import { kanjiNumber } from '@/lib/kanji';
import { stashStory, storyHref } from '@/lib/story';
import CardTrailer, { useCanHoverPreview, useHoverIntent } from './CardTrailer';
import StatusMenu from './StatusMenu';

export const releaseLabel: Record<string, string> = {
  RELEASING: 'Airing now',
  FINISHED: 'Finished',
  NOT_YET_RELEASED: 'Coming soon',
  HIATUS: 'On hiatus',
  CANCELLED: 'Cancelled',
};
const readingStatus: Record<string, string> = { ...releaseLabel, RELEASING: 'Ongoing' };

export default function TitleCard({
  item,
  match,
  rank,
  size = 'md',
  layout = 'grid',
}: {
  item: Title;
  match?: RankedTitle;
  rank?: number;
  size?: 'md' | 'lg';
  /** Cards borrow width from their neighbours within the current shelf. */
  layout?: 'grid' | 'rail';
}) {
  const app = useApp();
  const entry = app.entryFor(item);
  const name = app.name(item);
  const [failed, setFailed] = useState(false);
  const canHover = useCanHoverPreview();
  const root = useRef<HTMLElement>(null);
  const { hovering, bind } = useHoverIntent(380);
  const previewing = canHover && hovering && app.prefs.hoverPreviews && !!item.trailer?.embedUrl;
  useLayoutEffect(() => {
    const el = root.current;
    if (!previewing || !el) return;
    const shelf = el.parentElement!;
    const cards = Array.from(shelf.children) as HTMLElement[];
    if (layout === 'grid' && shelf.classList.contains('title-shelf') && cards.length > 1) {
      const index = cards.indexOf(el);
      // Match Home's full 16:9 width at the existing poster height. On narrow shelves,
      // leave each neighbour at least 30% of its normal width rather than overflowing.
      const expanded = Math.min(16 / 9 / 0.7, cards.length - 0.3 * (cards.length - 1));
      shelf.style.gridTemplateColumns = cards
        .map(
          (_, i) =>
            `minmax(0, ${i === index ? expanded : (cards.length - expanded) / (cards.length - 1)}fr)`,
        )
        .join(' ');
      const reset = () => {
        shelf.style.gridTemplateColumns = cards.map(() => 'minmax(0, 1fr)').join(' ');
      };
      // A resized grid gets regrouped by TitleGrid; release any borrowed width first.
      window.addEventListener('resize', reset);
      return () => {
        window.removeEventListener('resize', reset);
        reset();
      };
    }
  }, [previewing, layout]);
  const href = storyHref(item);
  const open = () => stashStory(item);
  const watch = item.format === 'Anime' || item.format === 'Donghua';
  return (
    <article
      ref={root}
      className={`title-card size-${size} ${previewing ? 'is-previewing' : ''}`}
      {...bind}
    >
      <div className="poster-wrap" style={{ background: item.color }}>
        <Link className="poster-button" href={href} onClick={open} aria-label={`Open ${name}`}>
          {!failed ? (
            <img
              src={item.image}
              alt={`${name} cover`}
              loading="lazy"
              onError={() => setFailed(true)}
            />
          ) : (
            <span className="cover-fallback">
              <BookOpen size={35} />
              <strong>{name}</strong>
            </span>
          )}
          {rank !== undefined && (
            <span className="rank-badge" aria-label={`Rank ${rank}`}>
              {kanjiNumber(rank)}
            </span>
          )}
          <span className="format-badge">{kindLabel(item.mediaFormat)}</span>
          <span className="poster-rating">
            <Star size={11} fill="currentColor" />
            {item.rating ? item.rating.toFixed(1) : 'New'}
          </span>
        </Link>
        <CardTrailer item={item} hovering={previewing} />
        <StatusMenu item={item} compact />
      </div>
      <Link
        className="card-title"
        href={href}
        onClick={open}
        // A guessed English name shows the original on hover, so look-alike names stay clear.
        title={item.titles?.englishFrom ? item.titles.romaji || item.original : undefined}
      >
        {name}
      </Link>
      <div className="card-meta">
        <span>
          {item.season && item.seasonYear
            ? `${seasonLabel(item.season)} ${item.seasonYear}`
            : item.year || 'TBA'}
        </span>
        <span>{item.episodes}</span>
      </div>
      <div className="card-tags">
        {item.status && (
          <span className="release-badge">
            {(watch ? releaseLabel : readingStatus)[item.status]}
          </span>
        )}
        {entry && (
          <span className={`library-badge tone-${statusTone[entry.status]}`}>
            {statusLabel(entry.status, item.format)}
          </span>
        )}
        {match && <span className="card-match">{Math.round(match.score)}% match</span>}
      </div>
    </article>
  );
}
