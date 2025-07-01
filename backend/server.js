const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

io.on("connection", socket => {
  console.log("Client connected:", socket.id);

  socket.on("join-room", ({ room, name }) => {
    socket.join(room);
    socket.to(room).emit("peer-joined", { name });
  });

  socket.on("offer", ({ room, offer }) => {
    socket.to(room).emit("offer", { offer });
  });

  socket.on("answer", ({ room, answer }) => {
    socket.to(room).emit("answer", { answer });
  });

  socket.on("ice-candidate", ({ room, candidate }) => {
    socket.to(room).emit("ice-candidate", { candidate });
  });
});

server.listen(3000, () => {
  console.log("Signaling server running on http://localhost:3000");
});
