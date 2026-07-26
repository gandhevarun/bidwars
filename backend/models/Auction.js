// models/Auction.js
const mongoose = require('mongoose');

const auctionSchema = new mongoose.Schema({
  title:       { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, required: true, maxlength: 5000 },
  category:    { type: String, required: true },

  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  images:         [{ type: String }],
  thumbnailImage: { type: String, default: '' },

  // Pricing
  startingPrice: { type: Number, required: true, min: 0 },
  reservePrice:  { type: Number, default: 0 },
  currentPrice:  { type: Number, required: true },
  buyNowPrice:   { type: Number, default: 0 },
  bidIncrement:  { type: Number, default: 1 },
  reserveMet:    { type: Boolean, default: false },

  // Timing
  startTime: { type: Date, required: true },
  endTime:   { type: Date, required: true },

  // Status
  status: {
    type: String,
    enum: ['draft', 'scheduled', 'live', 'ended', 'cancelled', 'sold'],
    default: 'draft'
  },

  // Bids
  bids:          [{ type: mongoose.Schema.Types.ObjectId, ref: 'Bid' }],
  bidCount:      { type: Number, default: 0 },
  currentWinner: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  // Live stream
  isLiveStream: { type: Boolean, default: false },
  streamStatus: { type: String, enum: ['offline', 'live'], default: 'offline' },
  streamPeerId: { type: String },

  // Item details
  condition: {
    type: String,
    enum: ['new', 'like-new', 'excellent', 'good', 'fair', 'poor'],
    default: 'good'
  },
  brand: { type: String },
  tags:  [String],

  // AI data
  aiPriceRecommendation: { type: Number },
  aiPriceRange:          { min: Number, max: Number },
  fraudScore:            { type: Number, default: 0 },
  isFlagged:             { type: Boolean, default: false },
  flagReason:            { type: String },

  // Analytics
  views:    { type: Number, default: 0 },
  watchCount: { type: Number, default: 0 },

  // Payment
  paymentStatus: {
    type: String,
    enum: ['pending', 'escrow', 'released', 'refunded'],
    default: 'pending'
  },

  // Reports
  reports: [{
    reportedBy:  { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reason:      String,
    description: String,
    createdAt:   { type: Date, default: Date.now }
  }]
}, { timestamps: true });

// Text search index
auctionSchema.index({ title: 'text', description: 'text', brand: 'text', tags: 'text' });
auctionSchema.index({ status: 1, endTime: 1 });
auctionSchema.index({ category: 1, status: 1 });
auctionSchema.index({ seller: 1 });

module.exports = mongoose.model('Auction', auctionSchema);
