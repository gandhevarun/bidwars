# ⚡ BidWars — Live Online Auction Platform

A full-stack real-time auction platform. College project.

---

## 🚀 Quick Start (5 Steps)

### Step 1 — Install dependencies
```bash
cd backend
npm install
```

### Step 2 — Setup MongoDB Atlas (free)
1. Go to [mongodb.com/atlas](https://mongodb.com/atlas) → Create free account
2. Create a **free M0 cluster**
3. **Database Access** → Add user → save username & password
4. **Network Access** → Add IP → `0.0.0.0/0` (allow all)
5. **Connect** → "Connect your application" → copy the URI

### Step 3 — Configure environment
```bash
cd backend
copy .env.example .env        # Windows
cp .env.example .env          # Mac/Linux
```

Edit `.env` — at minimum, set:
```
MONGODB_URI=mongodb+srv://youruser:yourpass@cluster0.xxxxx.mongodb.net/bidwars
JWT_SECRET=any_long_random_string_here
FRONTEND_URL=http://127.0.0.1:5500

# Email SMTP (required for forgot password and notifications)
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_REQUIRE_TLS=true
EMAIL_USER=your@gmail.com
EMAIL_PASS=your_16_char_app_password
EMAIL_FROM=your@gmail.com
```

### Step 4 — Seed the database
```bash
node config/seed.js
```
This creates categories, admin, and sample auctions.

### Step 5 — Run
```bash
# Terminal 1 - Backend
npm run dev
# ✅ Server on http://localhost:5000

# Terminal 2 - Frontend
# Open frontend/index.html with VS Code Live Server
# (Right-click index.html → "Open with Live Server")
# ✅ Frontend on http://127.0.0.1:5500
```

### Email setup check (optional)
After login, you can verify SMTP quickly:

```bash
POST /api/auth/test-email
Authorization: Bearer <your_jwt_token>
Content-Type: application/json

{ "to": "your@gmail.com" }
```

If SMTP is not configured, backend prints a dev-email log instead of failing.

---

## 🔑 Default Login Credentials

| Role   | Email                  | Password     |
|--------|------------------------|--------------|
| Admin  | admin@bidwars.com      | admin@0000   |
| Seller | seller@bidwars.com     | seller@1234  |
| Buyer  | buyer@bidwars.com      | buyer@1234   |

> ⚠️ Change admin password after first login in production!

---

## 💳 Test Payments

**Stripe test cards:**
| Card                  | Result   |
|-----------------------|----------|
| 4242 4242 4242 4242   | Success  |
| 4000 0000 0000 0002   | Declined |
- Use any future expiry (e.g. 12/28) and any 3-digit CVC

> Without Stripe keys in `.env`, payments run in **demo mode** (simulated success).

**PayPal sandbox:**
- Set `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` in `.env`
- Without them, PayPal runs in demo mode too.

---

## 🌐 Deploy (Free)

### Backend → Render.com
1. Push to GitHub
2. [render.com](https://render.com) → New Web Service → connect repo
3. Root directory: `backend` · Start command: `node server.js`
4. Add all `.env` variables in Render dashboard
5. Note your URL: `https://bidwars-xxx.onrender.com`

### Frontend → Netlify
1. Edit `frontend/app.js` lines 8–9:
```js
const API_BASE   = 'https://bidwars-xxx.onrender.com/api';
const SOCKET_URL = 'https://bidwars-xxx.onrender.com';
```
2. [netlify.com](https://netlify.com) → Drag & drop `frontend/` folder

---

## ✨ Features

- ⚡ **Real-time bidding** videa Socket.io
- 🤖 **Auto-bid system** — set max, system bids for you
- ⏰ **Anti-snipe** — 2-min extension if bid in final 2 min
- 📹 **Live video** — WebRTC/PeerJS seller broadcast ------
- 💬 **Live chat** — per-auction chat room
- 🔐 **Auth** — email/password, Google OAuth, Facebook OAuth, 2FA -----
- 💳 **Payments** — Stripe + PayPal sandbox with escrow
- 🤖 **AI price guide** — smart starting price recommendations
- 🚨 **Fraud detection** — rule-based scoring---
- ⚙️ **Admin panel** — users, auctions, payments, analytics
- 📱 **Mobile responsive** — dark theme UI

---

## 🧩 Documentation Snippets (Copy/Paste)

### 1) Health + DB Connectivity Check
```bash
curl http://localhost:5000/api/health
```

### 2) Register and Login (JWT)
```bash
# Register
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name":"Demo Buyer",
    "email":"buyer2@bidwars.com",
    "password":"buyer@1234",
    "role":"buyer"
  }'

# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email":"buyer2@bidwars.com",
    "password":"buyer@1234"
  }'
```

### 3) Get Current User from Token
```bash
curl http://localhost:5000/api/auth/me \
  -H "Authorization: Bearer <JWT_TOKEN>"
```

### 4) Create Auction with Images (Multipart)
```bash
curl -X POST http://localhost:5000/api/auctions \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -F "title=Sony A7 III Camera Body" \
  -F "description=Excellent condition, low shutter count, includes battery and charger." \
  -F "category=electronics" \
  -F "startingPrice=900" \
  -F "reservePrice=1100" \
  -F "buyNowPrice=1400" \
  -F "bidIncrement=25" \
  -F "condition=excellent" \
  -F "brand=Sony" \
  -F "startTime=2026-04-28T12:00:00.000Z" \
  -F "endTime=2026-04-30T12:00:00.000Z" \
  -F "images=@C:/path/to/photo1.jpg" \
  -F "images=@C:/path/to/photo2.jpg"
```

### 5) Place Bid (Anti-Snipe Supported by Backend)
```bash
curl -X POST http://localhost:5000/api/bids/<AUCTION_ID> \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{ "amount": 950 }'
```

### 6) Set Auto-Bid Max Ceiling
```bash
curl -X POST http://localhost:5000/api/bids/<AUCTION_ID>/autobid \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{ "maxBid": 1500 }'
```

### 7) Watchlist Toggle
```bash
curl -X POST http://localhost:5000/api/auctions/<AUCTION_ID>/watch \
  -H "Authorization: Bearer <JWT_TOKEN>"
```

### 8) Buy Now
```bash
curl -X POST http://localhost:5000/api/auctions/<AUCTION_ID>/buy-now \
  -H "Authorization: Bearer <JWT_TOKEN>"
```

### 9) Bid History (Masked User Names)
```bash
curl http://localhost:5000/api/bids/<AUCTION_ID>/history
```

### 10) 2FA Setup and Enable
```bash
# Generate QR + secret
curl -X POST http://localhost:5000/api/auth/2fa/setup \
  -H "Authorization: Bearer <JWT_TOKEN>"

# Enable 2FA with authenticator code
curl -X POST http://localhost:5000/api/auth/2fa/enable \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{ "code": "123456" }'
```

### 11) Notifications API Flow
```bash
# List notifications
curl http://localhost:5000/api/notifications \
  -H "Authorization: Bearer <JWT_TOKEN>"

# Mark all as read
curl -X PUT http://localhost:5000/api/notifications/read-all \
  -H "Authorization: Bearer <JWT_TOKEN>"
```

### 12) Stripe Payment (Works in Demo Mode Without Keys)
```bash
curl -X POST http://localhost:5000/api/payments/stripe/create-intent \
  -H "Authorization: Bearer <JWT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{ "auctionId": "<AUCTION_ID>" }'
```

### 13) Socket.io Join + Live Chat (Frontend/Client)
```js
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000', {
  auth: { token: '<JWT_TOKEN_OR_EMPTY_FOR_GUEST>' },
  transports: ['websocket', 'polling']
});

socket.on('connect', () => {
  socket.emit('auction:join', '<AUCTION_ID>');
});

socket.on('auction:viewers', (payload) => {
  console.log('viewer count update:', payload);
});

socket.emit('chat:message', {
  auctionId: '<AUCTION_ID>',
  message: 'Is original box included?'
});

socket.on('chat:message', (msg) => {
  console.log('new chat message:', msg);
});
```

### 14) Frontend API Helper (Token + Error Handling)
```js
async function api(path, options = {}) {
  const token = localStorage.getItem('bw_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers
  };

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
```

---

## ⚠️ Known Limitations

1. **OAuth** requires setting up Google/Facebook app credentials
2. **Email** requires a Gmail App Password (see `.env.example`)
3. **Stripe/PayPal** run in demo mode without real API keys
4. **Images** stored locally (`/uploads`) — add Cloudinary for cloud hosting
5. **Render free tier** spins down after 15 min inactivity (cold start ~30s)

---

## 🛠 Tech Stack

| Layer     | Technology                              |
|-----------|-----------------------------------------|
| Frontend  | React 18 (CDN), Tailwind CSS (CDN)     |
| Backend   | Node.js, Express.js                     |
| Database  | MongoDB Atlas                           |
| Realtime  | Socket.io                               |
| Video     | WebRTC + PeerJS                         |
| Auth      | JWT, Passport.js, Speakeasy (2FA)       |
| Payments  | Stripe, PayPal sandbox                  |
| Deploy    | Render (BE) + Netlify (FE)             |

---

MIT License — Free for educational use.
