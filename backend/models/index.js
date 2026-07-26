// models/index.js - Bid, Notification, Category, Payment, Review
const mongoose = require('mongoose');

// ── Bid ───────────────────────────────────────────────────────
const bidSchema = new mongoose.Schema({
  auction:     { type: mongoose.Schema.Types.ObjectId, ref: 'Auction', required: true },
  bidder:      { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount:      { type: Number, required: true, min: 0 },
  isAutoBid:   { type: Boolean, default: false },
  maxAutoBid:  { type: Number },
  status:      { type: String, enum: ['active', 'outbid', 'won', 'lost'], default: 'active' },
  ipAddress:   { type: String },
  fraudScore:  { type: Number, default: 0 }
}, { timestamps: true });

bidSchema.index({ auction: 1, amount: -1 });
bidSchema.index({ bidder: 1, auction: 1 });

const Bid = mongoose.model('Bid', bidSchema);

// ── Notification ──────────────────────────────────────────────
const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type: {
    type: String,
    enum: ['outbid', 'auction_ending', 'auction_won', 'auction_lost',
           'auction_started', 'payment_received', 'payment_due',
           'new_bid', 'stream_started', 'system'],
    required: true
  },
  title:   { type: String, required: true },
  message: { type: String, required: true },
  auction: { type: mongoose.Schema.Types.ObjectId, ref: 'Auction' },
  isRead:  { type: Boolean, default: false },
  data:    { type: mongoose.Schema.Types.Mixed }
}, { timestamps: true });

notificationSchema.index({ user: 1, isRead: 1 });
notificationSchema.index({ createdAt: -1 });

const Notification = mongoose.model('Notification', notificationSchema);

// ── Category ──────────────────────────────────────────────────
const categorySchema = new mongoose.Schema({
  name:          { type: String, required: true, unique: true },
  slug:          { type: String, required: true, unique: true },
  icon:          { type: String, default: '📦' },
  description:   { type: String },
  subcategories: [String],
  isActive:      { type: Boolean, default: true },
  sortOrder:     { type: Number, default: 0 },
  auctionCount:  { type: Number, default: 0 }
}, { timestamps: true });

const Category = mongoose.model('Category', categorySchema);

// ── Payment ───────────────────────────────────────────────────
const paymentSchema = new mongoose.Schema({
  auction:       { type: mongoose.Schema.Types.ObjectId, ref: 'Auction', required: true },
  buyer:         { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  seller:        { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  amount:        { type: Number, required: true },
  platformFee:   { type: Number, default: 0 },
  sellerAmount:  { type: Number, default: 0 },
  currency:      { type: String, default: 'usd' },
  paymentMethod: { type: String, enum: ['stripe', 'paypal'], required: true },
  status: {
    type: String,
    enum: ['pending', 'processing', 'escrow', 'released', 'refunded', 'failed'],
    default: 'pending'
  },
  stripePaymentIntentId: { type: String },
  paypalOrderId:         { type: String },
  paypalCaptureId:       { type: String },
  escrowHeldAt:          { type: Date },
  releasedAt:            { type: Date }
}, { timestamps: true });

const Payment = mongoose.model('Payment', paymentSchema);

// ── Review ────────────────────────────────────────────────────
const reviewSchema = new mongoose.Schema({
  reviewer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reviewee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  auction:  { type: mongoose.Schema.Types.ObjectId, ref: 'Auction', required: true },
  rating:   { type: Number, required: true, min: 1, max: 5 },
  comment:  { type: String, maxlength: 1000 },
  type:     { type: String, enum: ['buyer', 'seller'], required: true }
}, { timestamps: true });

const Review = mongoose.model('Review', reviewSchema);

module.exports = { Bid, Notification, Category, Payment, Review };
