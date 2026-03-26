const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*" }
});

// Servir frontend (se existir /public)
app.use(express.static(path.join(__dirname, 'public')));

// Memória das sessões
const rooms = {};

io.on('connection', (socket) => {
    console.log(`[CONNECT] ${socket.id}`);

    // Criar sala (FOH)
    socket.on('create_room', (data) => {
        const roomID = `AV-${Math.floor(1000 + Math.random() * 9000)}`;
        const pin = Math.floor(1000 + Math.random() * 9000).toString();

        rooms[roomID] = {
            pin: pin,
            channels: data?.channels || 12,
            states: {}
        };

        socket.join(roomID);
        socket.emit('room_created', { roomID, pin });

        console.log(`[CREATE] Room: ${roomID} | PIN: ${pin}`);
    });

    // Entrar na sala (BOH)
    socket.on('join_room', (data) => {
        const { roomID, pin } = data;
        const rid = roomID?.toUpperCase();

        if (rooms[rid] && rooms[rid].pin === pin) {
            socket.join(rid);

            socket.emit('joined_success', {
                roomID: rid,
                channels: rooms[rid].channels,
                states: rooms[rid].states
            });

            console.log(`[JOIN] ${socket.id} joined ${rid}`);
        } else {
            socket.emit('error_msg', 'ID ou PIN Inválido');
        }
    });

    // Atualizar canal
    socket.on('update_channel', (data) => {
        const { roomID, chID, status } = data;
        const rid = roomID?.toUpperCase();

        if (rooms[rid]) {
            rooms[rid].states[chID] = status;

            io.to(rid).emit('channel_updated', {
                chID,
                status
            });
        }
    });

    // Mensagem (chat / voz→texto)
    socket.on('voice_msg', (data) => {
        const { roomID, message, sender } = data;
        const rid = roomID?.toUpperCase();

        if (rooms[rid]) {
            io.to(rid).emit('receive_voice', {
                message,
                sender
            });
        }
    });

    // Sync manual (reconexão)
    socket.on('request_state', (roomID) => {
        const rid = roomID?.toUpperCase();

        if (rooms[rid]) {
            socket.emit('sync_state', {
                channels: rooms[rid].channels,
                states: rooms[rid].states
            });
        }
    });

    socket.on('disconnect', () => {
        console.log(`[DISCONNECT] ${socket.id}`);
    });
});

// Porta Railway
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`AV-Comm Engine Active on port ${PORT}`);
});
