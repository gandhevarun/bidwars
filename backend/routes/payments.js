// routes/payments.js - Stripe + PayPal sandbox with escrow
const express = require('express');
const router  = express.Router();
const Stripe  = require('stripe');
const stripe  = new Stripe(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');
const axios   = require('axios');
const Auction = require('../models/Auction');
const { Payment } = require('../models/index');
const User    = require('../models/User');
const { protect } = require('../middleware/auth');
const { createNotification } = require('../utils/notifications');

const FEE = 0.05;

// ── STRIPE: Create Payment Intent ───────────────────────────
router.post('/stripe/create-intent', protect, async (req, res) => {
  try {
    const { auctionId } = req.body;
    const auction = await Auction.findById(auctionId).populate('seller');
    if (!auction) return res.status(404).json({ error: 'Auction not found.' });
    if (auction.status !== 'ended' && auction.status !== 'sold' && auction.status !== 'live') {
      return res.status(400).json({ error: 'Auction payment not available yet.' });
    }

    if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY === 'sk_test_placeholder') {
      // Demo mode – simulate success
      const payment = await Payment.create({
        auction: auctionId, buyer: req.user.id, seller: auction.seller._id,
        amount: auction.currentPrice,
        platformFee:  auction.currentPrice * FEE,
        sellerAmount: auction.currentPrice * (1 - FEE),
        currency: 'usd', paymentMethod: 'stripe', status: 'escrow',
        stripePaymentIntentId: `demo_${Date.now()}`,
        escrowHeldAt: new Date()
      });
      await Auction.findByIdAndUpdate(auctionId, { paymentStatus: 'escrow' });
      return res.json({ success:true, demo:true, payment,
        message:'Demo mode: payment simulated. Set STRIPE_SECRET_KEY in .env for real payments.' });
    }

    const amountCents = Math.round(auction.currentPrice * 100);
    let customerId = req.user.stripeCustomerId;
    if (!customerId) {
      const c = await stripe.customers.create({ email:req.user.email, name:req.user.name });
      customerId = c.id;
      await User.findByIdAndUpdate(req.user.id, { stripeCustomerId: customerId });
    }

    const intent = await stripe.paymentIntents.create({
      amount: amountCents, currency: 'usd', customer: customerId,
      metadata: { auctionId, buyerId: req.user.id },
      description: `BidWars: ${auction.title}`
    });

    await Payment.create({
      auction: auctionId, buyer: req.user.id, seller: auction.seller._id,
      amount: auction.currentPrice,
      platformFee:  auction.currentPrice * FEE,
      sellerAmount: auction.currentPrice * (1 - FEE),
      currency: 'usd', paymentMethod: 'stripe',
      stripePaymentIntentId: intent.id, status: 'pending'
    });

    res.json({ success:true, clientSecret: intent.client_secret, amount: auction.currentPrice });
  } catch(err) {
    console.error('Stripe intent error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── STRIPE: Confirm Payment ──────────────────────────────────
router.post('/stripe/confirm', protect, async (req, res) => {
  try {
    const { paymentIntentId, auctionId } = req.body;

    // Demo mode
    if (!paymentIntentId || paymentIntentId.startsWith('demo_')) {
      await Auction.findByIdAndUpdate(auctionId, { paymentStatus:'escrow' });
      return res.json({ success:true, message:'Payment confirmed (demo).' });
    }

    const intent = await stripe.paymentIntents.retrieve(paymentIntentId);
    if (intent.status !== 'succeeded') return res.status(400).json({ error: 'Payment not completed.' });

    const payment = await Payment.findOneAndUpdate(
      { stripePaymentIntentId: paymentIntentId },
      { status:'escrow', escrowHeldAt: new Date() }, { new:true }
    );
    await Auction.findByIdAndUpdate(auctionId, { paymentStatus:'escrow' });

    const auction = await Auction.findById(auctionId);
    if (auction) {
      await createNotification({ userId:auction.seller, type:'payment_received',
        title:'Payment in Escrow', message:`$${payment.amount} for "${auction.title}" is held in escrow.`,
        auctionId });
      const io = req.app.get('io');
      if (io) io.to(`user_${auction.seller}`).emit('notification:payment', { auctionId, status:'escrow' });
    }
    res.json({ success:true, message:'Payment in escrow!', payment });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── STRIPE: Release Escrow ───────────────────────────────────
router.post('/stripe/release-escrow', protect, async (req, res) => {
  try {
    const { paymentId } = req.body;
    const payment = await Payment.findById(paymentId);
    if (!payment) return res.status(404).json({ error: 'Payment not found.' });
    if (payment.buyer.toString() !== req.user.id) return res.status(403).json({ error: 'Not authorized.' });
    if (payment.status !== 'escrow') return res.status(400).json({ error: 'Not in escrow.' });
    payment.status = 'released'; payment.releasedAt = new Date();
    await payment.save();
    await Auction.findByIdAndUpdate(payment.auction, { paymentStatus:'released' });
    await User.findByIdAndUpdate(payment.buyer,  { $inc:{ wonAuctions:1, totalSpent:payment.amount } });
    const auction = await Auction.findById(payment.auction);
    if (auction) await createNotification({ userId:payment.seller, type:'payment_received',
      title:'Escrow Released!', message:`$${payment.sellerAmount?.toFixed(2)} released for "${auction.title}".`,
      auctionId: payment.auction });
    res.json({ success:true, message:'Escrow released to seller!' });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── PAYPAL: Create Order ─────────────────────────────────────
router.post('/paypal/create-order', protect, async (req, res) => {
  try {
    const { auctionId } = req.body;
    const auction = await Auction.findById(auctionId);
    if (!auction) return res.status(404).json({ error: 'Auction not found.' });

    if (!process.env.PAYPAL_CLIENT_ID || process.env.PAYPAL_CLIENT_ID === 'your_paypal_sandbox_client_id') {
      // Demo mode
      const payment = await Payment.create({
        auction: auctionId, buyer: req.user.id, seller: auction.seller,
        amount: auction.currentPrice,
        platformFee:  auction.currentPrice * FEE,
        sellerAmount: auction.currentPrice * (1 - FEE),
        currency: 'usd', paymentMethod: 'paypal',
        paypalOrderId: `demo_${Date.now()}`, status: 'escrow', escrowHeldAt: new Date()
      });
      await Auction.findByIdAndUpdate(auctionId, { paymentStatus:'escrow' });
      return res.json({ success:true, demo:true, payment,
        message:'Demo mode. Set PAYPAL_CLIENT_ID in .env for real PayPal payments.' });
    }

    const token = await getPayPalToken();
    const order = await axios.post(`${paypalUrl()}/v2/checkout/orders`, {
      intent: 'CAPTURE',
      purchase_units: [{ amount:{ currency_code:'USD', value:auction.currentPrice.toFixed(2) },
        description:`BidWars: ${auction.title}`, custom_id: auctionId }],
      application_context: {
        return_url: `${process.env.FRONTEND_URL || 'http://127.0.0.1:5500'}#payment-success`,
        cancel_url: `${process.env.FRONTEND_URL || 'http://127.0.0.1:5500'}#payment-cancel`
      }
    }, { headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' } });

    await Payment.create({
      auction: auctionId, buyer: req.user.id, seller: auction.seller,
      amount: auction.currentPrice,
      platformFee:  auction.currentPrice * FEE,
      sellerAmount: auction.currentPrice * (1 - FEE),
      currency: 'usd', paymentMethod: 'paypal',
      paypalOrderId: order.data.id, status: 'pending'
    });

    const approvalUrl = order.data.links.find(l => l.rel === 'approve')?.href;
    res.json({ success:true, orderId: order.data.id, approvalUrl });
  } catch(err) {
    console.error('PayPal error:', err.response?.data || err.message);
    res.status(500).json({ error: 'PayPal order creation failed.' });
  }
});

// ── PAYPAL: Capture ──────────────────────────────────────────
router.post('/paypal/capture', protect, async (req, res) => {
  try {
    const { orderId } = req.body;
    const token = await getPayPalToken();
    const capture = await axios.post(`${paypalUrl()}/v2/checkout/orders/${orderId}/capture`, {},
      { headers:{ Authorization:`Bearer ${token}`, 'Content-Type':'application/json' } });
    const captureId = capture.data.purchase_units[0].payments.captures[0].id;
    const payment = await Payment.findOneAndUpdate({ paypalOrderId:orderId },
      { status:'escrow', paypalCaptureId:captureId, escrowHeldAt:new Date() }, { new:true });
    if (payment) await Auction.findByIdAndUpdate(payment.auction, { paymentStatus:'escrow' });
    res.json({ success:true, message:'PayPal payment in escrow!', payment });
  } catch(err) { res.status(500).json({ error: 'PayPal capture failed.' }); }
});

// ── MY PAYMENTS ──────────────────────────────────────────────
router.get('/my-payments', protect, async (req, res) => {
  try {
    const payments = await Payment.find({ $or:[{buyer:req.user.id},{seller:req.user.id}] })
      .populate('auction','title thumbnailImage').populate('buyer','name').populate('seller','name')
      .sort('-createdAt').limit(50);
    res.json({ success:true, payments });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// ── STRIPE WEBHOOK ───────────────────────────────────────────
router.post('/stripe/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  if (!process.env.STRIPE_WEBHOOK_SECRET) return res.json({ received: true });
  try {
    const event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    if (event.type === 'payment_intent.succeeded') {
      const pi = event.data.object;
      await Payment.findOneAndUpdate({ stripePaymentIntentId:pi.id },
        { status:'escrow', escrowHeldAt:new Date() });
    }
    res.json({ received: true });
  } catch(err) { res.status(400).json({ error: err.message }); }
});

// ── HELPERS ──────────────────────────────────────────────────
async function getPayPalToken() {
  const r = await axios.post(`${paypalUrl()}/v1/oauth2/token`, 'grant_type=client_credentials', {
    auth: { username: process.env.PAYPAL_CLIENT_ID, password: process.env.PAYPAL_CLIENT_SECRET },
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  });
  return r.data.access_token;
}
const paypalUrl = () => process.env.PAYPAL_MODE === 'live'
  ? 'https://api.paypal.com' : 'https://api.sandbox.paypal.com';

module.exports = router;
