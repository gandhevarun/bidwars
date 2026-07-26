// routes/auth.js
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const speakeasy = require('speakeasy');
const qrcode = require('qrcode');
const passport = require('passport');
const User = require('../models/User');
const { sendEmail } = require('../utils/email');
const { protect } = require('../middleware/auth');

const JWT_SECRET = process.env.JWT_SECRET || 'bidwars_super_secret_jwt_key_change_this_in_production_2024';
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://127.0.0.1:5500';

const generateToken = (userId) =>
  jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '7d' });

// ── REGISTER ────────────────────────────────────────────────
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    }

    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) return res.status(400).json({ error: 'Email already registered.' });

    const user = await User.create({
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password,
      role: role === 'seller' ? 'seller' : 'buyer',
      isEmailVerified: true // Auto-verify for easier dev/college use
    });

    // Send welcome email (non-blocking)
    sendEmail({
      to: email,
      subject: 'Welcome to BidWars! 🎉',
      html: `<h2>Welcome to BidWars, ${name}!</h2><p>Your account has been created successfully.</p><p>Happy bidding!</p>`
    }).catch(() => {});

    const token = generateToken(user._id);
    res.status(201).json({ success: true, token, user: user.toJSON() });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── LOGIN ────────────────────────────────────────────────────
router.post('/login', async (req, res) => {
  try {
    const { email, password, twoFactorCode } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password +twoFactorSecret');
    if (!user || !user.password) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid email or password.' });

    if (user.isBanned) {
      return res.status(403).json({ error: `Account banned. Reason: ${user.banReason || 'Terms violation'}` });
    }

    // 2FA check
    if (user.twoFactorEnabled) {
      if (!twoFactorCode) {
        return res.status(200).json({ requires2FA: true, message: 'Enter your 2FA code.' });
      }
      const valid = speakeasy.totp.verify({
        secret: user.twoFactorSecret, encoding: 'base32',
        token: twoFactorCode, window: 2
      });
      if (!valid) return res.status(401).json({ error: 'Invalid 2FA code.' });
    }

    user.lastLogin = new Date();
    await user.save({ validateBeforeSave: false });

    const token = generateToken(user._id);
    res.json({ success: true, token, user: user.toJSON() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET CURRENT USER ─────────────────────────────────────────
router.get('/me', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ success: true, user: user.toJSON() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── FORGOT PASSWORD ──────────────────────────────────────────
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: email?.toLowerCase() });
    if (user) {
      const resetToken = crypto.randomBytes(32).toString('hex');
      user.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
      user.passwordResetExpires = Date.now() + 60 * 60 * 1000;
      await user.save({ validateBeforeSave: false });
      const resetUrl = `${FRONTEND_URL}#reset-password?token=${resetToken}`;
      sendEmail({
        to: email,
        subject: 'BidWars Password Reset',
        html: `<h2>Reset Your Password</h2><p>Click below (expires in 1 hour):</p><a href="${resetUrl}" style="background:#f59e0b;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;">Reset Password</a>`
      }).catch(() => {});
    }
    // Always return success to prevent email enumeration
    res.json({ success: true, message: 'If that email exists, a reset link was sent.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── TEST EMAIL (dev/admin support) ──────────────────────────
router.post('/test-email', protect, async (req, res) => {
  try {
    const targetEmail = (req.body?.to || req.user.email || '').toLowerCase().trim();
    if (!targetEmail) return res.status(400).json({ error: 'Recipient email is required.' });

    await sendEmail({
      to: targetEmail,
      subject: 'BidWars Email Test',
      html: `<h2>BidWars Email Test</h2><p>Hello ${req.user.name || 'User'}, your SMTP setup is working.</p><p>Sent at: ${new Date().toISOString()}</p>`,
      text: `BidWars email test. Sent at ${new Date().toISOString()}`
    });

    res.json({ success: true, message: `Test email processed for ${targetEmail}.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── RESET PASSWORD ───────────────────────────────────────────
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ error: 'Token and password required.' });

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });
    if (!user) return res.status(400).json({ error: 'Invalid or expired reset token.' });

    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();
    res.json({ success: true, message: 'Password reset successfully!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── SETUP 2FA ────────────────────────────────────────────────
router.post('/2fa/setup', protect, async (req, res) => {
  try {
    const secret = speakeasy.generateSecret({ name: `BidWars (${req.user.email})`, length: 20 });
    const user = await User.findById(req.user.id);
    user.twoFactorSecret = secret.base32;
    await user.save({ validateBeforeSave: false });
    const qrCode = await qrcode.toDataURL(secret.otpauth_url);
    res.json({ success: true, qrCode, secret: secret.base32 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── ENABLE 2FA ───────────────────────────────────────────────
router.post('/2fa/enable', protect, async (req, res) => {
  try {
    const { code } = req.body;
    const user = await User.findById(req.user.id).select('+twoFactorSecret');
    const valid = speakeasy.totp.verify({
      secret: user.twoFactorSecret, encoding: 'base32', token: code, window: 2
    });
    if (!valid) return res.status(400).json({ error: 'Invalid code.' });
    user.twoFactorEnabled = true;
    await user.save({ validateBeforeSave: false });
    res.json({ success: true, message: '2FA enabled!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GOOGLE OAUTH ─────────────────────────────────────────────
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get('/google/callback',
  passport.authenticate('google', { session: false, failureRedirect: `${FRONTEND_URL}#login?error=oauth_failed` }),
  (req, res) => {
    const token = generateToken(req.user._id);
    res.redirect(`${FRONTEND_URL}#oauth-callback?token=${token}`);
  }
);

// ── FACEBOOK OAUTH ───────────────────────────────────────────
router.get('/facebook',
  passport.authenticate('facebook', { scope: ['email'] })
);

router.get('/facebook/callback',
  passport.authenticate('facebook', { session: false, failureRedirect: `${FRONTEND_URL}#login?error=oauth_failed` }),
  (req, res) => {
    const token = generateToken(req.user._id);
    res.redirect(`${FRONTEND_URL}#oauth-callback?token=${token}`);
  }
);

module.exports = router;
