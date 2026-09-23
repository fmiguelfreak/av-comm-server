const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const vm = require('node:vm');
const baseline = 'eb9a82693ee8470127c142a29965da216f9fb843';
const hooks = {
  index: ['app-root', 'create-show-name', 'btn-create-show', 'join-show-id', 'join-show-pin', 'btn-join-show'],
  config: ['socket-status', 'display-show-id', 'display-access-pin', 'channel-count', 'decrement-channels', 'increment-channels', 'role-grid', 'custom-role-container', 'custom-role-input', 'launch-cta'],
  grid: ['grid-container', 'session-info', 'device-id', 'status-dot', 'ptt-btn', 'ptt-overlay', 'show-name', 'connection-label', 'message-overlay']
};
for (const page of ['index', 'config', 'grid']) {
  test(`${page}: complete accessible document and functional hooks preserved`, () => {
    const current = fs.readFileSync(`public/${page}.html`, 'utf8');
    assert.match(current, /<!DOCTYPE html>/i); assert.match(current, /<body\b/); assert.match(current, /<\/html>/);
    assert.match(current, /name="viewport"/); assert.match(current, /href="\/ui.css"/);
    const ids = [...current.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
    assert.equal(new Set(ids).size, ids.length, 'Unique DOM IDs');
    for (const hook of hooks[page]) assert(ids.includes(hook), hook);
    for (const file of ['session', page]) { assert(current.includes(`src="/${file}.js"`)); new vm.Script(fs.readFileSync(`public/${file}.js`, 'utf8')); }
  });
}
test('visual revision preserves backend, session, setup logic and channel action contract', () => {
  for (const file of ['server.js', 'public/session.js', 'public/index.js', 'public/config.js']) {
    assert.equal(fs.readFileSync(file, 'utf8'), execFileSync('git', ['show', `${baseline}:${file}`], { encoding: 'utf8' }), `${file} must not change in this visual revision`);
  }
  const current = fs.readFileSync('public/grid.js', 'utf8');
  const old = execFileSync('git', ['show', `${baseline}:public/grid.js`], { encoding: 'utf8' });
  const events = s => [...s.matchAll(/socket\.emit\([^;]+;/g)].map(m => m[0]);
  assert.deepEqual(events(current), events(old));
  for (const hook of ['ch-num', 'status-text', 'indicator-bar', 'badge']) assert(current.includes(hook));
  assert(current.includes('bindVoicePTT'));
  assert(!/getUserMedia|MediaRecorder/.test(current));
  assert.equal(fs.readFileSync('public/channel-gestures.js', 'utf8'), execFileSync('git', ['show', '28e00c9:public/channel-gestures.js'], { encoding: 'utf8' }));
});
