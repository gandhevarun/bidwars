// routes/notifications.js
const express = require('express');
const router = express.Router();
const { Notification } = require('../models/index');
const { protect } = require('../middleware/auth');

router.get('/', protect, async (req, res) => {
  try {
    const { unreadOnly, limit = 20, page = 1 } = req.query;
    const query = { user: req.user.id };
    if (unreadOnly === 'true') query.isRead = false;
    const total = await Notification.countDocuments(query);
    const notifications = await Notification.find(query)
      .sort('-createdAt').skip((page-1)*limit).limit(Number(limit)).lean();
    const unreadCount = await Notification.countDocuments({ user: req.user.id, isRead: false });
    res.json({ success: true, notifications, total, unreadCount });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/read-all', protect, async (req, res) => {
  try {
    await Notification.updateMany({ user: req.user.id, isRead: false }, { isRead: true });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id/read', protect, async (req, res) => {
  try {
    await Notification.findOneAndUpdate({ _id: req.params.id, user: req.user.id }, { isRead: true });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/clear', protect, async (req, res) => {
  try {
    await Notification.deleteMany({ user: req.user.id, isRead: true });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
