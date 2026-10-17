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
  origin?: string;
  status?: ReleaseStatus;
  title: string;
  original: string;
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
    description: 'Grand adventures & worlds worth getting lost in',
  },
  {
    name: 'In my feelings',
    emoji: '🌧️',
    taste: [0.3, 1, 0.15, 0.4, 0.5, 0.4],
    description: 'Beautiful stories that stay with you',
  },
  {
    name: 'Just one more episode',
    emoji: '⚡',
    taste: [0.6, 0.5, 1, 0.85, 0.1, 0.6],
    description: 'High stakes, big twists, zero bedtime',
  },
  {
    name: 'Comfort zone',
    emoji: '☁️',
    taste: [0.4, 0.6, 0.1, 0.2, 1, 0.5],
    description: 'A warm hug in story form',
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
export interface CatalogResponse {
  items: Title[];
  source: string;
  notice?: string;
  fetchedAt?: string;
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
