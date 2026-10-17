import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editDistance, parseSearchTerms } from './search-terms.js';

const vocab = {
  genres: ['Comedy', 'Psychological', 'Romance', 'Slice of Life', 'Sports', 'Sci-Fi'],
  tags: ['Isekai', 'Shounen', 'Psychosexual', 'Time Manipulation', "Boys' Love", 'Cats'],
};

test('loose words become genres and tags, typos and shorthand included', () => {
  assert.deepEqual(parseSearchTerms('isekai romcom', vocab), {
    genres: ['Romance', 'Comedy'],
    tags: ['Isekai'],
    rest: '',
  });
  assert.deepEqual(parseSearchTerms('Shonen sport anime', vocab), {
    genres: ['Sports'],
    tags: ['Shounen'],
    rest: '',
  });
  assert.deepEqual(parseSearchTerms('slice-of-life with cats', vocab).genres, ['Slice of Life']);
  assert.deepEqual(parseSearchTerms('psycho', vocab).genres, ['Psychological']);
  assert.deepEqual(parseSearchTerms('time travel', vocab).tags, ['Time Manipulation']);
  assert.deepEqual(parseSearchTerms('scifi', vocab).genres, ['Sci-Fi']);
  assert.deepEqual(parseSearchTerms('boys love', vocab).tags, ["Boys' Love"]);
});

test('title words stay title words', () => {
  assert.deepEqual(parseSearchTerms('frieren', vocab), { genres: [], tags: [], rest: 'frieren' });
  assert.deepEqual(parseSearchTerms('romance dawn', vocab), {
    genres: ['Romance'],
    tags: [],
    rest: 'dawn',
  });
  // Short words need an exact match, so "spot" is not "Sports".
  assert.equal(parseSearchTerms('spot', vocab).genres.length, 0);
  assert.deepEqual(parseSearchTerms('one piece', null), {
    genres: [],
    tags: [],
    rest: 'one piece',
  });
});

test('edit distance counts swaps once and stops early', () => {
  assert.equal(editDistance('isekia', 'isekai', 1), 1);
  assert.equal(editDistance('shonen', 'shounen', 1), 1);
  assert.equal(editDistance('abcdef', 'uvwxyz', 1), 2);
});
