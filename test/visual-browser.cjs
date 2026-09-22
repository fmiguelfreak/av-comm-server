const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { io: connect } = require('socket.io-client');

module.exports = async function visualReview(browser, base) {
  const output = process.env.AVCOMM_SCREENSHOT_DIR || path.join(os.tmpdir(), 'avcomm-visual-review');
  fs.mkdirSync(output, { recursive: true });
  const client = connect(base, { autoConnect: false });
  const created = new Promise(resolve => client.once('show_created', resolve));
  client.on('connect', () => client.emit('create_show', { name: 'SUMMER LIVE / MAIN STAGE', channels: 12, role: 'FOH' }));
  client.connect();
  const show = await created;
  const session = { version: 1, showId: show.showId, pin: show.pin, name: show.config.name, channels: 12, role: 'FOH' };
  for (const [chId, status] of [[1, 'READY'], [2, 'READY'], [3, 'ALERT'], [7, 'EMERGENCY'], [9, 'READY']]) {
    await new Promise((resolve, reject) => client.timeout(3000).emit('update_channel', { showId: show.showId, chId, status }, (err, result) => err || !result.ok ? reject(err || new Error('state rejected')) : resolve()));
  }
  try {
    for (const [name, width, height, columns] of [
      ['desktop-1440p',2560,1440,3], ['desktop',1440,900,3], ['macbook',1366,768,3],
      ['ipad',820,1180,2], ['tablet-landscape',1024,768,2], ['mobile',390,844,2], ['narrow-mobile',320,568,1]
    ]) {
      const context = await browser.newContext({ viewport: { width, height }, isMobile: width < 700, hasTouch: width <= 1100 });
      const page = await context.newPage();
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(data => localStorage.setItem('av_session', JSON.stringify(data)), session);
      for (const screen of ['index', 'config', 'grid']) {
        await page.goto(`${base}/${screen === 'index' ? '' : screen + '.html'}`);
        await page.evaluate(() => document.fonts.ready);
        if (screen === 'config') await page.waitForFunction(() => document.getElementById('socket-status').textContent === 'CONNECTED');
        if (screen === 'grid') {
          await page.waitForFunction(() => document.getElementById('connection-label').textContent === 'ONLINE');
          assert.equal(await page.locator('.channel-card').count(), 12);
          assert.equal(await page.locator('#show-name').textContent(), session.name);
          const geometry = await page.locator('#grid-container').evaluate(el => ({ columns: getComputedStyle(el).gridTemplateColumns.split(' ').length, scroll: el.scrollHeight > el.clientHeight + 2 }));
          assert.equal(geometry.columns, columns, `${name} column count`);
          if (width > 1100) assert.equal(geometry.scroll, false, `${name} 12 channels fit without scroll`);
          assert.equal(await page.locator('#ch-7').getAttribute('data-status'), 'EMERGENCY');
          assert.equal(await page.locator('#ch-7 .status-text').evaluate(el => getComputedStyle(el).color), 'rgb(255, 80, 89)');
          const bar = await page.locator('.command-bar').boundingBox();
          assert(bar.y >= 0 && bar.y + bar.height <= height + 1, `${name} command bar visible`);
          await page.locator('#ch-12').scrollIntoViewIfNeeded();
          const card = await page.locator('#ch-12').boundingBox();
          assert(card.y + card.height <= bar.y, `${name} last channel not under command bar`);
          await page.locator('#grid-container').evaluate(el => { el.scrollTop = 0; });
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${name}/${screen} no horizontal overflow`);
        if (name === 'desktop' || (screen === 'grid' && ['mobile','ipad','macbook','desktop-1440p'].includes(name))) {
          await page.screenshot({ path: path.join(output, `${screen}-${name}.png`) });
        }
      }
      if (name === 'desktop') {
        await page.locator('#ptt-btn').dispatchEvent('keydown', { key: 'Enter' });
        assert.equal(await page.locator('#ptt-btn').getAttribute('aria-pressed'), 'true');
        assert.equal(await page.locator('#ptt-overlay').isVisible(), true);
        await page.screenshot({ path: path.join(output, 'grid-listening-desktop.png') });
        await page.locator('#ptt-btn').dispatchEvent('keyup', { key: 'Enter' });
        // UI template preview only; this is not a received/transcribed message.
        await page.locator('#message-overlay').evaluate(el => el.classList.remove('hidden'));
        await page.screenshot({ path: path.join(output, 'grid-message-preview-desktop.png') });
        await page.waitForFunction(() => getComputedStyle(document.getElementById('message-overlay')).visibility === 'hidden', null, { timeout: 8000 });
      }
      assert.deepEqual(errors, [], `${name} JS errors`);
      console.log(`PASS VISUAL: ${name} ${width}×${height} — 3 pages, ${columns} grid columns, hooks and viewport bounds`);
      await context.close();
    }
    console.log('SCREENSHOTS:', output);
  } finally { client.disconnect(); }
};
