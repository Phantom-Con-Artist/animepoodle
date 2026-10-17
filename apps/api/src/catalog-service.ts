import { type Title, type MediaExtras } from '@animepoodle/shared';
import { searchAniList } from './anilist.js';
import { searchJikan, getJikanExtras } from './jikan.js';
import { getAnimeThemes } from './animethemes.js';
export function mergeCatalog(primary: Title[], secondary: Title[]): Title[] {
  const merged = new Map<string, Title>();
  for (const item of [...primary, ...secondary]) {
    const category = ['Anime', 'Donghua'].includes(item.format) ? 'anime' : 'manga';
    const key = `${category}:${item.malId || item.id}`;
    if (!merged.has(key)) merged.set(key, item);
  }
  return [...merged.values()];
}
export async function searchCatalog(q: string, format: string, broaden = false) {
  let primary: Title[] = [];
  let primaryError: unknown;
  try {
    primary = await searchAniList(q, format);
  } catch (error) {
    primaryError = error;
  }
  if (!broaden && !primaryError && primary.length) return { items: primary, source: 'AniList' };
  if (format === 'Donghua') {
    if (primaryError) throw primaryError;
    return {
      items: primary,
      source: 'AniList',
      ...(broaden
        ? {
            notice:
              'Donghua stays on AniList because Jikan cannot reliably filter by country of origin.',
          }
        : {}),
    };
  }
  try {
    const secondary = await searchJikan(q, format);
    const items = mergeCatalog(primary, secondary);
    if (primaryError && !secondary.length) throw primaryError;
    return {
      items,
      source: primary.length ? (secondary.length ? 'AniList + Jikan' : 'AniList') : 'Jikan',
      ...(primaryError
        ? { notice: 'AniList is temporarily unavailable. Showing Jikan results.' }
        : {}),
    };
  } catch (error) {
    if (primaryError) throw primaryError;
    return {
      items: primary,
      source: 'AniList',
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
