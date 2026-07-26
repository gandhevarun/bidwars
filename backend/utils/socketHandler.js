// utils/socketHandler.js - Socket.io real-time handler
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'bidwars_super_secret_jwt_key_change_this_in_production_2024';

module.exports = function(io) {
  const auctionViewers = new Map(); // auctionId -> Set of userIds
  const userSockets   = new Map(); // userId    -> socketId

  // Auth middleware - allows guests
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token;
      if (token) {
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id).select('name avatar role');
        if (user) { socket.user = user; socket.userId = user._id.toString(); }
      }
    } catch(e) { /* guest connection - ok */ }
    next();
  });

  io.on('connection', socket => {
    console.log(`🔌 Socket: ${socket.id} (${socket.userId ? `user:${socket.userId}` : 'guest'})`);

    if (socket.userId) {
      userSockets.set(socket.userId, socket.id);
      socket.join(`user_${socket.userId}`);
    }

    // ── JOIN AUCTION ROOM ────────────────────────────────
    socket.on('auction:join', (auctionId) => {
      if (!auctionId) return;
      socket.join(`auction_${auctionId}`);
      if (!auctionViewers.has(auctionId)) auctionViewers.set(auctionId, new Set());
      if (socket.userId) auctionViewers.get(auctionId).add(socket.userId);
      const count = auctionViewers.get(auctionId).size;
      io.to(`auction_${auctionId}`).emit('auction:viewers', { auctionId, count });
    });

    socket.on('auction:leave', (auctionId) => {
      socket.leave(`auction_${auctionId}`);
      if (socket.userId && auctionViewers.has(auctionId)) {
        auctionViewers.get(auctionId).delete(socket.userId);
        io.to(`auction_${auctionId}`).emit('auction:viewers', {
          auctionId, count: auctionViewers.get(auctionId).size
        });
      }
    });

    // ── LIVE CHAT ────────────────────────────────────────
    socket.on('chat:message', ({ auctionId, message }) => {
      if (!socket.user) return socket.emit('error', { message: 'Login to chat.' });
      if (!message?.trim() || message.length > 300) return;
      io.to(`auction_${auctionId}`).emit('chat:message', {
        id: Date.now(),
        auctionId,
        userId:    socket.userId,
        userName:  socket.user.name,
        message:   message.trim(),
        timestamp: new Date()
      });
    });

    socket.on('chat:typing', ({ auctionId, isTyping }) => {
      if (!socket.user) return;
      socket.to(`auction_${auctionId}`).emit('chat:typing', {
        userId:    socket.userId,
        userName:  socket.user.name,
        isTyping
      });
    });

    // ── WEBRTC / LIVE STREAM ──────────────────────────────
    socket.on('stream:start', ({ auctionId, peerId }) => {
      if (!socket.user) return;
      io.to(`auction_${auctionId}`).emit('stream:started', {
        auctionId, peerId, streamerName: socket.user.name, streamerId: socket.userId
      });
    });

    socket.on('stream:watch', ({ auctionId }) => {
      // Ask streamer to send their peerId
      socket.to(`auction_${auctionId}`).emit('stream:viewer_joined', { auctionId, viewerSocketId: socket.id });
    });

    socket.on('stream:peer_response', ({ viewerSocketId, peerId }) => {
      io.to(viewerSocketId).emit('stream:peer_id', { peerId });
    });

    socket.on('stream:end', ({ auctionId }) => {
      io.to(`auction_${auctionId}`).emit('stream:ended', { auctionId });
    });

    // WebRTC manual signaling (fallback)
    socket.on('webrtc:offer',  ({ to, offer })      => io.to(to).emit('webrtc:offer',  { from:socket.id, offer }));
    socket.on('webrtc:answer', ({ to, answer })     => io.to(to).emit('webrtc:answer', { from:socket.id, answer }));
    socket.on('webrtc:ice',    ({ to, candidate })  => io.to(to).emit('webrtc:ice',    { from:socket.id, candidate }));

    // ── DISCONNECT ───────────────────────────────────────
    socket.on('disconnect', () => {
      if (socket.userId) {
        userSockets.delete(socket.userId);
        auctionViewers.forEach((set, auctionId) => {
          if (set.has(socket.userId)) {
            set.delete(socket.userId);
            io.to(`auction_${auctionId}`).emit('auction:viewers', { auctionId, count:set.size });
          }
        });
      }
    });

    socket.on('ping', () => socket.emit('pong', { ts: Date.now() }));
  });
};
