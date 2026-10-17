'use client';
import { useEffect, useRef, useState } from 'react';
import { Play, Square, LoaderCircle, Volume2, VolumeX } from 'lucide-react';
import { type Title, type Trailer } from '@animepoodle/shared';
import { fetchStoryDetails, trailerPlayerUrl } from '@/lib/trailers';
import { setTrailerSound, useTrailerSound, youtubeCommand } from '@/lib/trailer-sound';

/** True on devices with a real mouse, where hover previews make sense. */
export function useCanHoverPreview() {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    const query = window.matchMedia(
      '(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)',
    );
    setOk(query.matches);
    const update = () => setOk(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return ok;
}

/** Starts after the pointer rests for a moment, so sweeping across a grid doesn't load videos. */
export function useHoverIntent(delay = 450, wrap?: (update: () => void) => void) {
  const [hovering, setHovering] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const on = useRef(false);
  useEffect(() => () => clearTimeout(timer.current!), []);
  // `wrap` lets a caller animate the layout change (for example with a view transition).
  const set = (value: boolean) => {
    if (on.current === value) return;
    on.current = value;
    if (wrap) wrap(() => setHovering(value));
    else setHovering(value);
  };
  return {
    hovering,
    bind: {
      onPointerEnter: (e: React.PointerEvent) => {
        if (e.pointerType !== 'mouse') return;
        clearTimeout(timer.current!);
        timer.current = setTimeout(() => set(true), delay);
      },
      onPointerLeave: (e: React.PointerEvent) => {
        clearTimeout(timer.current!);
        // Layout animations can fire a stray "leave"; only collapse if the pointer really left.
        const el = e.currentTarget as HTMLElement;
        timer.current = setTimeout(() => {
          if (!el.matches(':hover')) set(false);
        }, 80);
      },
    },
  };
}
/** Browsers pause videos that unmute before the visitor has clicked anything on the page. */
const canUnmute = () =>
  typeof navigator === 'undefined' ||
  !('userActivation' in navigator) ||
  (navigator as Navigator & { userActivation: { hasBeenActive: boolean } }).userActivation
    .hasBeenActive;

/**
 * Muted, looping trailer behind a card. Plays while `hovering` (mouse) or after a click
 * (touch and keyboard). Videos stream from YouTube; nothing is stored by us.
 */
export default function CardTrailer({
  item,
  hovering = false,
  showControl = true,
  loop = true,
  onPlayingChange,
  onEnded,
}: {
  item: Title;
  hovering?: boolean;
  showControl?: boolean;
  /** Loop forever (cards) or play once and report the end (highlights). */
  loop?: boolean;
  onPlayingChange?: (playing: boolean) => void;
  onEnded?: () => void;
}) {
  const [fetched, setFetched] = useState<Trailer | null | undefined>(undefined);
  const [clicked, setClicked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  // A new title means a new trailer: reset when the card is reused for another item.
  useEffect(() => {
    setFetched(undefined);
    setClicked(false);
    setError('');
  }, [item.id, item.format]);

  const sound = useTrailerSound();
  const frame = useRef<HTMLIFrameElement>(null);
  const trailer = item.trailer !== undefined ? item.trailer : fetched;
  const unavailable = trailer === null;
  const playing = !!trailer?.embedUrl && (clicked || hovering);

  useEffect(() => onPlayingChange?.(playing), [playing, onPlayingChange]);
  // The YouTube player reports its state over postMessage once we say we're listening.
  useEffect(() => {
    if (!playing || !onEnded || trailer?.site !== 'youtube') return;
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      let data: { event?: string; info?: number | { playerState?: number } } | null = null;
      try {
        data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      } catch {
        return;
      }
      const state =
        data?.event === 'onStateChange'
          ? data.info
          : data?.event === 'infoDelivery' && typeof data.info === 'object'
            ? data.info?.playerState
            : undefined;
      if (state === 0) onEnded();
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [playing, onEnded, trailer]);

  // Apply the sound setting to the running player without restarting the video.
  useEffect(() => {
    if (playing && trailer?.site === 'youtube')
      youtubeCommand(frame.current, sound && canUnmute() ? 'unMute' : 'mute');
  }, [sound, playing, trailer]);

  async function toggle() {
    if (clicked) {
      setClicked(false);
      return;
    }
    if (trailer !== undefined) {
      if (trailer?.embedUrl) setClicked(true);
      return;
    }
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError('');
    try {
      const data = await fetchStoryDetails(item, 1, controller.signal);
      if (controller.signal.aborted) return;
      setFetched(data.trailer);
      if (data.trailer?.embedUrl) setClicked(true);
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
            ref={frame}
            onLoad={() => {
              frame.current?.contentWindow?.postMessage(
                JSON.stringify({ event: 'listening', id: item.id, channel: 'widget' }),
                '*',
              );
              // The player needs a moment after load before it accepts commands.
              if (sound && trailer.site === 'youtube' && canUnmute())
                [400, 1200].forEach((t) =>
                  setTimeout(() => youtubeCommand(frame.current, 'unMute'), t),
                );
            }}
            src={trailerPlayerUrl(trailer, true, loop)}
            title={`${item.title} background trailer`}
            allow="autoplay; encrypted-media"
            tabIndex={-1}
            aria-hidden="true"
            referrerPolicy="strict-origin-when-cross-origin"
          />
        </div>
      )}
      {showControl &&
        (trailer && !trailer.embedUrl ? (
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
            onClick={() => void toggle()}
            aria-label={`${clicked ? 'Stop trailer for' : loading ? 'Loading trailer for' : unavailable ? 'No trailer available for' : 'Play trailer for'} ${item.title}`}
            aria-pressed={clicked}
          >
            {loading ? (
              <LoaderCircle size={12} />
            ) : clicked ? (
              <Square size={11} fill="currentColor" />
            ) : (
              <Play size={12} fill="currentColor" />
            )}
            <span>
              {loading ? 'Loading' : clicked ? 'Stop' : unavailable ? 'No trailer' : 'Trailer'}
            </span>
          </button>
        ))}
      {playing && trailer?.site === 'youtube' && (
        <button
          className="card-sound-control"
          aria-pressed={sound}
          aria-label={
            sound ? `Mute ${item.title} trailer` : `Turn on sound for ${item.title} trailer`
          }
          onClick={() => setTrailerSound(!sound)}
        >
          {sound ? <Volume2 size={14} /> : <VolumeX size={14} />}
          <span>{sound ? 'Sound on' : 'Sound off'}</span>
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
