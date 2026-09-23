const AV_VOICE_SETTINGS = Object.freeze({ language: 'pt-PT', finalizeTimeout: 8000 });

// One recognition instance per press. Late callbacks can only affect their own session.
function createVoicePTT({ Recognition, allowed, send, render, settings = AV_VOICE_SETTINGS }) {
  let current = null;
  const supported = typeof Recognition === 'function';
  const show = (state, text = '', message = '') => render({ state, text, message });
  function dispose(run) {
    clearTimeout(run.timer);
    if (current === run) current = null;
  }
  function fail(run, message) {
    if (current !== run) return;
    dispose(run);
    try { run.recognition.abort(); } catch {}
    show('error', '', message);
  }
  function finish(run) {
    if (current !== run || !run.released || !run.ended) return;
    const text = run.final.trim();
    dispose(run); // Clear before sending: duplicate onend cannot send again.
    show('idle');
    if (text && allowed()) send(text);
  }
  function requestStop(run) {
    if (run.ended) return finish(run);
    show('stopping', run.preview);
    clearTimeout(run.timer);
    run.timer = setTimeout(() => fail(run, 'O reconhecimento não terminou. Tenta novamente.'), settings.finalizeTimeout);
    try { run.recognition.stop(); }
    catch { if (run.started) fail(run, 'Não foi possível finalizar o reconhecimento.'); }
  }
  function press() {
    if (!supported) { show('unsupported', '', 'Voice-to-Text não está disponível neste browser.'); return false; }
    if (current) return false;
    if (!allowed()) { show('error', '', 'Entra na sala e aguarda a ligação antes de usar PTT.'); return false; }
    let recognition;
    try { recognition = new Recognition(); }
    catch { show('error', '', 'Não foi possível iniciar o reconhecimento neste browser.'); return false; }
    const run = { recognition, preview: '', final: '', released: false, ended: false, started: false };
    current = run;
    recognition.lang = settings.language;
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;
    recognition.onstart = () => {
      if (current !== run) return;
      run.started = true;
      clearTimeout(run.timer);
      if (run.released) requestStop(run); else show('listening', run.preview);
    };
    recognition.onresult = event => {
      if (current !== run || run.ended) return;
      // The results list is cumulative; rebuilding it replaces interim hypotheses.
      const all = [], finals = [];
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript || '';
        all.push(text);
        if (result.isFinal) finals.push(text);
      }
      run.preview = all.join(' ').trim();
      run.final = finals.join(' ').trim();
      show(run.released ? 'stopping' : 'listening', run.preview);
    };
    recognition.onerror = event => {
      const messages = {
        'not-allowed': 'Permissão do microfone recusada. Autoriza o microfone nas definições do browser.',
        'service-not-allowed': 'Reconhecimento de voz bloqueado pelo browser ou sistema.',
        'audio-capture': 'Microfone indisponível. Verifica o dispositivo e as permissões.',
        'no-speech': 'Não foi detetada fala. Mantém PTT pressionado e tenta novamente.',
        'network': 'Falha de ligação ao reconhecimento do browser. Tenta novamente.',
        'language-not-supported': 'O reconhecimento em pt-PT não está disponível neste browser.'
      };
      fail(run, messages[event.error] || 'O reconhecimento foi interrompido. Tenta novamente.');
    };
    recognition.onend = () => {
      if (current !== run) return;
      clearTimeout(run.timer);
      run.ended = true;
      if (run.released) finish(run);
      else show('ready', run.final, 'Larga PTT para enviar.');
    };
    show('starting');
    run.timer = setTimeout(() => fail(run, 'O microfone não iniciou. Verifica as permissões.'), 15000);
    try { recognition.start(); }
    catch { fail(run, 'Não foi possível iniciar o microfone. Verifica as permissões.'); return false; }
    return current === run;
  }
  function release() {
    if (!current || current.released) return;
    current.released = true;
    requestStop(current);
  }
  function cancel() {
    if (!current) return;
    const run = current;
    dispose(run);
    try { run.recognition.abort(); } catch {}
    show('idle');
  }
  show(supported ? 'idle' : 'unsupported', '', supported ? '' : 'Voice-to-Text não está disponível neste browser.');
  return { press, release, cancel, supported };
}

