/* One persisted session shared by all three pages. Server snapshots are authoritative. */
window.AV = (() => {
  const key = 'av_session';
  const valid = s => s && s.version === 1 && /^\d{4}$/.test(s.showId) && /^\d{4}$/.test(s.pin)
    && typeof s.name === 'string' && Number.isInteger(s.channels) && s.channels >= 1 && s.channels <= 24
    && typeof s.role === 'string' && s.role.trim().length > 0 && s.role.length <= 40;
  function read() {
    try { const s = JSON.parse(localStorage.getItem(key)); return valid(s) ? s : null; }
    catch { return null; }
  }
  function save(data, role = 'FOH') {
    const session = { version: 1, showId: data.showId, pin: data.pin || data.config.pin,
      name: data.config.name, channels: data.config.channels, role };
    if (!valid(session)) throw new Error('Invalid session received');
    localStorage.setItem(key, JSON.stringify(session));
    return session;
  }
  function required() {
    const session = read();
    if (!session) window.location.replace('/');
    return session;
  }
  function error(message) {
    let el = document.getElementById('session-error');
    if (!el) {
      el = document.createElement('div');
      el.id = 'session-error';
      el.setAttribute('role', 'alert');
      el.className = 'fixed top-16 left-0 w-full z-[90] bg-[#131313] border-b border-red-500 text-red-400 px-4 py-2 text-xs font-mono';
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.hidden = !message;
  }
  function join(socket, session) {
    socket.emit('join_show', { showId: session.showId, pin: session.pin, role: session.role });
  }
  function bindErrors(socket) {
    socket.on('join_error', message => error(message + ' — return to the start page to join or create a show.'));
    socket.on('operation_error', data => error(data.message));
    socket.on('connect_error', () => error('UPLINK ERROR — retrying connection…'));
  }
  return { read, save, required, error, join, bindErrors };
})();
