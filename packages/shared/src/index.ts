export const formats = ['All', 'Anime', 'Manga', 'Manhwa', 'Manhua', 'Donghua'] as const;
export type Format = Exclude<(typeof formats)[number], 'All'>;
export const dimensions = [
  'Adventure',
  'Emotion',
  'Action',
  'Mystery',
  'Comfort',
  'Fantasy',
] as const;
export type Taste = [number, number, number, number, number, number];
export interface Title {
  id: number;
  anilistId?: number;
  malId?: number;
  source?: 'AniList' | 'Jikan';
  bannerImage?: string | null;
  tags?: FeatureTag[];
  mediaFormat?: string;
  season?: string | null;
  seasonYear?: number | null;
  popularity?: number;
  trailer?: Trailer | null;
  origin?: string;
  status?: ReleaseStatus;
  title: string;
  original: string;
  /** Every name the source gives, so people can pick which one they read. */
  titles?: {
    english: string | null;
    romaji: string | null;
    native: string | null;
    /** Set when AniList had no English title and one was taken from elsewhere. */
    englishFrom?: 'synonym' | 'MyAnimeList' | 'MangaDex';
  };
  format: Format;
  year: number;
  rating: number;
  episodes: string;
  genres: string[];
  description: string;
  image: string;
  color: string;
  features: Taste;
}
export const defaultTaste: Taste = [0.8, 0.7, 0.55, 0.6, 0.65, 0.85];
export const moods: { name: string; emoji: string; taste: Taste; description: string }[] = [
  {
    name: 'Take me somewhere',
    emoji: '🗺️',
    taste: [1, 0.5, 0.6, 0.5, 0.4, 1],
    description: 'Big journeys and worlds to explore',
  },
  {
    name: 'In my feelings',
    emoji: '🌧️',
    taste: [0.3, 1, 0.15, 0.4, 0.5, 0.4],
    description: 'Stories that hit you emotionally',
  },
  {
    name: 'Just one more episode',
    emoji: '⚡',
    taste: [0.6, 0.5, 1, 0.85, 0.1, 0.6],
    description: 'Fast, tense and full of twists',
  },
  {
    name: 'Comfort zone',
    emoji: '☁️',
    taste: [0.4, 0.6, 0.1, 0.2, 1, 0.5],
    description: 'Low stakes, cosy and funny',
  },
];
export interface RankedTitle {
  item: Title;
  score: number;
  reason: string;
  evidence?: {
    confidence: number;
    similarity: number;
    bayesian: number;
    novelty: number;
    uncertainty: number;
  };
}
export function scoreTitle(features: Taste, taste: Taste, rating: number, novelty: number): number {
  let dot = 0,
    a = 0,
    b = 0;
  for (let i = 0; i < 6; i++) {
    dot += features[i] * taste[i];
    a += features[i] ** 2;
    b += taste[i] ** 2;
  }
  const similarity = a > 0 && b > 0 ? dot / Math.sqrt(a * b) : 0;
  const distance = features.reduce((sum, value, i) => sum + Math.abs(value - taste[i]), 0) / 6;
  return Math.max(
    0,
    Math.min(
      100,
      (similarity * 0.65 + (1 - distance) * 0.25 + (rating / 10) * 0.1) * 100 - novelty,
    ),
  );
}
export function reasonFor(item: Title, taste: Taste) {
  const affinity = item.features
    .map((v, i) => ({ v: v * taste[i], name: dimensions[i] }))
    .sort((a, b) => b.v - a.v);
  return `${affinity[0].name} meets ${affinity[1].name.toLowerCase()}`;
}

