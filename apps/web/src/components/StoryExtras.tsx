'use client';
import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Film,
  MessageSquare,
  Play,
  ThumbsUp,
} from 'lucide-react';
import { type Title, type MediaDetails } from '@animepoodle/shared';
import { fetchStoryDetails, trailerPlayerUrl } from '@/lib/trailers';
import SupplementalMedia from './SupplementalMedia';
export default function StoryExtras({ item }: { item: Title }) {
  const [data, setData] = useState<MediaDetails | null>(null);
  const [page, setPage] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const mediaId = item.anilistId ? -item.anilistId : item.id;
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    (async () => {
      try {
        const result = await fetchStoryDetails(item, page, controller.signal);
        if (!controller.signal.aborted) setData(result);
      } catch (e) {
        if (!controller.signal.aborted)
          setError(
            e instanceof Error ? e.message : 'Trailers and reviews are unavailable right now.',
          );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [mediaId, item.format, page, retry]);
  return (
    <section className="story-extras" aria-label="Trailers and community reviews">
      {!data && loading && (
        <p className="extras-loading" role="status">
          Finding trailers and reader reviews…
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
          <div className="extras-heading">
            <h3>
              <Film size={18} />
              The first glimpse
            </h3>
            <a href={data.url} target="_blank" rel="noopener noreferrer">
              View on AniList <ArrowUpRight size={13} />
            </a>
          </div>
          {data.trailer ? (
            <div className="trailer-panel">
              {playing && data.trailer.embedUrl ? (
                <iframe
                  src={trailerPlayerUrl(data.trailer)}
                  title={`${item.title} trailer`}
                  allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
                  allowFullScreen
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              ) : (
                <button
                  className="trailer-preview"
                  onClick={() => {
                    if (data.trailer?.embedUrl) setPlaying(true);
                    else if (data.trailer)
                      window.open(data.trailer.url, '_blank', 'noopener,noreferrer');
                  }}
                  aria-label={`Play ${item.title} trailer`}
                >
                  {data.trailer.thumbnail && (
                    <img src={data.trailer.thumbnail} alt="" loading="lazy" />
                  )}
                  <span className="trailer-overlay" />
                  <span className="trailer-play">
                    <Play size={24} fill="currentColor" />
                  </span>
                  <span className="trailer-caption">
                    Watch the trailer{' '}
                    <small>via {data.trailer.site === 'youtube' ? 'YouTube' : 'Dailymotion'}</small>
                  </span>
                </button>
              )}
              <a
                className="trailer-external"
                href={data.trailer.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                Open trailer on {data.trailer.site === 'youtube' ? 'YouTube' : 'Dailymotion'}{' '}
                <ArrowUpRight size={13} />
              </a>
            </div>
          ) : (
            <p className="extras-empty">No trailer has been added to AniList for this story yet.</p>
          )}
          {!!data.youtubeLinks?.length && (
            <div className="youtube-links" aria-label="YouTube links from AniList">
              <strong>On YouTube</strong>
              {data.youtubeLinks.map((link) => (
                <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer">
                  {link.label}
                  <span>{link.source}</span>
                  <ArrowUpRight size={13} />
                </a>
              ))}
            </div>
          )}
          <div className="extras-heading reviews-heading">
            <h3>
              <MessageSquare size={18} />
              From the fandom
            </h3>
            <span>Reviews from AniList</span>
          </div>
          <p className="review-notice">
            Readers’ opinions, in their own words. Summaries may contain spoilers.
          </p>
          <div className="review-list" aria-busy={loading}>
            {data.reviews.length ? (
              data.reviews.map((review) => (
                <article className="review-card" key={review.id}>
                  <div className="review-byline">
                    <strong>{review.author}</strong>
                    {review.score !== null && (
                      <span className="review-score">
                        {review.score}
                        <small>/100</small>
                      </span>
                    )}
                  </div>
                  <details>
                    <summary>Reveal review summary</summary>
                    <p>{review.summary}</p>
                  </details>
                  <div className="review-footer">
                    <span>
                      <ThumbsUp size={12} />
                      {review.helpful} of {review.ratings} found helpful
                    </span>
                    <a href={review.url} target="_blank" rel="noopener noreferrer">
                      Read full review <ArrowUpRight size={12} />
                    </a>
                  </div>
                </article>
              ))
            ) : (
              <p className="extras-empty">
                No public reviews here yet. This story could be your next discovery.
              </p>
            )}
          </div>
          {(data.pageInfo.hasNextPage || data.pageInfo.currentPage > 1) && (
            <div className="review-pagination">
              <button
                className="text-button"
                disabled={loading || data.pageInfo.currentPage <= 1}
                onClick={() => setPage(data.pageInfo.currentPage - 1)}
              >
                <ChevronLeft size={14} />
                Previous
              </button>
              <span aria-live="polite">
                {loading ? 'Loading reviews…' : `Page ${data.pageInfo.currentPage}`}
              </span>
              <button
                className="text-button"
                disabled={loading || !data.pageInfo.hasNextPage}
                onClick={() => setPage(data.pageInfo.currentPage + 1)}
              >
                Next reviews
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </>
      )}
      <SupplementalMedia item={item} bannerImage={data?.bannerImage || item.bannerImage} />
    </section>
  );
}
