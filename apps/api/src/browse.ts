import {
  animeKinds,
  bookKinds,
  currentSeason,
  seasons,
  type AwardWinner,
  type AwardsResponse,
  type BrowseResponse,
  type Format,
  type HighlightsResponse,
  type StudioResponse,
  type Title,
} from '@animepoodle/shared';
import {
  CatalogError,
  mediaFields,
  normalizeMedia,
  requestAniList,
  type AniMedia,
} from './anilist';

/** Small TTL cache with request coalescing, shared by every endpoint in this module. */
function memo<T>(ttl: number, limit = 120) {
  const cache = new Map<string, { at: number; value: T }>();
  const pending = new Map<string, Promise<T>>();
  return async (key: string, work: () => Promise<T>): Promise<T> => {
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < ttl) return hit.value;
    const active = pending.get(key);
    if (active) return active;
    const run = work().then((value) => {
      if (cache.size >= limit) cache.delete(cache.keys().next().value!);
      cache.set(key, { at: Date.now(), value });
      return value;
    });
    pending.set(key, run);
    try {
      return await run;
    } finally {
      pending.delete(key);
    }
  };
}

export function scope(format: Format) {
  const type = ['Anime', 'Donghua'].includes(format) ? 'ANIME' : 'MANGA';
  const country =
    format === 'Manhwa' ? 'KR' : format === 'Manhua' || format === 'Donghua' ? 'CN' : 'JP';
  return { type, country };
}
const fuzzy = (d: Date) =>
  d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
const items = (media: AniMedia[] | undefined, format: Format) =>
  (media || []).map(normalizeMedia).filter((t: Title) => t.format === format);

export const browseSorts = [
  'TRENDING_DESC',
  'POPULARITY_DESC',
  'SCORE_DESC',
  'START_DATE_DESC',
  'START_DATE',
  'TITLE_ROMAJI',
  'FAVOURITES_DESC',
] as const;
export interface BrowseParams {
  format: Format;
  kinds: string[];
  genre?: string;
  year?: number;
  season?: string;
  status?: string;
  sort: (typeof browseSorts)[number];
  page: number;
  minPopularity?: number;
}
export function validKinds(format: Format, kinds: string[]) {
  const allowed: readonly string[] = ['Anime', 'Donghua'].includes(format) ? animeKinds : bookKinds;
  return kinds.every((k) => allowed.includes(k));
}
export const validSeason = (season: string) => (seasons as readonly string[]).includes(season);

const browseQuery = `query Browse($type:MediaType,$country:CountryCode,$formats:[MediaFormat],$genre:String,$season:MediaSeason,$seasonYear:Int,$from:FuzzyDateInt,$to:FuzzyDateInt,$status:MediaStatus,$sort:[MediaSort],$page:Int,$pop:Int){
  Page(page:$page,perPage:30){
    pageInfo{currentPage hasNextPage total}
    media(type:$type,countryOfOrigin:$country,format_in:$formats,genre:$genre,season:$season,seasonYear:$seasonYear,startDate_greater:$from,startDate_lesser:$to,status:$status,sort:$sort,popularity_greater:$pop,isAdult:false){${mediaFields}}
  }
}`;
const browseMemo = memo<BrowseResponse>(120000);
export function browseAniList(p: BrowseParams): Promise<BrowseResponse> {
  const key = JSON.stringify(p);
  return browseMemo(key, async () => {
    const { type, country } = scope(p.format);
    const seasonal = p.season && p.year && type === 'ANIME';
    const data = await requestAniList(browseQuery, {
      type,
      country,
      formats: p.kinds.length ? p.kinds : undefined,
      genre: p.genre,
      season: seasonal ? p.season : undefined,
      seasonYear: seasonal ? p.year : undefined,
      from: !seasonal && p.year ? p.year * 10000 : undefined,
      to: !seasonal && p.year ? (p.year + 1) * 10000 : undefined,
      status: p.status,
      sort: [p.sort, 'POPULARITY_DESC'],
      page: p.page,
      pop: p.minPopularity,
    });
    const page = data.data?.Page;
    if (data.errors || !Array.isArray(page?.media))
      throw new CatalogError('Browsing is unavailable right now. Please try again shortly.');
    return {
      items: items(page.media, p.format),
      pageInfo: {
        currentPage: page.pageInfo?.currentPage || p.page,
        hasNextPage: !!page.pageInfo?.hasNextPage,
        total: page.pageInfo?.total,
      },
      source: 'AniList',
      fetchedAt: new Date().toISOString(),
    };
  });
}

