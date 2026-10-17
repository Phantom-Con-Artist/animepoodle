/**
 * English names for works AniList lists without one. Many manhwa and manhua only have a
 * romanized title, while English names (official or fan) sit among the synonyms next to
 * other romanizations, Spanish, French and Japanese names. Every candidate is scored for
 * how English it reads; the best one wins only when it clearly reads as English.
 */

// Common English words. "no", "to", "de" and "na" are left out: they are also particles.
const english = new Set(
  "a an the of in on at is am are was were be been i i'm im my me mine you your you're he his him she her it its we our us they their them who whom whose what when where why how this that these those with without for from into onto over under after before again and or but not still got get gets getting have has had do does did can can't cannot will won't just only as by all every become became becoming reincarnated reborn returned return transmigrated another world love lady lord king queen prince princess knight hero villain villainess demon god gods master young life story days day night time year years home house school sister brother daughter son wife husband family secret first last one two three level dungeon tower player hunter regressor regression return returner academy crown duke duchess emperor empress magic sword".split(
    ' ',
  ),
);
// Function words of the other Latin-script languages that show up among synonyms.
const foreign = new Set(
  'el la los las una uno con por para del que y es le les des du et une au aux est dans pour sur und ein eine mit von il lo gli della di per che o os um uma com não em'.split(
    ' ',
  ),
);
// Spelling habits of romanized Korean, Japanese and Mandarin that English rarely has.
const romanized = [
  /eo|eu|oe|ae(?!l)|ui$|jj|kk|tt(?!le|er)|pp(?!y|er|le)/, // Korean
  /^(?:eul|reul|neun|eun|ui|ege|eseo|haneun|hae|ga|i)$/,
  /tsu|shi|ryo|kyo|ou$|uu|^(?:no|ga|wa|wo|ni|ka|mo|ne|yo|desu|masu|sama|kun|chan|san|nai)$/, // Japanese
  /zh|^x[iu]|^q[iu]|iang|iong|uo$|ao$|^(?:de|zhi|le|ta|zhe|men|ge|wo|ni|shi|jiu)$/, // Mandarin
];
// A word made only of Mandarin syllables ("shuangjing", "tian"). Many short English words
// parse too, so this is only used on the romanized title itself.
const pinyinWord =
  /^(?:(?:zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])?(?:iang|iong|uang|ang|eng|ing|ong|uan|ian|iao|uai|ai|ei|ao|ou|an|en|in|un|ia|ie|iu|ua|uo|ui|ue|er|a|o|e|i|u|v|ü))+$/;
const englishShape = /th|wh|ck|ght|tion|sion|ph|ing$|ness$|ment$|ful$|less$|[dfrsvwyz]$|'s$/;

