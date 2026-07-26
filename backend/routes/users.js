// routes/users.js
const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Auction = require('../models/Auction');
const { Bid } = require('../models/index');
const { protect } = require('../middleware/auth');

router.get('/profile', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .populate('watchlist', 'title currentPrice thumbnailImage status endTime');
    res.json({ success: true, user: user.toJSON() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/profile', protect, async (req, res) => {
  try {
    const allowed = ['name', 'bio', 'phone', 'avatar', 'interests', 'notificationPrefs'];
    const updates = {};
    allowed.forEach(f => { if (req.body[f] !== undefined) updates[f] = req.body[f]; });
    const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true, runValidators: true });
    res.json({ success: true, user: user.toJSON() });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/my-bids', protect, async (req, res) => {
  try {
    const bids = await Bid.find({ bidder: req.user.id })
      .populate('auction', 'title thumbnailImage currentPrice status endTime')
      .sort('-createdAt').limit(50).lean();
    res.json({ success: true, bids });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/won-auctions', protect, async (req, res) => {
  try {
    const auctions = await Auction.find({ currentWinner: req.user.id, status: { $in: ['ended','sold'] } })
      .sort('-updatedAt').lean();
    res.json({ success: true, auctions });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/recommendations', protect, async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    const categories = user.interests?.length ? user.interests : ['electronics','fashion','art'];
    const auctions = await Auction.find({ status:'live', category:{ $in: categories }, seller:{ $ne: req.user.id } })
      .sort('-bidCount').limit(8).lean();
    res.json({ success: true, auctions });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('name avatar rating reviewCount bio createdAt');
    if (!user) return res.status(404).json({ error: 'User not found.' });
    res.json({ success: true, user });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
