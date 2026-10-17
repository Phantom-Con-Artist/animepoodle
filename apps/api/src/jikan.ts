import { type Title, type Artwork, type MediaVideo, type ThemeSong } from '@animepoodle/shared';
import { CatalogError, featuresFor, normalizeTrailer } from './anilist.js';
import { createProviderClient } from './provider-client.js';
import { httpsUrl } from './urls.js';
const request = createProviderClient('Jikan', 'https://api.jikan.moe/v4', 900000, 1100);
interface JikanItem {
  mal_id: number;
  title: string;
  title_english?: string | null;
  title_japanese?: string | null;
  type?: string;
  status?: string;
  year?: number;
  score?: number;
  episodes?: number;
  chapters?: number;
  synopsis?: string;
  rating?: string;
  explicit_genres?: { name: string }[];
  genres?: { name: string }[];
  published?: { from: string };
  aired?: { from: string };
  images?: { jpg?: { large_image_url?: string; image_url?: string } };
  trailer?: { youtube_id?: string };
  theme?: { openings?: string[]; endings?: string[] };
}
export function normalizeJikan(d: JikanItem, manga: boolean): Title | null {
  if (
    !Number.isSafeInteger(d.mal_id) ||
    d.mal_id < 1 ||
    !d.title ||
    d.explicit_genres?.length ||
    d.rating?.startsWith('Rx')
  )
    return null;
  if (manga && !['Manga', 'Manhwa', 'Manhua', 'One-shot'].includes(d.type || '')) return null;
  const genres = (d.genres || []).map((g) => g.name);
  const image = httpsUrl(d.images?.jpg?.large_image_url || d.images?.jpg?.image_url);
  return {
    id: d.mal_id,
    malId: d.mal_id,
    source: 'Jikan',
    status: ['Currently Airing', 'Publishing'].includes(d.status || '')
      ? 'RELEASING'
      : ['Finished Airing', 'Finished'].includes(d.status || '')
        ? 'FINISHED'
        : ['Not yet aired', 'Not yet published'].includes(d.status || '')
          ? 'NOT_YET_RELEASED'
          : d.status === 'On Hiatus'
            ? 'HIATUS'
            : d.status === 'Discontinued'
              ? 'CANCELLED'
              : undefined,
    title: d.title_english || d.title,
    original: d.title_japanese || d.title,
    format: manga
      ? d.type === 'Manhwa'
        ? 'Manhwa'
        : d.type === 'Manhua'
          ? 'Manhua'
          : 'Manga'
      : 'Anime',
    year: d.year || Number((d.published?.from || d.aired?.from || '').slice(0, 4)) || 0,
    rating: d.score || 0,
    episodes: manga
      ? d.chapters
        ? `${d.chapters} chapters`
        : 'Ongoing'
      : d.episodes
        ? `${d.episodes} episodes`
        : 'Episodes unknown',
    genres,
    description: d.synopsis || 'No synopsis available yet.',
    image: image || '/icon.svg',
    color: '#657675',
    features: featuresFor(genres),
  };
}
export async function searchJikan(q: string, format: string, status = 'ALL'): Promise<Title[]> {
  if (format === 'Donghua') return []; // Jikan has no reliable country-of-origin filter.
  const kinds =
    format === 'All'
      ? ['anime', 'manga']
      : ['Manga', 'Manhwa', 'Manhua'].includes(format)
        ? ['manga']
        : ['anime'];
  const results = await Promise.allSettled(
    kinds.map(async (kind) => {
      const params = new URLSearchParams({ q, limit: '18', sfw: 'true' });
      const statuses: Record<string, string> =
        kind === 'anime'
          ? { RELEASING: 'airing', FINISHED: 'complete', NOT_YET_RELEASED: 'upcoming' }
          : {
              RELEASING: 'publishing',
              FINISHED: 'complete',
              NOT_YET_RELEASED: 'upcoming',
              HIATUS: 'hiatus',
              CANCELLED: 'discontinued',
            };
      if (status !== 'ALL' && !statuses[status]) return [];
      if (statuses[status]) params.set('status', statuses[status]);
      if (kind === 'manga' && format !== 'All') params.set('type', format.toLowerCase());
      const body = await request<{ data: JikanItem[] }>(`/${kind}?${params}`);
      if (!Array.isArray(body.data))
        throw new CatalogError('Jikan returned an unreadable catalog.');
      return body.data
        .map((d) => normalizeJikan(d, kind === 'manga'))
        .filter((t): t is Title => !!t);
    }),
  );
  if (results.every((r) => r.status === 'rejected'))
    throw (results[0] as PromiseRejectedResult).reason;
  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}
