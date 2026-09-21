const { test } = require('node:test');
const assert = require('node:assert/strict');
const { io: connect } = require('socket.io-client');
const { createServer } = require('../server');

const event = (socket, name) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => { socket.off(name, done); reject(new Error(`Timeout: ${name}`)); }, 3000);
  function done(data) { clearTimeout(timer); resolve(data); }
  socket.once(name, done);
});
const ack = (socket, name, data) => new Promise((resolve, reject) => {
  socket.timeout(3000).emit(name, data, (err, response) => err ? reject(err) : resolve(response));
});

test('AV-COMM real Socket.IO workflow and input boundaries', async t => {
  const { server, io } = createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const clients = [];
  t.after(async () => { clients.forEach(client => client.disconnect()); await new Promise(resolve => io.close(resolve)); });
  async function client() {
    const socket = connect(url, { forceNew: true, autoConnect: false, reconnectionDelay: 10 });
    clients.push(socket); const connected = event(socket, 'connect'); socket.connect(); await connected; return socket;
  }
  const a = await client(), b = await client(), outsider = await client();
  let showId, pin;
  await t.test('A: create and configure to 16 channels; navigation socket rejoins', async () => {
    const created = event(a, 'show_created');
    assert.equal((await ack(a, 'create_show', { name: 'AUDIT_SHOW', channels: 12, role: 'FOH' })).ok, true);
    ({ showId, pin } = await created);
    const configured = event(a, 'show_configured');
    assert.equal((await ack(a, 'configure_show', { showId, channels: 16 })).ok, true);
    assert.equal((await configured).config.channels, 16);
    a.disconnect(); const reconnected = event(a, 'connect'); a.connect(); await reconnected;
    const joined = event(a, 'join_success');
    await ack(a, 'join_show', { showId, pin, role: 'FOH' });
    assert.equal((await joined).config.channels, 16);
  });
  await t.test('B: second client enters the same show', async () => {
    const joined = event(b, 'join_success'); await ack(b, 'join_show', { showId, pin, role: 'BOH' });
    assert.equal((await joined).showId, showId);
  });
  await t.test('C: A → B and sender receive READY', async () => {
    const remote = event(b, 'state_changed'), self = event(a, 'state_changed');
    await ack(a, 'update_channel', { showId, chId: 16, status: 'READY' });
    assert.deepEqual(await remote, { showId, chId: 16, status: 'READY' });
    assert.equal((await self).status, 'READY');
  });
  await t.test('D: B → A receives ALERT', async () => {
    const remote = event(a, 'state_changed'); await ack(b, 'update_channel', { showId, chId: 2, status: 'ALERT' });
    assert.equal((await remote).status, 'ALERT');
  });
  await t.test('E: incorrect PIN is denied', async () => {
    const rejected = event(outsider, 'join_error');
    assert.equal((await ack(outsider, 'join_show', { showId, pin: '0000', role: 'FOH' })).ok, false);
    assert.match(await rejected, /Invalid/);
  });
  await t.test('F: transport reconnect triggers rejoin and current snapshot', async () => {
    b.on('connect', () => b.emit('join_show', { showId, pin, role: 'BOH' }));
    const disconnected = event(b, 'disconnect');
    b.io.engine.close(); await disconnected;
    await ack(a, 'update_channel', { showId, chId: 3, status: 'EMERGENCY' });
    // Rejoin also verifies missed updates by explicitly requesting the snapshot after reconnection.
    if (!b.connected) await event(b, 'connect');
    const joined = event(b, 'join_success'); await ack(b, 'join_show', { showId, pin, role: 'BOH' });
    const state = (await joined).config.states;
    assert.equal(state[16], 'READY'); assert.equal(state[2], 'ALERT'); assert.equal(state[3], 'EMERGENCY');
  });
  await t.test('G: outsider cannot update, configure, or send messages', async () => {
    for (const [name, payload] of [
      ['update_channel', { showId, chId: 1, status: 'READY' }],
      ['configure_show', { showId, channels: 1 }],
      ['new_message', { showId, text: 'intrusion', sender: 'FOH' }]
    ]) assert.equal((await ack(outsider, name, payload)).ok, false);
    const joined = event(a, 'join_success'); await ack(a, 'join_show', { showId, pin });
    const state = (await joined).config; assert.equal(state.states[1], undefined); assert.equal(state.messages.length, 0); assert.equal(state.channels, 16);
  });
  await t.test('null, missing, arrays, invalid channels/statuses do not throw', async () => {
    for (const name of ['create_show', 'join_show', 'configure_show', 'update_channel', 'new_message']) {
      for (const payload of [null, undefined, [], {}]) assert.equal((await ack(outsider, name, payload)).ok, false);
    }
    for (const channels of [-1, 0, 25, 1.5, '12']) assert.equal((await ack(a, 'configure_show', { showId, channels })).ok, false);
    for (const chId of [0, 17, '1', null]) assert.equal((await ack(a, 'update_channel', { showId, chId, status: 'READY' })).ok, false);
    assert.equal((await ack(a, 'update_channel', { showId, chId: 1, status: 'INVALID' })).ok, false);
  });
  await t.test('configuration is broadcast and removes out-of-range state', async () => {
    const configured = event(b, 'show_configured'); await ack(a, 'configure_show', { showId, channels: 1 });
    const show = (await configured).config; assert.equal(show.channels, 1); assert.deepEqual(show.states, {});
  });
  await t.test('admitted chat is delivered and capped at 50 messages', async () => {
    const message = event(b, 'broadcast_message'); await ack(a, 'new_message', { showId, text: 'hello', sender: 'FOH' });
    assert.equal((await message).text, 'hello');
    for (let i = 0; i < 51; i++) await ack(a, 'new_message', { showId, text: String(i), sender: 'FOH' });
    const joined = event(a, 'join_success'); await ack(a, 'join_show', { showId, pin });
    assert.equal((await joined).config.messages.length, 50);
  });
});

test('repeated random IDs cannot overwrite rooms', async t => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const sandbox = { require: name => name === 'crypto' ? { randomInt: () => 1234 } : require(name), module: { exports: {} }, __dirname: require('node:path').resolve(__dirname, '..') };
  vm.runInNewContext(fs.readFileSync(require.resolve('../server'), 'utf8'), sandbox);
  const { server, io } = sandbox.module.exports.createServer();
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const socket = connect(`http://127.0.0.1:${server.address().port}`, { autoConnect: false });
  t.after(async () => { socket.disconnect(); await new Promise(resolve => io.close(resolve)); });
  const connected = event(socket, 'connect'); socket.connect(); await connected;
  for (const id of ['1234', '1235']) {
    const created = event(socket, 'show_created'); await ack(socket, 'create_show', { name: id, channels: 12 });
    assert.equal((await created).showId, id);
  }
  const joined = event(socket, 'join_success'); await ack(socket, 'join_show', { showId: '1234', pin: '1234' });
  assert.equal((await joined).config.name, '1234');
});
