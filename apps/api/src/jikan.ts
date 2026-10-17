import {
  type Title,
  type Artwork,
  type MediaVideo,
  type ThemeSong,
  type CommunityResponse,
} from '@animepoodle/shared';
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
    titles: {
      english: d.title_english || null,
      romaji: d.title || null,
      native: d.title_japanese || null,
    },
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

interface JikanReview {
  mal_id: number;
  url?: string;
  date?: string;
  review?: string;
  score?: number;
  tags?: string[];
  is_spoiler?: boolean;
  reactions?: { overall?: number };
  user?: { username?: string; images?: { jpg?: { image_url?: string } } };
}
interface JikanTopic {
  mal_id: number;
  url?: string;
  title?: string;
  date?: string;
  author_username?: string;
  comments?: number;
}
const excerpt = (text: string) => {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length > 700 ? `${clean.slice(0, 700).replace(/\s\S*$/, '')}…` : clean;
};
/** MyAnimeList reviews, forum threads and background notes, via Jikan. */
export async function getJikanCommunity(
  malId: number,
  anime: boolean,
  page: number,
): Promise<CommunityResponse> {
  const kind = anime ? 'anime' : 'manga';
  const [full, reviews, topics] = await Promise.allSettled([
    request<{ data: JikanItem & { background?: string; members?: number; rank?: number } }>(
      `/${kind}/${malId}/full`,
    ),
    request<{ data: JikanReview[]; pagination?: { has_next_page?: boolean } }>(
      `/${kind}/${malId}/reviews?page=${page}&spoilers=true&preliminary=true`,
    ),
    page === 1
      ? request<{ data: JikanTopic[] }>(`/${kind}/${malId}/forum?filter=all`)
      : Promise.resolve({ data: [] as JikanTopic[] }),
  ]);
  if ([full, reviews, topics].every((r) => r.status === 'rejected'))
    throw (reviews as PromiseRejectedResult).reason;
  const info = full.status === 'fulfilled' ? full.value.data : null;
  const reviewData = reviews.status === 'fulfilled' ? reviews.value : null;
  return {
    malUrl: `https://myanimelist.net/${kind}/${malId}`,
    englishTitle: info?.title_english?.trim() || null,
    background: info?.background?.trim() || null,
    members: info?.members ?? null,
    rank: info?.rank ?? null,
    reviews: (reviewData?.data || [])
      .filter((r) => Number.isSafeInteger(r.mal_id) && typeof r.review === 'string')
      .slice(0, 6)
      .map((r) => ({
        id: r.mal_id,
        author: r.user?.username || 'MyAnimeList member',
        avatar: httpsUrl(r.user?.images?.jpg?.image_url),
        score: typeof r.score === 'number' ? r.score : null,
        date: r.date || null,
        verdict: r.tags?.[0] || null,
        excerpt: excerpt(r.review!),
        spoiler: !!r.is_spoiler,
        reactions: r.reactions?.overall || 0,
        url: httpsUrl(r.url) || `https://myanimelist.net/${kind}/${malId}/reviews`,
      })),
    hasNextPage: !!reviewData?.pagination?.has_next_page,
    topics:
      topics.status === 'fulfilled'
        ? (topics.value.data || []).slice(0, 8).map((t) => ({
            id: t.mal_id,
            title: t.title || 'Discussion thread',
            author: t.author_username || 'MyAnimeList member',
            comments: t.comments || 0,
            date: t.date || null,
            url: httpsUrl(t.url) || `https://myanimelist.net/${kind}/${malId}/forum`,
          }))
        : [],
    ...([full, reviews, topics].some((r) => r.status === 'rejected')
      ? { notice: 'Some MyAnimeList community data is unavailable right now.' }
      : {}),
  };
}
