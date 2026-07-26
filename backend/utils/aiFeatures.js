// utils/aiFeatures.js - Rule-based AI features (no external API needed)

const BASE_PRICES = {
  electronics: 500, fashion: 150, collectibles: 300, art: 800,
  jewelry: 1000, vehicles: 15000, sports: 200, home: 400,
  toys: 100, books: 50, default: 200
};

const CONDITION_MULTIPLIERS = {
  'new': 1.0, 'like-new': 0.85, 'excellent': 0.75, 'good': 0.60, 'fair': 0.40, 'poor': 0.25
};

const BRAND_PREMIUMS = {
  apple: 1.4, rolex: 3.0, louis: 2.5, gucci: 2.0, nike: 1.2, sony: 1.1,
  samsung: 1.1, canon: 1.2, nikon: 1.2, bmw: 1.3, mercedes: 1.4
};

async function getAIPriceRecommendation({ category, condition, brand }) {
  const base = BASE_PRICES[category?.toLowerCase()] || BASE_PRICES.default;
  const condMult = CONDITION_MULTIPLIERS[condition] || 0.6;
  const brandKey = brand?.toLowerCase().split(' ')[0];
  const brandMult = BRAND_PREMIUMS[brandKey] || 1.0;
  const recommended = Math.round(base * condMult * brandMult);
  return {
    recommended,
    min: Math.round(recommended * 0.7),
    max: Math.round(recommended * 1.5),
    confidence: 0.72
  };
}

async function detectAuctionFraud({ sellerId, price, title, description, imageCount }) {
  let score = 0;
  if (!description || description.length < 30) score += 20;
  if (imageCount === 0) score += 15;
  if (price > 50000) score += 10;
  const suspiciousWords = ['guaranteed','100% authentic','no return','as is','urgent'];
  const lowerTitle = (title || '').toLowerCase();
  if (suspiciousWords.some(w => lowerTitle.includes(w))) score += 15;
  return Math.min(score, 100);
}

async function detectBidFraud({ bidderId, auctionId, amount }) {
  // Simple rule: return low score unless clearly anomalous
  return amount > 1000000 ? 95 : 5;
}

async function getRecommendations(userId, interests = []) {
  return interests.length ? interests : ['electronics', 'fashion', 'collectibles'];
}

module.exports = { getAIPriceRecommendation, detectAuctionFraud, detectBidFraud, getRecommendations };
