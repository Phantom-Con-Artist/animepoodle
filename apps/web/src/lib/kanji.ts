// Kanji marks for the wabi-sabi look: seals beside headings, numerals on ranks.
// They're decoration only; every one sits next to the English it echoes.

/** The seal stamped beside each home rail heading, keyed by rail id. */
export const railKanji: Record<string, string> = {
  'new-chapters': '新章',
  'keep-reading': '続読',
  continue: '続き',
  week: '今週',
  month: '今月',
  year: '今年',
  'mangadex-latest': '新着',
  season: '季節',
  awards: '受賞',
  upcoming: '未来',
  next: '積読',
  matches: '縁',
  mood: '気分',
};

/** Page headings get a large ghost character on the far side. */
export const pageKanji = {
  browse: '探',
  top: '頂',
  forYou: '縁',
  library: '蔵',
  studio: '工房',
} as const;

export const seasonKanji: Record<string, string> = {
  WINTER: '冬',
  SPRING: '春',
  SUMMER: '夏',
  FALL: '秋',
};

export const sectionKanji: Record<string, string> = {
  Anime: 'アニメ',
  Donghua: '动画',
  Manga: '漫画',
  Manhwa: '만화',
  Manhua: '漫画',
};

export const moodKanji: Record<string, string> = {
  'Take me somewhere': '旅',
  'In my feelings': '涙',
  'Just one more episode': '熱',
  'Comfort zone': '和',
};

const digits = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

/** 1–999 as kanji numerals: 3 → 三, 12 → 十二, 40 → 四十, 105 → 百五. */
export function kanjiNumber(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 999) return String(n);
  const h = Math.floor(n / 100);
  const t = Math.floor((n % 100) / 10);
  const o = n % 10;
  return (
    (h ? (h > 1 ? digits[h] : '') + '百' : '') +
    (t ? (t > 1 ? digits[t] : '') + '十' : '') +
    digits[o]
  );
}
