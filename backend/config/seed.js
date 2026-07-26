// config/seed.js - Seed database with admin, demo users, categories, and sample auctions
require('dotenv').config();
const mongoose = require('mongoose');
const User    = require('../models/User');
const Auction = require('../models/Auction');
const { Category } = require('../models/index');

const URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/bidwars';
console.log('🔧 Seeding database with URI:', URI);
const CATEGORIES = [
  { name:'Electronics',   slug:'electronics',  icon:'💻', sortOrder:1, subcategories:['Phones','Laptops','TVs','Cameras','Audio'] },
  { name:'Fashion',       slug:'fashion',       icon:'👗', sortOrder:2, subcategories:['Men','Women','Kids','Shoes','Bags'] },
  { name:'Collectibles',  slug:'collectibles',  icon:'🏆', sortOrder:3, subcategories:['Coins','Stamps','Cards','Figurines'] },
  { name:'Art',           slug:'art',           icon:'🎨', sortOrder:4, subcategories:['Paintings','Sculptures','Photography'] },
  { name:'Jewelry',       slug:'jewelry',       icon:'💍', sortOrder:5, subcategories:['Rings','Necklaces','Watches','Bracelets'] },
  { name:'Vehicles',      slug:'vehicles',      icon:'🚗', sortOrder:6, subcategories:['Cars','Motorcycles','Boats','Parts'] },
  { name:'Sports',        slug:'sports',        icon:'⚽', sortOrder:7, subcategories:['Equipment','Memorabilia','Clothing'] },
  { name:'Home & Garden', slug:'home',          icon:'🏠', sortOrder:8, subcategories:['Furniture','Decor','Kitchen','Garden'] },
  { name:'Toys & Hobbies',slug:'toys',          icon:'🧸', sortOrder:9, subcategories:['Action Figures','Board Games','LEGO'] },
  { name:'Books & Media', slug:'books',         icon:'📚', sortOrder:10, subcategories:['Books','Comics','Movies','Games'] }
];

