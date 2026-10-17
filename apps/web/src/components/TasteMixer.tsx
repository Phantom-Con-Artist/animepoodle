'use client';
import { type Dispatch, type SetStateAction } from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';
import { defaultTaste, dimensions, type Taste } from '@animepoodle/shared';
import Modal from './Modal';
interface Props {
  taste: Taste;
  setTaste: Dispatch<SetStateAction<Taste>>;
  variety: number;
  setVariety: (v: number) => void;
  engine: string;
  candidateCount: number;
  ratingCount: number;
  onClearRatings: () => void;
  onClose: () => void;
  onShowStories: () => void;
  onTasteChange: () => void;
}
export default function TasteMixer({
  taste,
  setTaste,
  variety,
  setVariety,
  engine,
  candidateCount,
  ratingCount,
  onClearRatings,
  onClose,
  onShowStories,
  onTasteChange,
}: Props) {
  return (
    <Modal title="Tune your taste" onClose={onClose}>
      <div className="mixer-heading">
        <span className="mixer-icon">
          <Sparkles size={25} />
        </span>
        <div className="eyebrow">YOUR TASTE IS THE SECRET INGREDIENT</div>
        <h2>A little more you.</h2>
        <p>Mix what moves you. Your recommendations update as you go.</p>
      </div>
      <div className="taste-sliders">
        {dimensions.map((d, i) => (
          <label key={d}>
            <span>
              {d}
              <strong>{Math.round(taste[i] * 100)}%</strong>
            </span>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round(taste[i] * 100)}
              onChange={(e) => {
                setTaste(
                  (t) => t.map((v, j) => (i === j ? Number(e.target.value) / 100 : v)) as Taste,
                );
                onTasteChange();
              }}
            />
          </label>
        ))}
      </div>
      <label className="variety-control">
        <span>
          A little familiar <strong>A little unexpected</strong>
        </span>
        <input
          type="range"
          min="0"
          max="3"
          step="0.1"
          value={variety}
          onChange={(e) => setVariety(Number(e.target.value))}
        />
      </label>
      <div className="engine-note">
        <span className="engine-dot" />
        <div>
          <strong>{engine}</strong>
          <p>
            Your ratings, saved stories, and moods shape these picks. {candidateCount} available
            stories · {ratingCount} private ratings. More feedback improves the estimate. Calculated
            on your device; match scores are not predicted ratings.
          </p>
        </div>
      </div>
      {ratingCount > 0 && (
        <button className="text-button" onClick={onClearRatings}>
          Forget my ratings
        </button>
      )}
      <div className="mixer-actions">
        <button
          className="text-button"
          onClick={() => {
            setTaste(defaultTaste);
            setVariety(1.2);
            onTasteChange();
          }}
        >
          Reset taste
        </button>
        <button
          className="primary-button"
          onClick={() => {
            onShowStories();
          }}
        >
          Show me my stories <ArrowRight size={16} />
        </button>
      </div>
    </Modal>
  );
}
