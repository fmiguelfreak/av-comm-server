const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: "*" }
});

app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};

io.on('connection', (socket) => {
    console.log(`[CONNECT] ${socket.id}`);

    socket.on('create_room', (data) => {
        const roomID = `AV-${Math.floor(1000 + Math.random() * 9000)}`;
        const pin = Math.floor(1000 + Math.random() * 9000).toString();

        rooms[roomID] = {
            pin,
            channels: data?.channels || 12,
            states: {}
        };

        socket.join(roomID);
        socket.emit('room_created', { roomID, pin });
    });

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
        } else {
            socket.emit('error_msg', 'ID ou PIN inválido');
        }
    });

    socket.on('update_channel', (data) => {
        const { roomID, channelID, status } = data;
        const rid = roomID?.toUpperCase();

        if (rooms[rid]) {
            rooms[rid].states[channelID] = status;

            io.to(rid).emit('channel_updated', {
                channelID,
                status
            });
        }
    });

    socket.on('voice_msg', (data) => {
        const { roomID, message, sender } = data;
        const rid = roomID?.toUpperCase();

        if (rooms[rid]) {
            io.to(rid).emit('receive_voice', { message, sender });
        }
    });

    socket.on('disconnect', () => {
        console.log(`[DISCONNECT] ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log(`AV-Comm Engine Active on port ${PORT}`);
});