const wordsOf = (text: string) => text.toLowerCase().match(/[\p{L}']+/gu) || [];
const squash = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

interface Reading {
  score: number;
  words: number;
  /** Words that look like romanized Japanese, Korean or Mandarin. */
  romanized: number;
  /** Signs of Spanish, French, Portuguese, German or Vietnamese. */
  foreign: number;
  /** Share of words also in the romanized title (names kept in a translation). */
  shared: number;
  englishWords: number;
}
export function readName(
  name: string,
  romajiWords: Set<string> = new Set(),
  pinyin = false,
): Reading | null {
  const words = wordsOf(name);
  if (!words.length || !/\p{Ll}/u.test(name)) return null; // acronyms like "GSGW"
  // Letters outside Latin script: Hangul, kana, hanzi, Cyrillic, Thai…
  if (/(?=\p{L})\P{Script=Latin}/u.test(name)) return null;
  const r: Reading = {
    score: 0,
    words: words.length,
    romanized: 0,
    foreign: 0,
    shared: 0,
    englishWords: 0,
  };
  let shared = 0;
  for (const w of words) {
    if (pinyin && pinyinWord.test(w)) {
      r.score -= 1.5;
      r.romanized++;
      continue;
    }
    if (english.has(w)) {
      r.score += 2;
      r.englishWords++;
    } else if (englishShape.test(w)) r.score += 1;
    if (foreign.has(w) || /[^\x00-\x7f]/.test(w)) {
      r.score -= 2.5;
      r.foreign++;
    }
    if (romanized.some((p) => p.test(w))) {
      r.score -= 1.5;
      r.romanized++;
    }
    if (romajiWords.has(w)) shared++;
  }
  r.shared = shared / words.length;
  // Mostly the same words as the romanization: a respelling, not a translation.
  if (r.shared > 0.5) r.score -= 2;
  // A name or two carried over is a good sign it is this work, not a spin-off.
  else if (shared > 0) r.score += 1;
  return r;
}
export const englishScore = (name: string, romajiWords?: Set<string>) =>
  readName(name, romajiWords)?.score ?? -Infinity;

// "II", "2", "Season 2", "Part 3", "2nd Season": sequels must keep their marker.
const sequel =
  /\s*(?:[:\-–]\s*)?((?:season|part|cour)\s*\d+|\d+(?:st|nd|rd|th)\s+season|\b[IVX]{2,4}\b|\b\d{1,2}\b)\s*$/i;

/**
 * The English name to show, or null to keep the romanized title. `country` is AniList's
 * countryOfOrigin: Korean and Chinese works get a second, looser pass.
 */
export function englishSynonym(
  synonyms: string[] | null | undefined,
  romaji: string,
  country?: string,
) {
  const romajiWords = new Set(wordsOf(romaji));
  // A romaji title with no romanization in it ("One Punch Man", "Medaka Box", "Player") is
  // already how readers know the work, so a synonym would only be a nickname or spin-off.
  const own = readName(romaji, undefined, country === 'CN' || country === 'TW');
  // Korean and Chinese romanization is harder to spot, so there it must also read as English.
  if (
    own &&
    own.romanized === 0 &&
    own.foreign === 0 &&
    (country === 'JP' || own.score / own.words >= 0.5)
  )
    return null;
  const candidates = (synonyms || [])
    .filter((raw): raw is string => typeof raw === 'string')
    .map((raw) => raw.trim().replace(/\s+/g, ' '))
    .filter((name) => name.length >= 2 && name.length <= 160 && squash(name) !== squash(romaji))
    .map((name) => ({ name, r: readName(name, romajiWords) }))
    .filter((c): c is { name: string; r: Reading } => !!c.r && c.r.foreign === 0);
  const pick = (list: typeof candidates) =>
    list.reduce<(typeof candidates)[number] | null>(
      (best, c) =>
        // Ties go to the more specific (longer) name, then to AniList's order.
        !best ||
        c.r.score > best.r.score ||
        (c.r.score === best.r.score && c.name.length > best.name.length)
          ? c
          : best,
      null,
    );
  // Clearly English: at least a point, and more than a third of a point per word.
  let best = pick(candidates.filter((c) => c.r.score >= 1 && c.r.score / c.r.words >= 0.35));
  // Korean and Chinese works: a clean Latin name that isn't a respelling is a translation
  // ("Eternal Reverence", "Renegade Immortal"). Japanese synonyms are too often nicknames.
  if (!best && (country === 'KR' || country === 'CN' || country === 'TW'))
    best = pick(
      candidates.filter(
        (c) => c.r.romanized === 0 && (c.r.shared < 0.5 || c.r.englishWords > 0) && c.r.score > -1,
      ),
    );
  if (!best) return null;
  if (
    marker(romaji) &&
    !new RegExp(`\\b${marker(romaji)!.replace(/\s+/g, '\\s*')}\\b`, 'i').test(best.name)
  )
    return `${best.name} ${marker(romaji)}`;
  return best.name;
}
const marker = (romaji: string) => romaji.match(sequel)?.[1];