// One request per section keeps the home page inside AniList's rate limit.
const highlightsQuery = `query Highlights($type:MediaType,$country:CountryCode,$monthFrom:FuzzyDateInt,$yearFrom:FuzzyDateInt,$season:MediaSeason,$seasonYear:Int,$pop:Int,$anime:Boolean!){
  week:Page(perPage:12){media(type:$type,countryOfOrigin:$country,sort:[TRENDING_DESC,POPULARITY_DESC],isAdult:false){${mediaFields}}}
  month:Page(perPage:12){media(type:$type,countryOfOrigin:$country,startDate_greater:$monthFrom,sort:[POPULARITY_DESC],isAdult:false){${mediaFields}}}
  year:Page(perPage:12){media(type:$type,countryOfOrigin:$country,startDate_greater:$yearFrom,popularity_greater:$pop,sort:[SCORE_DESC],isAdult:false){${mediaFields}}}
  seasonal:Page(perPage:12) @include(if:$anime){media(type:$type,countryOfOrigin:$country,season:$season,seasonYear:$seasonYear,sort:[POPULARITY_DESC],isAdult:false){${mediaFields}}}
  upcoming:Page(perPage:12){media(type:$type,countryOfOrigin:$country,status:NOT_YET_RELEASED,sort:[POPULARITY_DESC],isAdult:false){${mediaFields}}}
}`;
const highlightsMemo = memo<HighlightsResponse>(600000, 20);
export function getHighlights(format: Format, now = new Date()): Promise<HighlightsResponse> {
  return highlightsMemo(`${format}:${now.toISOString().slice(0, 10)}`, async () => {
    const { type, country } = scope(format);
    const anime = type === 'ANIME';
    const monthAgo = new Date(now.getTime() - 31 * 86400000);
    const season = currentSeason(now);
    const data = await requestAniList(highlightsQuery, {
      type,
      country,
      monthFrom: fuzzy(monthAgo),
      yearFrom: now.getUTCFullYear() * 10000,
      season: season.season,
      seasonYear: season.year,
      pop: anime ? (format === 'Donghua' ? 300 : 2000) : 300,
      anime,
    });
    const d = data.data;
    if (data.errors || !d?.week)
      throw new CatalogError('Highlights are unavailable right now. Please try again shortly.');
    return {
      format,
      season: anime ? season : null,
      week: items(d.week.media, format),
      month: items(d.month?.media, format),
      year: items(d.year?.media, format),
      seasonal: items(d.seasonal?.media, format),
      upcoming: items(d.upcoming?.media, format),
      fetchedAt: new Date().toISOString(),
    };
  });
}

