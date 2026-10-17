'use client';
import { Bookmark, Check, Sparkles, Star } from 'lucide-react';
import { type Title, type RankedTitle } from '@animepoodle/shared';
import Modal from './Modal';
import StoryExtras from './StoryExtras';
export default function StoryDetail({
  selected,
  match,
  saved,
  onSave,
  onClose,
}: {
  selected: Title;
  match?: RankedTitle;
  saved: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  return (
    <Modal title={selected.title} onClose={onClose} wide>
      <div className="detail-layout">
        <div className="detail-poster" style={{ background: selected.color }}>
          <img
            src={selected.image}
            alt={`${selected.title} cover`}
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
        </div>
        <div className="detail-content">
          <div className="eyebrow">YOUR NEXT RABBIT HOLE</div>
          <span className="detail-format">
            {selected.format} · {selected.year || 'Year unknown'}
          </span>
          <h2>{selected.title}</h2>
          <p className="original-title">{selected.original}</p>
          <div className="detail-stats">
            <span>
              <Star size={16} fill="currentColor" />
              {selected.rating || 'Unrated'}
            </span>
            <span>{selected.episodes}</span>
          </div>
          <div className="genre-tags">
            {selected.genres.map((g) => (
              <span key={g}>{g}</span>
            ))}
          </div>
          <p className="synopsis">{selected.description}</p>
          {match && (
            <div className="match-explanation">
              <Sparkles size={19} />
              <span>
                <strong>{Math.round(match!.score)}% taste match</strong>
                <small>{match!.reason}. Scored from your six-dimensional taste profile.</small>
              </span>
            </div>
          )}
          <button className="primary-button" onClick={onSave}>
            {saved ? <Check size={17} /> : <Bookmark size={17} />}{' '}
            {saved ? 'Saved to my library' : 'Save to my library'}
          </button>
          <p className="detail-note">
            A discovery space. Find official availability in your region.
          </p>
        </div>
      </div>
      <StoryExtras key={`${selected.format}:${selected.id}`} item={selected} />
    </Modal>
  );
}
