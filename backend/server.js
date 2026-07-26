// ============================================================
// BidWars - Main Server
// ============================================================
require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const mongoose = require('mongoose');
const session = require('express-session');
const passport = require('passport');
const rateLimit = require('express-rate-limit');
const path = require('path');

// Routes
const authRoutes     = require('./routes/auth');
const auctionRoutes  = require('./routes/auctions');
const bidRoutes      = require('./routes/bids');
const userRoutes     = require('./routes/users');
const adminRoutes    = require('./routes/admin');
const paymentRoutes  = require('./routes/payments');
const categoryRoutes = require('./routes/categories');
const notifRoutes    = require('./routes/notifications');

const socketHandler = require('./utils/socketHandler');
const { verifyEmailTransport } = require('./utils/email');
require('./config/passport');

const app    = express();
const server = http.createServer(app);

// ── Socket.io ────────────────────────────────────────────────
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://127.0.0.1:5500',
  'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:3000',
  'null' // for file:// protocol during dev
];

const io = new Server(server, {
  cors: {
    origin: (origin, cb) => cb(null, true), // allow all in dev
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

app.set('io', io);

// ── Middleware ───────────────────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false }));
app.use(morgan('dev'));

app.use(cors({
  origin: (origin, cb) => cb(null, true),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Stripe webhook needs raw body - must come BEFORE express.json()
app.use('/api/payments/stripe/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'bidwars_session_secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    maxAge: 24 * 60 * 60 * 1000
  }
}));

app.use(passport.initialize());
app.use(passport.session());

// Rate limiting (relaxed for development)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 200 : 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// Serve uploaded images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ── Routes ───────────────────────────────────────────────────
app.use('/api/auth',          authRoutes);
app.use('/api/auctions',      auctionRoutes);
app.use('/api/bids',          bidRoutes);
app.use('/api/users',         userRoutes);
app.use('/api/admin',         adminRoutes);
app.use('/api/payments',      paymentRoutes);
app.use('/api/categories',    categoryRoutes);
app.use('/api/notifications', notifRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
  });
});

// ── 404 handler ──────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// ── Global error handler ─────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Server error:', err.stack);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// ── Socket.io Handler ────────────────────────────────────────
socketHandler(io);

// ── MongoDB Connection ───────────────────────────────────────
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/bidwars';

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('✅ MongoDB connected');
    require('./utils/auctionJobs')(io);
  })
  .catch(err => {
    console.error('❌ MongoDB connection failed:', err.message);
    console.error('   Make sure MONGODB_URI is set in your .env file');
  });

mongoose.connection.on('disconnected', () => console.warn('⚠️  MongoDB disconnected'));
mongoose.connection.on('reconnected', () => console.log('✅ MongoDB reconnected'));

// ── Start Server ─────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log('');
  console.log('╔════════════════════════════════════════╗');
  console.log(`║  🚀 BidWars Server on port ${PORT}          ║`);
  console.log(`║  📡 WebSocket ready                    ║`);
  console.log(`║  🌍 Env: ${(process.env.NODE_ENV || 'development').padEnd(30)}║`);
  console.log('╚════════════════════════════════════════╝');
  console.log('');

  verifyEmailTransport()
    .then(result => {
      if (result.ok) console.log(`📧 Email: ${result.message}`);
      else console.warn(`⚠️  Email: ${result.message}`);
    })
    .catch(err => console.warn(`⚠️  Email verify failed: ${err.message}`));
});

module.exports = { app, io };
