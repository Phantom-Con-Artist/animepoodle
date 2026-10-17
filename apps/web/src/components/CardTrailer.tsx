'use client';
import { useEffect, useRef, useState } from 'react';
import { Play, Square, LoaderCircle } from 'lucide-react';
import { type Title, type Trailer } from '@animepoodle/shared';
import { fetchStoryDetails, trailerPlayerUrl } from '@/lib/trailers';
export default function CardTrailer({ item }: { item: Title }) {
  const [trailer, setTrailer] = useState<Trailer | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  async function toggleTrailer() {
    if (playing) {
      setPlaying(false);
      return;
    }
    if (trailer) {
      setPlaying(true);
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError('');
    try {
      const data = await fetchStoryDetails(item, 1, controller.signal);
      if (!controller.signal.aborted) {
        setTrailer(data.trailer);
        if (data.trailer?.embedUrl) setPlaying(true);
        else if (!data.trailer) setUnavailable(true);
      }
    } catch {
      if (!controller.signal.aborted) setError('Trailer unavailable. Try again.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  return (
    <>
      {playing && trailer && (
        <div className="card-trailer-bg">
          <iframe
            src={trailerPlayerUrl(trailer, true)}
            title={`${item.title} background trailer`}
            allow="autoplay; encrypted-media"
            tabIndex={-1}
            aria-hidden="true"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      )}
      {trailer && !trailer.embedUrl ? (
        <a
          className="card-trailer-control"
          href={trailer.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Watch ${item.title} trailer on Dailymotion`}
        >
          <Play size={12} />
          <span>Watch trailer</span>
        </a>
      ) : (
        <button
          className="card-trailer-control"
          disabled={loading || unavailable}
          onClick={() => void toggleTrailer()}
          aria-label={`${playing ? 'Stop trailer for' : loading ? 'Loading trailer for' : unavailable ? 'No trailer available for' : 'Play trailer for'} ${item.title}`}
          aria-pressed={playing}
        >
          {loading ? (
            <LoaderCircle size={12} />
          ) : playing ? (
            <Square size={11} fill="currentColor" />
          ) : (
            <Play size={12} fill="currentColor" />
          )}
          <span>
            {loading ? 'Loading' : playing ? 'Stop' : unavailable ? 'No trailer' : 'Trailer'}
          </span>
        </button>
      )}

      {error && (
        <span className="card-trailer-error" role="status">
          {error}
        </span>
      )}
    </>
  );
}
