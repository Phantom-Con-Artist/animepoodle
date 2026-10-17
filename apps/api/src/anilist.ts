import {
  type Title,
  type Taste,
  type MediaDetails,
  type Trailer,
  type MediaLink,
  type MediaProfile,
} from '@animepoodle/shared';
import { httpsUrl, youtubeUrl } from './urls.js';
export const mediaFields = `id idMal title{english romaji native} type format status countryOfOrigin tags{name rank isAdult isGeneralSpoiler isMediaSpoiler} startDate{year} season seasonYear popularity averageScore episodes chapters genres description(asHtml:false) bannerImage coverImage{large extraLarge color} trailer{id site}`;
const query = `query Search($search:String!,$type:MediaType,$country:CountryCode,$status:MediaStatus){Page(page:1,perPage:30){media(search:$search,type:$type,countryOfOrigin:$country,status:$status,isAdult:false,sort:SEARCH_MATCH){${mediaFields}}}}`;
const discoveryQuery = `query Discover($type:MediaType,$country:CountryCode,$status:MediaStatus,$sort:[MediaSort]){Page(page:1,perPage:30){media(type:$type,countryOfOrigin:$country,status:$status,isAdult:false,sort:$sort){${mediaFields}}}}`;
export interface AniMedia {
  id: number;
  idMal: number | null;
  title: { english: string | null; romaji: string; native: string | null };
  type: 'ANIME' | 'MANGA';
  countryOfOrigin: string;
  format?: string;
  tags?: {
    name: string;
    rank: number | null;
    isAdult?: boolean;
    isGeneralSpoiler?: boolean;
    isMediaSpoiler?: boolean;
  }[];
  startDate: { year: number | null };
  averageScore: number | null;
  episodes: number | null;
  chapters: number | null;
  status: string;
  genres: string[];
  description: string | null;
  bannerImage?: string | null;
  season?: string | null;
  seasonYear?: number | null;
  popularity?: number | null;
  trailer?: { id?: string; site?: string } | null;
  coverImage: { large: string; extraLarge?: string; color: string | null };
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
    mediaFormat: d.format,
    season: d.season || null,
    seasonYear: d.seasonYear || null,
    popularity: d.popularity || 0,
    trailer: normalizeTrailer(d.trailer || null),
    origin: d.countryOfOrigin,
    status: d.status as Title['status'],
    tags: (d.tags || [])
      .filter(
        (tag) =>
          !tag.isAdult &&
          !tag.isGeneralSpoiler &&
          !tag.isMediaSpoiler &&
          typeof tag.name === 'string' &&
          typeof tag.rank === 'number' &&
          tag.rank > 0,
      )
      .sort((a, b) => (b.rank || 0) - (a.rank || 0))
      .slice(0, 32)
      .map((tag) => ({ name: tag.name.slice(0, 100), rank: Math.min(100, tag.rank || 0) })),
    bannerImage: httpsUrl(d.bannerImage),
    title: d.title.english || d.title.romaji,
    titles: {
      english: d.title.english || null,
      romaji: d.title.romaji || null,
      native: d.title.native || null,
    },
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
    year: d.startDate?.year || 0,
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
    genres: d.genres || [],
    description: (d.description || 'No synopsis available yet.')
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'"),
    image: d.coverImage.extraLarge || d.coverImage.large,
    color: d.coverImage.color || '#657675',
    features: featuresFor(d.genres || []),
  };
}
const cache = new Map<string, { at: number; items: Title[] }>();
const pending = new Map<string, Promise<Title[]>>();
let cooldownUntil = 0;
export async function searchAniList(
  search: string,
  format: string,
  status = 'ALL',
): Promise<Title[]> {
  const key = `${format}:${status}:${search.toLowerCase()}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.at < 60000) return cached.items;
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
    const data = await requestAniList(query, {
      search,
      type,
      country,
      status: status === 'ALL' ? undefined : status,
    });
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
export async function requestAniList(document: string, variables: Record<string, unknown>) {
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
      'Live search is unavailable right now. Your cached discoveries are still here.',
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
    ${mediaFields} trailer{id site thumbnail}
    externalLinks{site url isDisabled type language color}
    endDate{year} duration source(version:3) favourites
    nextAiringEpisode{episode airingAt}
    rankings{rank type allTime season year context}
    studios(isMain:true){nodes{id name}}
    staff(perPage:8,sort:[RELEVANCE]){edges{role node{id name{full}}}}
    characters(perPage:12,sort:[ROLE,RELEVANCE]){edges{role node{id name{full} image{medium}} voiceActors(language:JAPANESE,sort:[RELEVANCE]){id name{full} image{medium}}}}
    relations{edges{relationType(version:2) node{${mediaFields}}}}
    recommendations(perPage:8,sort:RATING_DESC){nodes{mediaRecommendation{${mediaFields}}}}
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
      media: media.title && media.coverImage && media.type ? normalizeMedia(media) : undefined,
      profile: normalizeProfile(media),
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

interface AniProfileFields {
  season?: string | null;
  seasonYear?: number | null;
  endDate?: { year: number | null } | null;
  duration?: number | null;
  source?: string | null;
  popularity?: number | null;
  favourites?: number | null;
  studios?: { nodes?: { id: number; name: string }[] } | null;
  characters?: {
    edges?: {
      role: string;
      node: { id: number; name: { full: string }; image: { medium: string } | null };
      voiceActors?: { id: number; name: { full: string }; image: { medium: string } | null }[];
    }[];
  } | null;
  staff?: { edges?: { role: string; node: { id: number; name: { full: string } } }[] } | null;
  externalLinks?: {
    site?: string;
    url?: string;
    isDisabled?: boolean;
    type?: string;
    language?: string | null;
    color?: string | null;
  }[];
  relations?: { edges?: { relationType: string; node: AniMedia }[] } | null;
  rankings?: {
    rank: number;
    type: 'RATED' | 'POPULAR';
    allTime: boolean;
    season: string | null;
    year: number | null;
    context: string;
  }[];
  nextAiringEpisode?: { episode: number; airingAt: number } | null;
  recommendations?: { nodes?: { mediaRecommendation: AniMedia | null }[] } | null;
}
export const words = (value: string | null | undefined) =>
  value
    ? value
        .toLowerCase()
        .replace(/_/g, ' ')
        .replace(/^./, (c) => c.toUpperCase())
    : null;
export function normalizeProfile(media: AniProfileFields): MediaProfile {
  return {
    studios: (media.studios?.nodes || []).map((s) => s.name).slice(0, 4),
    season: media.season ? `${words(media.season)} ${media.seasonYear || ''}`.trim() : null,
    endYear: media.endDate?.year || null,
    duration: media.duration || null,
    sourceMaterial: words(media.source),
    popularity: media.popularity || 0,
    favourites: media.favourites || 0,
    studioList: (media.studios?.nodes || [])
      .slice(0, 4)
      .map((st) => ({ id: st.id, name: st.name })),
    characters: (media.characters?.edges || []).map((edge) => {
      const va = edge.voiceActors?.[0];
      return {
        id: edge.node.id,
        name: edge.node.name.full,
        role: words(edge.role) || 'Supporting',
        image: httpsUrl(edge.node.image?.medium),
        voiceActor: va
          ? {
              name: va.name.full,
              image: httpsUrl(va.image?.medium),
              url: `https://anilist.co/staff/${va.id}`,
            }
          : null,
      };
    }),
    staff: (media.staff?.edges || []).map((edge) => ({
      name: edge.node.name.full,
      role: edge.role,
      url: `https://anilist.co/staff/${edge.node.id}`,
    })),
    links: (media.externalLinks || [])
      .filter((l) => !l.isDisabled && l.site && httpsUrl(l.url))
      .map((l) => ({
        site: l.site!,
        url: httpsUrl(l.url)!,
        type: l.type || 'INFO',
        language: l.language || null,
        color: l.color && /^#[0-9a-f]{3,8}$/i.test(l.color) ? l.color : null,
      })),
    relations: (media.relations?.edges || [])
      .filter((e) => e.node && !['CHARACTER', 'OTHER'].includes(e.relationType))
      .map((e) => ({ relation: words(e.relationType) || 'Related', item: normalizeMedia(e.node) }))
      .slice(0, 12),
    rankings: (media.rankings || [])
      .filter((r) => r.rank <= 100)
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 4)
      .map((r) => ({
        rank: r.rank,
        kind: r.type,
        label: `${r.type === 'RATED' ? 'Highest rated' : 'Most popular'} ${
          r.allTime
            ? 'of all time'
            : r.season
              ? `${words(r.season)} ${r.year}`
              : r.year
                ? `of ${r.year}`
                : ''
        }`.trim(),
      })),
    nextEpisode: media.nextAiringEpisode || null,
    recommendations: (media.recommendations?.nodes || [])
      .map((node) => node.mediaRecommendation)
      .filter((m): m is AniMedia => !!m)
      .map(normalizeMedia),
  };
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

