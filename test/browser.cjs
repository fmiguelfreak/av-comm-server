const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { createServer } = require('../server');
const path = require('node:path');
const os = require('node:os');

(async () => {
  const { server, io } = createServer();
  let browser;
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const errors = [];
  try {
    browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
    const contextA = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const contextB = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: "AVCOMM-Test-Mobile" });
    const a = await contextA.newPage(), b = await contextB.newPage();
    for (const page of [a, b]) page.on('pageerror', e => errors.push(e.message));
    await a.goto(base);
    await a.locator('#create-show-name').fill('BROWSER_SHOW');
    await a.locator('#btn-create-show').click();
    await a.waitForURL('**/config.html');
    await a.waitForFunction(() => document.getElementById('socket-status').textContent === 'CONNECTED');
    const session = await a.evaluate(() => JSON.parse(localStorage.av_session));
    assert.equal(session.name, 'BROWSER_SHOW');
    for (let i = 0; i < 4; i++) await a.locator('#increment-channels').click();
    await a.locator('[data-role="CUSTOM"]').click();
    await a.locator('#custom-role-input').fill('STAGE');
    await a.locator('#launch-cta').click();
    await a.waitForURL('**/grid.html');
    await a.waitForFunction(() => document.querySelectorAll('.channel-card').length === 16 && document.querySelector('.channel-card').getAttribute('aria-disabled') === 'false');
    assert.equal((await a.evaluate(() => JSON.parse(localStorage.av_session))).role, 'STAGE');
    console.log('PASS A: real browser create → config (16 channels/custom role) → grid');

    await b.goto(base);
    await b.locator('#join-show-id').fill(session.showId);
    await b.locator('#join-show-pin').fill('0000');
    await b.locator('#btn-join-show').click();
    await b.waitForFunction(() => document.getElementById('session-error')?.textContent.includes('Invalid'));
    assert.equal(new URL(b.url()).pathname, '/');
    await b.locator('#join-show-pin').fill(session.pin);
    await b.locator('#btn-join-show').click();
    await b.waitForURL('**/grid.html');
    await b.waitForFunction(() => document.querySelectorAll('.channel-card').length === 16 && document.querySelector('.channel-card').getAttribute('aria-disabled') === 'false');
    console.log('PASS B/E: mobile browser rejects wrong PIN, then joins same grid');
    await a.locator('#ch-1').click();
    await b.waitForFunction(() => document.querySelector('#ch-1 .status-text').textContent === 'READY');
    await b.locator('#ch-2').dblclick();
    await a.waitForFunction(() => document.querySelector('#ch-2 .status-text').textContent === 'ALERT');
    console.log('PASS C/D: bidirectional realtime and double-tap ALERT');

    await contextB.setOffline(true);
    // Force the transport closed immediately, avoiding the heartbeat timeout in a test.
    for (const socket of io.sockets.sockets.values()) {
      if (socket.handshake.headers['user-agent']?.includes('Mobile')) socket.conn.close();
    }
    await a.locator('#ch-3').click();
    await a.waitForFunction(() => document.querySelector('#ch-3 .status-text').textContent === 'READY');
    await contextB.setOffline(false);
    await b.waitForFunction(() => document.querySelector('#ch-3 .status-text').textContent === 'READY' && document.querySelector('#ch-1').getAttribute('aria-disabled') === 'false');
    console.log('PASS F: browser offline/reconnect restores missed state');

    await a.locator('#ptt-btn').dispatchEvent('keydown', { key: 'Enter' });
    assert.equal(await a.locator('#ptt-overlay').evaluate(el => el.classList.contains('hidden')), false);
    await a.locator('#ptt-btn').dispatchEvent('keyup', { key: 'Enter' });
    assert.equal(await a.locator('#ptt-overlay').evaluate(el => el.classList.contains('hidden')), true);
    console.log('PASS: PTT visual press/release');
    await b.reload();
    await b.waitForFunction(() => document.querySelector('#ch-3 .status-text').textContent === 'READY');
    console.log('PASS: reload applies initial snapshot');

    for (const page of [a, b]) {
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      assert.equal(await page.locator('.channel-card').count(), 16);
    }
    await a.screenshot({ path: path.join(os.tmpdir(), 'avcomm-grid-desktop.png') });
    await b.screenshot({ path: path.join(os.tmpdir(), 'avcomm-grid-mobile.png') });
    await b.goto(base + '/config.html');
    await b.waitForFunction(() => document.getElementById('socket-status').textContent === 'CONNECTED');
    await b.screenshot({ path: path.join(os.tmpdir(), 'avcomm-config-mobile.png') });
    await b.setViewportSize({ width: 390, height: 667 });
    await b.locator('[data-role="CUSTOM"]').click();
    await b.locator('#custom-role-input').fill('MONITORS');
    for (let i = 0; i < 8; i++) await b.locator('#increment-channels').click();
    await b.locator('#launch-cta').click();
    await b.waitForURL('**/grid.html');
    await b.waitForFunction(() => document.querySelectorAll('.channel-card').length === 24);
    await a.waitForFunction(() => document.querySelectorAll('.channel-card').length === 24);
    await b.locator('#ch-24').click();
    await a.waitForFunction(() => document.querySelector('#ch-24 .status-text').textContent === 'READY');
    console.log('PASS: short mobile config and all 24 channels reachable; count broadcasts to A');
    await b.goto(base + '/config.html');
    await b.waitForFunction(() => document.getElementById('socket-status').textContent === 'CONNECTED');
    for (let i = 0; i < 23; i++) await b.locator('#decrement-channels').click();
    await b.locator('#launch-cta').click();
    await b.waitForURL('**/grid.html');
    await a.waitForFunction(() => document.querySelectorAll('.channel-card').length === 1);
    console.log('PASS: shrinking to one channel updates active grids');
    await b.goto(base);
    await b.locator('#btn-join-show').scrollIntoViewIfNeeded();
    const joinBounds = await b.locator('#btn-join-show').boundingBox();
    assert(joinBounds.y >= 0 && joinBounds.y + joinBounds.height <= 667);
    await b.screenshot({ path: path.join(os.tmpdir(), 'avcomm-index-mobile.png') });
    await b.evaluate(() => localStorage.setItem('av_session', '{'));
    await b.goto(base + '/grid.html'); await b.waitForURL(base + '/');
    console.log('PASS: malformed session redirects safely');
    assert.deepEqual(errors, []);
    console.log('PASS: no browser JavaScript errors');
    await require('./gestures-browser.cjs')(browser, base, io);
    await require('./visual-browser.cjs')(browser, base);
  } finally {
    if (browser) await browser.close();
    await new Promise(resolve => io.close(resolve));
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
