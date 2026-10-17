'use client';
import { useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import Link from 'next/link';
import { BookOpen, Star } from 'lucide-react';
import { kindLabel, seasonLabel, type RankedTitle, type Title } from '@animepoodle/shared';
import { useApp } from '@/lib/app-state';
import { statusLabel, statusTone } from '@/lib/library';
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
  /** Rails widen the card in place; grids give it two columns. */
  layout?: 'grid' | 'rail';
}) {
  const app = useApp();
  const entry = app.entryFor(item);
  const name = app.name(item);
  const [failed, setFailed] = useState(false);
  const canHover = useCanHoverPreview();
  const root = useRef<HTMLElement>(null);
  const [anchor, setAnchor] = useState<React.CSSProperties | null>(null);
  const { hovering, bind } = useHoverIntent(550, (update) => {
    const el = root.current;
    const animated = layout === 'grid' && !!item.trailer?.embedUrl && app.prefs.hoverPreviews;
    if (!animated || !el) return update();
    // Pin the card to its own row and spread into the neighbouring column (leftwards when it
    // sits in the last column), keeping its height, so it never slides out from under the
    // pointer. The other cards flow around it.
    let next: React.CSSProperties | null = null;
    if (!hovering) {
      const grid = el.parentElement!;
      const cols = getComputedStyle(grid).gridTemplateColumns.split(' ').length;
      const index = Array.prototype.indexOf.call(grid.children, el);
      if (cols >= 2) {
        const col = (index % cols) + 1;
        const start = col === cols ? cols - 1 : col;
        next = {
          gridRow: Math.floor(index / cols) + 1,
          gridColumn: `${start} / span 2`,
          ['--poster-h' as string]: `${el.querySelector('.poster-wrap')!.getBoundingClientRect().height}px`,
        };
      }
    }
    const apply = () => {
      setAnchor(next);
      update();
    };
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    if (doc.startViewTransition) doc.startViewTransition(() => flushSync(apply));
    else apply();
  });
  const previewing = canHover && hovering && app.prefs.hoverPreviews && !!item.trailer?.embedUrl;
  const pinned = previewing && layout === 'grid' && !!anchor;
  const href = storyHref(item);
  const open = () => stashStory(item);
  const watch = item.format === 'Anime' || item.format === 'Donghua';
  return (
    <article
      ref={root}
      className={`title-card size-${size} ${previewing ? 'is-previewing' : ''} ${pinned ? 'is-pinned' : ''}`}
      style={
        {
          viewTransitionName: layout === 'grid' ? `card-${item.format}-${item.id}` : undefined,
          ...(pinned ? anchor : {}),
        } as React.CSSProperties
      }
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
          {rank !== undefined && <span className="rank-badge">{rank}</span>}
          <span className="format-badge">{kindLabel(item.mediaFormat)}</span>
          <span className="poster-rating">
            <Star size={11} fill="currentColor" />
            {item.rating ? item.rating.toFixed(1) : 'New'}
          </span>
        </Link>
        <CardTrailer item={item} hovering={previewing} />
        <StatusMenu item={item} compact />
      </div>
      <Link className="card-title" href={href} onClick={open}>
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
