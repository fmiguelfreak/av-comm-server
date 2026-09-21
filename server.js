const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { randomInt } = require('crypto');
const path = require('path');

const MAX_CHANNELS = 24;
const STATUSES = new Set(['IDLE', 'READY', 'ALERT', 'EMERGENCY']);
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const channelCount = value => Number.isInteger(value) && value >= 1 && value <= MAX_CHANNELS;
const roleValid = value => typeof value === 'string' && value.trim().length > 0 && value.length <= 40;

function createServer() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server);
  const shows = new Map();
  app.use(express.static(path.join(__dirname, 'public')));

  io.on('connection', socket => {
    function fail(event, message, ack) {
      socket.emit(event === 'join_show' ? 'join_error' : 'operation_error',
        event === 'join_show' ? message : { event, message });
      if (typeof ack === 'function') ack({ ok: false, error: message });
    }
    function handle(event, callback) {
      socket.on(event, (payload, ack) => {
        if (!object(payload)) return fail(event, 'Invalid payload', ack);
        callback(payload, typeof ack === 'function' ? ack : () => {}, message => fail(event, message, ack));
      });
    }
    function member(showId) {
      return typeof showId === 'string' && socket.data.showId === showId && socket.rooms.has(showId) && shows.get(showId);
    }
    function enter(showId) {
      if (socket.data.showId) socket.leave(socket.data.showId);
      socket.data.showId = showId;
      socket.join(showId);
    }
    const snapshot = (showId, show) => ({ showId, pin: show.pin, config: show });

    handle('create_show', ({ name, channels = 12, role = 'FOH' }, ack, reject) => {
      if (typeof name !== 'string' || !name.trim() || name.length > 100 || !channelCount(channels) || !roleValid(role)) {
        return reject('Invalid show name, channel count (1–24), or role');
      }
      if (shows.size >= 9000) return reject('No Show IDs available');
      // Search from a random offset: no overwrite, even when random values repeat.
      let candidate = randomInt(1000, 10000);
      while (shows.has(String(candidate))) candidate = candidate === 9999 ? 1000 : candidate + 1;
      const showId = String(candidate);
      const show = { name: name.trim(), pin: String(randomInt(1000, 10000)), channels, states: {}, messages: [] };
      shows.set(showId, show);
      enter(showId);
      const data = snapshot(showId, show);
      socket.emit('show_created', data);
      ack({ ok: true });
    });

    handle('join_show', ({ showId, pin, role = 'FOH' }, ack, reject) => {
      const show = typeof showId === 'string' && shows.get(showId);
      if (!show || typeof pin !== 'string' || show.pin !== pin || !roleValid(role)) return reject('Invalid Show ID or PIN');
      enter(showId);
      socket.emit('join_success', snapshot(showId, show));
      ack({ ok: true });
    });

    // Configuration is shared by the room; only an admitted member may change it.
    handle('configure_show', ({ showId, channels }, ack, reject) => {
      const show = member(showId);
      if (!show) return reject('Join the show first');
      if (!channelCount(channels)) return reject('Channel count must be an integer from 1 to 24');
      show.channels = channels;
      for (const chId of Object.keys(show.states)) if (Number(chId) > channels) delete show.states[chId];
      const data = snapshot(showId, show);
      io.to(showId).emit('show_configured', data);
      ack({ ok: true, ...data });
    });

    handle('update_channel', ({ showId, chId, status }, ack, reject) => {
      const show = member(showId);
      if (!show) return reject('Join the show first');
      if (!Number.isInteger(chId) || chId < 1 || chId > show.channels || !STATUSES.has(status)) return reject('Invalid channel or status');
      show.states[chId] = status;
      io.to(showId).emit('state_changed', { showId, chId, status });
      ack({ ok: true });
    });

    handle('new_message', ({ showId, text, sender }, ack, reject) => {
      const show = member(showId);
      if (!show) return reject('Join the show first');
      if (typeof text !== 'string' || !text.trim() || text.length > 2000 || !roleValid(sender)) return reject('Invalid message');
      const message = { text: text.trim(), sender: sender.trim(), timestamp: Date.now() };
      show.messages.push(message);
      if (show.messages.length > 50) show.messages.shift();
      io.to(showId).emit('broadcast_message', message);
      ack({ ok: true });
    });
  });
  return { server, io };
}

if (require.main === module) {
  const { server } = createServer();
  const port = process.env.PORT || 3000;
  server.listen(port, () => console.log(`AV-COMM Server running on port ${port}`));
}
module.exports = { createServer };
