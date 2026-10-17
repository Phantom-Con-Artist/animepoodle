import { type Title, type MediaExtras, type SearchMatches } from '@animepoodle/shared';
import { searchAniListTerms, discoverAniList } from './anilist.js';
import { searchJikan, getJikanExtras, discoverJikan } from './jikan.js';
import { getAnimeThemes } from './animethemes.js';
import { searchMangaDex } from './mangadex.js';
export function mergeCatalog(primary: Title[], secondary: Title[]): Title[] {
  const merged = new Map<string, Title>();
  for (const item of [...primary, ...secondary]) {
    const category = ['Anime', 'Donghua'].includes(item.format) ? 'anime' : 'manga';
    const key = `${category}:${item.malId || item.id}`;
    if (!merged.has(key)) merged.set(key, item);
  }
  return [...merged.values()];
}
const names = (t: Title) =>
  [t.title, t.original, t.titles?.english, t.titles?.romaji, t.titles?.native]
    .filter((n): n is string => !!n)
    .map((n) => n.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((n) => n.length > 2);
export async function searchCatalog(q: string, format: string, broaden = false, status = 'ALL') {
  // Series only MangaDex lists are searched alongside AniList and come after its results.
  const mangadex = searchMangaDex(q, format).catch(() => [] as Title[]);
  let result: Awaited<ReturnType<typeof searchAniListCatalog>>;
  try {
    result = await searchAniListCatalog(q, format, broaden, status);
  } catch (error) {
    const only = (await mangadex).filter((t) => status === 'ALL' || t.status === status);
    if (!only.length) throw error;
    return {
      items: only,
      source: 'MangaDex',
      notice: 'AniList is unavailable right now. Showing MangaDex results.',
    };
  }
  // MangaDex entries without an AniList link can still be AniList titles: skip same names.
  const known = new Set(result.items.flatMap(names));
  const extra = (await mangadex).filter(
    (t) => (status === 'ALL' || t.status === status) && !names(t).some((n) => known.has(n)),
  );
  if (!extra.length) return result;
  return { ...result, items: [...result.items, ...extra], source: `${result.source} + MangaDex` };
}
async function searchAniListCatalog(q: string, format: string, broaden: boolean, status: string) {
  let primary: Title[] = [];
  let matched: SearchMatches | undefined;
  let primaryError: unknown;
  try {
    ({ items: primary, matched } = await searchAniListTerms(q, format, status));
  } catch (error) {
    primaryError = error;
  }
  if (!broaden && !primaryError && primary.length)
    return { items: primary, source: 'AniList', matched };
  if (format === 'Donghua') {
    if (primaryError) throw primaryError;
    return {
      items: primary,
      source: 'AniList',
      matched,
      ...(broaden
        ? {
            notice:
              'Donghua stays on AniList because Jikan cannot reliably filter by country of origin.',
          }
        : {}),
    };
  }
  try {
    const secondary = await searchJikan(q, format, status);
    const items = mergeCatalog(primary, secondary);
    if (primaryError && !secondary.length) throw primaryError;
    return {
      items,
      source: primary.length ? (secondary.length ? 'AniList + Jikan' : 'AniList') : 'Jikan',
      matched,
      ...(primaryError
        ? { notice: 'AniList is temporarily unavailable. Showing Jikan results.' }
        : {}),
    };
  } catch (error) {
    if (primaryError) throw primaryError;
    return {
      items: primary,
      source: 'AniList',
      matched,
      ...(broaden
        ? { notice: 'Jikan is unavailable right now. Your AniList results are still here.' }
        : {}),
    };
  }
}
export async function getSupplementalMedia(
  anilistId: number | undefined,
  malId: number | undefined,
  format: string,
): Promise<MediaExtras> {
  const anime = ['Anime', 'Donghua'].includes(format);
  const [themes, jikan] = await Promise.allSettled([
    anime ? getAnimeThemes(anilistId, malId) : Promise.resolve(null),
    malId ? getJikanExtras(malId, anime) : Promise.resolve(null),
  ]);
  const themeData = themes.status === 'fulfilled' ? themes.value : null;
  const jikanData = jikan.status === 'fulfilled' ? jikan.value : null;
  return {
    themes: themeData?.themes.length ? themeData.themes : jikanData?.themes || [],
    videos: jikanData?.videos || [],
    artwork: Array.from(
      new Map(
        [...(themeData?.artwork || []), ...(jikanData?.artwork || [])].map((image) => [
          image.url,
          image,
        ]),
      ).values(),
    ),
    sources: [
      {
        name: 'AnimeThemes',
        status: !anime ? 'not-applicable' : themes.status === 'rejected' ? 'unavailable' : 'ok',
        ...(themes.status === 'rejected'
          ? { message: 'Opening and ending media is unavailable right now.' }
          : {}),
      },
      {
        name: 'Jikan',
        status: !malId
          ? 'not-applicable'
          : jikan.status === 'rejected'
            ? 'unavailable'
            : jikanData?.partial
              ? 'partial'
              : 'ok',
        ...(jikan.status === 'rejected'
          ? { message: 'Extra videos and artwork are unavailable right now.' }
          : {}),
      },
    ],
  };
}

export async function discoverCatalog(format: string, status: string, sort: string) {
  try {
    return await discoverAniList(format, status, sort);
  } catch (error) {
    if (format === 'Donghua') throw error;
    try {
      const items = await discoverJikan(format, status, sort);
      if (!items.length) throw error;
      return {
        items,
        source: 'Jikan',
        fetchedAt: new Date().toISOString(),
        notice: 'AniList is temporarily unavailable. Showing Jikan discoveries.',
      };
    } catch {
      throw error;
    }
  }
}
