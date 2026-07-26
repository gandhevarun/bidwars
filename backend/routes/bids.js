// routes/bids.js - Bidding with auto-bid system
const express = require('express');
const router = express.Router();
const Auction = require('../models/Auction');
const { Bid, Notification } = require('../models/index');
const User = require('../models/User');
const { protect } = require('../middleware/auth');
const { detectBidFraud } = require('../utils/aiFeatures');
const { createNotification } = require('../utils/notifications');

// ── PLACE A BID ──────────────────────────────────────────────
router.post('/:auctionId', protect, async (req, res) => {
  try {
    const { amount, maxAutoBid } = req.body;
    const bidAmount = Number(amount);
    const io = req.app.get('io');

    const auction = await Auction.findById(req.params.auctionId);

    if (!auction) return res.status(404).json({ error: 'Auction not found' });
    if (auction.status !== 'live') return res.status(400).json({ error: 'Auction is not active' });
    if (auction.seller.toString() === req.user.id) return res.status(400).json({ error: 'You cannot bid on your own auction' });
    if (new Date() > auction.endTime) return res.status(400).json({ error: 'Auction has ended' });

    const minBid = auction.currentPrice + (auction.bidCount > 0 ? auction.bidIncrement : 0);
    if (bidAmount < minBid) {
      return res.status(400).json({ error: `Minimum bid is $${minBid.toFixed(2)}` });
    }

    // Fraud detection
    const fraudScore = await detectBidFraud({
      bidderId: req.user.id,
      auctionId: auction._id,
      amount: bidAmount,
      ip: req.ip
    });

    if (fraudScore > 90) {
      return res.status(400).json({ error: 'Bid flagged as suspicious. Please contact support.' });
    }

    // Get previous winner to notify
    const previousWinner = auction.currentWinner;

    // Create the bid
    const bid = new Bid({
      auction: auction._id,
      bidder: req.user.id,
      amount: bidAmount,
      maxAutoBid: maxAutoBid ? Number(maxAutoBid) : undefined,
      isAutoBid: false,
      fraudScore,
      ipAddress: req.ip
    });
    await bid.save();

    // Update previous winning bid status
    await Bid.updateMany(
      { auction: auction._id, bidder: { $ne: req.user.id }, status: 'active' },
      { status: 'outbid' }
    );

    // Update auction
    auction.currentPrice = bidAmount;
    auction.currentWinner = req.user.id;
    auction.bids.push(bid._id);
    auction.bidCount += 1;
    if (auction.reservePrice > 0 && bidAmount >= auction.reservePrice) {
      auction.reserveMet = true;
    }

    // Auto-extend: if bid placed in last 2 minutes, extend by 2 minutes
    const twoMinutes = 2 * 60 * 1000;
    if (auction.endTime - new Date() < twoMinutes) {
      auction.endTime = new Date(Date.now() + twoMinutes);
    }

    await auction.save();

    // Update user stats
    await User.findByIdAndUpdate(req.user.id, { $inc: { totalBids: 1 } });

    // Set auto-bid if provided
    if (maxAutoBid && Number(maxAutoBid) > bidAmount) {
      await setAutoBid(req.user.id, auction._id, Number(maxAutoBid));
    }

    // Notify previous winner they've been outbid
    if (previousWinner && previousWinner.toString() !== req.user.id) {
      await createNotification({
        userId: previousWinner,
        type: 'outbid',
        title: 'You\'ve been outbid!',
        message: `Someone outbid you on "${auction.title}". Current price: $${bidAmount}`,
        auctionId: auction._id
      });
      io.to(`user_${previousWinner}`).emit('notification:outbid', {
        auctionId: auction._id,
        auctionTitle: auction.title,
        newBid: bidAmount
      });
    }

    // Emit real-time bid update to all watching
    const bidData = {
      auctionId: auction._id,
      amount: bidAmount,
      bidder: { id: req.user.id, name: req.user.name },
      bidCount: auction.bidCount,
      endTime: auction.endTime,
      reserveMet: auction.reserveMet,
      timestamp: new Date()
    };

    io.to(`auction_${auction._id}`).emit('bid:new', bidData);

    // Process auto-bids for other users
    processAutoBids(auction, req.user.id, io).catch(console.error);

    res.status(201).json({
      success: true,
      bid: { ...bid.toObject(), amount: bidAmount },
      auction: { currentPrice: auction.currentPrice, bidCount: auction.bidCount, endTime: auction.endTime }
    });
  } catch (err) {
    console.error('Bid error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── AUTO-BID SYSTEM ──────────────────────────────────────────
async function setAutoBid(userId, auctionId, maxBid) {
  await User.findByIdAndUpdate(
    userId,
    {
      $pull: { autoBids: { auctionId } }, // Remove existing
    }
  );
  await User.findByIdAndUpdate(
    userId,
    {
      $push: { autoBids: { auctionId, maxBid, isActive: true } }
    }
  );
}

async function processAutoBids(auction, currentBidderId, io) {
  try {
    // Find all users with active auto-bids on this auction (except current winner)
    const users = await User.find({
      'autoBids.auctionId': auction._id,
      'autoBids.isActive': true,
      _id: { $ne: currentBidderId }
    });

    if (users.length === 0) return;

    // Find the user with the highest max bid
    let bestAutoBidder = null;
    let bestMaxBid = 0;

    for (const user of users) {
      const autoBid = user.autoBids.find(
        ab => ab.auctionId.toString() === auction._id.toString() && ab.isActive
      );
      if (autoBid && autoBid.maxBid > bestMaxBid) {
        bestMaxBid = autoBid.maxBid;
        bestAutoBidder = { user, maxBid: autoBid.maxBid };
      }
    }

    if (!bestAutoBidder) return;

    const currentPrice = auction.currentPrice;
    const nextBid = currentPrice + auction.bidIncrement;

    if (bestAutoBidder.maxBid < nextBid) {
      // Auto-bidder can't afford next increment - deactivate
      await User.findOneAndUpdate(
        { _id: bestAutoBidder.user._id, 'autoBids.auctionId': auction._id },
        { $set: { 'autoBids.$.isActive': false } }
      );
      return;
    }

    // Calculate auto-bid amount (just enough to win)
    const autoBidAmount = Math.min(nextBid, bestAutoBidder.maxBid);

    // Create auto-bid
    const bid = new Bid({
      auction: auction._id,
      bidder: bestAutoBidder.user._id,
      amount: autoBidAmount,
      maxAutoBid: bestAutoBidder.maxBid,
      isAutoBid: true
    });
    await bid.save();

    // Update previous bids
    await Bid.updateMany(
      { auction: auction._id, bidder: { $ne: bestAutoBidder.user._id }, status: 'active' },
      { status: 'outbid' }
    );

    const previousWinner = auction.currentWinner;

    // Update auction
    auction.currentPrice = autoBidAmount;
    auction.currentWinner = bestAutoBidder.user._id;
    auction.bids.push(bid._id);
    auction.bidCount += 1;
    if (auction.reservePrice > 0 && autoBidAmount >= auction.reservePrice) {
      auction.reserveMet = true;
    }
    await auction.save();

    await User.findByIdAndUpdate(bestAutoBidder.user._id, { $inc: { totalBids: 1 } });

    // Notify previous winner
    if (previousWinner && previousWinner.toString() !== bestAutoBidder.user._id.toString()) {
      await createNotification({
        userId: previousWinner,
        type: 'outbid',
        title: 'Auto-bid outbid you!',
        message: `Another user's auto-bid exceeded yours on "${auction.title}". New price: $${autoBidAmount}`,
        auctionId: auction._id
      });
      io.to(`user_${previousWinner}`).emit('notification:outbid', {
        auctionId: auction._id,
        auctionTitle: auction.title,
        newBid: autoBidAmount,
        isAutoBid: true
      });
    }

    // Emit to room
    io.to(`auction_${auction._id}`).emit('bid:new', {
      auctionId: auction._id,
      amount: autoBidAmount,
      bidder: { id: bestAutoBidder.user._id, name: 'Auto-bid' },
      bidCount: auction.bidCount,
      endTime: auction.endTime,
      isAutoBid: true,
      timestamp: new Date()
    });

    // Recursively process more auto-bids if needed
    await processAutoBids(auction, bestAutoBidder.user._id, io);
  } catch (err) {
    console.error('Auto-bid processing error:', err);
  }
}

// ── SET AUTO-BID ─────────────────────────────────────────────
router.post('/:auctionId/autobid', protect, async (req, res) => {
  try {
    const { maxBid } = req.body;
    const auction = await Auction.findById(req.params.auctionId);

    if (!auction || auction.status !== 'live') {
      return res.status(400).json({ error: 'Auction not available' });
    }
    if (Number(maxBid) <= auction.currentPrice) {
      return res.status(400).json({ error: `Max bid must be above current price $${auction.currentPrice}` });
    }

    await setAutoBid(req.user.id, auction._id, Number(maxBid));

    // If current price < user's max, place initial bid
    const nextBid = auction.currentPrice + auction.bidIncrement;
    if (auction.currentWinner?.toString() !== req.user.id && Number(maxBid) >= nextBid) {
      const io = req.app.get('io');
      // Simulate auto-bid being triggered
      auction.currentWinner = null; // Temporarily clear to allow processing
      await processAutoBids(auction, 'trigger', io);
    }

    res.json({ success: true, message: `Auto-bid set to max $${maxBid}` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET BID HISTORY ──────────────────────────────────────────
router.get('/:auctionId/history', async (req, res) => {
  try {
    const bids = await Bid.find({ auction: req.params.auctionId })
      .populate('bidder', 'name avatar')
      .sort('-createdAt')
      .limit(50)
      .lean();

    // Mask bidder names for privacy (show only first name + last initial)
    const maskedBids = bids.map(b => ({
      ...b,
      bidder: {
        ...b.bidder,
        name: b.bidder?.name ? maskName(b.bidder.name) : 'Anonymous'
      }
    }));

    res.json({ success: true, bids: maskedBids });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function maskName(name) {
  const parts = name.split(' ');
  if (parts.length === 1) return parts[0][0] + '***';
  return parts[0] + ' ' + parts[parts.length - 1][0] + '.';
}

module.exports = router;
