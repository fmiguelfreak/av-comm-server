// Card markup retained from the reference snapshot; session and transport logic are new.
const channelMarkup = ch => `
            <div id="ch-${ch.id}" class="channel-card bg-surface-container-high relative flex flex-col justify-between p-2.5 rounded-sm border-l-4 border-zinc-700" role="button" tabindex="0" aria-label="Channel ${ch.id}">
                <div class="flex justify-between items-start">
                    <span class="font-headline text-base font-bold text-zinc-400 ch-num">CH ${ch.id < 10 ? '0' + ch.id : ch.id}</span>
                    <span class="text-[9px] font-label text-outline opacity-50 status-text">IDLE</span>
                </div>
                <div class="flex flex-col gap-1">
                    <span class="font-label text-[9px] uppercase tracking-widest text-zinc-500">${ch.label}</span>
                    <div class="h-1 w-full bg-zinc-800 indicator-bar"></div>
                </div>
                <div class="absolute bottom-1 right-1 hidden badge">
                    <span class="text-[8px] font-bold px-1 rounded-sm"></span>
                </div>
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
  const timers = new Map();
  let joined = false;
  let count = 0;
  const colors = { IDLE: '#71717a', READY: '#00ff41', ALERT: '#fd9000', EMERGENCY: '#ffb4ab' };
  document.getElementById('device-id').textContent = `ID: ${session.showId}`;
  function availability() {
    grid.querySelectorAll('.channel-card').forEach(card => card.setAttribute('aria-disabled', String(!joined)));
    dot.className = joined ? 'w-2 h-2 rounded-full bg-[#00FF41] shadow-[0_0_8px_#00FF41]' : 'w-2 h-2 rounded-full bg-zinc-600';
    info.textContent = joined ? `${session.role} | ${session.showId} | ${session.pin}` : 'OFFLINE';
  }
  function update(chId, status) {
    const card = document.getElementById(`ch-${chId}`);
    if (!card || !colors[status]) return;
    const active = status !== 'IDLE';
    card.style.borderLeftColor = active ? colors[status] : '';
    card.querySelector('.ch-num').style.color = active ? colors[status] : '';
    card.querySelector('.status-text').textContent = status;
    const bar = card.querySelector('.indicator-bar');
    bar.style.backgroundColor = active ? colors[status] : '';
    bar.style.boxShadow = status === 'READY' ? '0 0 10px rgba(0,255,65,0.4)' : '';
    bar.classList.toggle('animate-pulse', status === 'EMERGENCY');
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
  function clearTimers() { timers.forEach(clearTimeout); timers.clear(); }
  function build(channels) {
    clearTimers(); count = channels;
    grid.innerHTML = Array.from({ length: channels }, (_, i) => channelMarkup({ id: i + 1, label: labels[i] || `CHANNEL_${String(i + 1).padStart(2, '0')}` })).join('');
    // Exactly the reference's 2 × 6 at 12 channels; additional channels retain readable cards.
    grid.style.gridTemplateRows = `repeat(${Math.ceil(channels / 2)}, minmax(56px, 1fr))`;
    grid.style.overflowY = 'auto';
    grid.querySelectorAll('.channel-card').forEach((card, i) => {
      card.addEventListener('click', () => {
        if (!joined) return;
        if (timers.has(i)) { clearTimeout(timers.get(i)); timers.delete(i); send(i + 1, 'ALERT'); }
        else timers.set(i, setTimeout(() => { timers.delete(i); send(i + 1, 'READY'); }, 250));
      });
      card.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); send(i + 1, e.shiftKey ? 'ALERT' : 'READY'); }
      });
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
  socket.on('join_error', () => { joined = false; availability(); });
  socket.on('state_changed', data => { if (joined && data.showId === session.showId) update(data.chId, data.status); });
  build(session.channels);

  // Visual PTT only: no microphone, recording, transcription, or audio transport.
  const ptt = document.getElementById('ptt-btn');
  const overlay = document.getElementById('ptt-overlay');
  overlay.style.pointerEvents = 'none';
  let pttTimer;
  const stopPTT = () => { clearTimeout(pttTimer); overlay.classList.add('hidden'); };
  const startPTT = () => { stopPTT(); overlay.classList.remove('hidden'); pttTimer = setTimeout(stopPTT, 3000); };
  ptt.setAttribute('role', 'button'); ptt.tabIndex = 0; ptt.style.touchAction = 'none';
  ptt.addEventListener('pointerdown', e => { e.preventDefault(); ptt.setPointerCapture(e.pointerId); startPTT(); });
  ['pointerup', 'pointercancel', 'lostpointercapture', 'blur'].forEach(event => ptt.addEventListener(event, stopPTT));
  ptt.addEventListener('keydown', e => { if (!e.repeat && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); startPTT(); } });
  ptt.addEventListener('keyup', stopPTT);
  window.addEventListener('blur', stopPTT);
})();
