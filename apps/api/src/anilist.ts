import {
  type Title,
  type Taste,
  type MediaDetails,
  type Trailer,
  type MediaLink,
} from '@animepoodle/shared';
import { httpsUrl, youtubeUrl } from './urls.js';
const query = `query Discover($search:String!,$type:MediaType,$country:CountryCode){Page(page:1,perPage:30){media(search:$search,type:$type,countryOfOrigin:$country,isAdult:false,sort:SEARCH_MATCH){id idMal title{english romaji native}type countryOfOrigin startDate{year}averageScore episodes chapters status genres description(asHtml:false)bannerImage coverImage{large color}}}}`;
interface AniMedia {
  id: number;
  idMal: number | null;
  title: { english: string | null; romaji: string; native: string | null };
  type: 'ANIME' | 'MANGA';
  countryOfOrigin: string;
  startDate: { year: number | null };
  averageScore: number | null;
  episodes: number | null;
  chapters: number | null;
  status: string;
  genres: string[];
  description: string | null;
  bannerImage?: string | null;
  coverImage: { large: string; color: string | null };
}
export class CatalogError extends Error {
  constructor(
    message: string,
    public status: 404 | 429 | 503 = 503,
    public retryAfter = 60,
  ) {
    super(message);
  }
}
export function featuresFor(genres: string[]): Taste {
  return [
    genres.includes('Adventure') ? 0.95 : 0.35,
    genres.some((g) => ['Drama', 'Romance'].includes(g)) ? 0.95 : 0.4,
    genres.includes('Action') ? 0.95 : 0.2,
    genres.some((g) => ['Mystery', 'Thriller'].includes(g)) ? 0.95 : 0.25,
    genres.some((g) => ['Slice of Life', 'Comedy'].includes(g)) ? 0.95 : 0.2,
    genres.some((g) => ['Fantasy', 'Supernatural'].includes(g)) ? 0.95 : 0.2,
  ];
}
export function normalizeMedia(d: AniMedia): Title {
  return {
    id: d.idMal || -d.id,
    anilistId: d.id,
    malId: d.idMal || undefined,
    source: 'AniList',
    bannerImage: httpsUrl(d.bannerImage),
    title: d.title.english || d.title.romaji,
    original: d.title.native || d.title.romaji,
    format:
      d.type === 'ANIME'
        ? d.countryOfOrigin === 'CN'
          ? 'Donghua'
          : 'Anime'
        : d.countryOfOrigin === 'KR'
          ? 'Manhwa'
          : d.countryOfOrigin === 'CN'
            ? 'Manhua'
            : 'Manga',
    year: d.startDate.year || 0,
    rating: d.averageScore ? d.averageScore / 10 : 0,
    episodes:
      d.type === 'MANGA'
        ? d.chapters
          ? `${d.chapters} chapters`
          : d.status === 'RELEASING'
            ? 'Ongoing'
            : 'Chapters unknown'
        : d.episodes
          ? `${d.episodes} episodes`
          : 'Episodes unknown',
    genres: d.genres,
    description: (d.description || 'No synopsis available yet.')
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'"),
    image: d.coverImage.large,
    color: d.coverImage.color || '#657675',
    features: featuresFor(d.genres),
  };
}
const cache = new Map<string, { at: number; items: Title[] }>();
const pending = new Map<string, Promise<Title[]>>();
let cooldownUntil = 0;
export async function searchAniList(search: string, format: string): Promise<Title[]> {
  const key = `${format}:${search.toLowerCase()}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < 300000) return cached.items;
  if (cooldownUntil > Date.now())
    throw new CatalogError(
      'AniList is taking a short breather. Please try again in a minute.',
      429,
      Math.ceil((cooldownUntil - Date.now()) / 1000),
    );
  const existing = pending.get(key);
  if (existing) return existing;
  const work = (async () => {
    const type =
      format === 'All'
        ? undefined
        : ['Manga', 'Manhwa', 'Manhua'].includes(format)
          ? 'MANGA'
          : 'ANIME';
    const country =
      format === 'Manhwa'
        ? 'KR'
        : ['Manhua', 'Donghua'].includes(format)
          ? 'CN'
          : format === 'Manga'
            ? 'JP'
            : undefined;
    const data = await requestAniList(query, { search, type, country });
    if (data.errors || !Array.isArray(data.data?.Page?.media))
      throw new CatalogError(
        'The catalog could not complete this search. Please try another title.',
      );
    const items = data.data.Page.media.map(normalizeMedia);
    if (cache.size >= 100) cache.delete(cache.keys().next().value!);
    cache.set(key, { at: Date.now(), items });
    return items;
  })();
  pending.set(key, work);
  try {
    return await work;
  } finally {
    pending.delete(key);
  }
}

// Shared transport keeps rate-limit cooldowns consistent across search and details.
async function requestAniList(document: string, variables: Record<string, unknown>) {
  if (cooldownUntil > Date.now())
    throw new CatalogError(
      'AniList is taking a short breather. Please try again in a minute.',
      429,
      Math.ceil((cooldownUntil - Date.now()) / 1000),
    );
  let res: Response;
  try {
    res = await fetch('https://graphql.anilist.co', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ query: document, variables }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    throw new CatalogError(
      'Live search is unavailable right now. Your curated discoveries are still here.',
    );
  }
  if (res.status === 429) {
    const retry = Math.max(1, Number(res.headers.get('Retry-After')) || 60);
    cooldownUntil = Date.now() + retry * 1000;
    throw new CatalogError(
      'AniList is taking a short breather. Please try again in a minute.',
      429,
      retry,
    );
  }
  if (res.status === 404)
    throw new CatalogError('No AniList details are available for this story yet.', 404);
  if (!res.ok)
    throw new CatalogError('AniList is unavailable right now. Please try again shortly.');
  return await res.json();
}
const detailsQuery = `query StoryExtras($id:Int,$idMal:Int,$type:MediaType!,$page:Int!){
  Media(id:$id,idMal:$idMal,type:$type,isAdult:false){
    id idMal bannerImage trailer{id site thumbnail}
    externalLinks{site url isDisabled}
    reviews(page:$page,perPage:3,sort:RATING_DESC){
      pageInfo{currentPage hasNextPage}
      nodes{id summary score rating ratingAmount user{name}}
    }
  }
}`;
export function normalizeTrailer(trailer: { id?: string; site?: string } | null): Trailer | null {
  if (!trailer?.id || !/^[a-zA-Z0-9_-]{1,100}$/.test(trailer.id)) return null;
  const id = trailer.id;
  if (trailer.site === 'youtube')
    return {
      site: 'youtube',
      url: `https://www.youtube.com/watch?v=${id}`,
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}`,
      thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    };
  if (trailer.site === 'dailymotion')
    return {
      site: 'dailymotion',
      url: `https://www.dailymotion.com/video/${id}`,
      embedUrl: null,
      thumbnail: null,
    };
  return null;
}
const detailsCache = new Map<string, { at: number; value: MediaDetails }>();
const detailsPending = new Map<string, Promise<MediaDetails>>();
export async function getMediaDetails(
  mediaId: number,
  format: string,
  page: number,
): Promise<MediaDetails> {
  const type = ['Anime', 'Donghua'].includes(format) ? 'ANIME' : 'MANGA';
  const key = `${type}:${mediaId}:${page}`;
  const cached = detailsCache.get(key);
  if (cached && Date.now() - cached.at < 300000) return cached.value;
  const existing = detailsPending.get(key);
  if (existing) return existing;
  const work = (async () => {
    const data = await requestAniList(detailsQuery, {
      id: mediaId < 0 ? -mediaId : undefined,
      idMal: mediaId > 0 ? mediaId : undefined,
      type,
      page,
    });
    if (
      !data.data?.Media &&
      (data.errors?.some((e: { status?: number }) => e.status === 404) || !data.errors)
    )
      throw new CatalogError('No AniList details are available for this story yet.', 404);
    if (data.errors || !data.data?.Media)
      throw new CatalogError(
        'Trailers and reviews are unavailable right now. Please try again shortly.',
      );
    const media = data.data.Media;
    const value: MediaDetails = {
      anilistId: media.id,
      malId: media.idMal || null,
      bannerImage: httpsUrl(media.bannerImage),
      youtubeLinks: normalizeYoutubeLinks(media.trailer, media.externalLinks || []),
      url: `https://anilist.co/${type === 'ANIME' ? 'anime' : 'manga'}/${media.id}`,
      trailer: normalizeTrailer(media.trailer),
      reviews: (media.reviews?.nodes || []).map(
        (r: {
          id: number;
          summary: string | null;
          score: number | null;
          rating: number | null;
          ratingAmount: number | null;
          user: { name: string } | null;
        }) => ({
          id: r.id,
          summary: r.summary || 'Untitled review',
          score: r.score,
          helpful: r.rating || 0,
          ratings: r.ratingAmount || 0,
          author: r.user?.name || 'AniList reader',
          url: `https://anilist.co/review/${r.id}`,
        }),
      ),
      pageInfo: {
        currentPage: media.reviews?.pageInfo?.currentPage || page,
        hasNextPage: !!media.reviews?.pageInfo?.hasNextPage,
      },
    };
    if (detailsCache.size >= 100) detailsCache.delete(detailsCache.keys().next().value!);
    detailsCache.set(key, { at: Date.now(), value });
    return value;
  })();
  detailsPending.set(key, work);
  try {
    return await work;
  } finally {
    detailsPending.delete(key);
  }
}

export function normalizeYoutubeLinks(
  trailer: { site?: string; id?: string } | null,
  links: { site?: string; url?: string; isDisabled?: boolean }[],
): MediaLink[] {
  const result: MediaLink[] = [];
  if (trailer?.site === 'youtube') {
    const normalized = normalizeTrailer(trailer);
    if (normalized)
      result.push({ label: 'Trailer on YouTube', url: normalized.url, source: 'AniList' });
  }
  for (const link of links) {
    if (link.isDisabled) continue;
    const url = youtubeUrl(link.url);
    if (url) result.push({ label: link.site || 'YouTube', url, source: 'AniList' });
  }
  return Array.from(new Map(result.map((link) => [link.url, link])).values());
}
