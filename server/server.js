const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, '../client'), {
    setHeaders: (res, path) => {
        if (path.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
    }
}));

// Serve face-api models
app.use('/models', express.static(path.join(__dirname, '../client/models')));

const rooms = new Map();

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-room', (roomID) => {
        Array.from(socket.rooms).forEach(room => {
            if (room !== socket.id) socket.leave(room);
        });

        socket.join(roomID);
        
        if (!rooms.has(roomID)) {
            rooms.set(roomID, new Set());
        }
        rooms.get(roomID).add(socket.id);
        
        socket.to(roomID).emit('user-connected', socket.id);
        io.to(roomID).emit('participant-count', rooms.get(roomID).size);
    });

    socket.on('signal', (data) => {
        const { roomID, signal } = data;
        socket.to(roomID).emit('signal', { signal, senderID: socket.id });
    });

    socket.on('emotion-data', (data) => {
        socket.to(data.roomID).emit('emotion-data', data);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        rooms.forEach((participants, roomID) => {
            if (participants.has(socket.id)) {
                participants.delete(socket.id);
                if (participants.size === 0) {
                    rooms.delete(roomID);
                } else {
                    io.to(roomID).emit('user-disconnected', socket.id);
                    io.to(roomID).emit('participant-count', participants.size);
                }
            }
        });
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});