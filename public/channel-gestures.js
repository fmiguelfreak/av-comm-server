/* Pointer gestures share one path for mouse, trackpad and touch. */
function bindChannelGestures(card, { enabled, send }) {
  const HOLD_MS = 1500;
  const DOUBLE_MS = 250;
  let pointer = null;
  let tapTimer = null;
  let ignoreClick = false;
  const events = new AbortController();
  const listen = (name, callback) => card.addEventListener(name, callback, { signal: events.signal });
  function cancel() {
    clearTimeout(tapTimer);
    tapTimer = null;
    const previous = pointer;
    pointer = null;
    if (previous) {
      clearTimeout(previous.timer);
      if (card.hasPointerCapture(previous.id)) card.releasePointerCapture(previous.id);
    }
    card.classList.remove('is-holding');
  }
  function single() { send(card.dataset.status === 'IDLE' ? 'READY' : 'IDLE'); }
  listen('pointerdown', event => {
    if (!enabled() || !event.isPrimary || event.button !== 0 || pointer) return;
    ignoreClick = true;
    const double = tapTimer !== null;
    clearTimeout(tapTimer); tapTimer = null;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, double, complete: false };
    card.setPointerCapture(event.pointerId);
    card.classList.add('is-holding');
    pointer.timer = setTimeout(() => {
      if (!pointer || !enabled()) { cancel(); return; }
      pointer.complete = true;
      card.classList.remove('is-holding');
      send('EMERGENCY');
    }, HOLD_MS);
  });
  listen('pointermove', event => {
    if (pointer?.id === event.pointerId && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 12) cancel();
  });
  listen('pointerup', event => {
    if (pointer?.id !== event.pointerId) return;
    const { complete, double } = pointer;
    cancel();
    if (!enabled() || complete) return;
    if (double) send('ALERT');
    else tapTimer = setTimeout(() => { tapTimer = null; if (enabled()) single(); }, DOUBLE_MS);
  });
  for (const name of ['pointercancel', 'lostpointercapture']) {
    listen(name, event => { if (pointer?.id === event.pointerId) cancel(); });
  }
  listen('contextmenu', event => event.preventDefault());
  // Native compatibility clicks after pointerup must never produce a second action.
  listen('click', event => {
    if (event.detail === 0 && !ignoreClick && enabled()) single();
  });
  listen('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (event.repeat || !enabled()) return;
    cancel(); ignoreClick = false;
    if (event.shiftKey) send('ALERT'); else single();
  });
  listen('blur', cancel);
  return { cancel, destroy() { cancel(); events.abort(); } };
}
if (typeof module !== 'undefined') module.exports = { bindChannelGestures };
