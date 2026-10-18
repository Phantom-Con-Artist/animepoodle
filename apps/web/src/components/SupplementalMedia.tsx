'use client';
import { useEffect, useState } from 'react';
import { ArrowUpRight, ImageIcon, Music2, Play, Square } from 'lucide-react';
import { mediaIdentity, type Title, type MediaExtras, type ThemeSong } from '@animepoodle/shared';
export default function SupplementalMedia({
  item,
  bannerImage,
}: {
  item: Title;
  bannerImage?: string | null;
}) {
  const [requested, setRequested] = useState(false);
  const [data, setData] = useState<MediaExtras | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [playback, setPlayback] = useState<{
    kind: 'theme';
    id: string;
    mode: 'audio' | 'video';
  } | null>(null);
  const [mediaError, setMediaError] = useState('');
  const { anilistId, malId } = mediaIdentity(item);
  useEffect(() => {
    if (!requested) return;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ format: item.format });
    if (anilistId) params.set('anilistId', String(anilistId));
    if (malId) params.set('malId', String(malId));
    (async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/api/extras?${params}`, {
          signal: controller.signal,
        });
        if (!res.headers.get('content-type')?.includes('application/json'))
          throw new Error('Extra media is unavailable right now.');
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || 'Extra media is unavailable right now.');
        if (!controller.signal.aborted) setData(body);
      } catch (e) {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : 'Extra media is unavailable right now.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [requested, anilistId, malId, item.format, retry]);
  const theme =
    playback?.kind === 'theme' ? data?.themes.find((t) => t.id === playback.id) : undefined;
  const artwork = [
    ...(bannerImage
      ? [
          {
            url: bannerImage,
            thumbnail: bannerImage,
            label: 'Landscape banner',
            source: 'AniList' as const,
          },
        ]
      : []),
    ...(data?.artwork || []),
  ];
  function playTheme(theme: ThemeSong, mode: 'audio' | 'video') {
    setMediaError('');
    setPlayback({ kind: 'theme', id: theme.id, mode });
  }
  return (
    <section className="supplemental-media" aria-label="Soundtrack and artwork">
      <div className="extras-heading">
        <h3>
          <Music2 size={18} />
          Soundtrack & extras
        </h3>
      </div>
      {!requested ? (
        <div className="media-discovery-prompt">
          <div>
            <strong>Openings, endings and artwork</strong>
            <p>Load theme songs and extra artwork for this title.</p>
          </div>
          <button className="primary-button" onClick={() => setRequested(true)}>
            Find songs & artwork <ArrowUpRight size={14} />
          </button>
        </div>
      ) : (
        <>
          {loading && (
            <p className="extras-loading" role="status">
              Loading songs and artwork…
            </p>
          )}
          {error && (
            <div className="extras-error" role="status">
              <p>{error}</p>
              <button className="text-button" onClick={() => setRetry((v) => v + 1)}>
                Try again
              </button>
            </div>
          )}
          {data && (
            <>
              <div className="provider-status">
                {data.sources.map((source) => (
                  <span
                    key={source.name}
                    className={source.status === 'unavailable' ? 'provider-unavailable' : ''}
                  >
                    {source.name}
                    <small>
                      {source.status === 'ok'
                        ? 'connected'
                        : source.status === 'not-applicable'
                          ? 'not available for this title'
                          : source.status === 'partial'
                            ? 'some extras available'
                            : 'temporarily unavailable'}
                    </small>
                  </span>
                ))}
              </div>
              <div className="extras-heading">
                <h3>
                  <Music2 size={17} />
                  Openings & endings
                </h3>
                <span>Click to listen or watch</span>
              </div>
              {data.themes.length ? (
                <div className="theme-list">
                  {data.themes.map((song) => (
                    <article className="theme-row" key={song.id}>
                      <span className="theme-label">{song.label}</span>
                      <div className="theme-description">
                        <strong>{song.title}</strong>
                        <small>
                          {song.artists.join(', ') || 'Artist details unavailable'}
                          {song.episodes ? ` · Episodes ${song.episodes}` : ''}
                        </small>
                        <a href={song.url} target="_blank" rel="noopener noreferrer">
                          {song.source} <ArrowUpRight size={10} />
                        </a>
                      </div>
                      <div className="theme-actions">
                        {song.audioUrl && (
                          <button
                            onClick={() => playTheme(song, 'audio')}
                            aria-label={`Listen to ${song.title}`}
                          >
                            <Music2 size={13} />
                            <span>Listen</span>
                          </button>
                        )}
                        {song.videoUrl && (
                          <button
                            onClick={() => playTheme(song, 'video')}
                            aria-label={`Watch ${song.title}`}
                          >
                            <Play size={13} />
                            <span>Watch</span>
                          </button>
                        )}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="extras-empty">
                  No opening or ending media is available for this title yet.
                </p>
              )}
              {theme && playback?.kind === 'theme' && (
                <div className="theme-player">
                  <div>
                    <strong>
                      Now {playback.mode === 'audio' ? 'listening' : 'watching'}: {theme.title}
                    </strong>
                    <button
                      className="text-button"
                      onClick={() => setPlayback(null)}
                      aria-label="Stop theme playback"
                    >
                      <Square size={12} />
                      Stop
                    </button>
                  </div>
                  {playback.mode === 'audio' ? (
                    <audio
                      key={`${theme.id}-audio`}
                      src={theme.audioUrl || undefined}
                      controls
                      autoPlay
                      preload="none"
                      aria-label={`${theme.title} audio`}
                      onError={() =>
                        setMediaError('This recording could not be played. Try the source link.')
                      }
                    />
                  ) : (
                    <video
                      key={`${theme.id}-video`}
                      src={theme.videoUrl || undefined}
                      controls
                      autoPlay
                      playsInline
                      preload="none"
                      poster={bannerImage || item.image}
                      aria-label={`${theme.title} video`}
                      onError={() =>
                        setMediaError('This video could not be played. Try the source link.')
                      }
                    />
                  )}
                </div>
              )}
              {mediaError && (
                <p className="status-message" role="status">
                  {mediaError}
                </p>
              )}
            </>
          )}
        </>
      )}
      {artwork.length > 0 && (
        <>
          <div className="extras-heading media-subheading">
            <h3>
              <ImageIcon size={17} />
              Artwork & thumbnails
            </h3>
            <span>Open an image for full size</span>
          </div>
          <div className="artwork-grid">
            {artwork.map((image, index) => (
              <a
                key={`${image.source}:${image.url}`}
                href={image.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Open artwork ${index + 1} from ${image.source}`}
              >
                <img
                  src={image.thumbnail}
                  alt={`${item.title} ${image.label.toLowerCase()}`}
                  loading="lazy"
                />
                <span>
                  {image.label}
                  <small>{image.source}</small>
                </span>
              </a>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
