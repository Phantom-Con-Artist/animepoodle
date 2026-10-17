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
  rating,
  onRate,
}: {
  selected: Title;
  match?: RankedTitle;
  saved: boolean;
  onSave: () => void;
  onClose: () => void;
  rating: number;
  onRate: (rating: number) => void;
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
                <small>{match!.reason}. Based on your mood and local metadata vectors.</small>
                {match.evidence && (
                  <small>
                    Profile evidence: {Math.round(match.evidence.confidence * 100)}% · Theme
                    affinity: {Math.round(match.evidence.similarity * 100)}% · Novelty:{' '}
                    {Math.round(match.evidence.novelty * 100)}%. Evidence reflects how much feedback
                    the model has, not prediction accuracy.
                  </small>
                )}
              </span>
            </div>
          )}
          <button className="primary-button" onClick={onSave}>
            {saved ? <Check size={17} /> : <Bookmark size={17} />}{' '}
            {saved ? 'Saved to my library' : 'Save to my library'}
          </button>
          <label className="personal-rating">
            How did this story feel?
            <select
              aria-label="My rating"
              value={rating}
              onChange={(e) => onRate(Number(e.target.value))}
            >
              <option value="0">Not rated yet</option>
              <option value="1">1 ★ · Not for me</option>
              <option value="2">2 ★ · Not my favorite</option>
              <option value="3">3 ★ · It was okay</option>
              <option value="4">4 ★ · Really liked it</option>
              <option value="5">5 ★ · Loved it</option>
            </select>
            <small>Private feedback for your on-device recommendations.</small>
          </label>
          <p className="detail-note">
            A discovery space. Find official availability in your region.
          </p>
        </div>
      </div>
      <StoryExtras key={`${selected.format}:${selected.id}`} item={selected} />
    </Modal>
  );
}
