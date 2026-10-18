'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { uniqueTitles, type RankedTitle, type Title } from '@animepoodle/shared';
import TitleCard from './TitleCard';

const AUTO_TURN_MS = 7000;
// Auto-turning only where it can't fight the visitor: wide screens with a mouse, motion allowed.
const AUTO_TURN_QUERY =
  '(min-width: 1024px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)';

/** A titled, horizontally scrolling row of cards with a "See all" link. On desktop the row
 *  turns a page by itself every few seconds, and pauses while it's being looked at. */
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
  const section = useRef<HTMLElement>(null);
  const [page, setPage] = useState({ at: 1, of: 1 });
  const [turns, setTurns] = useState(0);
  // One page is as many whole cards as fit, so a turn never leaves a card cut in half.
  const pageWidth = (el: HTMLDivElement) => {
    const card = el.firstElementChild as HTMLElement | null;
    if (!card) return el.clientWidth;
    const step = card.offsetWidth + (parseFloat(getComputedStyle(el).columnGap) || 0);
    return Math.max(1, Math.floor((el.clientWidth + 1) / step)) * step;
  };
  // Page stops: every whole page from the start, and the very end for a last partial page.
  const stops = (el: HTMLDivElement) => {
    const width = pageWidth(el);
    const max = Math.max(0, el.scrollWidth - el.clientWidth);
    const list: number[] = [];
    for (let x = 0; x < max - 2; x += width) list.push(x);
    list.push(max);
    return list;
  };
  const current = (el: HTMLDivElement, list: number[]) =>
    list.reduce(
      (best, x, i) =>
        Math.abs(x - el.scrollLeft) < Math.abs(list[best] - el.scrollLeft) ? i : best,
      0,
    );
  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const list = stops(el);
    const at = current(el, list) + 1;
    const of = list.length;
    setPage((p) => (p.at === at && p.of === of ? p : { at, of }));
  }, []);
  const scroll = useCallback((dir: 1 | -1) => {
    const el = track.current;
    if (!el) return;
    const list = stops(el);
    // The last page turns back to the first, and the first back to the last.
    const next = (current(el, list) + dir + list.length) % list.length;
    el.scrollTo({ left: list[next], behavior: 'smooth' });
  }, []);
  const turn = (dir: 1 | -1) => {
    scroll(dir);
    setTurns((n) => n + 1); // a manual turn restarts the auto-turn clock
  };
  const count = items?.length || 0;
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    measure();
    const resize = new ResizeObserver(measure);
    resize.observe(el);
    el.addEventListener('scroll', measure, { passive: true });
    return () => {
      resize.disconnect();
      el.removeEventListener('scroll', measure);
    };
  }, [measure, count]);
  useEffect(() => {
    const el = track.current;
    const root = section.current;
    if (!el || !root || !window.matchMedia(AUTO_TURN_QUERY).matches) return;
    let visible = false;
    const seen = new IntersectionObserver(([entry]) => (visible = entry.isIntersecting), {
      threshold: 0.6,
    });
    seen.observe(el);
    const timer = window.setInterval(() => {
      const busy = root.matches(':hover') || root.matches(':focus-within');
      if (visible && !busy && !document.hidden && el.scrollWidth > el.clientWidth + 2) scroll(1);
    }, AUTO_TURN_MS);
    return () => {
      window.clearInterval(timer);
      seen.disconnect();
    };
  }, [scroll, count, turns]);
  return (
    <section className="rail" aria-labelledby={`${id}-title`} ref={section}>
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
          {page.of > 1 && (
            <span className="rail-page" aria-hidden="true">
              {String(page.at).padStart(2, '0')}
              <i>/</i>
              {String(page.of).padStart(2, '0')}
            </span>
          )}
          <button
            className="icon-button"
            aria-label={`Scroll ${title} back`}
            onClick={() => turn(-1)}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            className="icon-button"
            aria-label={`Scroll ${title} forward`}
            onClick={() => turn(1)}
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