const discoveryCache = new Map<
  string,
  { at: number; data: { items: Title[]; source: string; fetchedAt: string } }
>(); // 60-second freshness window
const discoveryPending = new Map<
  string,
  Promise<{ items: Title[]; source: string; fetchedAt: string }>
>();
export async function discoverAniList(format: string, status: string, sort: string) {
  const key = `${format}:${status}:${sort}`;
  const hit = discoveryCache.get(key);
  if (hit && Date.now() - hit.at < 60000) return hit.data;
  const active = discoveryPending.get(key);
  if (active) return active;
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
    const data = await requestAniList(discoveryQuery, {
      type,
      country,
      status: status === 'ALL' ? undefined : status,
      sort: [sort, 'POPULARITY_DESC'],
    });
    if (data.errors || !Array.isArray(data.data?.Page?.media))
      throw new CatalogError(
        'The live catalog is unavailable right now. Please try again shortly.',
      );
    const result = {
      items: data.data.Page.media.map(normalizeMedia) as Title[],
      source: 'AniList',
      fetchedAt: new Date().toISOString(),
    };
    if (discoveryCache.size >= 100) discoveryCache.delete(discoveryCache.keys().next().value!);
    discoveryCache.set(key, { at: Date.now(), data: result });
    return result;
  })();
  discoveryPending.set(key, work);
  try {
    return await work;
  } finally {
    discoveryPending.delete(key);
  }
}
