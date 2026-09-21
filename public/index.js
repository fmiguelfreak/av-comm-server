(() => {
  const socket = io();
  const create = document.getElementById('btn-create-show');
  const join = document.getElementById('btn-join-show');
  const name = document.getElementById('create-show-name');
  const id = document.getElementById('join-show-id');
  const pin = document.getElementById('join-show-pin');
  let pending = false;
  function ready() { pending = false; create.disabled = join.disabled = !socket.connected; }
  function start() {
    if (!socket.connected || pending) return false;
    pending = true; create.disabled = join.disabled = true; AV.error(''); return true;
  }
  AV.bindErrors(socket);
  socket.on('connect', () => { ready(); AV.error(''); });
  socket.on('disconnect', () => { ready(); AV.error('OFFLINE — reconnecting…'); });
  socket.on('join_error', ready);
  socket.on('operation_error', ready);
  create.addEventListener('click', () => {
    if (!start()) return;
    socket.emit('create_show', { name: name.value.trim() || 'UNNAMED_SHOW', channels: 12, role: 'FOH' });
  });
  join.addEventListener('click', () => {
    if (!/^\d{4}$/.test(id.value) || !/^\d{4}$/.test(pin.value)) return AV.error('Show ID and PIN must contain 4 digits.');
    if (!start()) return;
    socket.emit('join_show', { showId: id.value, pin: pin.value, role: 'FOH' });
  });
  function navigate(data, page) {
    try { AV.save(data); window.location.href = page; }
    catch { AV.error('Unable to save session. Enable local storage and try again.'); ready(); }
  }
  socket.on('show_created', data => navigate(data, 'config.html'));
  socket.on('join_success', data => navigate(data, 'grid.html'));
  [id, pin].forEach(input => input.addEventListener('input', () => { input.value = input.value.replace(/[^0-9]/g, ''); }));
  name.maxLength = 100;
  name.addEventListener('keydown', e => { if (e.key === 'Enter') create.click(); });
  pin.addEventListener('keydown', e => { if (e.key === 'Enter') join.click(); });
  ready();
})();
