// Headless check of racer/racer.html. Usage: node e2e/racer.e2e.cjs [baseUrl] [outDir]
const { chromium } = require('playwright');
const path = require('path');
const assert = require('assert');
const base = process.argv[2] || 'http://localhost:8765/racer/racer.html';
const out = process.argv[3] || '.';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url()));
  const st = () => page.evaluate(() => window.__racer.state);
  const waitPhase = (p, t = 10000) => page.waitForFunction((x) => window.__racer.state.phase === x, p, { timeout: t });
  const answer = async (right) => {
    await waitPhase('ask');
    await page.evaluate((r) => { const s = window.__racer.state; window.__racer.choose(r ? s.qcorrect : (s.qcorrect + 1) % 4); }, right);
  };
  const shot = (n) => page.screenshot({ path: path.join(out, n) });

  // ---- home + class picker ----
  await page.goto(base + '?class=8&dev=1');
  await page.waitForFunction(() => window.__racer && window.__racer.loop.updates > 20);
  assert.equal((await st()).cls, 8); assert.equal((await st()).track, 'middle');
  assert.equal(await page.$$eval('#cls-row button', (b) => b.length), 7);
  assert.match(await page.textContent('#ladder-name'), /Class 8 · Middle ladder \(60 levels, 12 ranks\)/);
  await page.click('#cls-row button:has-text("10")');
  assert.match(await page.textContent('#ladder-name'), /Class 10 · Senior ladder \(100 levels, 20 ranks\)/);
  await page.click('#cls-row button:has-text("7")');
  assert.equal((await st()).track, 'middle');
  await shot('racer_1_home.png');

  // ---- settings: extra time + graphics ----
  await page.click('#b-settings');
  await page.click('.toggle:has-text("Extra reading time") button');
  await page.click('#set-graphics button:has-text("Low")');
  assert.equal((await st()).quality, 'low');
  await page.click('#set-graphics button:has-text("Auto")');
  await page.click('.toggle:has-text("Colour-blind") button');
  await shot('racer_2_settings.png');
  await page.click('#set-back');

  // ---- garage ----
  await page.click('#b-garage');
  assert.ok((await page.$$eval('#g-paint button:disabled', (b) => b.length)) > 0, 'locked paints at rank 1');
  await shot('racer_3_garage.png');
  await page.click('#g-back');

  // ---- placement run (fresh profile) ----
  assert.ok(await page.isVisible('#b-placement'));
  await page.click('#b-placement');
  for (let i = 0; i < 15; i++) await answer(i % 4 !== 3);
  await waitPhase('over', 15000);
  assert.match(await page.textContent('#r-title'), /Placement complete/);
  assert.match(await page.textContent('#r-banners'), /Placed at Level/);
  await shot('racer_4_placement.png');
  await page.click('#r-home');
  assert.ok(!(await page.isVisible('#b-placement')), 'placement button hides afterwards');

  // reset to level 1 for a clean ranked test
  await page.click('#b-settings'); await page.click('#dev-reset'); await page.click('#set-back');
  await page.click('#cls-row button:has-text("8")');

  // ---- three-line menu on the home screen: opens, lists every dashboard tab, closes ----
  await page.click('#nav-btn'); await page.waitForTimeout(400);
  await page.waitForFunction(() => document.querySelector('.navdrawer').classList.contains('open'));
  assert.ok((await page.$$eval('.navitem', (a) => a.length)) >= 8, 'dashboard links present');
  assert.ok((await page.$$eval('.navitem', (a) => a.map((x) => x.getAttribute('href')))).every((h) => /^\.\.\/\.\.\//.test(h)));
  await shot('racer_3b_menu.png');
  await page.click('.navshade', { position: { x: 375, y: 400 } });
  await page.waitForFunction(() => !document.querySelector('.navdrawer').classList.contains('open'));
  // ---- day / night switch ----
  const e0 = (await st()).env; await page.click('#env-quick');
  assert.notEqual((await st()).env, e0);
  await page.click('#env-quick');

  // ---- ranked run: extra time active, correct answers, power-ups, pause ----
  await page.click('#b-ranked');
  await waitPhase('ask');
  await page.waitForFunction(() => window.__racer.state.timeScale < 0.5, null, { timeout: 3000 });   // think-slow engages within a frame
  const s1 = await st();
  assert.equal(s1.hearts, 3);
  await answer(true);
  await page.waitForTimeout(300);
  assert.ok((await st()).score > 0);
  await waitPhase('ask');
  await page.keyboard.press('p'); await page.waitForTimeout(100);
  assert.equal((await st()).phase, 'pause');
  await shot('racer_5_pause.png');
  await page.keyboard.press('p'); await page.waitForTimeout(100);
  assert.equal((await st()).phase, 'ask');
  await page.keyboard.press('f');
  assert.equal(await page.$$eval('.opt.hide', (n) => n.length), 2);
  await page.waitForTimeout(2500);
  { const g = await st(); assert.ok(g.gateK >= 0); assert.ok(g.carZ > 0.3 && g.carZ < 0.9); }
  await shot('racer_6_run.png');
  await page.keyboard.down('ArrowUp'); await page.waitForTimeout(600); await page.keyboard.up('ArrowUp');
  assert.ok((await st()).carZ > 0.5, 'car drives forward');
  { const e1 = (await st()).env; await page.click('#env-hud'); assert.notEqual((await st()).env, e1, 'HUD day/night button works mid-run'); await page.keyboard.press('n'); assert.equal((await st()).env, e1); await page.click('#env-hud'); } await page.waitForTimeout(300);
  await shot('racer_6b_night.png');
  await answer(true);
  for (let i = 0; i < 6; i++) await answer(true);                       // streak builds
  // three wrong answers -> game over, wrongs reviewed, coins
  for (let i = 0; i < 3; i++) await answer(false);
  await waitPhase('over', 8000);
  assert.match(await page.textContent('#r-title'), /GAME OVER/);
  assert.ok((await page.$$eval('#r-wrongs .wr', (n) => n.length)) >= 3);
  assert.match(await page.textContent('#r-stats'), /Coins earned/);
  await shot('racer_7_result.png');
  await page.click('#r-home');

  // ---- rank gate: fail then pass, rank-up screen ----
  await page.click('#b-settings'); await page.click('#dev-gate'); await page.click('#set-back');
  await page.click('#b-ranked');
  await answer(true);                                                    // fills the bar -> gate starts
  await page.waitForFunction(() => window.__racer.state.inGate, null, { timeout: 5000 });
  for (let i = 0; i < 3; i++) await answer(false);                       // 3rd wrong fails the gate
  await waitPhase('over', 8000);
  assert.match(await page.textContent('#r-title'), /RANK GATE FAILED/);
  await shot('racer_8_gatefail.png');
  await page.click('#r-home');
  assert.match(await page.textContent('#b-ranked'), /Retry Rank Gate/);
  await page.click('#b-ranked');                                         // retry goes straight into the gate
  await page.waitForFunction(() => window.__racer.state.inGate, null, { timeout: 5000 });
  for (let i = 0; i < 10; i++) await answer(true);
  await waitPhase('rankup', 8000);
  assert.ok(await page.isVisible('#s-rankup'));
  await shot('racer_9_rankup.png');
  await page.click('#ru-go');
  await waitPhase('ask', 5000);
  assert.equal((await st()).rank, 1);
  await page.keyboard.press('p'); await page.click('#p-quit');           // end the run from the pause menu
  await waitPhase('over', 5000);
  assert.match(await page.textContent('#r-banners'), /Rank up/);
  await page.click('#r-home');

  // ---- practice: never game over, progression untouched ----
  const before = await page.evaluate(() => JSON.stringify(window.__racer.store.prog));
  await page.click('#b-practice');
  for (let i = 0; i < 6; i++) await answer(false);
  assert.equal((await st()).over, false);
  await page.keyboard.press('p'); await page.click('#p-quit');
  await waitPhase('over', 5000);
  assert.equal(await page.evaluate(() => JSON.stringify(window.__racer.store.prog)), before);
  await page.click('#r-home');

  // ---- persistence across reload; other class keeps separate progress ----
  await page.reload();
  await page.waitForFunction(() => window.__racer && window.__racer.loop.updates > 5);
  assert.equal((await st()).cls, 8); assert.equal((await st()).rank, 1);
  await page.goto(base + '?class=11&local=1');
  await page.waitForFunction(() => window.__racer && window.__racer.loop.updates > 5);
  assert.equal((await st()).track, 'senior'); assert.equal((await st()).level, 1);

  // ---- desktop layout ----
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.waitForTimeout(300);
  await page.click('#b-ranked');
  await page.waitForTimeout(800);
  await shot('racer_10_desktop.png');

  console.log('errors:', errors.length ? errors : 'none');
  await browser.close();
  if (errors.length) process.exit(1);
  console.log('RACER E2E OK');
})().catch((e) => { console.error('RACER E2E FAIL', e); process.exit(1); });
