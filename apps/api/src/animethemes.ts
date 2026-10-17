import { type Artwork, type ThemeSong } from '@animepoodle/shared';
import { CatalogError } from './anilist.js';
import { createProviderClient } from './provider-client.js';
import { httpsUrl } from './urls.js';
const request = createProviderClient('AnimeThemes', 'https://api.animethemes.moe', 3600000);
interface ThemeAnime {
  slug: string;
  images?: { link: string; facet: string }[];
  animethemes?: {
    id: number;
    slug: string;
    type: string;
    sequence: number;
    song?: { title: string; artists?: { name: string }[] };
    animethemeentries?: {
      id: number;
      spoiler: boolean;
      nsfw: boolean;
      episodes: string | null;
      videos?: { link: string; resolution: number; size: number; audio?: { link: string } }[];
    }[];
  }[];
}
function mediaUrl(value: unknown) {
  const url = httpsUrl(value);
  return url && new URL(url).hostname.endsWith('.animethemes.moe') ? url : null;
}
export async function getAnimeThemes(anilistId: number | undefined, malId: number | undefined) {
  if (!anilistId && !malId) return { themes: [] as ThemeSong[], artwork: [] as Artwork[] };
  const params = new URLSearchParams({
    'filter[has]': 'resources',
    'filter[site]': anilistId ? 'AniList' : 'MyAnimeList',
    'filter[external_id]': String(anilistId || malId),
    include: 'animethemes.song.artists,animethemes.animethemeentries.videos.audio,images',
    'page[size]': '1',
  });
  const data = await request<{ anime: ThemeAnime[] }>(`/anime?${params}`);
  if (!Array.isArray(data.anime))
    throw new CatalogError('AnimeThemes returned an unreadable response.');
  const anime = data.anime[0];
  const themes: ThemeSong[] = [];
  const artwork: Artwork[] = [];
  if (!anime) return { themes, artwork };
  const url = `https://animethemes.moe/anime/${encodeURIComponent(anime.slug)}`;
  for (const theme of anime.animethemes || [])
    for (const entry of theme.animethemeentries || []) {
      if (entry.nsfw || entry.spoiler) continue;
      const versions = (entry.videos || [])
        .filter((v) => mediaUrl(v.link))
        .sort((a, b) => a.size - b.size);
      const video = versions[0];
      if (!video) continue;
      themes.push({
        id: `at-${theme.id}-${entry.id}`,
        label: theme.slug || `${theme.type}${theme.sequence || 1}`,
        title: theme.song?.title || 'Theme song',
        artists: (theme.song?.artists || []).map((a) => a.name),
        videoUrl: mediaUrl(video.link),
        audioUrl: mediaUrl(video.audio?.link),
        episodes: entry.episodes,
        source: 'AnimeThemes',
        url,
      });
    }
  for (const image of anime.images || []) {
    const safe = httpsUrl(image.link);
    if (safe)
      artwork.push({
        url: safe,
        thumbnail: safe,
        label: image.facet || 'Cover artwork',
        source: 'AnimeThemes',
      });
  }
  return { themes: themes.slice(0, 24), artwork: artwork.slice(0, 4) };
}
