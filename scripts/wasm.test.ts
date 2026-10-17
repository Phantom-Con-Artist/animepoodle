import { catalog } from '../tests/fixtures/catalog';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { defaultTaste, scoreTitle, type Taste } from '../packages/shared/src/index';
test('shipped WebAssembly scores match JavaScript fallback for the full catalog', async () => {
  const { instance } = await WebAssembly.instantiate(
    await readFile('apps/web/public/wasm/recommender.wasm'),
  );
  const score = instance.exports.score as (...args: number[]) => number;
  for (const taste of [
    defaultTaste,
    [0, 0, 0, 0, 0, 0] as Taste,
    [1, 0.1, 0.4, 0.8, 0.2, 0.6] as Taste,
  ])
    for (const item of catalog)
      assert.ok(
        Math.abs(
          score(...item.features, ...taste, item.rating, 0) -
            scoreTitle(item.features, taste, item.rating, 0),
        ) < 1e-8,
      );
});
