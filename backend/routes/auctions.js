// routes/auctions.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Auction = require('../models/Auction');
const { Bid, Category } = require('../models/index');
const { protect, optionalAuth } = require('../middleware/auth');
const { detectAuctionFraud, getAIPriceRecommendation } = require('../utils/aiFeatures');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(__dirname, '..', 'uploads', 'auctions');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `auction-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024, files: 10 } });

// ── GET ALL AUCTIONS ─────────────────────────────────────────
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { page=1, limit=12, search, category, status, minPrice, maxPrice,
            sort='-createdAt', condition, endingSoon } = req.query;
    const query = {};

    if (search?.trim()) {
      query.$or = [
        { title:       { $regex: search.trim(), $options: 'i' } },
        { description: { $regex: search.trim(), $options: 'i' } },
        { brand:       { $regex: search.trim(), $options: 'i' } }
      ];
    }
    if (category) query.category = category;
    if (status)   query.status = status;
    else          query.status = { $in: ['live', 'scheduled'] };
    if (condition) query.condition = condition;
    if (minPrice || maxPrice) {
      query.currentPrice = {};
      if (minPrice) query.currentPrice.$gte = Number(minPrice);
      if (maxPrice) query.currentPrice.$lte = Number(maxPrice);
    }
    if (endingSoon === 'true') {
      query.endTime = { $lte: new Date(Date.now() + 60*60*1000), $gte: new Date() };
      query.status  = 'live';
    }

    const skip  = (Number(page)-1) * Number(limit);
    const total = await Auction.countDocuments(query);
    const auctions = await Auction.find(query)
      .populate('seller', 'name avatar rating')
      .select('-bids -reports')
      .sort(sort).skip(skip).limit(Number(limit)).lean();

    res.json({ success:true, auctions,
      pagination:{ total, page:Number(page), pages:Math.ceil(total/Number(limit)), limit:Number(limit) }});
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── GET SINGLE AUCTION ───────────────────────────────────────
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const auction = await Auction.findById(req.params.id)
      .populate('seller', 'name avatar rating reviewCount bio')
      .populate('currentWinner', 'name avatar');
    if (!auction) return res.status(404).json({ error: 'Auction not found.' });
    await Auction.findByIdAndUpdate(req.params.id, { $inc: { views: 1 } });
    res.json({ success:true, auction });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── CREATE AUCTION ───────────────────────────────────────────
router.post('/', protect, upload.array('images', 10), async (req, res) => {
  try {
    const { title, description, category, startingPrice, reservePrice,
            buyNowPrice, bidIncrement, startTime, endTime, condition, brand, tags } = req.body;

    if (!title || !description || !category || !startingPrice || !startTime || !endTime)
      return res.status(400).json({ error: 'Missing required fields.' });

    const start = new Date(startTime);
    const end   = new Date(endTime);
    if (isNaN(start.getTime()) || isNaN(end.getTime()))
      return res.status(400).json({ error: 'Invalid dates.' });
    if (end <= start)
      return res.status(400).json({ error: 'End time must be after start time.' });

    if (!req.files || req.files.length === 0)
      return res.status(400).json({ error: 'At least one image upload is required.' });

    const imageUrls = (req.files||[]).map(f => `/uploads/auctions/${f.filename}`);
    const price = Number(startingPrice);

    let aiRec = null, fraudScore = 0;
    try { aiRec = await getAIPriceRecommendation({ category, condition, brand }); } catch(e){}
    try { fraudScore = await detectAuctionFraud({ sellerId:req.user.id, price, title, description, imageCount:imageUrls.length }); } catch(e){}

    const now    = new Date();
    const status = start <= now ? 'live' : 'scheduled';

    const auction = await Auction.create({
      title: title.trim(), description: description.trim(), category,
      seller: req.user.id,
      images: imageUrls, thumbnailImage: imageUrls[0] || '',
      startingPrice: price, currentPrice: price,
      reservePrice:  reservePrice ? Number(reservePrice) : 0,
      buyNowPrice:   buyNowPrice  ? Number(buyNowPrice)  : 0,
      bidIncrement:  bidIncrement ? Number(bidIncrement) : Math.max(1, Math.floor(price*0.01)),
      startTime: start, endTime: end, status,
      condition: condition || 'good', brand: brand || '',
      tags: tags ? (Array.isArray(tags) ? tags : tags.split(',').map(t=>t.trim())) : [],
      aiPriceRecommendation: aiRec?.recommended,
      aiPriceRange: aiRec ? { min:aiRec.min, max:aiRec.max } : undefined,
      fraudScore, isFlagged: fraudScore > 80
    });

    const io = req.app.get('io');
    if (io) io.emit('auction:new', { id:auction._id, title:auction.title, status });

    res.status(201).json({ success:true, auction });
  } catch(err) {
    console.error('Create auction error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── UPDATE AUCTION ───────────────────────────────────────────
router.put('/:id', protect, async (req, res) => {
  try {
    const auction = await Auction.findById(req.params.id);
    if (!auction) return res.status(404).json({ error: 'Auction not found.' });
    if (auction.seller.toString() !== req.user.id && req.user.role !== 'admin')
      return res.status(403).json({ error: 'Not authorized.' });
    if (auction.bidCount > 0 && req.user.role !== 'admin')
      return res.status(400).json({ error: 'Cannot edit auction with bids.' });
    const allowed = ['title','description','reservePrice','buyNowPrice','endTime','condition','brand'];
    allowed.forEach(f => { if (req.body[f] !== undefined) auction[f] = req.body[f]; });
    await auction.save();
    res.json({ success:true, auction });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── WATCH / UNWATCH ──────────────────────────────────────────
router.post('/:id/watch', protect, async (req, res) => {
  try {
    const User = require('../models/User');
    const user = await User.findById(req.user.id);
    const id   = req.params.id;
    const idx  = user.watchlist.findIndex(w => w.toString() === id);
    if (idx > -1) {
      user.watchlist.splice(idx, 1);
      await Auction.findByIdAndUpdate(id, { $inc:{ watchCount:-1 } });
      await user.save({ validateBeforeSave:false });
      return res.json({ success:true, watching:false });
    }
    user.watchlist.push(id);
    await Auction.findByIdAndUpdate(id, { $inc:{ watchCount:1 } });
    await user.save({ validateBeforeSave:false });
    res.json({ success:true, watching:true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── BUY NOW ──────────────────────────────────────────────────
router.post('/:id/buy-now', protect, async (req, res) => {
  try {
    const auction = await Auction.findById(req.params.id);
    if (!auction || auction.status !== 'live') return res.status(400).json({ error: 'Auction not available.' });
    if (!auction.buyNowPrice) return res.status(400).json({ error: 'No Buy Now price.' });
    if (auction.seller.toString() === req.user.id) return res.status(400).json({ error: 'Cannot buy your own item.' });
    auction.status        = 'sold';
    auction.currentPrice  = auction.buyNowPrice;
    auction.currentWinner = req.user.id;
    auction.endTime       = new Date();
    await auction.save();
    const io = req.app.get('io');
    if (io) io.to(`auction_${auction._id}`).emit('auction:sold', { auctionId:auction._id, price:auction.buyNowPrice });
    res.json({ success:true, message:'Item purchased! Proceed to payment.', auction });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── REPORT AUCTION ───────────────────────────────────────────
router.post('/:id/report', protect, async (req, res) => {
  try {
    const { reason, description } = req.body;
    await Auction.findByIdAndUpdate(req.params.id, {
      $push:{ reports:{ reportedBy:req.user.id, reason, description } }
    });
    res.json({ success:true, message:'Report submitted.' });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── MY AUCTIONS (must be before /:id) ───────────────────────
router.get('/seller/my-auctions', protect, async (req, res) => {
  try {
    const auctions = await Auction.find({ seller:req.user.id }).sort('-createdAt').lean();
    res.json({ success:true, auctions });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
