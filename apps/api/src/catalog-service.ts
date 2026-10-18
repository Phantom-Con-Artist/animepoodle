import { type Title, type MediaExtras } from '@animepoodle/shared';
import { searchAniListTerms, discoverAniList, CatalogError } from './anilist';
import { getAnimeThemes } from './animethemes';
import { searchMangaDex } from './mangadex';
const names = (t: Title) =>
  [t.title, t.original, t.titles?.english, t.titles?.romaji, t.titles?.native]
    .filter((n): n is string => !!n)
    .map((n) => n.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''))
    .filter((n) => n.length > 2);
export async function searchCatalog(q: string, format: string, status = 'ALL') {
  // Series only MangaDex lists are searched alongside AniList and come after its results.
  const mangadex = searchMangaDex(q, format).catch(() => [] as Title[]);
  let result: Awaited<ReturnType<typeof searchAniListCatalog>>;
  try {
    result = await searchAniListCatalog(q, format, status);
  } catch (error) {
    // A blocked server answers at once, so the visitor's browser can take over.
    if (error instanceof CatalogError && error.status === 502) throw error;
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
async function searchAniListCatalog(q: string, format: string, status: string) {
  const { items, matched } = await searchAniListTerms(q, format, status);
  return { items, source: 'AniList', matched };
}
export async function getSupplementalMedia(
  anilistId: number | undefined,
  malId: number | undefined,
  format: string,
): Promise<MediaExtras> {
  const anime = ['Anime', 'Donghua'].includes(format);
  const themes = await Promise.allSettled([
    anime ? getAnimeThemes(anilistId, malId) : Promise.resolve(null),
  ]).then(([r]) => r);
  const themeData = themes.status === 'fulfilled' ? themes.value : null;
  return {
    themes: themeData?.themes || [],
    artwork: themeData?.artwork || [],
    sources: [
      {
        name: 'AnimeThemes',
        status: !anime ? 'not-applicable' : themes.status === 'rejected' ? 'unavailable' : 'ok',
        ...(themes.status === 'rejected'
          ? { message: 'Opening and ending media is unavailable right now.' }
          : {}),
      },
    ],
  };
}

export async function discoverCatalog(format: string, status: string, sort: string) {
  return discoverAniList(format, status, sort);
}
