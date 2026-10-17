# Shared components
## apps/web/src/components/TitleCard.tsx
```tsx
'use client';
import { useLayoutEffect, useRef, useState } from 'react';
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
  /** Cards borrow width from their neighbours within the current shelf. */
  layout?: 'grid' | 'rail';
}) {
  const app = useApp();
  const entry = app.entryFor(item);
  const name = app.name(item);
  const [failed, setFailed] = useState(false);
  const canHover = useCanHoverPreview();
  const root = useRef<HTMLElement>(null);
  const { hovering, bind } = useHoverIntent(550);
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

```
## apps/web/src/components/TitleGrid.tsx
```tsx
'use client';
import { Children, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** Keep each shelf's membership fixed while a preview borrows width from its neighbours. */
export default function TitleGrid({ children }: { children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const [columns, setColumns] = useState(2);
  useLayoutEffect(() => {
    const el = root.current!;
    const measure = () => {
      const widths = getComputedStyle(el).gridTemplateColumns.split(' ').map(Number.parseFloat);
      setColumns(widths.length);
      el.style.setProperty('--shelf-poster-h', `${widths[0] / 0.7}px`);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, []);
  const cards = Children.toArray(children);
  return (
    <div className="title-grid" ref={root}>
      {Array.from({ length: Math.ceil(cards.length / columns) }, (_, row) => {
        const shelf = cards.slice(row * columns, (row + 1) * columns);
        return (
          <div
            className="title-shelf"
            key={row}
            style={{
              gridTemplateColumns: Array.from({ length: columns }, () => 'minmax(0, 1fr)').join(
                ' ',
              ),
            }}
          >
            {shelf}
            {Array.from({ length: columns - shelf.length }, (_, i) => (
              <div key={`space-${i}`} aria-hidden="true" />
            ))}
          </div>
        );
      })}
    </div>
  );
}

```
## apps/web/src/components/StatusMenu.tsx
```tsx
'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { Bookmark, Check, ChevronDown, Trash2 } from 'lucide-react';
import { type Title } from '@animepoodle/shared';
import { useApp } from '@/lib/app-state';
import { libraryStatuses, statusLabel, statusTone } from '@/lib/library';

/**
 * Library control. `compact` is the icon button on covers; the full version shows the status
 * as text, for story pages.
 */
export default function StatusMenu({ item, compact = false }: { item: Title; compact?: boolean }) {
  const app = useApp();
  const entry = app.entryFor(item);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (
        e instanceof KeyboardEvent ? e.key === 'Escape' : !root.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const label = entry ? statusLabel(entry.status, item.format) : 'Add to library';
  return (
    <div className={`status-menu ${compact ? 'compact' : ''}`} ref={root}>
      <button
        className={`status-trigger ${entry ? `tone-${statusTone[entry.status]}` : ''}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={compact ? `${entry ? label : 'Add'}: ${item.title}` : undefined}
        title={compact ? label : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        {entry ? <Check size={compact ? 16 : 17} /> : <Bookmark size={compact ? 16 : 17} />}
        {!compact && <span>{label}</span>}
        {!compact && <ChevronDown size={15} />}
      </button>
      {open && (
        <div
          className="status-popover"
          role="menu"
          id={menuId}
          aria-label={`Library status for ${item.title}`}
        >
          {libraryStatuses.map((status) => (
            <button
              key={status}
              role="menuitemradio"
              aria-checked={entry?.status === status}
              className={`tone-${statusTone[status]}`}
              onClick={() => {
                app.setStatus(item, status);
                setOpen(false);
              }}
            >
              <span className="status-dot" />
              {statusLabel(status, item.format)}
              {entry?.status === status && <Check size={15} />}
            </button>
          ))}
          {entry && (
            <button
              role="menuitem"
              className="status-remove"
              onClick={() => {
                app.setStatus(item, null);
                setOpen(false);
              }}
            >
              <Trash2 size={15} />
              Remove from library
            </button>
          )}
        </div>
      )}
    </div>
  );
}

```
## apps/web/src/components/Modal.tsx
```tsx
'use client';
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
export default function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    const prior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      d.close();
      document.body.style.overflow = prior;
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'modal-wide' : ''}`}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-close-bar">
        <button onClick={onClose} className="icon-button close-button" aria-label="Close dialog">
          <X size={20} />
        </button>
      </div>
      <div className="modal-inner">{children}</div>
    </dialog>
  );
}

```