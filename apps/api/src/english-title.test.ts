import { test } from 'node:test';
import assert from 'node:assert/strict';
import { englishSynonym } from './english-title';
import { normalizeMedia, type AniMedia } from './anilist';
import { withEnglishTitle } from '@animepoodle/shared';

// Real AniList entries without an English title.
test('translations win over respellings, other languages and acronyms', () => {
  assert.equal(
    englishSynonym(
      ['GSGW', 'Got Dropped into a Ghost Story, Still Gotta Work', 'GDCG'],
      'Goedame Tteoreojyeodo Chulgeuneul Haeya Haneunguna',
      'KR',
    ),
    'Got Dropped into a Ghost Story, Still Gotta Work',
  );
  assert.equal(
    englishSynonym(
      ['Starting With a Lie', 'Todo empezó con una mentira', '시작은 거짓말처럼'],
      'Cong Huang Yan Kai Shi',
      'CN',
    ),
    'Starting With a Lie',
  );
  assert.equal(
    englishSynonym(
      ['Ani ni Tsukeru Kusuri wa Nai!', 'Please Take My Brother Away'],
      'Kuai Ba Wo Ge Dai Zou',
      'CN',
    ),
    'Please Take My Brother Away',
  );
  assert.equal(
    englishSynonym(['La Princesse Vagabonde', 'March of the Long Song'], 'Chang Ge Xing', 'CN'),
    'March of the Long Song',
  );
  assert.equal(englishSynonym(['Na Honjaman Rebeleop'], 'Na Honjaman Level Up', 'KR'), null);
  assert.equal(
    englishSynonym(['If I Die, I will Be Invincible'], 'Zai Bu Si Wo Jiu Zhen Wu Di Le', 'CN'),
    'If I Die, I will Be Invincible',
  );
});

test('similar names: the specific one wins and sequels stay distinct', () => {
  assert.equal(
    englishSynonym(
      ['Divine Throne', 'Sealed Divine Throne', 'Shenyin Wangzuo'],
      'Shen Yin Wangzuo',
      'CN',
    ),
    'Sealed Divine Throne',
  );
  const first = englishSynonym(['The Legend and the Hero'], 'Feng Shen Ji', 'CN');
  const second = englishSynonym(['The Legend and the Hero'], 'Feng Shen Ji II', 'CN');
  const third = englishSynonym(['The Legend and the Hero III'], 'Feng Shen Ji III', 'CN');
  assert.equal(first, 'The Legend and the Hero');
  assert.equal(second, 'The Legend and the Hero II');
  assert.equal(third, 'The Legend and the Hero III');
  assert.equal(
    englishSynonym(['Tower of God'], 'Sin-ui Tap Season 2', 'KR'),
    'Tower of God Season 2',
  );
  // Names carried into a translation point at this work rather than a spin-off.
  assert.equal(
    englishSynonym(
      ['World Of Heavens', 'Battle Through the Heavens Prequel - The Legend of Yao Lao'],
      'Dou Po Cangqiong: Yao Lao Chuanqi',
      'CN',
    ),
    'Battle Through the Heavens Prequel - The Legend of Yao Lao',
  );
});

test('romaji that readers already use stays, Japanese nicknames are not titles', () => {
  assert.equal(englishSynonym(['Good Loser Kumagawa'], 'Medaka Box', 'JP'), null);
  assert.equal(
    englishSynonym(['One-Punch Man (Original)', 'Wanpanman'], 'One Punch Man', 'JP'),
    null,
  );
  assert.equal(
    englishSynonym(['Oregairu'], 'Yahari Ore no Seishun Love Comedy wa Machigatteiru', 'JP'),
    null,
  );
  assert.equal(englishSynonym(['Kimetsu no Yaiba Gaiden'], 'Kimetsu no Yaiba', 'JP'), null);
  assert.equal(
    englishSynonym(['The Shape of Voice'], 'Koe no Katachi', 'JP'),
    'The Shape of Voice',
  );
  assert.equal(englishSynonym(['Docteur Du Ming'], 'Doctor Du Ming', 'CN'), null);
  assert.equal(englishSynonym([], 'Player', 'KR'), null);
});

test('Korean and Chinese works accept clean Latin translations without common words', () => {
  assert.equal(
    englishSynonym(['Homeless', 'No Home', '無家可歸'], 'Jibi Eopseo', 'KR'),
    'Homeless',
  );
  assert.equal(englishSynonym(['19 Days', '19日'], '19 Tian', 'CN'), '19 Days');
  assert.equal(englishSynonym(['Renegade Immortal'], 'Xian Ni', 'CN'), 'Renegade Immortal');
  assert.equal(
    englishSynonym(['雙鏡', ' Couple of Mirrors'], 'Shuangjing', 'CN'),
    'Couple of Mirrors',
  );
});

test('guessed names are marked, and official sources replace only guesses', () => {
  const media = {
    id: 1,
    idMal: 2,
    title: { english: null, romaji: 'Dungeon-eul Geurineun Hwaga', native: null },
    synonyms: ['The Dungeon Painter'],
    type: 'MANGA',
    countryOfOrigin: 'KR',
    startDate: { year: 2024 },
    averageScore: 80,
    episodes: null,
    chapters: null,
    genres: [],
    description: '',
    coverImage: { large: 'https://s4.anilist.co/c.jpg', color: null },
  } as unknown as AniMedia;
  const guessed = normalizeMedia(media);
  assert.equal(guessed.title, 'The Dungeon Painter');
  assert.equal(guessed.titles?.englishFrom, 'synonym');
  const official = withEnglishTitle(guessed, 'The Painter of the Dungeon', 'MangaDex');
  assert.equal(official.title, 'The Painter of the Dungeon');
  assert.equal(official.titles?.englishFrom, 'MangaDex');
  assert.equal(withEnglishTitle(official, 'Something Else', 'MangaDex'), official);
  const real = normalizeMedia({
    ...media,
    title: { ...media.title, english: 'Real Title' },
  } as AniMedia);
  assert.equal(real.titles?.englishFrom, undefined);
  assert.equal(withEnglishTitle(real, 'Other', 'MangaDex'), real);
});
