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
    console.log('User connected:', socket.id);

    // CREATE ROOM (Strictly 4-Digit Numeric ID)
    socket.on('create_room', (data) => {
        let roomID;
        do {
            roomID = Math.floor(1000 + Math.random() * 9000).toString();
        } while (rooms[roomID]);

        const pin = Math.floor(1000 + Math.random() * 9000).toString();
        
        rooms[roomID] = {
            pin: pin,
            host: socket.id,
            channels: data.channels || 12,
            showName: data.showName || 'Unnamed Show',
            states: {}
        };

        socket.join(roomID);
        socket.emit('room_created', { roomID, pin, channels: rooms[roomID].channels });
        console.log(`[CREATE] Room: ${roomID} | PIN: ${pin} | Name: ${rooms[roomID].showName}`);
    });

    // JOIN ROOM
    socket.on('join_room', (data) => {
        const { roomID, pin, role } = data;
        const rid = roomID?.toString();
        
        if (rooms[rid] && rooms[rid].pin === pin) {
            socket.join(rid);
            socket.emit('joined_success', { 
                roomID: rid, 
                channels: rooms[rid].channels,
                showName: rooms[rid].showName,
                states: rooms[rid].states 
            });
            console.log(`[JOIN] User ${socket.id} (${role}) joined ${rid}`);
        } else {
            socket.emit('error_msg', 'Invalid Show ID or PIN');
        }
    });

    // UPDATE CHANNEL (Real-time Broadcast)
    socket.on('update_channel', (data) => {
        const { roomID, chID, status, role } = data;
        const rid = roomID?.toString();
        
        if (rooms[rid]) {
            rooms[rid].states[chID] = status;
            // Broadcast to everyone in the room
            io.to(rid).emit('channel_updated', { chID, status, role });
            console.log(`[UPDATE] Room: ${rid} | Ch: ${chID} | Status: ${status} | By: ${role}`);
        }
    });

    // VOICE MESSAGE
    socket.on('voice_msg', (data) => {
        const { roomID, message, sender } = data;
        io.to(roomID).emit('receive_voice', { message, sender });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Event Mics Signaling Bridge v2.3 Active on port ${PORT}`);
});
