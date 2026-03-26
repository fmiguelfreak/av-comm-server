const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve static files from the 'public' folder
app.use(express.static(path.join(__dirname, 'public')));

// In-memory state for active shows
let activeShows = {};

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Create a new show
  socket.on('create_show', ({ name, channels, role }) => {
    const showId = Math.floor(1000 + Math.random() * 9000).toString();
    const pin = Math.floor(1000 + Math.random() * 9000).toString();
    
    activeShows[showId] = {
      name,
      pin,
      channels: parseInt(channels) || 12,
      states: {}, // Stores state for each channel (READY, ALERT, etc.)
      messages: []
    };

    socket.join(showId);
    socket.emit('show_created', { showId, pin, config: activeShows[showId] });
    console.log(`Show created: ${showId} (${name})`);
  });

  // Join an existing show
  socket.on('join_show', ({ showId, pin, role }) => {
    const show = activeShows[showId];
    if (show && show.pin === pin) {
      socket.join(showId);
      socket.emit('join_success', { showId, config: show });
      console.log(`User joined show: ${showId} as ${role}`);
    } else {
      socket.emit('join_error', 'Invalid Show ID or PIN');
    }
  });

  // Update channel status (The Handshake)
  socket.on('update_channel', ({ showId, chId, status }) => {
    if (activeShows[showId]) {
      activeShows[showId].states[chId] = status;
      // Broadcast to everyone in the show room
      io.to(showId).emit('state_changed', { chId, status });
      console.log(`Show ${showId}: Channel ${chId} changed to ${status}`);
    }
  });

  // Voice-to-Text / Chat Messaging
  socket.on('new_message', ({ showId, text, sender }) => {
    if (activeShows[showId]) {
      const message = { text, sender, timestamp: Date.now() };
      activeShows[showId].messages.push(message);
      // Keep only last 50 messages
      if (activeShows[showId].messages.length > 50) activeShows[showId].messages.shift();
      
      io.to(showId).emit('broadcast_message', message);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected');
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`AV-COMM Server running on port ${PORT}`);
});