function bindVoicePTT({ socket, getSession, allowed }) {
  const button = document.getElementById('ptt-btn');
  const overlay = document.getElementById('ptt-overlay');
  const caption = button.querySelector('small');
  const transcript = document.getElementById('ptt-transcript');
  const feedback = document.getElementById('ptt-feedback');
  const labels = { starting: 'STARTING MICROPHONE...', listening: 'LISTENING...', stopping: 'FINALIZING...', ready: 'RELEASE TO SEND' };
  const voice = createVoicePTT({
    Recognition: window.SpeechRecognition || window.webkitSpeechRecognition,
    allowed,
    send(text) {
      if (text.length > 2000) { AV.error('Mensagem demasiado longa (máximo 2000 caracteres). Repete uma frase mais curta.'); return; }
      const session = getSession();
      socket.timeout(5000).emit('new_message', { showId: session.showId, text, sender: session.role }, (err, result) => {
        if (err || !result?.ok) AV.error(err ? 'Não foi possível confirmar a entrega. A mensagem não será reenviada automaticamente.' : result.error);
      });
    },
    render({ state, text, message }) {
      button.dataset.voiceState = state;
      const active = Boolean(labels[state]);
      overlay.classList.toggle('hidden', !active);
      button.classList.toggle('is-listening', state === 'listening');
      button.setAttribute('aria-pressed', String(state === 'starting' || state === 'listening'));
      button.setAttribute('aria-disabled', String(state === 'unsupported'));
      caption.textContent = state === 'unsupported' ? 'VOICE UNAVAILABLE' : state === 'stopping' ? 'FINALIZING' : 'HOLD TO TALK';
      button.title = message || 'Mantém pressionado para falar; larga para enviar texto.';
      document.getElementById('ptt-heading').textContent = labels[state] || '';
      document.getElementById('ptt-mic-state').textContent = state === 'listening' ? 'MIC ACTIVE · pt-PT' : state === 'starting' ? 'WAITING FOR MICROPHONE' : 'MIC STOPPED';
      overlay.dataset.voiceState = state;
      transcript.textContent = text || 'Fala para a equipa…';
      transcript.classList.toggle('transcript-placeholder', !text);
      feedback.textContent = message || 'LARGA PTT PARA ENVIAR · APENAS TEXTO';
      if (state === 'error') AV.error(message);
      if (state === 'starting') AV.error('');
    }
  });
  let input = null;
  const release = () => { if (input === null) return; input = null; voice.release(); };
  const cancel = () => { input = null; voice.cancel(); };
  button.style.touchAction = 'none';
  button.addEventListener('pointerdown', event => {
    if (input !== null || !event.isPrimary || event.button !== 0) return;
    event.preventDefault();
    input = event.pointerId;
    if (!voice.press()) { input = null; return; }
    button.setPointerCapture(event.pointerId);
  });
  button.addEventListener('pointerup', event => { if (input === event.pointerId) release(); });
  for (const type of ['pointercancel', 'lostpointercapture']) button.addEventListener(type, event => { if (input === event.pointerId) cancel(); });
  button.addEventListener('contextmenu', event => event.preventDefault());
  button.addEventListener('keydown', event => {
    if (!['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    if (!event.repeat && input === null) { input = 'keyboard'; if (!voice.press()) input = null; }
  });
  button.addEventListener('keyup', event => { if (input === 'keyboard' && ['Enter', ' '].includes(event.key)) release(); });
  window.addEventListener('blur', cancel);
  document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); });
  window.addEventListener('pagehide', cancel);
  socket.on('disconnect', cancel);
  socket.on('join_error', cancel);

  const received = document.getElementById('message-overlay');
  let hideTimer;
  socket.on('broadcast_message', message => {
    if (!allowed() || typeof message?.text !== 'string' || !message.text.trim()) return;
    clearTimeout(hideTimer);
    received.querySelector('.message-source').textContent = typeof message.sender === 'string' ? message.sender : '';
    document.getElementById('message-text').textContent = message.text;
    const stamp = document.getElementById('message-time');
    const date = new Date(message.timestamp);
    stamp.textContent = Number.isFinite(date.getTime()) ? date.toLocaleTimeString(AV_VOICE_SETTINGS.language, { hour: '2-digit', minute: '2-digit' }) : '';
    stamp.dateTime = Number.isFinite(date.getTime()) ? date.toISOString() : '';
    received.classList.remove('hidden');
    hideTimer = setTimeout(() => received.classList.add('hidden'), 4000);
  });
}
if (typeof module !== 'undefined') module.exports = { createVoicePTT, AV_VOICE_SETTINGS };
