/** Reading: chapters come from MangaDex and are credited to their scanlation groups. */
export interface ReadingSeries {
  /** MangaDex manga ID. */
  id: string;
  title: string;
  /** Languages with at least one chapter, MangaDex codes such as "en" or "pt-br". */
  languages: string[];
  /** Publisher pages MangaDex lists, such as the official English release. */
  official: { label: string; url: string }[];
  url: string;
}
export interface ReadingSeriesResponse {
  series: ReadingSeries | null;
}
export interface ChapterInfo {
  id: string;
  chapter: string | null;
  volume: string | null;
  title: string | null;
  language: string;
  pages: number;
  /** Official chapters hosted elsewhere have no pages here, only this link. */
  externalUrl: string | null;
  readableAt: string;
  groups: string[];
}
export interface ChapterListResponse {
  chapters: ChapterInfo[];
  total: number;
  offset: number;
  limit: number;
}
/** Every chapter in reading order, for next/previous and the chapter picker. */
export interface ChapterIndexResponse {
  chapters: { id: string; chapter: string | null; volume: string | null }[];
}
export interface ChapterPagesResponse {
  chapter: ChapterInfo;
  mangaId: string;
  /** Same-origin page URLs; images go through animepoodle as MangaDex requires. */
  pages: string[];
  quality: 'data' | 'data-saver';
}
export interface ChapterUpdate {
  mangaId: string;
  count: number;
  latest: ChapterInfo;
}
export interface ChapterUpdatesResponse {
  updates: ChapterUpdate[];
  checkedAt: string;
}
export const readingLanguageNames: Record<string, string> = {
  en: 'English',
  ja: 'Japanese',
  ko: 'Korean',
  zh: 'Chinese',
  'zh-hk': 'Chinese (Traditional)',
  es: 'Spanish',
  'es-la': 'Spanish (Latin America)',
  'pt-br': 'Portuguese (Brazil)',
  pt: 'Portuguese',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  ru: 'Russian',
  id: 'Indonesian',
  vi: 'Vietnamese',
  th: 'Thai',
  tr: 'Turkish',
  ar: 'Arabic',
  pl: 'Polish',
  uk: 'Ukrainian',
  hi: 'Hindi',
  bn: 'Bengali',
  fil: 'Filipino',
  ms: 'Malay',
};
export const languageName = (code: string) => readingLanguageNames[code] || code.toUpperCase();
export const chapterLabel = (c: { chapter: string | null; volume?: string | null }) =>
  c.chapter ? `Chapter ${c.chapter}` : c.volume ? `Volume ${c.volume}` : 'Oneshot';
export const mangaDexId = (value: string | null | undefined) =>
  !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
