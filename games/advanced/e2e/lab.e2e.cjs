// Headless check of lab.html. Usage: node e2e/lab.e2e.cjs [baseUrl] [outDir]
// Needs Playwright + a static server serving games/advanced/ (python3 -m http.server 8765).
const { chromium } = require('playwright');
const path = require('path');
const base = process.argv[2] || 'http://localhost:8765/lab.html';
const out = process.argv[3] || '.';
const assert = require('assert');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url()));

  await page.goto(base);
  await page.waitForFunction(() => window.__lab && window.__lab.state.updates > 30, null, { timeout: 15000 });
  const s0 = await page.evaluate(() => window.__lab.state);
  assert.equal(s0.phase, 'ask'); assert.equal(s0.hearts, 3);
  assert.ok(s0.timeScale < 0.5, 'think-slow should slow the world, got ' + s0.timeScale);
  await page.screenshot({ path: path.join(out, 'lab_1_ask.png') });

  // measure fps for 3 s
  await page.waitForTimeout(3000);
  const s1 = await page.evaluate(() => window.__lab.state);
  console.log('fps', s1.fps.toFixed(1), 'quality', s1.quality, 'fallback30', s1.fallback30);

  // correct answer
  await page.evaluate(() => { const L = window.__lab; L.choose(L.state.correct); });
  await page.waitForTimeout(250);
  const s2 = await page.evaluate(() => window.__lab.state);
  assert.equal(s2.phase, 'result'); assert.equal(s2.hearts, 3); assert.ok(s2.score > 0);
  await page.screenshot({ path: path.join(out, 'lab_2_correct.png') });
  await page.waitForTimeout(1300);

  // wrong answer -> crash, slow-mo, heart lost
  await page.evaluate(() => { const L = window.__lab; L.choose((L.state.correct + 1) % 4); });
  await page.waitForTimeout(200);
  const s3 = await page.evaluate(() => window.__lab.state);
  assert.equal(s3.hearts, 2);
  assert.ok(s3.timeScale < 0.6, 'slow-mo expected after crash, got ' + s3.timeScale);
  await page.screenshot({ path: path.join(out, 'lab_3_crash.png') });

  // power-up: 50:50 hides two options
  await page.waitForFunction(() => window.__lab.state.phase === 'ask', null, { timeout: 8000 });
  await page.keyboard.press('f');
  await page.waitForTimeout(100);
  const hidden = await page.$$eval('.opt.hide', (n) => n.length);
  assert.equal(hidden, 2, '50:50 should hide two options');
  await page.keyboard.press('t');
  await page.waitForTimeout(100);
  const s4 = await page.evaluate(() => window.__lab.state);
  assert.equal(s4.timeScale, 0, 'freeze stops the world');
  await page.screenshot({ path: path.join(out, 'lab_4_powerups.png') });

  // lose remaining hearts -> game over with explanations
  for (let i = 0; i < 6; i++) {
    const st = await page.evaluate(() => window.__lab.state);
    if (st.phase === 'over') break;
    await page.waitForFunction(() => ['ask', 'over'].includes(window.__lab.state.phase), null, { timeout: 8000 });
    await page.evaluate(() => { const L = window.__lab; if (L.state.phase === 'ask') L.choose((L.state.correct + 1) % 4); });
    await page.waitForTimeout(1500);
  }
  await page.waitForFunction(() => window.__lab.state.phase === 'over', null, { timeout: 8000 });
  const wrongCards = await page.$$eval('#over-list .wr', (n) => n.length);
  assert.ok(wrongCards >= 3, 'game over should list wrong answers, got ' + wrongCards);
  const exp = await page.$eval('#over-list .wr .ex', (n) => n.textContent.length);
  assert.ok(exp > 5, 'explanation present');
  await page.screenshot({ path: path.join(out, 'lab_5_gameover.png') });

  // retry works, quality buttons work, desktop size works
  await page.click('#retry');
  await page.waitForFunction(() => window.__lab.state.phase === 'ask' && window.__lab.state.hearts === 3);
  await page.click('#lab-btn');
  await page.click('#r-q button[data-v="0"]');
  await page.waitForTimeout(300);
  assert.equal((await page.evaluate(() => window.__lab.state)).quality, 'low');
  await page.click('#r-q button[data-v="2"]');
  assert.equal((await page.evaluate(() => window.__lab.state)).quality, 'high');
  await page.click('#b-gate');
  await page.screenshot({ path: path.join(out, 'lab_6_panel.png') });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(out, 'lab_7_desktop.png') });

  // keyboard answer: 1-4 selects
  const before = await page.evaluate(() => window.__lab.state);
  await page.keyboard.press('1');
  await page.waitForTimeout(100);
  assert.equal((await page.evaluate(() => window.__lab.state)).phase, 'result');

  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
  if (errors.length) process.exit(1);
  console.log('E2E OK');
})().catch((e) => { console.error('E2E FAIL', e); process.exit(1); });
