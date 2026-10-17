'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Pause, Play, Star } from 'lucide-react';
import { kindLabel, type Title } from '@animepoodle/shared';
import { stashStory, storyHref } from '@/lib/story';
import { useApp } from '@/lib/app-state';
import { releaseLabel } from './TitleCard';
import CardTrailer, { useCanHoverPreview, useHoverIntent } from './CardTrailer';
import StatusMenu from './StatusMenu';
import HypeButton from './HypeButton';

const ROTATE_MS = 9000;
// Safety net in case a player never reports that it finished.
const MAX_TRAILER_MS = 240000;

const firstSentences = (text: string) => {
  const parts = text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s/);
  let out = '';
  for (const p of parts) {
    if ((out + p).length > 480) break;
    out += (out ? ' ' : '') + p;
  }
  return out || text.slice(0, 480);
};

/**
 * Top highlights. Without a video it rotates every 9 seconds. Hovering (or tapping Trailer)
 * expands the picture, hides the text and plays the trailer once; when it ends the next
 * highlight takes over, and keeps playing if the pointer is still there.
 */
export default function HighlightHero({ items, label }: { items: Title[]; label: string }) {
  const picks = items.filter((i) => i.bannerImage).slice(0, 5);
  const list = picks.length >= 3 ? picks : items.slice(0, 5);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [playing, setPlaying] = useState(false);
  const app = useApp();
  const canHover = useCanHoverPreview();
  const { hovering, bind } = useHoverIntent(500);
  const current = list[Math.min(index, list.length - 1)];
  const hasVideo = !!current?.trailer?.embedUrl;
  const expanded = playing;
  const next = useCallback(
    () => setIndex((i) => (i + 1) % Math.max(list.length, 1)),
    [list.length],
  );

  useEffect(() => setIndex(0), [items]);
  useEffect(() => {
    if (paused || list.length < 2) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Reading the text (hovering a title with no trailer) also pauses rotation.
    if (!playing && hovering) return;
    const t = setTimeout(next, playing ? MAX_TRAILER_MS : ROTATE_MS);
    return () => clearTimeout(t);
  }, [index, paused, hovering, playing, list.length, next]);

  if (!current) return null;
  const href = storyHref(current);
  return (
    <section className="highlight" aria-label="Top highlights" aria-roledescription="carousel">
      <div className={`highlight-stage ${expanded ? 'is-playing' : ''}`} {...bind}>
        <div className="highlight-media">
          <img
            key={current.bannerImage || current.image}
            src={current.bannerImage || current.image}
            alt=""
            className="highlight-art"
          />
          <CardTrailer
            key={`${current.format}:${current.id}`}
            item={current}
            hovering={canHover && hovering && hasVideo && app.prefs.hoverPreviews}
            loop={false}
            onPlayingChange={setPlaying}
            onEnded={next}
          />
        </div>
        {/* Shown only while a trailer plays, so the title and link stay in reach. */}
        <div className="highlight-nowplaying" aria-hidden={!expanded}>
          <strong>{app.name(current)}</strong>
          <HypeButton item={current} compact />
          <Link
            className="text-button"
            href={href}
            onClick={() => stashStory(current)}
            tabIndex={expanded ? 0 : -1}
          >
            See details <ArrowRight size={15} />
          </Link>
        </div>
        <div className="highlight-copy-wrap" aria-hidden={expanded}>
          <div className="highlight-copy" aria-live="polite">
            <span className="feature-label">{label}</span>
            <h1>{app.name(current)}</h1>
            <div className="hero-meta">
              <span>
                <Star size={13} fill="currentColor" />{' '}
                {current.rating ? current.rating.toFixed(1) : 'New'}
              </span>
              <em>{kindLabel(current.mediaFormat)}</em>
              {current.status && <em>{releaseLabel[current.status]}</em>}
              {current.genres.slice(0, 2).map((g) => (
                <em key={g}>{g}</em>
              ))}
            </div>
            <p>{firstSentences(current.description)}</p>
            <div className="highlight-actions">
              <Link className="primary-button" href={href} onClick={() => stashStory(current)}>
                See details <ArrowRight size={17} />
              </Link>
              <StatusMenu item={current} />
              <HypeButton item={current} />
            </div>
            {canHover && hasVideo && app.prefs.hoverPreviews && (
              <small className="highlight-hint">Hover here and the trailer starts.</small>
            )}
          </div>
        </div>
      </div>
      {list.length > 1 && (
        <div className="highlight-picker" role="tablist" aria-label="Choose a highlight">
          {list.map((item, i) => (
            <button
              key={`${item.format}:${item.id}`}
              role="tab"
              aria-selected={i === index}
              aria-label={app.name(item)}
              className={i === index ? 'selected' : ''}
              onClick={() => setIndex(i)}
            >
              <img src={item.image} alt="" loading="lazy" />
              <span>
                <strong>{app.name(item)}</strong>
                <small>{kindLabel(item.mediaFormat)}</small>
              </span>
              {i === index && !paused && !hovering && !playing && list.length > 1 && (
                <i
                  className="highlight-timer"
                  style={{ animationDuration: `${ROTATE_MS}ms` }}
                  key={index}
                />
              )}
            </button>
          ))}
          <button
            className="highlight-pause"
            aria-label={paused ? 'Resume rotation' : 'Pause rotation'}
            onClick={() => setPaused((p) => !p)}
          >
            {paused ? <Play size={15} /> : <Pause size={15} />}
          </button>
        </div>
      )}
    </section>
  );
}