export interface Trailer {
  site: 'youtube' | 'dailymotion';
  url: string;
  embedUrl: string | null;
  thumbnail: string | null;
}
export interface MediaReview {
  id: number;
  summary: string;
  score: number | null;
  helpful: number;
  ratings: number;
  author: string;
  url: string;
}
export interface MediaDetails {
  anilistId: number;
  malId?: number | null;
  bannerImage?: string | null;
  youtubeLinks?: MediaLink[];
  url: string;
  trailer: Trailer | null;
  reviews: MediaReview[];
  pageInfo: { currentPage: number; hasNextPage: boolean };
  /** Full normalized title so a story page can render from a direct link. */
  media?: Title;
  profile?: MediaProfile;
}
export interface MediaCharacter {
  id?: number;
  name: string;
  role: string;
  image: string | null;
  voiceActor?: { name: string; image: string | null; url: string } | null;
}
export interface ExternalLink {
  site: string;
  url: string;
  type: 'STREAMING' | 'INFO' | 'SOCIAL' | string;
  language: string | null;
  color: string | null;
}
export interface MediaRelation {
  relation: string;
  item: Title;
}
export interface MediaRanking {
  rank: number;
  label: string;
  kind: 'RATED' | 'POPULAR';
}
export interface MediaProfile {
  studioList?: { id: number; name: string }[];
  staff?: { name: string; role: string; url: string }[];
  links?: ExternalLink[];
  relations?: MediaRelation[];
  rankings?: MediaRanking[];
  nextEpisode?: { episode: number; airingAt: number } | null;
  studios: string[];
  season: string | null;
  endYear: number | null;
  duration: number | null;
  sourceMaterial: string | null;
  popularity: number;
  favourites: number;
  characters: MediaCharacter[];
  recommendations: Title[];
}
export interface CommunityReview {
  id: number;
  author: string;
  avatar: string | null;
  score: number | null;
  date: string | null;
  verdict: string | null;
  excerpt: string;
  spoiler: boolean;
  reactions: number;
  url: string;
}
export interface ForumTopic {
  id: number;
  title: string;
  author: string;
  comments: number;
  date: string | null;
  url: string;
}
export interface CommunityResponse {
  malUrl: string;
  /** MyAnimeList's official English title, when it has one. */
  englishTitle?: string | null;
  background: string | null;
  members: number | null;
  rank: number | null;
  reviews: CommunityReview[];
  hasNextPage: boolean;
  topics: ForumTopic[];
  notice?: string;
}

export interface MediaLink {
  label: string;
  url: string;
  source: 'AniList' | 'Jikan';
}
export interface Artwork {
  url: string;
  thumbnail: string;
  label: string;
  source: 'AniList' | 'Jikan' | 'AnimeThemes';
}
export interface MediaVideo {
  title: string;
  trailer: Trailer;
  source: 'AniList' | 'Jikan';
}
export interface ThemeSong {
  id: string;
  label: string;
  title: string;
  artists: string[];
  videoUrl: string | null;
  audioUrl: string | null;
  episodes: string | null;
  source: 'AnimeThemes' | 'Jikan';
  url: string;
}
export interface MediaExtras {
  themes: ThemeSong[];
  videos: MediaVideo[];
  artwork: Artwork[];
  sources: {
    name: 'AnimeThemes' | 'Jikan';
    status: 'ok' | 'partial' | 'unavailable' | 'not-applicable';
    message?: string;
  }[];
}
export function mediaIdentity(item: Title) {
  return { anilistId: item.anilistId, malId: item.malId || (item.id > 0 ? item.id : undefined) };
}
export const releaseStatuses = [
  'ALL',
  'RELEASING',
  'FINISHED',
  'NOT_YET_RELEASED',
  'HIATUS',
  'CANCELLED',
] as const;
export type ReleaseStatus = Exclude<(typeof releaseStatuses)[number], 'ALL'>;
/** What a loose search read into the query besides titles. */
export interface SearchMatches {
  genres: string[];
  tags: string[];
  studios: string[];
}
export interface CatalogResponse {
  items: Title[];
  source: string;
  notice?: string;
  fetchedAt?: string;
  matched?: SearchMatches;
}
export function mergeTitleMetadata(groups: Title[][]) {
  const map = new Map<string, Title>();
  for (const group of groups)
    for (const item of group) {
      const previous = map.get(titleKey(item));
      map.set(titleKey(item), { ...previous, ...item });
    }
  return [...map.values()];
}

export interface FeatureTag {
  name: string;
  rank: number;
}
export interface Feedback {
  item: Title;
  rating: number;
}
export function titleKey(item: Title) {
  return `${item.format}:${item.id}`;
}
export {
  vectorizeCatalog,
  buildVectorProfile,
  cosineSimilarity,
  rankByVectors,
  posteriorStats,
  VECTOR_SIZE,
} from './vectors';

