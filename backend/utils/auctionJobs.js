// utils/auctionJobs.js - Background cron jobs
const Auction = require('../models/Auction');
const { Bid } = require('../models/index');
const { createNotification } = require('./notifications');

module.exports = function startAuctionJobs(io) {
  console.log('⏱️  Auction background jobs started');

  setInterval(async () => {
    try {
      const now = new Date();

      // 1. Activate scheduled auctions
      const toStart = await Auction.find({ status:'scheduled', startTime:{ $lte:now } });
      for (const a of toStart) {
        a.status = 'live';
        await a.save();
        io.emit('auction:started', { id:a._id, title:a.title });
        console.log(`▶️  Auction started: ${a.title}`);
      }

      // 2. End expired live auctions
      const toEnd = await Auction.find({ status:'live', endTime:{ $lte:now } })
        .populate('currentWinner','name email');
      for (const a of toEnd) {
        a.status = 'ended';
        await a.save();

        // Mark winning bid
        if (a.currentWinner) {
          await Bid.findOneAndUpdate(
            { auction:a._id, bidder:a.currentWinner._id, status:'active' },
            { status:'won' }
          );
          await createNotification({
            userId: a.currentWinner._id,
            type: 'auction_won',
            title: '🏆 You won an auction!',
            message: `Congratulations! You won "${a.title}" for $${a.currentPrice.toLocaleString()}`,
            auctionId: a._id
          });
          io.to(`user_${a.currentWinner._id}`).emit('notification:auction_won', {
            auctionId: a._id, title: a.title, finalPrice: a.currentPrice
          });
        }

        // Notify seller
        await createNotification({
          userId: a.seller,
          type: 'auction_started',
          title: 'Your auction has ended',
          message: a.currentWinner
            ? `"${a.title}" sold for $${a.currentPrice.toLocaleString()}`
            : `"${a.title}" ended with no bids.`,
          auctionId: a._id
        });

        io.to(`auction_${a._id}`).emit('auction:ended', {
          auctionId: a._id,
          finalPrice: a.currentPrice,
          winnerId: a.currentWinner?._id,
          winnerName: a.currentWinner?.name
        });
        console.log(`🏁 Auction ended: ${a.title}`);
      }

      // 3. Send "ending soon" alerts (5 min warning)
      const endingSoon = await Auction.find({
        status:'live',
        endTime:{ $gte:now, $lte:new Date(now.getTime() + 5*60*1000) },
        'endingSoonNotified': { $ne: true }
      });
      for (const a of endingSoon) {
        io.to(`auction_${a._id}`).emit('auction:ending_soon', { auctionId:a._id, title:a.title, minutesLeft:5 });
        // Mark as notified (use findByIdAndUpdate to avoid re-triggering hooks)
        await Auction.findByIdAndUpdate(a._id, { $set:{ endingSoonNotified:true } });
      }

    } catch (err) {
      console.error('Auction job error:', err.message);
    }
  }, 15000); // every 15 seconds
};
