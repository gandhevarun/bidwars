// routes/admin.js - Admin panel routes
const express = require('express');
const router = express.Router();
const Auction = require('../models/Auction');
const { Bid, Notification, Payment, Category } = require('../models/index');
const User = require('../models/User');
const { protect, adminOnly } = require('../middleware/auth');

// All admin routes require auth + admin role
router.use(protect, adminOnly);

// ── DASHBOARD STATS ──────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const [
      totalUsers, newUsersToday, totalAuctions, liveAuctions,
      totalBids, totalRevenue, flaggedAuctions, totalPayments
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ createdAt: { $gte: new Date(new Date().setHours(0,0,0,0)) } }),
      Auction.countDocuments(),
      Auction.countDocuments({ status: 'live' }),
      Bid.countDocuments(),
      Payment.aggregate([{ $match: { status: { $in: ['escrow', 'released'] } } }, { $group: { _id: null, total: { $sum: '$platformFee' } } }]),
      Auction.countDocuments({ isFlagged: true }),
      Payment.countDocuments({ status: { $in: ['escrow', 'released'] } })
    ]);

    // Revenue by month (last 6 months)
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const revenueByMonth = await Payment.aggregate([
      { $match: { createdAt: { $gte: sixMonthsAgo }, status: { $in: ['escrow', 'released'] } } },
      { $group: {
        _id: { year: { $year: '$createdAt' }, month: { $month: '$createdAt' } },
        revenue: { $sum: '$platformFee' },
        count: { $sum: 1 }
      }},
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    // Top categories
    const topCategories = await Auction.aggregate([
      { $group: { _id: '$category', count: { $sum: 1 }, totalValue: { $sum: '$currentPrice' } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);

    // Auction status breakdown
    const auctionsByStatus = await Auction.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } }
    ]);

    res.json({
      success: true,
      stats: {
        totalUsers,
        newUsersToday,
        totalAuctions,
        liveAuctions,
        totalBids,
        platformRevenue: totalRevenue[0]?.total || 0,
        flaggedAuctions,
        totalPayments
      },
      revenueByMonth,
      topCategories,
      auctionsByStatus
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── MANAGE USERS ─────────────────────────────────────────────
router.get('/users', async (req, res) => {
  try {
    const { page = 1, limit = 20, search, role, status } = req.query;
    const query = {};
    if (search) query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } }
    ];
    if (role) query.role = role;
    if (status === 'banned') query.isBanned = true;
    if (status === 'active') query.isBanned = false;

    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .select('-password -twoFactorSecret')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({ success: true, users, total, pages: Math.ceil(total / limit) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/users/:id/ban', async (req, res) => {
  try {
    const { reason } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isBanned: true, banReason: reason || 'Violated terms of service' },
      { new: true }
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, message: `User ${user.name} banned.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/users/:id/unban', async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { isBanned: false, banReason: undefined },
      { new: true }
    );
    res.json({ success: true, message: `User ${user.name} unbanned.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/users/:id/role', async (req, res) => {
  try {
    const { role } = req.body;
    if (!['buyer', 'seller', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── MANAGE AUCTIONS ──────────────────────────────────────────
router.get('/auctions', async (req, res) => {
  try {
    const { page = 1, limit = 20, status, flagged } = req.query;
    const query = {};
    if (status) query.status = status;
    if (flagged === 'true') query.isFlagged = true;

    const total = await Auction.countDocuments(query);
    const auctions = await Auction.find(query)
      .populate('seller', 'name email')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({ success: true, auctions, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/auctions/:id/approve', async (req, res) => {
  try {
    const auction = await Auction.findByIdAndUpdate(
      req.params.id,
      { isFlagged: false, flagReason: undefined, status: 'live' },
      { new: true }
    );
    res.json({ success: true, auction });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/auctions/:id/cancel', async (req, res) => {
  try {
    const { reason } = req.body;
    const auction = await Auction.findByIdAndUpdate(
      req.params.id,
      { status: 'cancelled', flagReason: reason },
      { new: true }
    );
    res.json({ success: true, auction });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── MANAGE CATEGORIES ─────────────────────────────────────────
router.get('/categories', async (req, res) => {
  try {
    const categories = await Category.find().sort('sortOrder');
    res.json({ success: true, categories });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/categories', async (req, res) => {
  try {
    const { name, slug, icon, description, subcategories } = req.body;
    const category = new Category({ name, slug, icon, description, subcategories: subcategories || [] });
    await category.save();
    res.status(201).json({ success: true, category });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── REPORTS ──────────────────────────────────────────────────
router.get('/reported-auctions', async (req, res) => {
  try {
    const auctions = await Auction.find({ 'reports.0': { $exists: true } })
      .populate('seller', 'name email')
      .populate('reports.reportedBy', 'name email')
      .sort('-createdAt');
    res.json({ success: true, auctions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── PAYMENTS OVERVIEW ─────────────────────────────────────────
router.get('/payments', async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const query = status ? { status } : {};

    const total = await Payment.countDocuments(query);
    const payments = await Payment.find(query)
      .populate('auction', 'title')
      .populate('buyer', 'name email')
      .populate('seller', 'name email')
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({ success: true, payments, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── BROADCAST NOTIFICATION ────────────────────────────────────
router.post('/broadcast', async (req, res) => {
  try {
    const { title, message, type = 'system' } = req.body;
    const io = req.app.get('io');

    // Send to all connected users
    io.emit('notification:broadcast', { title, message, type });

    res.json({ success: true, message: 'Broadcast sent!' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

// ── UNIFIED USER UPDATE (for frontend compatibility) ─────────
router.put('/users/:id', async (req, res) => {
  try {
    const { isBanned, banReason, role } = req.body;
    const update = {};
    if (isBanned !== undefined) {
      update.isBanned = isBanned;
      update.banReason = isBanned ? (banReason || 'Violated terms of service') : '';
    }
    if (role && ['buyer', 'seller', 'admin'].includes(role)) update.role = role;
    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── UNIFIED AUCTION ACTION ───────────────────────────────────
router.put('/auctions/:id', async (req, res) => {
  try {
    const { action, reason } = req.body;
    let update = {};
    if (action === 'approve') update = { isFlagged: false, flagReason: '', status: 'live' };
    else if (action === 'cancel') update = { status: 'cancelled', flagReason: reason || 'Removed by admin' };
    else if (action === 'flag') update = { isFlagged: true, flagReason: reason };
    else update = req.body; // allow direct field updates
    const auction = await Auction.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!auction) return res.status(404).json({ error: 'Auction not found' });
    res.json({ success: true, auction });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