async function seed() {
  try {
    await mongoose.connect(URI);
    console.log('✅ Connected to MongoDB\n');

    // ── Categories ───────────────────────────────────────
    await Category.deleteMany({});
    await Category.insertMany(CATEGORIES);
    console.log('✅ Categories seeded (10)');

    // ── Admin (updated credentials) ──────────────────────
    await User.deleteOne({ email: 'admin@bidwars.com' });
    await User.deleteOne({ email: 'admin@bidvault.com' }); // remove old
    const admin = await User.create({
      name: 'Admin',
      email: 'admin@bidwars.com',
      password: 'admin@0000',
      role: 'admin',
      isEmailVerified: true
    });
    console.log('✅ Admin created:  admin@bidwars.com  /  admin@0000');

    // ── Demo Seller ──────────────────────────────────────
    let seller = await User.findOne({ email: 'seller@bidwars.com' });
    if (!seller) {
      seller = await User.create({
        name: 'Demo Seller', email: 'seller@bidwars.com',
        password: 'seller@1234', role: 'seller',
        isEmailVerified: true, rating: 4.8, reviewCount: 42
      });
      console.log('✅ Seller created: seller@bidwars.com / seller@1234');
    }

    // ── Demo Buyer ───────────────────────────────────────
    let buyer = await User.findOne({ email: 'buyer@bidwars.com' });
    if (!buyer) {
      buyer = await User.create({
        name: 'Demo Buyer', email: 'buyer@bidwars.com',
        password: 'buyer@1234', role: 'buyer',
        isEmailVerified: true
      });
      console.log('✅ Buyer created:  buyer@bidwars.com  / buyer@1234');
    }

    // ── Sample Auctions ──────────────────────────────────
    await Auction.deleteMany({ seller: seller._id });
    const now = new Date();
    const day = 24 * 60 * 60 * 1000;
    const randomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
    const randomEndTime = (daysFromNow, extraHours = 0) => {
      const end = new Date(now.getTime() + daysFromNow * day + randomInt(0, extraHours) * 60 * 60 * 1000);
      end.setMinutes(randomInt(0, 59), 0, 0);
      return end;
    };
    const randomVintageEndTime = () => randomEndTime(randomInt(8, 25), 12);
    const VINTAGE_AUCTIONS = [
      { title:'Vintage Rolex Submariner 1969 – Ref 1680',
        description:'All original parts: dial, bezel, bracelet. Comes with original box. Recently serviced. A true collector\'s piece.',
        category:'jewelry', startingPrice:5000, bidIncrement:250,
        endTime: randomVintageEndTime(), condition:'good', brand:'Rolex',
        images:['https://www.bobswatches.com/rolex-blog/wp-content/uploads/2018/03/Rolex_Submariner_1680_Submariner-Marble-1-1.jpg'],
        thumbnailImage:'https://www.bobswatches.com/rolex-blog/wp-content/uploads/2018/03/Rolex_Submariner_1680_Submariner-Marble-1-1.jpg',
        aiPriceRecommendation:12000, aiPriceRange:{min:8000,max:18000} },
      { title:'Vintage Leica M3 Rangefinder Camera (1958)',
        description:'Classic film camera in working condition with original leather case. Smooth shutter and clean viewfinder.',
        category:'collectibles', startingPrice:1800, bidIncrement:50,
        endTime: randomVintageEndTime(), condition:'good', brand:'Leica',
        images:['https://www.kenrockwell.com/leica/m3/D3S_7742-1200.jpg'],
        thumbnailImage:'https://www.kenrockwell.com/leica/m3/D3S_7742-1200.jpg',
        aiPriceRecommendation:2400, aiPriceRange:{min:1700,max:3200} },
      { title:'Retro Vinyl Record Player (1970s)',
        description:'Belt-drive turntable with warm analog output. Comes with dust cover and replacement stylus.',
        category:'electronics', startingPrice:320, bidIncrement:10,
        endTime: randomVintageEndTime(), condition:'good', brand:'Technics',
        images:['https://www.grangerhertzog.com/media/catalog/product/r/a/rad029_2.jpg?quality=80&bg-color=255,255,255&fit=bounds&height=564&width=564&canvas=564:564'],
        thumbnailImage:'https://www.grangerhertzog.com/media/catalog/product/r/a/rad029_2.jpg?quality=80&bg-color=255,255,255&fit=bounds&height=564&width=564&canvas=564:564',
        aiPriceRecommendation:480, aiPriceRange:{min:300,max:750} },
      { title:'Vintage Leather Travel Trunk (1930s)',
        description:'Large steamer trunk with brass hardware and interior lining. Solid structure with authentic wear.',
        category:'home', startingPrice:900, bidIncrement:25,
        endTime: randomVintageEndTime(), condition:'fair', brand:'Samsonite',
        images:['https://i.ebayimg.com/images/g/P-UAAOSwRwdmYx15/s-l1600.webp'],
        thumbnailImage:'https://i.ebayimg.com/images/g/P-UAAOSwRwdmYx15/s-l1600.webp',
        aiPriceRecommendation:1200, aiPriceRange:{min:800,max:1800} },
      { title:'Collector\'s Fountain Pen – Parker 51 (1940s)',
        description:'Classic Parker 51 with gold nib. Restored ink flow and polished barrel. Writes smoothly.',
        category:'collectibles', startingPrice:280, bidIncrement:10,
        endTime: randomVintageEndTime(), condition:'excellent', brand:'Parker',
        images:['https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQz3FNpF3_1EdQth9fERL0pZNWOOvioffIcvA&s'],
        thumbnailImage:'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQz3FNpF3_1EdQth9fERL0pZNWOOvioffIcvA&s',
        aiPriceRecommendation:420, aiPriceRange:{min:260,max:650} },
      { title:'Vintage Concert Poster – Original Print (1969)',
        description:'Original-era poster with vivid colors and light edge wear. Professionally framed and preserved.',
        category:'art', startingPrice:1100, bidIncrement:30,
        endTime: randomVintageEndTime(), condition:'good', brand:'Fillmore',
        images:['https://i.ebayimg.com/images/g/UZ0AAOSwD31ky9y7/s-l1600.webp'],
        thumbnailImage:'https://i.ebayimg.com/images/g/UZ0AAOSwD31ky9y7/s-l1600.webp',
        aiPriceRecommendation:1600, aiPriceRange:{min:1000,max:2400} },
      { title:'First Edition Harry Potter – Philosopher\'s Stone (1997)',
        description:'Rare first edition, first printing. Minor dust jacket wear, excellent interior. A legendary collector\'s item.',
        category:'books', startingPrice:5000, bidIncrement:100,
        endTime: randomVintageEndTime(), condition:'good',
        images:['https://www.baylissbooks.co.uk/cdn/shop/files/2956F43D-3206-4C39-87CA-92D818FE05D9.jpg?v=1690398499&width=5000'],
        thumbnailImage:'https://www.baylissbooks.co.uk/cdn/shop/files/2956F43D-3206-4C39-87CA-92D818FE05D9.jpg?v=1690398499&width=5000',
        aiPriceRecommendation:8000, aiPriceRange:{min:5000,max:15000} }
    ];

    const auctionDocs = VINTAGE_AUCTIONS.map(a => ({
      ...a, seller:seller._id,
      currentPrice: a.startingPrice,
      startTime: new Date(now.getTime() - randomInt(1, 18) * 60 * 60 * 1000), status: 'live'
    }));
    await Auction.insertMany(auctionDocs);
    console.log(`✅ ${VINTAGE_AUCTIONS.length} vintage sample auctions created`);

    console.log('\n╔══════════════════════════════════════════╗');
    console.log('║     🎉  Database seeded successfully!    ║');
    console.log('╠══════════════════════════════════════════╣');
    console.log('║  ADMIN:   admin@bidwars.com              ║');
    console.log('║  PASS:    admin@0000                     ║');
    console.log('╠══════════════════════════════════════════╣');
    console.log('║  SELLER:  seller@bidwars.com / seller@1234║');
    console.log('║  BUYER:   buyer@bidwars.com  / buyer@1234 ║');
    console.log('╚══════════════════════════════════════════╝\n');
    process.exit(0);
  } catch(err) {
    console.error('❌ Seed error:', err.message);
    process.exit(1);
  }
}

seed();
