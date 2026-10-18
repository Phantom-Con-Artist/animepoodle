import { test } from 'node:test';
import assert from 'node:assert/strict';
import { app } from './app';

// AniList answers 403 to Cloudflare's shared addresses. The server must say so at once (502)
// instead of trying slower fallbacks, so the page can retry from the visitor's browser.
test('a blocked AniList answers 502 immediately, without waiting on other providers', async () => {
  const original = globalThis.fetch;
  const hosts: string[] = [];
  globalThis.fetch = async (url) => {
    const host = new URL(String(url)).host;
    hosts.push(host);
    if (host === 'graphql.anilist.co')
      return Response.json(
        { errors: [{ message: 'You have been manually blocked.' }] },
        { status: 403 },
      );
    // Anything else would hang like an unreachable provider.
    return new Promise<Response>(() => {});
  };
  try {
    for (const path of [
      '/api/search?q=Violet+Evergarden&format=Anime',
      '/api/discover?format=Anime',
      '/api/browse?format=Anime',
    ]) {
      const started = Date.now();
      const res = await app.request(path);
      assert.equal(res.status, 502, path);
      assert.match((await res.json()).error, /blocking this server/);
      assert.ok(Date.now() - started < 2000, `${path} should not wait on other providers`);
    }
    assert.deepEqual([...new Set(hosts)], ['graphql.anilist.co']);
  } finally {
    globalThis.fetch = original;
  }
});
