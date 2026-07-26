// utils/notifications.js
const { Notification } = require('../models/index');
const { sendEmail } = require('./email');

async function createNotification({ userId, type, title, message, auctionId }) {
  try {
    await Notification.create({ user: userId, type, title, message, auction: auctionId || null });
  } catch (err) {
    console.error('Create notification error:', err.message);
  }
}

module.exports = { createNotification };
