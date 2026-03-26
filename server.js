web application/stitch/projects/4562373654591413909/screens/b4e999584d334c49a822ed1094640ca5
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

const rooms = {};

io.on('connection', (socket) => {
    console.log('Operator connected:', socket.id);

    // CREATE ROOM (HOST)
    socket.on('create_room', (data) => {
        const roomID = Math.floor(1000 + Math.random() * 9000).toString();
        const pin = Math.floor(1000 + Math.random() * 9000).toString();
        
        rooms[roomID] = {
            pin: pin,
            channels: data.channels || 12,
            showName: data.showName || 'Unnamed Show',
            states: {}
        };

        socket.join(roomID);
        socket.emit('room_created', { roomID, pin, channels: rooms[roomID].channels });
        console.log(`[CREATE] Room: ${roomID} | Name: ${rooms[roomID].showName}`);
    });

    // JOIN ROOM
    socket.on('join_room', (data) => {
        const { roomID, pin, role } = data;
        if (rooms[roomID] && rooms[roomID].pin === pin) {
            socket.join(roomID);
            socket.emit('joined_success', { 
                roomID, 
                channels: rooms[roomID].channels,
                showName: rooms[roomID].showName,
                states: rooms[roomID].states 
            });
            console.log(`[JOIN] User ${socket.id} (${role}) joined ${roomID}`);
        } else {
            socket.emit('error_msg', 'Invalid ID or PIN');
        }
    });

    // UPDATE CHANNEL (SYNC)
    socket.on('update_channel', (data) => {
        const { roomID, chID, status, role } = data;
        if (rooms[roomID]) {
            rooms[roomID].states[chID] = status;
            // Broadcast to everyone in the room
            io.to(roomID).emit('channel_updated', { chID, status, role });
            console.log(`[UPDATE] Room: ${roomID} | Ch: ${chID} | Status: ${status} | By: ${role}`);
        }
    });

    // VOICE MESSAGE
    socket.on('voice_msg', (data) => {
        const { roomID, message, sender } = data;
        io.to(roomID).emit('receive_voice', { message, sender });
    });

    socket.on('disconnect', () => {
        console.log('Operator disconnected');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`AV-Comm v2.1 Engine Active on port ${PORT}`);
});
