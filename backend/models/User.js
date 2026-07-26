// models/User.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name:     { type: String, required: true, trim: true },
  email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, minlength: 6, select: false },
  avatar:   { type: String, default: '' },
  role:     { type: String, enum: ['buyer', 'seller', 'admin'], default: 'buyer' },

  // OAuth
  googleId:     { type: String },
  facebookId:   { type: String },
  authProvider: { type: String, default: 'local' },

  // 2FA
  twoFactorEnabled: { type: Boolean, default: false },
  twoFactorSecret:  { type: String, select: false },

  // Email verification
  isEmailVerified:          { type: Boolean, default: false },
  emailVerificationToken:   { type: String },
  emailVerificationExpires: { type: Date },

  // Password reset
  passwordResetToken:   { type: String },
  passwordResetExpires: { type: Date },

  // Profile
  phone: { type: String },
  bio:   { type: String, maxlength: 500 },

  // Stats
  totalBids:   { type: Number, default: 0 },
  wonAuctions: { type: Number, default: 0 },
  totalSpent:  { type: Number, default: 0 },
  rating:      { type: Number, default: 5.0, min: 0, max: 5 },
  reviewCount: { type: Number, default: 0 },

  // Payment
  stripeCustomerId: { type: String },

  // Status
  isBanned:  { type: Boolean, default: false },
  banReason: { type: String },

  // Auto-bid settings
  autoBids: [{
    auctionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Auction' },
    maxBid:    { type: Number },
    isActive:  { type: Boolean, default: true }
  }],

  // Notification preferences
  notificationPrefs: {
    email:      { type: Boolean, default: true },
    outbid:     { type: Boolean, default: true },
    auctionEnd: { type: Boolean, default: true }
  },

  watchlist:  [{ type: mongoose.Schema.Types.ObjectId, ref: 'Auction' }],
  interests:  [String],
  lastLogin:  { type: Date }
}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function(next) {
  if (!this.isModified('password') || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Compare password
userSchema.methods.comparePassword = async function(candidate) {
  return bcrypt.compare(candidate, this.password);
};

// Remove sensitive fields from JSON output
userSchema.methods.toJSON = function() {
  const obj = this.toObject();
  delete obj.password;
  delete obj.twoFactorSecret;
  delete obj.emailVerificationToken;
  delete obj.passwordResetToken;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
