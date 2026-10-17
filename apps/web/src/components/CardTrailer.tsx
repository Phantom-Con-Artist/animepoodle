'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Play, Square, LoaderCircle, Volume2, VolumeX, X } from 'lucide-react';
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

/** Opens connections to YouTube ahead of time, so a trailer starts the moment it's asked for. */
let warmed = false;
export function warmYouTube() {
  if (warmed || typeof document === 'undefined') return;
  warmed = true;
  for (const href of [
    'https://www.youtube-nocookie.com',
    'https://www.youtube.com',
    'https://i.ytimg.com',
    'https://www.google.com',
  ]) {
    const link = document.createElement('link');
    link.rel = 'preconnect';
    link.href = href;
    link.crossOrigin = '';
    document.head.append(link);
  }
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
        warmYouTube();
        clearTimeout(timer.current!);
        timer.current = setTimeout(() => set(true), delay);
      },
      onPointerLeave: (e: React.PointerEvent) => {
        clearTimeout(timer.current!);
        // View-transition snapshots temporarily clear :hover even with a stationary mouse.
        // Test the pointer against the live card instead, so its player stays mounted.
        const el = e.currentTarget as HTMLElement;
        const { clientX, clientY } = e;
        timer.current = setTimeout(() => {
          const rect = el.getBoundingClientRect();
          if (
            clientX < rect.left ||
            clientX >= rect.right ||
            clientY < rect.top ||
            clientY >= rect.bottom
          )
            set(false);
        }, 80);
      },
    },
  };
}
type PlayerMessage = {
  event?: string;
  info?: number | { playerState?: number; currentTime?: number; duration?: number };
};

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
  const [hoverStopped, setHoverStopped] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => request.current?.abort(), []);
  // A new title means a new trailer: reset when the card is reused for another item.
  useEffect(() => {
    setFetched(undefined);
    setClicked(false);
    setHoverStopped(false);
    setError('');
  }, [item.id, item.format]);

  const sound = useTrailerSound();
  const frame = useRef<HTMLIFrameElement>(null);
  const trailer = item.trailer !== undefined ? item.trailer : fetched;
  const unavailable = trailer === null;
  const playing = !!trailer?.embedUrl && (clicked || (hovering && !hoverStopped));
  // Phones and tablets play a pressed trailer full screen, with sound, instead of in the card.
  const canHover = useCanHoverPreview();
  const [theater, setTheater] = useState(false);
  const fullscreened = useRef(false);
  const closeTheater = () => {
    setTheater(false);
    setClicked(false);
    if (fullscreened.current && document.fullscreenElement) void document.exitFullscreen();
    fullscreened.current = false;
  };
  const openTheater = () => {
    setTheater(true);
    // Must run inside the tap itself, before any await, or the browser refuses.
    const root = document.documentElement;
    if (!root.requestFullscreen || document.fullscreenElement) return;
    root
      .requestFullscreen({ navigationUI: 'hide' })
      .then(() => {
        fullscreened.current = true;
        const orientation = screen.orientation as ScreenOrientation & {
          lock?: (o: string) => Promise<void>;
        };
        return orientation.lock?.('landscape');
      })
      .catch(() => {});
  };
  useEffect(() => {
    if (!theater) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeTheater();
    // Leaving full screen (the Back gesture on Android) closes the trailer too.
    const onFullscreen = () => {
      if (fullscreened.current && !document.fullscreenElement) {
        fullscreened.current = false;
        closeTheater();
      }
    };
    const scroll = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => {
      document.body.style.overflow = scroll;
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onFullscreen);
    };
  }, [theater]);
  const looping = loop && !theater;

  // An explicit stop wins over hover until the pointer leaves the card.
  useEffect(() => {
    if (!hovering) setHoverStopped(false);
  }, [hovering]);

  const inCard = playing && !theater;
  useEffect(() => onPlayingChange?.(inCard), [inCard, onPlayingChange]);
  // Only show the player while the video is really running: YouTube's title card, pause
  // overlay and "more videos" end screen never get a frame. Until then the artwork stays.
  const [live, setLive] = useState(false);
  useEffect(() => {
    setLive(false);
    if (!playing || trailer?.site !== 'youtube') return;
    let ended = false;
    let heard = false;
    let duration = 0;
    let time = 0;
    // YouTube only reports to pages that say they're listening, and ignores the message until
    // its player is ready, so keep asking until it answers.
    const listen = setInterval(() => {
      if (heard) return clearInterval(listen);
      frame.current?.contentWindow?.postMessage(
        JSON.stringify({ event: 'listening', id: item.id, channel: 'widget' }),
        '*',
      );
    }, 200);
    // If the player never reports (blocked messages), show it anyway rather than never.
    const fallback = setTimeout(() => !heard && setLive(true), 2500);
    const finish = () => {
      if (ended) return;
      ended = true;
      setLive(false);
      if (theater) closeTheater();
      else onEnded?.();
    };
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame.current?.contentWindow) return;
      let data: PlayerMessage | null = null;
      try {
        data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
      } catch {
        return;
      }
      heard = true;
      const info = typeof data?.info === 'object' && data.info ? data.info : undefined;
      if (info?.duration) duration = info.duration;
      if (info?.currentTime != null) time = info.currentTime;
      const state =
        data?.event === 'onStateChange' && typeof data.info === 'number'
          ? data.info
          : info?.playerState;
      if (state === 1) {
        ended = false;
        setLive(true);
      } else if (state === 2) setLive(false);
      else if (state === 0) {
        if (looping) {
          youtubeCommand(frame.current, 'seekTo', [0, true]);
          youtubeCommand(frame.current, 'playVideo');
        } else finish();
      }
      // Leave just before the end, so the end screen never draws: loop back or hand over.
      if (duration && info?.currentTime != null && duration - time < 0.6) {
        if (looping) youtubeCommand(frame.current, 'seekTo', [0, true]);
        else finish();
      }
    };
    window.addEventListener('message', onMessage);
    return () => {
      clearInterval(listen);
      clearTimeout(fallback);
      window.removeEventListener('message', onMessage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, onEnded, trailer, looping, theater]);

  // Apply the sound setting to the running player without restarting the video.
  useEffect(() => {
    if (playing && trailer?.site === 'youtube')
      youtubeCommand(frame.current, (sound || theater) && canUnmute() ? 'unMute' : 'mute');
  }, [sound, playing, trailer, theater]);

  async function toggle() {
    if (playing) {
      setClicked(false);
      setHoverStopped(true);
      return;
    }
    setHoverStopped(false);
    warmYouTube();
    if (!canHover && trailer !== null) openTheater();
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
      else closeTheater();
    } catch {
      closeTheater();
      if (!controller.signal.aborted) setError('Trailer unavailable. Try again.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  const player = (trailer: Trailer) => (
    <div className={`card-trailer-bg${live || trailer.site !== 'youtube' ? ' is-live' : ''}`}>
      <iframe
        ref={frame}
        onLoad={() => {
          frame.current?.contentWindow?.postMessage(
            JSON.stringify({ event: 'listening', id: item.id, channel: 'widget' }),
            '*',
          );
          // The player needs a moment after load before it accepts commands.
          if ((sound || theater) && trailer.site === 'youtube' && canUnmute())
            [400, 1200].forEach((t) =>
              setTimeout(() => youtubeCommand(frame.current, 'unMute'), t),
            );
        }}
        src={trailerPlayerUrl(trailer, true, looping)}
        title={`${item.title} background trailer`}
        allow="autoplay; encrypted-media"
        tabIndex={-1}
        aria-hidden="true"
        referrerPolicy="strict-origin-when-cross-origin"
      />
    </div>
  );

  return (
    <>
      {playing && trailer && !theater && player(trailer)}
      {theater &&
        createPortal(
          <div
            className="trailer-theater"
            role="dialog"
            aria-modal="true"
            aria-label={`${item.title} trailer`}
          >
            {playing && trailer && player(trailer)}
            {!(playing && (live || trailer?.site !== 'youtube')) && (
              <LoaderCircle className="theater-spinner" size={34} aria-label="Loading trailer" />
            )}
            <button
              type="button"
              className="theater-close"
              onClick={closeTheater}
              aria-label="Close trailer"
              autoFocus
            >
              <X size={22} />
            </button>
          </div>,
          document.body,
        )}
      {/* No trailer, no button: a disabled "No trailer" pill is just clutter. */}
      {showControl &&
        !unavailable &&
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
        ))}
      {playing && !theater && trailer?.site === 'youtube' && (
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
