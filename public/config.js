(() => {
  let session = AV.required();
  if (!session) return;
  const socket = io();
  const count = document.getElementById('channel-count');
  const launch = document.getElementById('launch-cta');
  const status = document.getElementById('socket-status');
  const custom = document.getElementById('custom-role-input');
  let channels = session.channels;
  let role = ['FOH', 'BOH', 'MICS'].includes(session.role) ? session.role : 'CUSTOM';
  let joined = false;
  let submitting = false;
  let dirty = false;
  custom.value = role === 'CUSTOM' ? session.role : '';
  custom.maxLength = 40;
  document.getElementById('display-show-id').textContent = session.showId;
  document.getElementById('display-access-pin').textContent = session.pin;
  function render() {
    count.textContent = channels;
    document.querySelectorAll('.role-btn').forEach(btn => btn.classList.toggle('role-active', btn.dataset.role === role));
    document.getElementById('custom-role-container').classList.toggle('hidden', role !== 'CUSTOM');
    launch.disabled = !joined || submitting;
  }
  document.getElementById('decrement-channels').onclick = () => { channels = Math.max(1, channels - 1); dirty = true; render(); };
  document.getElementById('increment-channels').onclick = () => { channels = Math.min(24, channels + 1); dirty = true; render(); };
  document.querySelectorAll('.role-btn').forEach(btn => btn.onclick = () => { role = btn.dataset.role; render(); if (role === 'CUSTOM') custom.focus(); });
  AV.bindErrors(socket);
  socket.on('connect', () => { status.textContent = 'SYNCING'; AV.join(socket, session); });
  socket.on('disconnect', () => { joined = false; submitting = false; status.textContent = 'OFFLINE'; render(); });
  socket.on('join_success', data => {
    joined = true;
    session = AV.save(data, session.role);
    if (!dirty) channels = session.channels;
    status.textContent = 'CONNECTED';
    AV.error(''); render();
  });
  socket.on('join_error', () => { joined = false; status.textContent = 'ACCESS DENIED'; render(); });
  socket.on('show_configured', data => {
    if (data.showId !== session.showId) return;
    session = AV.save(data, session.role);
    if (!dirty) { channels = session.channels; render(); }
  });
  socket.on('operation_error', () => { submitting = false; render(); });
  launch.onclick = () => {
    if (!joined || submitting) return;
    submitting = true; AV.error(''); render();
    const selectedRole = role === 'CUSTOM' ? custom.value.trim().toUpperCase() || 'TECH_UNNAMED' : role;
    socket.timeout(5000).emit('configure_show', { showId: session.showId, channels }, (err, result) => {
      if (err || !result.ok) {
        submitting = false; render();
        AV.error(err ? 'Configuration not confirmed. Please retry.' : result.error);
        return;
      }
      try {
        session = AV.save(result, selectedRole);
        window.location.href = 'grid.html';
      } catch {
        submitting = false; render();
        AV.error('Unable to save session. Enable local storage and try again.');
      }
    });
  };
  render();
})();
