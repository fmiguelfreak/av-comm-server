const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function fixture() {
  let now = 0, next = 0;
  const tasks = new Map(), sent = [], classes = new Set();
  const card = new EventTarget();
  card.dataset = { status: 'IDLE' };
  card.classList = { add: c => classes.add(c), remove: c => classes.delete(c) };
  card.setPointerCapture = () => {}; card.hasPointerCapture = () => false;
  let enabled = true;
  const ctx = { module: { exports: {} }, AbortController,
    setTimeout: (fn, delay) => { tasks.set(++next, { at: now + delay, fn }); return next; },
    clearTimeout: id => tasks.delete(id) };
  vm.runInNewContext(fs.readFileSync('public/channel-gestures.js', 'utf8'), ctx);
  const binding = ctx.module.exports.bindChannelGestures(card, { enabled: () => enabled, send: status => { sent.push(status); card.dataset.status = status; } });
  const emit = (type, values = {}) => { const event = new Event(type, { cancelable: true }); Object.assign(event, { pointerId: 1, isPrimary: true, button: 0, clientX: 0, clientY: 0, detail: 1 }, values); card.dispatchEvent(event); };
  function tick(ms) { const until = now + ms; for (;;) { const task = [...tasks].sort((a,b) => a[1].at-b[1].at).find(([,v]) => v.at <= until); if (!task) break; now = task[1].at; tasks.delete(task[0]); task[1].fn(); } now = until; }
  const tap = () => { emit('pointerdown'); emit('pointerup'); emit('click'); };
  return { card, sent, classes, emit, tick, tap, binding, disable: () => { enabled = false; } };
}
test('single tap toggles IDLE/READY and resets ALERT/EMERGENCY', () => {
  const f=fixture(); f.tap(); f.tick(250); assert.deepEqual(f.sent,['READY']);
  for (const state of ['READY','ALERT','EMERGENCY']) { f.card.dataset.status=state; f.tap(); f.tick(250); assert.equal(f.sent.at(-1),'IDLE'); }
});
test('double tap sends only ALERT, with no READY or compatibility click duplicates', () => {
  const f=fixture(); f.tap(); f.tick(100); f.tap(); f.emit('dblclick'); f.tick(2000); assert.deepEqual(f.sent,['ALERT']);
});
test('hold reaches EMERGENCY at 1500ms and release sends nothing else', () => {
  const f=fixture(); f.emit('pointerdown'); assert(f.classes.has('is-holding')); f.tick(1499); assert.deepEqual(f.sent,[]);
  f.tick(1); assert.deepEqual(f.sent,['EMERGENCY']); assert(!f.classes.has('is-holding'));
  f.emit('pointerup'); f.emit('click'); f.tick(2000); assert.deepEqual(f.sent,['EMERGENCY']);
});
test('second tap becoming a hold cancels pending single/double action', () => {
  const f=fixture(); f.tap(); f.tick(100); f.emit('pointerdown'); f.tick(1500); f.emit('pointerup'); f.emit('click'); f.tick(1000); assert.deepEqual(f.sent,['EMERGENCY']);
});
test('scroll, pointercancel, lost capture, disconnect cleanup and blur cancel holds', () => {
  for (const mode of ['pointercancel','lostpointercapture','blur','move','disconnect']) {
    const f=fixture(); f.emit('pointerdown'); f.tick(500);
    if(mode==='move') f.emit('pointermove',{clientY:30}); else if(mode==='disconnect'){f.disable();f.binding.cancel();} else f.emit(mode);
    f.tick(2000); f.emit('pointerup'); f.emit('click'); f.tick(500); assert.deepEqual(f.sent,[],mode); assert(!f.classes.has('is-holding'));
  }
});
test('non-primary pointers and right mouse cannot activate channels; keyboard still works', () => {
  const f=fixture(); f.emit('pointerdown',{isPrimary:false});f.emit('pointerup');f.tick(2000);f.emit('pointerdown',{button:2});f.tick(2000);assert.deepEqual(f.sent,[]);
  f.emit('keydown',{key:'Enter'});f.emit('keydown',{key:'Enter',repeat:true});assert.deepEqual(f.sent,['READY']);
  f.emit('keydown',{key:'Enter',shiftKey:true});assert.deepEqual(f.sent,['READY','ALERT']);
});
