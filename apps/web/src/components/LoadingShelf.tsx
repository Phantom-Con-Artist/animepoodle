'use client';
import { useEffect, useState } from 'react';
import Poodle from './Poodle';

const steps = [
  'Asking AniList nicely',
  'Sorting through the shelves',
  'Dusting off the cover art',
  'Nearly there',
];

/**
 * Loading state for catalog pages: the poodle hops along while placeholder cards shimmer.
 * The status line changes as the wait gets longer, so a slow API doesn't look frozen.
 */
export default function LoadingShelf({ label, count = 12 }: { label: string; count?: number }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(s + 1, steps.length - 1)), 1600);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="loading-shelf" role="status" aria-live="polite" aria-label={`Loading ${label}`}>
      <div className="loading-runner">
        <div className="loading-track" aria-hidden="true">
          <Poodle className="loading-poodle" />
        </div>
        <p>
          <strong>{steps[step]}…</strong> <span>Loading {label}</span>
        </p>
      </div>
      <div className="title-grid" aria-hidden="true">
        {Array.from({ length: count }, (_, i) => (
          <span
            key={i}
            className="card-skeleton shimmer"
            style={{ animationDelay: `${(i % 6) * 90}ms` }}
          />
        ))}
      </div>
    </div>
  );
}
