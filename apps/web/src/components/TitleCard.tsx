'use client';
import { useState } from 'react';
import { Bookmark, BookOpen, Check, Sparkles, Star } from 'lucide-react';
import { type Title, type RankedTitle } from '@animepoodle/shared';
import CardTrailer from './CardTrailer';

export default function TitleCard({
  item,
  index,
  saved,
  match,
  onOpen,
  onSave,
}: {
  item: Title;
  index: number;
  saved: boolean;
  match?: RankedTitle;
  onOpen: () => void;
  onSave: () => void;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <article className="title-card" style={{ animationDelay: `${index * 45}ms` }}>
      <div className="poster-wrap" style={{ background: item.color }}>
        <button className="poster-button" onClick={onOpen} aria-label={`Explore ${item.title}`}>
          {!failed ? (
            <img
              src={item.image}
              alt={`${item.title} cover`}
              loading="lazy"
              onError={() => setFailed(true)}
            />
          ) : (
            <span className="cover-fallback">
              <BookOpen size={35} />
              <strong>{item.title}</strong>
            </span>
          )}
          <span className="poster-shade" />
          <span className="format-badge">{item.format}</span>
          <span className="poster-rating">
            <Star size={11} fill="currentColor" />
            {item.rating || '—'}
          </span>
        </button>
        <CardTrailer item={item} />
        <button
          className={`save-button ${saved ? 'is-saved' : ''}`}
          onClick={onSave}
          aria-label={`${saved ? 'Remove' : 'Save'} ${item.title}`}
          aria-pressed={saved}
        >
          {saved ? <Check size={16} /> : <Bookmark size={16} />}
        </button>
      </div>
      <button className="card-title" onClick={onOpen}>
        {item.title}
      </button>
      {item.status && (
        <div className="release-badge">
          {
            {
              RELEASING: 'Airing / ongoing',
              FINISHED: 'Completed',
              NOT_YET_RELEASED: 'TBA / upcoming',
              HIATUS: 'On hiatus',
              CANCELLED: 'Cancelled',
            }[item.status]
          }
        </div>
      )}
      <div className="card-meta">
        <span>{item.year || 'TBA'}</span>
        <i>·</i>
        <span>{item.episodes}</span>
      </div>
      {match ? (
        <div className="card-match">
          <Sparkles size={12} />
          {Math.round(match.score)}% taste match
        </div>
      ) : (
        <div className="card-genres">{item.genres.slice(0, 2).join(' · ')}</div>
      )}
    </article>
  );
}