export interface ParsedWinner {
  year: number;
  /** First calendar year the ceremony covered. */
  from: number;
  ceremony: string;
  title: string;
  hint: string;
  studio: string | null;
}
const plain = (wiki: string) =>
  wiki
    .replace(/\[\[(?:[^|\]]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/'{2,}/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
/**
 * Reads the winners table on Wikipedia's "Crunchyroll Anime Award for Anime of the Year"
 * article. Winner rows are highlighted (background #FAEB86); the year header above them
 * names the anime year and the ceremony.
 */
export function parseAnimeOfTheYear(wikitext: string): ParsedWinner[] {
  const lines = wikitext.split('\n');
  const winners: ParsedWinner[] = [];
  let years: number[] = [];
  let ceremony = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('!') && /\[\[\d{4} in anime/.test(line)) {
      // Some ceremonies cover two calendar years ("2023/2024").
      years = [...line.matchAll(/\[\[(\d{4}) in anime/g)].map((m) => Number(m[1]));
      const ord = line.match(/\[\[(\d+(?:st|nd|rd|th)) Crunchyroll Anime Awards/);
      ceremony = ord ? `${ord[1]} Crunchyroll Anime Awards` : 'Crunchyroll Anime Awards';
      continue;
    }
    if (!years.length || !/background:\s*#FAEB86/i.test(line)) continue;
    const anime = lines[i + 1] || '';
    const next = lines[i + 2] || '';
    if (!anime.startsWith('|')) continue;
    // Winners are bold italic, but the bold sometimes wraps a season note too:
    // '''''Title'' (season 2)'''. Drop the bold markers and read the italic title.
    const text = anime.slice(1).replace(/'''''/g, "''").replace(/'''/g, '');
    const italic = text.match(/''(.+?)''/);
    if (!italic) continue;
    const hint = plain(text.slice(text.indexOf(italic[0]) + italic[0].length)).replace(/[()]/g, '');
    const studio =
      next.startsWith('|') && !next.startsWith('|-')
        ? plain(next.replace(/^\|\s*(rowspan="\d+"\s*\|)?/, '')) || null
        : null;
    winners.push({
      year: years[years.length - 1],
      from: years[0],
      ceremony,
      title: plain(italic[1]),
      hint,
      studio,
    });
  }
  return winners;
}

const wikiUrl =
  'https://en.wikipedia.org/w/api.php?action=parse&page=Crunchyroll_Anime_Award_for_Anime_of_the_Year&prop=wikitext&format=json&formatversion=2&origin=*';
const awardsMemo = memo<AwardsResponse>(43200000, 2);
/** Live winners: Wikipedia for who won, AniList for the matching entry. No hand-kept list. */
export function getAwards(): Promise<AwardsResponse> {
  return awardsMemo('aoty', async () => {
    let wikitext: string;
    try {
      const res = await fetch(wikiUrl, {
        // Browsers set their own User-Agent; a custom one would force a CORS preflight.
        headers:
          typeof window === 'undefined'
            ? {
                Accept: 'application/json',
                'User-Agent': 'animepoodle/1.0 (https://github.com/Phantom-Con-Artist/animepoodle)',
              }
            : { Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      wikitext = (await res.json()).parse.wikitext;
    } catch {
      throw new CatalogError('Award winners are unavailable right now. Please try again shortly.');
    }
    const parsed = parseAnimeOfTheYear(wikitext)
      .sort((a, b) => b.year - a.year)
      .slice(0, 12);
    if (!parsed.length)
      throw new CatalogError('Award winners are unavailable right now. Please try again shortly.');
    // Match each winner to the AniList entry that started in its eligibility window. Season
    // notes ("season 2") sharpen the search; misses get one retry with a simpler title.
    const searchFor = (w: ParsedWinner) => {
      const season = w.hint.match(/season (\d+)/i);
      return season && Number(season[1]) > 1 && !/season|part/i.test(w.title)
        ? `${w.title} Season ${season[1]}`
        : w.title;
    };
    const simplify = (title: string) =>
      title
        .replace(/\bpart \d+\b/i, '')
        .replace(/:\s*the\b/i, ':')
        .replace(/\s+/g, ' ')
        .trim();
    const lookup = async (terms: string[], subset: ParsedWinner[]) => {
      const query = `query Awards{${subset
        .map(
          (w, i) =>
            `a${i}:Page(perPage:1){media(search:${JSON.stringify(terms[i])},type:ANIME,format_not:MUSIC,startDate_greater:${(w.from - 1) * 10000},startDate_lesser:${w.year * 10000 + 1232},sort:[SEARCH_MATCH],isAdult:false){${mediaFields}}}`,
        )
        .join(' ')}}`;
      const data = await requestAniList(query, {});
      if (!data.data)
        throw new CatalogError(
          'Award winners are unavailable right now. Please try again shortly.',
        );
      return subset.map((_, i) => (data.data[`a${i}`]?.media?.[0] as AniMedia | undefined) || null);
    };
    const found = await lookup(parsed.map(searchFor), parsed);
    const missing = parsed.filter((_, i) => !found[i]);
    if (missing.length) {
      const retry = await lookup(
        missing.map((w) => simplify(searchFor(w))),
        missing,
      );
      missing.forEach((w, i) => (found[parsed.indexOf(w)] = retry[i]));
    }
    const winners: AwardWinner[] = [];
    parsed.forEach((w, i) => {
      const media = found[i];
      if (media)
        winners.push({
          award: 'Anime of the Year',
          ceremony: w.ceremony,
          year: w.year,
          studio: w.studio,
          item: normalizeMedia(media),
        });
    });
    return { winners, source: 'Wikipedia and AniList', fetchedAt: new Date().toISOString() };
  });
}

const genresMemo = memo<string[]>(86400000, 1);
export function getGenres(): Promise<string[]> {
  return genresMemo('genres', async () => {
    const data = await requestAniList('query{GenreCollection}', {});
    const list = data.data?.GenreCollection;
    if (!Array.isArray(list)) throw new CatalogError('Genres are unavailable right now.');
    // Adult content is filtered out everywhere else, so those genres aren't offered.
    return list.filter((g: unknown) => typeof g === 'string' && !['Ecchi', 'Hentai'].includes(g));
  });
}

const studioQuery = `query StudioWorks($id:Int!,$page:Int!,$sort:[MediaSort]){
  Studio(id:$id){
    id name isAnimationStudio favourites siteUrl
    media(page:$page,perPage:30,sort:$sort,isMain:true){pageInfo{currentPage hasNextPage total} nodes{${mediaFields} isAdult}}
  }
}`;
const studioMemo = memo<StudioResponse>(600000, 60);
export function getStudio(id: number, page: number, sort: string): Promise<StudioResponse> {
  return studioMemo(`${id}:${page}:${sort}`, async () => {
    const data = await requestAniList(studioQuery, { id, page, sort: [sort] });
    const studio = data.data?.Studio;
    if (!studio && (!data.errors || data.errors.some((e: { status?: number }) => e.status === 404)))
      throw new CatalogError('We couldn’t find that studio on AniList.', 404);
    if (!studio) throw new CatalogError('Studio details are unavailable right now.');
    return {
      id: studio.id,
      name: studio.name,
      isAnimationStudio: !!studio.isAnimationStudio,
      favourites: studio.favourites || 0,
      url: `https://anilist.co/studio/${studio.id}`,
      items: (studio.media?.nodes || [])
        .filter((m: AniMedia & { isAdult?: boolean }) => !m.isAdult)
        .map(normalizeMedia),
      pageInfo: {
        currentPage: studio.media?.pageInfo?.currentPage || page,
        hasNextPage: !!studio.media?.pageInfo?.hasNextPage,
        total: studio.media?.pageInfo?.total,
      },
    };
  });
}
