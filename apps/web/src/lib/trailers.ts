import { mediaIdentity, type MediaDetails, type Title, type Trailer } from '@animepoodle/shared';
export async function fetchStoryDetails(
  item: Title,
  page: number,
  signal: AbortSignal,
): Promise<MediaDetails> {
  const { anilistId, malId } = mediaIdentity(item);
  const mediaId = anilistId ? -anilistId : malId || item.id;
  const response = await fetch(
    `${process.env.NEXT_PUBLIC_API_URL || ''}/api/media/${mediaId}?format=${item.format}&page=${page}`,
    { signal },
  );
  if (!response.headers.get('content-type')?.includes('application/json'))
    throw new Error('Trailers and reviews are unavailable right now.');
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || 'Trailers and reviews are unavailable right now.');
  return data;
}
export function trailerPlayerUrl(trailer: Trailer, background = false, loop = true) {
  if (!trailer.embedUrl) return trailer.url;
  const url = new URL(trailer.embedUrl);
  url.searchParams.set('autoplay', '1');
  if (trailer.site === 'youtube') {
    url.searchParams.set('playsinline', '1');
    url.searchParams.set('rel', '0');
    if (background) {
      // Muted autoplay always works; sound is switched on afterwards through the JS API.
      url.searchParams.set('enablejsapi', '1');
      if (typeof location !== 'undefined') url.searchParams.set('origin', location.origin);
      url.searchParams.set('mute', '1');
      // Keep YouTube's own overlays out of the way of the artwork.
      url.searchParams.set('iv_load_policy', '3');
      url.searchParams.set('fs', '0');
      url.searchParams.set('cc_load_policy', '0');
      url.searchParams.set('controls', '0');
      url.searchParams.set('disablekb', '1');
      // No loop=1&playlist=: that turns the embed into a playlist with its own prev/next
      // overlay. The card loops the video itself through the JS API instead.
    }
  } else if (background) {
    url.searchParams.set('mute', 'true');
    if (loop) url.searchParams.set('loop', 'true');
    url.searchParams.set('controls', 'false');
  }
  return url.toString();
}