/** One label per AniList media format, used everywhere so types never get mixed up. */
export const mediaKinds: Record<string, { label: string; group: string }> = {
  TV: { label: 'TV series', group: 'TV series' },
  TV_SHORT: { label: 'Short', group: 'Shorts' },
  MOVIE: { label: 'Movie', group: 'Movies' },
  OVA: { label: 'OVA', group: 'OVAs' },
  SPECIAL: { label: 'Special', group: 'Specials' },
  ONA: { label: 'Web series', group: 'Web series' },
  MUSIC: { label: 'Music video', group: 'Music videos' },
  MANGA: { label: 'Series', group: 'Series' },
  ONE_SHOT: { label: 'One-shot', group: 'One-shots' },
  NOVEL: { label: 'Novel', group: 'Novels' },
};
export const animeKinds = ['TV', 'MOVIE', 'OVA', 'ONA', 'SPECIAL', 'TV_SHORT'] as const;
export const bookKinds = ['MANGA', 'ONE_SHOT', 'NOVEL'] as const;
export const kindLabel = (format?: string | null) =>
  (format && mediaKinds[format]?.label) || 'Unknown type';
export const isWatchFormat = (format: Format) => format === 'Anime' || format === 'Donghua';
export const seasons = ['WINTER', 'SPRING', 'SUMMER', 'FALL'] as const;
export type Season = (typeof seasons)[number];
/** Anime seasons follow the calendar: Dec–Feb winter (December counts toward next year). */
export function currentSeason(date = new Date()): { season: Season; year: number } {
  const m = date.getUTCMonth();
  const year = date.getUTCFullYear();
  if (m === 11) return { season: 'WINTER', year: year + 1 };
  return { season: seasons[Math.floor((m + 1) / 3) % 4], year };
}
export const seasonLabel = (season: string) => season.charAt(0) + season.slice(1).toLowerCase();
export interface PageInfo {
  currentPage: number;
  hasNextPage: boolean;
  total?: number;
}
export interface BrowseResponse extends CatalogResponse {
  pageInfo: PageInfo;
}
export interface HighlightsResponse {
  format: Format;
  season: { season: Season; year: number } | null;
  week: Title[];
  month: Title[];
  year: Title[];
  seasonal: Title[];
  upcoming: Title[];
  fetchedAt: string;
}
export interface AwardWinner {
  award: string;
  ceremony: string;
  year: number;
  studio?: string | null;
  item: Title;
}
export interface AwardsResponse {
  winners: AwardWinner[];
  source: string;
  fetchedAt: string;
}
export interface StudioResponse {
  id: number;
  name: string;
  isAnimationStudio: boolean;
  favourites: number;
  url: string;
  items: Title[];
  pageInfo: PageInfo;
}
/** Drops repeats (AniList pages can overlap when rankings shift between requests). */
export function uniqueTitles(items: Title[]) {
  const seen = new Set<string>();
  return items.filter((t) => {
    const k = `${t.format}:${t.id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
export type TitleLanguage = 'english' | 'romaji' | 'native';
/** The title in the reader's preferred language, falling back sensibly when it's missing. */
export function displayTitle(item: Title, language: TitleLanguage = 'english') {
  const t = item.titles;
  if (!t) return item.title;
  if (language === 'romaji') return t.romaji || t.english || item.title;
  if (language === 'native') return t.native || t.romaji || item.title;
  return t.english || t.romaji || item.title;
}

export * from './hype';
export * from './reading';

/**
 * Fill in an English title found after the catalog loaded (MyAnimeList, MangaDex). AniList's
 * own English title always wins; a synonym guess gives way to an official source.
 */
export function withEnglishTitle(
  item: Title,
  english: string | null | undefined,
  from: 'MyAnimeList' | 'MangaDex',
): Title {
  const name = english?.trim();
  const t = item.titles;
  if (!name || (t?.english && !t.englishFrom) || (t?.englishFrom && t.englishFrom !== 'synonym'))
    return item;
  if (t?.english === name) return item;
  return {
    ...item,
    title: name,
    titles: {
      english: name,
      romaji: t?.romaji ?? null,
      native: t?.native ?? null,
      englishFrom: from,
    },
  };
}