interface JikanVideos {
  data: {
    promo?: { title: string; trailer: { youtube_id?: string } }[];
    music_videos?: {
      title: string;
      video: { youtube_id?: string };
      meta?: { author?: string; title?: string };
    }[];
  };
}
export async function getJikanExtras(malId: number, anime: boolean) {
  const kind = anime ? 'anime' : 'manga';
  const tasks = await Promise.allSettled([
    request<{ data: { jpg?: { large_image_url?: string; image_url?: string } }[] }>(
      `/${kind}/${malId}/pictures`,
    ),
    ...(anime
      ? [
          request<JikanVideos>(`/anime/${malId}/videos`),
          request<{ data: JikanItem }>(`/anime/${malId}/full`),
        ]
      : []),
  ]);
  if (tasks.every((r) => r.status === 'rejected')) throw (tasks[0] as PromiseRejectedResult).reason;
  const artwork: Artwork[] = [];
  const videos: MediaVideo[] = [];
  const themes: ThemeSong[] = [];
  const pictures = tasks[0];
  if (pictures.status === 'fulfilled') {
    const data = (
      pictures.value as { data: { jpg?: { large_image_url?: string; image_url?: string } }[] }
    ).data;
    if (Array.isArray(data))
      for (const picture of data.slice(0, 12)) {
        const url = httpsUrl(picture.jpg?.large_image_url || picture.jpg?.image_url);
        if (url) artwork.push({ url, thumbnail: url, label: 'Cover artwork', source: 'Jikan' });
      }
  }
  const videoResult = tasks[1];
  if (videoResult?.status === 'fulfilled') {
    const data = (videoResult.value as JikanVideos).data;
    for (const entry of [
      ...(data?.promo || []).map((v) => ({ title: v.title, clip: v.trailer })),
      ...(data?.music_videos || []).map((v) => ({
        title: v.title || v.meta?.title || 'Music video',
        clip: v.video,
      })),
    ]) {
      const trailer = normalizeTrailer({ site: 'youtube', id: entry.clip?.youtube_id });
      if (trailer) videos.push({ title: entry.title, trailer, source: 'Jikan' });
    }
  }
  const full = tasks[2];
  if (full?.status === 'fulfilled') {
    const data = (full.value as { data: JikanItem }).data;
    for (const [type, entries] of [
      ['OP', data?.theme?.openings || []],
      ['ED', data?.theme?.endings || []],
    ] as const)
      entries.forEach((title, index) =>
        themes.push({
          id: `jikan-${type}-${index}`,
          label: `${type}${index + 1}`,
          title,
          artists: [],
          videoUrl: null,
          audioUrl: null,
          episodes: null,
          source: 'Jikan',
          url: `https://myanimelist.net/anime/${malId}`,
        }),
      );
    const trailer = normalizeTrailer({ site: 'youtube', id: data?.trailer?.youtube_id });
    if (trailer) videos.unshift({ title: 'Trailer', trailer, source: 'Jikan' });
  }
  return {
    artwork,
    videos: Array.from(new Map(videos.map((v) => [v.trailer.url, v])).values()).slice(0, 12),
    themes,
    partial: tasks.some((r) => r.status === 'rejected'),
  };
}

export async function discoverJikan(
  format: string,
  status: string,
  sort: string,
): Promise<Title[]> {
  if (format === 'Donghua') return [];
  const manga = ['Manga', 'Manhwa', 'Manhua'].includes(format);
  const kind = manga ? 'manga' : 'anime';
  const statusMap: Record<string, string> = manga
    ? {
        RELEASING: 'publishing',
        FINISHED: 'complete',
        NOT_YET_RELEASED: 'upcoming',
        HIATUS: 'hiatus',
        CANCELLED: 'discontinued',
      }
    : { RELEASING: 'airing', FINISHED: 'complete', NOT_YET_RELEASED: 'upcoming' };
  if (status !== 'ALL' && !statusMap[status]) return [];
  const params = new URLSearchParams({
    limit: '30',
    sfw: 'true',
    order_by:
      sort === 'SCORE_DESC' ? 'score' : sort === 'START_DATE_DESC' ? 'start_date' : 'popularity',
    sort: sort === 'POPULARITY_DESC' || sort === 'TRENDING_DESC' ? 'asc' : 'desc',
  });
  if (status !== 'ALL') params.set('status', statusMap[status]);
  if (manga) params.set('type', format.toLowerCase());
  const body = await request<{ data: JikanItem[] }>(`/${kind}?${params}`);
  if (!Array.isArray(body.data)) throw new CatalogError('Jikan returned an unreadable catalog.');
  return body.data.map((d) => normalizeJikan(d, manga)).filter((t): t is Title => !!t);
}
