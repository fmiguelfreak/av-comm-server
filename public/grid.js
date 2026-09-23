// Presentation template; gestures are bound separately using the existing Socket.IO contract.
const channelMarkup = ch => `
  <div id="ch-${ch.id}" class="channel-card" data-status="IDLE" role="button" tabindex="0" aria-label="Channel ${ch.id}">
    <div class="channel-top"><span class="ch-num">CH ${String(ch.id).padStart(2, '0')}</span><span class="status-text">IDLE</span></div>
    <div class="channel-name">${ch.label.replaceAll('_', ' ')}</div>
    <div class="channel-bottom"><div class="indicator-bar"></div><span class="channel-caption">PRODUCTION INTERCOM</span></div>
    <div class="badge hidden"><span></span></div>
  </div>
`;
(() => {
  let session = AV.required();
  if (!session) return;
  const socket = io();
  const grid = document.getElementById('grid-container');
  const info = document.getElementById('session-info');
  const dot = document.getElementById('status-dot');
  const labels = ['STAGE_LEFT', 'STAGE_RIGHT', 'DIRECTOR_W', 'PRODUCER', 'LIGHTING_1', 'VIDEO_WALL', 'RIGGING_M', 'SPOT_01', 'SPOT_02', 'PYRO_SAFE', 'SYSTEM_ERR', 'SPARE_LINE'];
  let gestures = [];
  let joined = false;
  let count = 0;
  const colors = { IDLE: '#71717a', READY: '#00ff41', ALERT: '#ffad42', EMERGENCY: '#ff5059' };
  document.getElementById('device-id').textContent = `ID: ${session.showId}`;
  function availability(connectionState) {
    grid.querySelectorAll('.channel-card').forEach(card => card.setAttribute('aria-disabled', String(!joined)));
    dot.className = 'small-led';
    info.textContent = `${session.role} | SHOW ID ${session.showId} | PIN ${session.pin}`;
    document.getElementById('show-name').textContent = session.name;
    document.getElementById('show-name').title = session.name;
    const state = connectionState || (joined ? 'ONLINE' : navigator.onLine && socket.active ? 'RECONNECTING' : 'OFFLINE');
    document.getElementById('connection-label').textContent = state;
    document.getElementById('connection-status').dataset.state = state;
  }
  function update(chId, status) {
    const card = document.getElementById(`ch-${chId}`);
    if (!card || !colors[status]) return;
    card.dataset.status = status;
    const active = status !== 'IDLE';
    card.style.borderLeftColor = active ? colors[status] : '';
    card.querySelector('.ch-num').style.color = active ? colors[status] : '';
    card.querySelector('.status-text').textContent = status;
    const bar = card.querySelector('.indicator-bar');
    bar.style.backgroundColor = active ? colors[status] : '';
    bar.style.boxShadow = status === 'READY' ? '0 0 10px rgba(0,255,65,0.4)' : '';
    // A steady red indicator is readable without decorative emergency flashing.
    const badge = card.querySelector('.badge');
    badge.classList.toggle('hidden', !['READY', 'ALERT'].includes(status));
    badge.children[0].textContent = status;
    badge.children[0].style.backgroundColor = colors[status];
    badge.children[0].style.color = status === 'READY' ? '#007117' : '#000000';
  }
  function send(chId, status) {
    if (!joined || !socket.connected) return;
    socket.emit('update_channel', { showId: session.showId, chId, status });
  }
  function clearTimers() { gestures.forEach(gesture => gesture.cancel()); }
  window.addEventListener('blur', clearTimers);
  document.addEventListener('visibilitychange', () => { if (document.hidden) clearTimers(); });
  function build(channels) {
    gestures.forEach(gesture => gesture.destroy());
    gestures = []; count = channels;
    grid.innerHTML = Array.from({ length: channels }, (_, i) => channelMarkup({ id: i + 1, label: labels[i] || `CHANNEL_${String(i + 1).padStart(2, '0')}` })).join('');
    // Responsive columns and row sizing belong to the presentation stylesheet.
    document.getElementById('channel-total').textContent = `${channels} CHANNEL${channels === 1 ? '' : 'S'}`;
    grid.querySelectorAll('.channel-card').forEach((card, i) => {
      gestures.push(bindChannelGestures(card, {
        enabled: () => joined && socket.connected,
        send: status => send(i + 1, status)
      }));
    });
    availability();
  }
  function snapshot(data) {
    if (data.showId !== session.showId) return;
    session = AV.save(data, session.role);
    if (count !== session.channels) build(session.channels);
    for (let i = 1; i <= count; i++) update(i, data.config.states[i] || 'IDLE');
    availability();
  }
  AV.bindErrors(socket);
  socket.on('connect', () => AV.join(socket, session));
  socket.on('join_success', data => { joined = true; AV.error(''); snapshot(data); });
  socket.on('show_configured', snapshot);
  socket.on('disconnect', () => { joined = false; clearTimers(); availability(); });
  socket.on('join_error', () => { joined = false; clearTimers(); availability('OFFLINE'); });
  socket.on('connect_error', () => availability(navigator.onLine && socket.active ? 'RECONNECTING' : 'OFFLINE'));
  socket.io.on('reconnect_attempt', () => availability(navigator.onLine ? 'RECONNECTING' : 'OFFLINE'));
  window.addEventListener('offline', () => availability('OFFLINE'));
  socket.on('state_changed', data => { if (joined && data.showId === session.showId) update(data.chId, data.status); });
  build(session.channels);

  bindVoicePTT({ socket, getSession: () => session, allowed: () => joined && socket.connected });
})();
