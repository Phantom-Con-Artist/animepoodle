import { chromium } from '@playwright/test';
const b = await chromium.launch({ channel: 'chromium' });
const d = await (await b.newContext({ viewport: { width: 1600, height: 950 } })).newPage();
await d.goto('http://localhost:3000/browse', { waitUntil: 'load' });
await d.waitForTimeout(6000);
const cols = await d.evaluate(() => getComputedStyle(document.querySelector('.title-grid')).gridTemplateColumns.split(' ').length);
for (const idx of [1, cols - 1, cols + 2]) {
  await d.mouse.move(5, 5);
  await d.waitForTimeout(900);
  const g = d.locator('.title-grid .title-card').nth(idx);
  await g.scrollIntoViewIfNeeded();
  const box = await g.locator('.poster-wrap').boundingBox();
  await d.mouse.move(box.x + box.width / 2, box.y + box.height * 0.85);
  const states = [];
  for (let t = 0; t < 12; t++) {
    await d.waitForTimeout(250);
    states.push((await g.getAttribute('class')).includes('is-previewing') ? 'P' : '.');
  }
  const after = await g.locator('.poster-wrap').boundingBox();
  const fr = await g.locator('iframe').boundingBox().catch(() => null);
  console.log('card', idx, states.join(''), 'box', Math.round(after.width) + 'x' + Math.round(after.height), 'at', Math.round(after.x), '(was', Math.round(box.x) + ')', 'video', fr ? Math.round(fr.width) + 'x' + Math.round(fr.height) : 'none');
  if (idx === cols - 1) await d.screenshot({ path: process.argv[2] + '/browse-fixed.png' });
}
await b.close();
