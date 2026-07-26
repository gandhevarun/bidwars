// ============================================================
// BidWars - Complete Frontend (React 18, CDN, no build tools)
// ============================================================
const { useState, useEffect, useRef, useCallback, createContext, useContext } = React;

// ── CONFIG ───────────────────────────────────────────────────
const API_BASE   = window.API_BASE   || 'http://localhost:5000/api';
const SOCKET_URL = window.SOCKET_URL || 'http://localhost:5000';
const STRIPE_KEY = window.STRIPE_KEY || '';

// ── TOAST ────────────────────────────────────────────────────
function showToast(msg, type='info', duration=4000) {
  const container = document.getElementById('toasts');
  if (!container) return;
  const colors = { success:'#22c55e', error:'#ef4444', warning:'#f59e0b', info:'#3b82f6' };
  const icons  = { success:'✅', error:'❌', warning:'⚠️', info:'ℹ️' };
  const el = document.createElement('div');
  el.className = 'toast';
  el.style.cssText = `background:#1a1a1a;border:1px solid ${colors[type]||colors.info};border-radius:12px;padding:12px 18px;display:flex;gap:10px;align-items:center;box-shadow:0 8px 24px rgba(0,0,0,.6);pointer-events:auto;max-width:340px`;
  el.innerHTML = `<span style="font-size:1.1rem">${icons[type]||'ℹ️'}</span><span style="color:#f5f5f5;font-size:.875rem;line-height:1.4">${msg}</span>`;
  container.appendChild(el);
  setTimeout(() => el.remove(), duration);
}
window.showToast = showToast;

// ── API HELPER ───────────────────────────────────────────────
async function api(path, options={}) {
  const token = localStorage.getItem('bw_token');
  const isFormData = options.body instanceof FormData;
  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization:`Bearer ${token}` } : {}),
    ...options.headers
  };
  try {
    const res  = await fetch(`${API_BASE}${path}`, { ...options, headers });
    let data;
    try { data = await res.json(); } catch(e) { data = {}; }
    if (!res.ok) throw new Error(data.error || data.message || `Request failed (${res.status})`);
    return data;
  } catch(err) {
    if (err.name === 'TypeError') throw new Error('Cannot connect to server. Is the backend running on port 5000?');
    throw err;
  }
}
window.api = api;

// ── SOCKET ───────────────────────────────────────────────────
let socket = null;
function getSocket() {
  if (socket?.connected) return socket;
  if (typeof io === 'undefined') return null;
  const token = localStorage.getItem('bw_token');
  socket = io(SOCKET_URL, {
    auth: { token: token || '' },
    transports: ['websocket','polling'],
    reconnectionAttempts: 5,
    timeout: 8000
  });
  socket.on('connect',       () => console.log('🔌 Socket connected:', socket.id));
  socket.on('connect_error', (e) => console.warn('Socket error (backend running?):', e.message));
  socket.on('disconnect',    () => console.log('🔌 Socket disconnected'));
  return socket;
}
window.getSocket = getSocket;

// ── AUTH CONTEXT ─────────────────────────────────────────────
const AuthContext = createContext(null);
function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('bw_token');
    if (token) {
      api('/auth/me')
        .then(d => setUser(d.user))
        .catch(() => localStorage.removeItem('bw_token'))
        .finally(() => setLoading(false));
    } else setLoading(false);
  }, []);

  const login = async (email, password, code) => {
    const d = await api('/auth/login', { method:'POST', body:JSON.stringify({ email, password, twoFactorCode:code }) });
    if (d.requires2FA) return d;
    localStorage.setItem('bw_token', d.token);
    setUser(d.user);
    // Reconnect socket with new token
    if (socket) { socket.disconnect(); socket = null; }
    getSocket();
    return d;
  };

  const register = async (name, email, password, role) => {
    const d = await api('/auth/register', { method:'POST', body:JSON.stringify({ name, email, password, role }) });
    localStorage.setItem('bw_token', d.token);
    setUser(d.user);
    return d;
  };

  const logout = () => {
    localStorage.removeItem('bw_token');
    setUser(null);
    if (socket) { socket.disconnect(); socket = null; }
    showToast('Logged out', 'info');
  };

  if (loading) return React.createElement('div', {
    style:{ minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',background:'#0F0F0F',flexDirection:'column',gap:16 }
  }, React.createElement('div', { style:{ fontFamily:'Bebas Neue,sans-serif',fontSize:'3rem',color:'#F59E0B',letterSpacing:'.1em' } }, 'BIDWARS'),
     React.createElement('div', { style:{ color:'#555',fontSize:'.85rem' } }, 'Loading...'));

  return React.createElement(AuthContext.Provider, { value:{ user, login, register, logout, setUser } }, children);
}
const useAuth = () => useContext(AuthContext);

// ── APP CONTEXT ──────────────────────────────────────────────
const AppContext = createContext(null);
function AppProvider({ children }) {
  const [page, setPage] = useState(() => {
    const h = window.location.hash.replace('#','') || 'home';
    return h;
  });
  const navigate = useCallback((to) => {
    window.location.hash = to;
    setPage(to);
  }, []);
  useEffect(() => {
    const handler = () => setPage(window.location.hash.replace('#','') || 'home');
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);
  return React.createElement(AppContext.Provider, { value:{ page, navigate } }, children);
}
const useApp = () => useContext(AppContext);

// ── HELPERS ──────────────────────────────────────────────────
const fmt  = (n) => `$${Number(n||0).toLocaleString('en-US', { minimumFractionDigits:0 })}`;
const fmtDate = (d) => new Date(d).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' });

const ITEM_IMAGE_HINTS = [
  {
    match: /macbook air|macbook/i,
    image: 'https://images.pexels.com/photos/18105/pexels-photo.jpg?auto=compress&cs=tinysrgb&w=1200'
  },
  {
    match: /rolex|watch|submariner/i,
    image: 'https://images.unsplash.com/photo-1523170335258-f5ed11844a49?auto=format&fit=crop&w=1200&q=80'
  },
  {
    match: /playstation|ps5|console/i,
    image: 'https://images.unsplash.com/photo-1606144042614-b2417e99c4e3?auto=format&fit=crop&w=1200&q=80'
  },
  {
    match: /air jordan|sneaker|nike|shoe/i,
    image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80'
  },
  {
    match: /canon|camera|lens|eos/i,
    image: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1200&q=80'
  },
  {
    match: /first edition harry potter|harry potter|philosopher'?s stone/i,
    image: 'https://images.pexels.com/photos/159711/books-bookstore-book-reading-159711.jpeg?auto=compress&cs=tinysrgb&w=1200'
  }
];

const CATEGORY_IMAGE_MAP = {
  electronics: 'https://images.unsplash.com/photo-1498049794561-7780e7231661?auto=format&fit=crop&w=1200&q=80',
  fashion: 'https://images.unsplash.com/photo-1445205170230-053b83016050?auto=format&fit=crop&w=1200&q=80',
  collectibles: 'https://images.unsplash.com/photo-1611251135345-18b47a7e8fdd?auto=format&fit=crop&w=1200&q=80',
  art: 'https://images.unsplash.com/photo-1460661419201-fd4cecdf8a8b?auto=format&fit=crop&w=1200&q=80',
  jewelry: 'https://images.unsplash.com/photo-1617038220319-276d3cfab638?auto=format&fit=crop&w=1200&q=80',
  vehicles: 'https://images.unsplash.com/photo-1492144534655-ae79c964c9d7?auto=format&fit=crop&w=1200&q=80',
  sports: 'https://images.unsplash.com/photo-1461896836934-ffe607ba8211?auto=format&fit=crop&w=1200&q=80',
  home: 'https://images.unsplash.com/photo-1484101403633-562f891dc89a?auto=format&fit=crop&w=1200&q=80',
  toys: 'https://images.unsplash.com/photo-1566576912321-d58ddd7a6088?auto=format&fit=crop&w=1200&q=80',
  books: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=1200&q=80'
};

const DEFAULT_AUCTION_IMAGE = 'https://via.placeholder.com/1200x800?text=No+Image';

function getAuctionImageFallback(auction, size = 'card') {
  const title = (auction?.title || '').toLowerCase();
  const category = (auction?.category || '').toLowerCase();
  const hit = ITEM_IMAGE_HINTS.find(h => h.match.test(title));
  return hit?.image || CATEGORY_IMAGE_MAP[category] || DEFAULT_AUCTION_IMAGE;
}

function getAuctionImageUrl(auction, size = 'card') {
  const raw = auction?.thumbnailImage;
  if (raw && /^https?:\/\//i.test(raw)) return raw;
  if (raw) return `${SOCKET_URL}${raw}`;
  return getAuctionImageFallback(auction, size);
}

function timeLeft(endTime) {
  const diff = new Date(endTime) - Date.now();
  if (diff <= 0) return 'Ended';
  const d = Math.floor(diff/86400000), h = Math.floor((diff%86400000)/3600000),
        m = Math.floor((diff%3600000)/60000), s = Math.floor((diff%60000)/1000);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

// ── COUNTDOWN TIMER ──────────────────────────────────────────
function Countdown({ endTime, onEnd }) {
  const [left, setLeft] = useState(Math.max(0, new Date(endTime) - Date.now()));
  useEffect(() => {
    const t = setInterval(() => {
      const v = Math.max(0, new Date(endTime) - Date.now());
      setLeft(v);
      if (v <= 0) { clearInterval(t); onEnd?.(); }
    }, 1000);
    return () => clearInterval(t);
  }, [endTime]);
  const d = Math.floor(left/86400000), h = Math.floor((left%86400000)/3600000),
        m = Math.floor((left%3600000)/60000), s = Math.floor((left%60000)/1000);
  const urgent = left > 0 && left < 5*60*1000;
  if (left <= 0) return React.createElement('span', { style:{ color:'#ef4444',fontWeight:600 } }, 'Ended');
  return React.createElement('span', { className: urgent ? 'urgent' : '', style:{ fontFamily:'monospace',fontWeight:700,fontSize:'1rem',color: urgent ? '#ef4444':'#F59E0B' } },
    d > 0 ? `${d}d ${h}h ${m}m` : h > 0 ? `${h}h ${m}m ${s}s` : `${m}m ${s}s`
  );
}

const RTC_ICE_SERVERS = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }
];

function createRtcPeerConnection() {
  return new RTCPeerConnection({ iceServers: RTC_ICE_SERVERS });
}

function LiveStreamPanel({ auctionId, auction, isSeller, isEnded }) {
  const [status, setStatus] = useState('idle');
  const [message, setMessage] = useState('');
  const [viewerCount, setViewerCount] = useState(0);
  const [streamReady, setStreamReady] = useState(false);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const peerConnectionsRef = useRef(new Map());
  const socketRef = useRef(null);

  const attachStream = useCallback((videoEl, stream, muted=false) => {
    if (!videoEl || !stream) return;
    videoEl.muted = muted;
    videoEl.srcObject = stream;
    videoEl.play?.().catch(() => {});
    setStreamReady(true);
  }, []);

  const cleanupPeer = useCallback((socketId) => {
    const pc = peerConnectionsRef.current.get(socketId);
    if (!pc) return;
    try { pc.onicecandidate = null; pc.ontrack = null; pc.close(); } catch (e) {}
    peerConnectionsRef.current.delete(socketId);
  }, []);

  const stopLocalStream = useCallback(() => {
    const stream = localStreamRef.current;
    if (stream) stream.getTracks().forEach(track => track.stop());
    localStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    setStreamReady(false);
  }, []);

  const stopStream = useCallback((shouldBroadcast = true) => {
    const s = socketRef.current || getSocket();
    if (shouldBroadcast && s) s.emit('stream:end', { auctionId });
    peerConnectionsRef.current.forEach((_, socketId) => cleanupPeer(socketId));
    peerConnectionsRef.current.clear();
    stopLocalStream();
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    setStreamReady(false);
    setStatus('idle');
    setMessage('');
  }, [auctionId, cleanupPeer, stopLocalStream]);

  const startStream = async () => {
    try {
      setStreamReady(false);
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('This browser does not support camera access.');
      }
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      localStreamRef.current = stream;
      attachStream(localVideoRef.current, stream, true);
      const s = socketRef.current || getSocket();
      socketRef.current = s;
      if (!s) throw new Error('Socket connection not available.');
      s.emit('stream:start', { auctionId, peerId: s.id });
      setStatus('live');
      setMessage('Broadcasting live to auction viewers.');
      showToast('Live stream started', 'success');
    } catch (err) {
      setStreamReady(false);
      setStatus('idle');
      setMessage('');
      showToast(err.message || 'Unable to start live stream', 'error');
    }
  };

  const watchStream = () => {
    const s = socketRef.current || getSocket();
    socketRef.current = s;
    if (!s) return showToast('Socket connection not available.', 'warning');
    setStreamReady(false);
    setStatus('watching');
    setMessage('Waiting for the auction host to connect...');
    s.emit('stream:watch', { auctionId });
  };

  useEffect(() => {
    const s = getSocket();
    if (!s) return;
    socketRef.current = s;

    const handleViewerJoined = async ({ auctionId: evtAuctionId, viewerSocketId }) => {
      if (evtAuctionId?.toString() !== auctionId || !isSeller) return;
      const localStream = localStreamRef.current;
      if (!localStream || !viewerSocketId || peerConnectionsRef.current.has(viewerSocketId)) return;
      try {
        const pc = createRtcPeerConnection();
        peerConnectionsRef.current.set(viewerSocketId, pc);
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
        pc.onicecandidate = (event) => {
          if (event.candidate) s.emit('webrtc:ice', { to: viewerSocketId, candidate: event.candidate });
        };
        pc.onconnectionstatechange = () => {
          if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) cleanupPeer(viewerSocketId);
        };
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        s.emit('webrtc:offer', { to: viewerSocketId, offer });
        setStatus('live');
        setMessage('Broadcasting live to auction viewers.');
      } catch (err) {
        cleanupPeer(viewerSocketId);
        console.warn('Failed to create WebRTC offer:', err);
      }
    };

    const handleOffer = async ({ from, offer }) => {
      if (isSeller || !from || !offer) return;
      try {
        let pc = peerConnectionsRef.current.get(from);
        if (!pc) {
          pc = createRtcPeerConnection();
          peerConnectionsRef.current.set(from, pc);
          pc.onicecandidate = (event) => {
            if (event.candidate) s.emit('webrtc:ice', { to: from, candidate: event.candidate });
          };
          pc.ontrack = (event) => {
            const remoteStream = event.streams?.[0];
            if (remoteStream) {
              attachStream(remoteVideoRef.current, remoteStream, false);
              setStatus('watching');
              setMessage('Connected to the live stream.');
            }
          };
          pc.onconnectionstatechange = () => {
            if (['failed', 'disconnected', 'closed'].includes(pc.connectionState)) cleanupPeer(from);
          };
        }
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        s.emit('webrtc:answer', { to: from, answer });
      } catch (err) {
        cleanupPeer(from);
        setStatus('idle');
        setMessage('');
        showToast('Failed to connect to the live stream', 'error');
      }
    };

    const handleAnswer = async ({ from, answer }) => {
      if (!isSeller || !from || !answer) return;
      const pc = peerConnectionsRef.current.get(from);
      if (!pc) return;
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        setStatus('live');
      } catch (err) {
        console.warn('Failed to apply WebRTC answer:', err);
      }
    };

    const handleIce = async ({ from, candidate }) => {
      if (!from || !candidate) return;
      const pc = peerConnectionsRef.current.get(from);
      if (!pc) return;
      try {
        await pc.addIceCandidate(candidate);
      } catch (err) {
        console.warn('Failed to add ICE candidate:', err);
      }
    };

    const handleStarted = ({ auctionId: evtAuctionId }) => {
      if (evtAuctionId?.toString() !== auctionId) return;
      setStatus(isSeller ? 'live' : 'watching');
      setMessage(isSeller ? 'Broadcasting live to auction viewers.' : 'Auction stream is live.');
    };

    const handleEnded = ({ auctionId: evtAuctionId }) => {
      if (evtAuctionId?.toString() !== auctionId) return;
      stopStream(false);
      setStatus('ended');
      setMessage('Live stream ended.');
    };

    const handleViewers = (data) => {
      if (data.auctionId?.toString() !== auctionId) return;
      setViewerCount(data.count || 0);
    };

    s.on('stream:viewer_joined', handleViewerJoined);
    s.on('webrtc:offer', handleOffer);
    s.on('webrtc:answer', handleAnswer);
    s.on('webrtc:ice', handleIce);
    s.on('stream:started', handleStarted);
    s.on('stream:ended', handleEnded);
    s.on('auction:viewers', handleViewers);

    return () => {
      s.off('stream:viewer_joined', handleViewerJoined);
      s.off('webrtc:offer', handleOffer);
      s.off('webrtc:answer', handleAnswer);
      s.off('webrtc:ice', handleIce);
      s.off('stream:started', handleStarted);
      s.off('stream:ended', handleEnded);
      s.off('auction:viewers', handleViewers);
      peerConnectionsRef.current.forEach((_, socketId) => cleanupPeer(socketId));
      peerConnectionsRef.current.clear();
      stopLocalStream();
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
    };
  }, [auctionId, attachStream, cleanupPeer, isSeller, stopLocalStream, stopStream]);

  useEffect(() => {
    if (!auction?.isLiveStream && auction?.streamStatus !== 'live') return;
    setStatus(isSeller ? 'live' : 'watching');
    setMessage('Auction stream is live.');
  }, [auctionId, isSeller, auction?.isLiveStream, auction?.streamStatus]);

  const frameStyle = {
    border: '1px solid #2a2a2a',
    borderRadius: 14,
    overflow: 'hidden',
    background: '#0d0d0d',
    minHeight: 220,
    display: 'flex',
    flexDirection: 'column'
  };

  const showStreamSkeleton = !streamReady && status !== 'ended';

  return React.createElement('div', { className:'card', style:{ padding:16, marginBottom:20 } },
    React.createElement('div', { style:{ display:'flex',justifyContent:'space-between',alignItems:'center',gap:12,marginBottom:12 } },
      React.createElement('div', null,
        React.createElement('h3', { style:{ fontWeight:600, color:'#F59E0B', marginBottom:4 } }, 'Live Stream'),
        React.createElement('p', { style:{ color:'#888', fontSize:'.8rem' } }, isSeller ? 'Broadcast your listing to active bidders.' : 'Watch the seller present the item in real time.')
      ),
      React.createElement('div', { style:{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:4 } },
        React.createElement('span', { className: `badge ${status === 'ended' ? 'badge-ended' : 'badge-live'}` }, status === 'live' ? 'LIVE' : status === 'watching' ? 'CONNECTED' : status === 'ended' ? 'ENDED' : 'READY'),
        React.createElement('span', { style:{ color:'#666', fontSize:'.75rem' } }, `${viewerCount} watcher${viewerCount === 1 ? '' : 's'}`)
      )
    ),
    React.createElement('div', { style:{ marginBottom:12 } },
      React.createElement('div', { style:frameStyle },
        React.createElement('div', { style:{ position:'relative', width:'100%', height:240, background:'#111' } },
          isSeller ? React.createElement('video', {
            ref: localVideoRef,
            autoPlay: true,
            muted: true,
            playsInline: true,
            style:{ width:'100%', height:240, objectFit:'cover', background:'#111' }
          }) : React.createElement('video', {
            ref: remoteVideoRef,
            autoPlay: true,
            playsInline: true,
            controls: false,
            style:{ width:'100%', height:240, objectFit:'cover', background:'#111' }
          }),
          showStreamSkeleton && React.createElement('div', { className:'stream-skeleton', style:{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', flexDirection:'column', gap:10, background:'rgba(10,10,10,.78)' } },
            React.createElement('div', { style:{ display:'flex', alignItems:'center', gap:8, padding:'6px 12px', border:'1px solid rgba(245,158,11,.35)', borderRadius:99, background:'rgba(245,158,11,.1)' } },
              React.createElement('span', { className:'live-dot' }),
              React.createElement('span', { style:{ color:'#fbbf24', fontSize:12, fontWeight:700, letterSpacing:'.06em' } }, 'LIVE ROOM')
            ),
            React.createElement('div', { style:{ display:'flex', gap:14, fontSize:24, lineHeight:1 } },
              React.createElement('span', { title:'Bidding' }, '🔨'),
              React.createElement('span', { title:'Discussion' }, '💬'),
              React.createElement('span', { title:'Audience' }, '👥')
            ),
            React.createElement('div', { style:{ color:'#9ca3af', fontSize:12, textAlign:'center' } },
              isSeller ? 'Go live to start bidding discussions' : 'Waiting for seller to start the live bidding room'
            )
          )
        ),
        React.createElement('div', { style:{ padding:12, borderTop:'1px solid #1f1f1f', color:'#888', fontSize:'.8rem' } },
          message || (isSeller ? 'Camera preview appears here after you go live.' : 'Click watch to join the live stream.')
        )
      )
    ),
    React.createElement('div', { style:{ display:'flex', gap:8, flexWrap:'wrap' } },
      isSeller
        ? React.createElement(React.Fragment, null,
            React.createElement('button', {
              type:'button',
              onClick: status === 'live' ? stopStream : startStream,
              disabled: isEnded,
              className:'btn-gold',
              style:{ padding:'10px 14px', borderRadius:10 }
            }, status === 'live' ? 'End Stream' : 'Go Live'),
            React.createElement('span', { style:{ color:'#666', alignSelf:'center', fontSize:'.8rem' } }, isEnded ? 'Auction ended' : 'Use your camera and microphone to present the item.')
          )
        : React.createElement(React.Fragment, null,
            React.createElement('button', {
              type:'button',
              onClick: status === 'watching' ? () => stopStream(false) : watchStream,
              disabled: isEnded,
              className:'btn-gold',
              style:{ padding:'10px 14px', borderRadius:10 }
            }, status === 'watching' ? 'Leave Stream' : 'Watch Live'),
            React.createElement('span', { style:{ color:'#666', alignSelf:'center', fontSize:'.8rem' } }, isEnded ? 'Stream unavailable' : 'The seller can join at any time and start broadcasting.')
          )
    )
  );
}

// ── NAVBAR ───────────────────────────────────────────────────
function Navbar() {
  const { user, logout } = useAuth();
  const { navigate, page } = useApp();
  const [notifCount, setNotifCount] = useState(0);
  const [menuOpen, setMenuOpen]     = useState(false);

  useEffect(() => {
    if (!user) return;
    api('/notifications?unreadOnly=true&limit=1')
      .then(d => setNotifCount(d.unreadCount || 0))
      .catch(() => {});
    const s = getSocket();
    if (s) {
      s.on('notification:outbid',       () => setNotifCount(c => c+1));
      s.on('notification:auction_won',  () => setNotifCount(c => c+1));
      s.on('notification:broadcast',    (d) => { showToast(d.message||d.title,'info'); setNotifCount(c=>c+1); });
    }
  }, [user]);

  const navLink = (to, label, active) =>
    React.createElement('button', {
      onClick: () => navigate(to),
      style:{ background:'none',border:'none',cursor:'pointer',color: page===active||page===to ? '#F59E0B':'#aaa',fontWeight:500,fontSize:'.9rem',fontFamily:'inherit',padding:'6px 4px',transition:'color .2s' }
    }, label);

  return React.createElement('nav', {
    style:{ position:'fixed',top:0,left:0,right:0,zIndex:100,background:'rgba(15,15,15,.95)',backdropFilter:'blur(12px)',borderBottom:'1px solid #1a1a1a',height:60 }
  },
    React.createElement('div', { style:{ maxWidth:1280,margin:'0 auto',padding:'0 20px',height:'100%',display:'flex',alignItems:'center',justifyContent:'space-between' } },
      // Logo
      React.createElement('button', { onClick:()=>navigate('home'), style:{ background:'none',border:'none',cursor:'pointer',display:'flex',alignItems:'center',gap:8 } },
        React.createElement('div', { style:{ width:32,height:32,background:'linear-gradient(135deg,#F59E0B,#D97706)',borderRadius:8,display:'flex',alignItems:'center',justifyContent:'center' } },
          React.createElement('span', { style:{ fontSize:'1.1rem',fontWeight:700,color:'#000' } }, '⚡')
        ),
        React.createElement('span', { style:{ fontFamily:'Bebas Neue,sans-serif',fontSize:'1.6rem',color:'#F59E0B',letterSpacing:'.08em',lineHeight:1 } }, 'BIDWARS')
      ),
      // Nav links (desktop)
      React.createElement('div', { style:{ display:'flex',gap:24,alignItems:'center' } },
        navLink('home',     'Home'),
        navLink('auctions', 'Auctions'),
        navLink('categories','Categories'),
        user && navLink('create', '+ List Item'),
        user?.role === 'admin' && navLink('admin', '⚙️ Admin')
      ),
      // Right side
      React.createElement('div', { style:{ display:'flex',alignItems:'center',gap:12 } },
        user ? React.createElement(React.Fragment, null,
          // Notifications bell
          React.createElement('button', {
            onClick: () => navigate('notifications'),
            style:{ position:'relative',background:'none',border:'none',cursor:'pointer',fontSize:'1.3rem',padding:4 }
          },
            '🔔',
            notifCount > 0 && React.createElement('span', {
              style:{ position:'absolute',top:-2,right:-2,background:'#ef4444',color:'#fff',fontSize:10,fontWeight:700,width:16,height:16,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center' }
            }, notifCount > 9 ? '9+' : notifCount)
          ),
          // User menu
          React.createElement('div', { style:{ position:'relative' } },
            React.createElement('button', {
              onClick: () => setMenuOpen(!menuOpen),
              style:{ display:'flex',alignItems:'center',gap:8,background:'#1a1a1a',border:'1px solid #2a2a2a',borderRadius:10,padding:'6px 12px',cursor:'pointer',color:'#f5f5f5',fontFamily:'inherit',fontSize:'.875rem' }
            },
              React.createElement('div', { style:{ width:24,height:24,background:'linear-gradient(135deg,#F59E0B,#D97706)',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',color:'#000',fontWeight:700,fontSize:11 } }, (user.name||'?')[0].toUpperCase()),
              user.name?.split(' ')[0],
              '▾'
            ),
            menuOpen && React.createElement('div', {
              style:{ position:'absolute',top:42,right:0,background:'#1a1a1a',border:'1px solid #2a2a2a',borderRadius:12,padding:8,minWidth:160,zIndex:200,boxShadow:'0 8px 32px rgba(0,0,0,.6)' },
              onMouseLeave: () => setMenuOpen(false)
            },
              [['dashboard','📊 Dashboard'],['profile','👤 Profile'],['my-bids','🔨 My Bids']].map(([to,label]) =>
                React.createElement('button', { key:to, onClick:()=>{ navigate(to); setMenuOpen(false); },
                  style:{ display:'block',width:'100%',textAlign:'left',background:'none',border:'none',cursor:'pointer',color:'#ccc',padding:'8px 12px',borderRadius:8,fontSize:'.875rem',fontFamily:'inherit' }
                }, label)
              ),
              React.createElement('hr', { style:{ border:'none',borderTop:'1px solid #2a2a2a',margin:'4px 0' } }),
              React.createElement('button', { onClick:()=>{ logout(); setMenuOpen(false); },
                style:{ display:'block',width:'100%',textAlign:'left',background:'none',border:'none',cursor:'pointer',color:'#ef4444',padding:'8px 12px',borderRadius:8,fontSize:'.875rem',fontFamily:'inherit' }
              }, '🚪 Logout')
            )
          )
        ) : React.createElement('div', { style:{ display:'flex',gap:8 } },
          React.createElement('button', { onClick:()=>navigate('login'),  className:'btn-outline', style:{ padding:'7px 16px',borderRadius:9,fontSize:'.875rem' } }, 'Login'),
          React.createElement('button', { onClick:()=>navigate('register'),className:'btn-gold',   style:{ padding:'7px 16px',borderRadius:9,fontSize:'.875rem' } }, 'Register')
        )
      )
    )
  );
}

// ── AUCTION CARD ─────────────────────────────────────────────
function AuctionCard({ auction, onClick }) {
  const urgent = auction.endTime && (new Date(auction.endTime) - Date.now()) < 3600000 && auction.status === 'live';
  const img = getAuctionImageUrl(auction, 'card');

  return React.createElement('div', {
    onClick, className:'card',
    style:{ cursor:'pointer',overflow:'hidden',transition:'all .25s' },
    onMouseEnter: e => e.currentTarget.style.transform='translateY(-4px)',
    onMouseLeave: e => e.currentTarget.style.transform='translateY(0)'
  },
    // Image
    React.createElement('div', { style:{ position:'relative',height:200,overflow:'hidden',background:'#111' } },
      React.createElement('img', { src:img, alt:auction.title, loading:'lazy',
        style:{ width:'100%',height:'100%',objectFit:'cover',transition:'transform .3s' },
        onMouseEnter: e => e.target.style.transform='scale(1.05)',
        onMouseLeave: e => e.target.style.transform='scale(1)',
        onError: e => { e.target.src = getAuctionImageFallback(auction, 'card'); }
      }),
      auction.status === 'live' && React.createElement('div', { style:{ position:'absolute',top:10,left:10,display:'flex',gap:6 } },
        React.createElement('span', { className:'badge badge-live' }, React.createElement('span', { className:'live-dot', style:{ marginRight:4 } }), 'LIVE')
      ),
      auction.buyNowPrice > 0 && React.createElement('span', {
        style:{ position:'absolute',top:10,right:10,background:'rgba(34,197,94,.85)',color:'#fff',fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:99 }
      }, 'BUY NOW')
    ),
    // Info
    React.createElement('div', { style:{ padding:16 } },
      React.createElement('p', { style:{ color:'#666',fontSize:11,marginBottom:4,textTransform:'uppercase',letterSpacing:'.05em' } }, auction.category),
      React.createElement('h3', { style:{ fontSize:'1rem',fontWeight:600,marginBottom:12,lineHeight:1.35,
        overflow:'hidden',display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical' } }, auction.title),
      React.createElement('div', { style:{ display:'flex',justifyContent:'space-between',alignItems:'flex-end' } },
        React.createElement('div', null,
          React.createElement('p', { style:{ color:'#666',fontSize:11,marginBottom:2 } }, 'Current Bid'),
          React.createElement('p', { style:{ fontSize:'1.3rem',fontWeight:700,color:'#F59E0B',fontFamily:'monospace' } }, fmt(auction.currentPrice))
        ),
        React.createElement('div', { style:{ textAlign:'right' } },
          React.createElement('p', { style:{ color:'#555',fontSize:11,marginBottom:2 } }, `${auction.bidCount||0} bids`),
          auction.endTime && React.createElement('p', { style:{ fontSize:12,fontWeight:600,color: urgent?'#ef4444':'#888' } },
            urgent ? '⏰ ' : '⏱ ', timeLeft(auction.endTime)
          )
        )
      )
    )
  );
}

// ── HOME PAGE ─────────────────────────────────────────────────
function HomePage() {
  const { navigate } = useApp();
  const [featured,   setFeatured]   = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [stats,      setStats]      = useState({ auctions:0, users:0, bids:0 });

  const DEFAULT_CATS = [
    {name:'Electronics',slug:'electronics',icon:'💻'},{name:'Fashion',slug:'fashion',icon:'👗'},
    {name:'Collectibles',slug:'collectibles',icon:'🏆'},{name:'Art',slug:'art',icon:'🎨'},
    {name:'Jewelry',slug:'jewelry',icon:'💍'},{name:'Vehicles',slug:'vehicles',icon:'🚗'},
    {name:'Sports',slug:'sports',icon:'⚽'},{name:'Books & Media',slug:'books',icon:'📚'}
  ];

  useEffect(() => {
    Promise.all([
      api('/auctions?status=live&limit=8&sort=-bidCount').catch(()=>({ auctions:[] })),
      api('/categories').catch(()=>({ categories:[] }))
    ]).then(([auc, cats]) => {
      setFeatured(auc.auctions || []);
      setCategories(cats.categories || []);
    }).finally(() => setLoading(false));
  }, []);

  const cats = categories.length ? categories : DEFAULT_CATS;

  return React.createElement('div', { style:{ paddingTop:60 } },
    // Hero
    React.createElement('section', {
      style:{ padding:'80px 20px 60px',background:'linear-gradient(135deg,#0F0F0F 0%,#1a0d00 50%,#0F0F0F 100%)',textAlign:'center' }
    },
      React.createElement('div', { style:{ maxWidth:700,margin:'0 auto' } },
        React.createElement('div', { style:{ display:'inline-flex',alignItems:'center',gap:8,background:'rgba(245,158,11,.1)',border:'1px solid rgba(245,158,11,.2)',borderRadius:99,padding:'4px 16px',fontSize:12,color:'#F59E0B',marginBottom:24 } },
          React.createElement('span', { className:'live-dot' }), 'Live Auctions Happening Now'
        ),
        React.createElement('h1', { style:{ fontFamily:'Bebas Neue,sans-serif',fontSize:'clamp(3rem,8vw,5.5rem)',color:'#F5F5F5',letterSpacing:'.03em',lineHeight:.95,marginBottom:20 } },
          'BID. WIN. ', React.createElement('span', { style:{ color:'#F59E0B' } }, 'OWN IT.')
        ),
        React.createElement('p', { style:{ color:'#888',fontSize:'1.1rem',marginBottom:36,maxWidth:480,margin:'0 auto 36px' } },
          'Real-time online auctions with live bidding, auto-bid, and escrow-protected payments.'
        ),
        React.createElement('div', { style:{ display:'flex',gap:16,justifyContent:'center',flexWrap:'wrap' } },
          React.createElement('button', { onClick:()=>navigate('auctions'), className:'btn-gold', style:{ padding:'14px 36px',borderRadius:12,fontSize:'1rem' } }, '🔨 Browse Auctions'),
          React.createElement('button', { onClick:()=>navigate('register'), className:'btn-outline', style:{ padding:'14px 36px',borderRadius:12,fontSize:'1rem' } }, '🚀 Start Selling')
        )
      )
    ),

    // Stats bar
    React.createElement('div', { style:{ background:'#111',borderTop:'1px solid #1a1a1a',borderBottom:'1px solid #1a1a1a',padding:'20px 20px' } },
      React.createElement('div', { style:{ maxWidth:800,margin:'0 auto',display:'flex',justifyContent:'space-around',flexWrap:'wrap',gap:20 } },
        [['⚡','Live Auctions','Real-time bidding'],['🛡️','Escrow Protected','Secure payments'],['🤖','AI Price Guide','Smart recommendations'],['📱','Mobile Ready','Bid from anywhere']].map(([icon,title,sub])=>
          React.createElement('div', { key:title, style:{ textAlign:'center' } },
            React.createElement('div', { style:{ fontSize:'1.8rem',marginBottom:6 } }, icon),
            React.createElement('div', { style:{ fontWeight:600,fontSize:'.9rem' } }, title),
            React.createElement('div', { style:{ color:'#666',fontSize:.75+'rem' } }, sub)
          )
        )
      )
    ),

    // Categories
    React.createElement('section', { style:{ maxWidth:1280,margin:'0 auto',padding:'48px 20px 24px' } },
      React.createElement('h2', { style:{ fontFamily:'Bebas Neue,sans-serif',fontSize:'2rem',letterSpacing:'.05em',marginBottom:24,color:'#F59E0B' } }, 'Browse Categories'),
      React.createElement('div', { style:{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:12 } },
        cats.map(c => React.createElement('button', {
          key:c.slug||c.name,
          onClick: () => navigate(`auctions?category=${c.slug||c.name}`),
          style:{ background:'#1a1a1a',border:'1px solid #2a2a2a',borderRadius:14,padding:'20px 12px',cursor:'pointer',textAlign:'center',transition:'all .2s',color:'#f5f5f5',fontFamily:'inherit' },
          onMouseEnter: e=>{ e.currentTarget.style.borderColor='#F59E0B'; e.currentTarget.style.background='rgba(245,158,11,.05)'; },
          onMouseLeave: e=>{ e.currentTarget.style.borderColor='#2a2a2a'; e.currentTarget.style.background='#1a1a1a'; }
        },
          React.createElement('div', { style:{ fontSize:'2rem',marginBottom:8 } }, c.icon||'📦'),
          React.createElement('div', { style:{ fontSize:'.8rem',fontWeight:600 } }, c.name)
        ))
      )
    ),

    // Featured Auctions
    React.createElement('section', { style:{ maxWidth:1280,margin:'0 auto',padding:'24px 20px 60px' } },
      React.createElement('div', { style:{ display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:24 } },
        React.createElement('h2', { style:{ fontFamily:'Bebas Neue,sans-serif',fontSize:'2rem',letterSpacing:'.05em',color:'#F59E0B' } }, '🔥 Live Auctions'),
        React.createElement('button', { onClick:()=>navigate('auctions'), style:{ background:'none',border:'none',cursor:'pointer',color:'#F59E0B',fontSize:'.875rem',fontWeight:600,fontFamily:'inherit' } }, 'View All →')
      ),
      loading ? React.createElement('div', { style:{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:20 } },
        Array(4).fill(0).map((_,i) => React.createElement('div', { key:i, style:{ background:'#1a1a1a',borderRadius:16,height:300,border:'1px solid #2a2a2a' } }))
      ) : featured.length === 0 ? React.createElement('div', { style:{ textAlign:'center',padding:60,color:'#555' } },
        React.createElement('div', { style:{ fontSize:'3rem',marginBottom:12 } }, '🔨'),
        React.createElement('p', { style:{ fontSize:'1.1rem' } }, 'No live auctions yet.'),
        React.createElement('p', { style:{ fontSize:'.875rem',marginTop:8 } }, 'Run "node config/seed.js" in the backend to add sample auctions.')
      ) : React.createElement('div', { style:{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:20 } },
        featured.map(a => React.createElement(AuctionCard, { key:a._id, auction:a, onClick:()=>navigate(`auction/${a._id}`) }))
      )
    ),

    // Footer
    React.createElement('footer', { style:{ borderTop:'1px solid #1a1a1a',padding:'32px 20px',textAlign:'center',color:'#444',fontSize:'.8rem' } },
      'Bid hard, bid smart, and let every second count.'
    )
  );
}

// ── AUCTIONS LIST PAGE ────────────────────────────────────────
function AuctionsPage() {
  const { navigate } = useApp();
  const [auctions, setAuctions] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [total,    setTotal]    = useState(0);
  const [page,     setPage]     = useState(1);
  const [filters,  setFilters]  = useState({ search:'', category:'', status:'live', sort:'-createdAt', minPrice:'', maxPrice:'', condition:'' });
  const [showFilt, setShowFilt] = useState(false);
  const [categories, setCats]   = useState([]);
  const LIMIT = 12;

  useEffect(() => { api('/categories').then(d=>setCats(d.categories||[])).catch(()=>{}); }, []);
  useEffect(() => { load(); }, [page, filters]);

  const load = async () => {
    setLoading(true);
    try {
      const p = new URLSearchParams({ page, limit:LIMIT });
      Object.entries(filters).forEach(([k,v]) => { if(v) p.set(k,v); });
      const d = await api(`/auctions?${p}`);
      setAuctions(d.auctions||[]);
      setTotal(d.pagination?.total||0);
    } catch(e) { showToast(e.message,'error'); }
    finally { setLoading(false); }
  };

  const setFilter = (k,v) => { setFilters(f=>({...f,[k]:v})); setPage(1); };
  const clearFilters = () => { setFilters({ search:'',category:'',status:'live',sort:'-createdAt',minPrice:'',maxPrice:'',condition:'' }); setPage(1); };
  const pages = Math.ceil(total/LIMIT);

  // Read category from hash params
  useEffect(() => {
    const hash = window.location.hash;
    const match = hash.match(/\?category=([^&]+)/);
    if (match) setFilter('category', decodeURIComponent(match[1]));
  }, []);

  return React.createElement('div', { style:{ paddingTop:60 } },
    // Search bar
    React.createElement('div', { style:{ background:'#111',borderBottom:'1px solid #1a1a1a',padding:'12px 20px',position:'sticky',top:60,zIndex:50 } },
      React.createElement('div', { style:{ maxWidth:1280,margin:'0 auto',display:'flex',gap:10,flexWrap:'wrap',alignItems:'center' } },
        React.createElement('div', { style:{ flex:1,minWidth:200,position:'relative' } },
          React.createElement('input', { className:'input', value:filters.search,
            onChange:e=>setFilter('search',e.target.value),
            placeholder:'🔍 Search auctions...', style:{ paddingLeft:16 } })
        ),
        React.createElement('select', { className:'input', value:filters.status, onChange:e=>setFilter('status',e.target.value), style:{width:130} },
          [['','All Status'],['live','Live'],['scheduled','Upcoming'],['ended','Ended']].map(([v,l])=>React.createElement('option',{key:v,value:v},l))
        ),
        React.createElement('select', { className:'input', value:filters.sort, onChange:e=>setFilter('sort',e.target.value), style:{width:150} },
          [['-createdAt','Newest'],[' endTime','Ending Soon'],['currentPrice','Price ↑'],['-currentPrice','Price ↓'],['-bidCount','Most Bids']].map(([v,l])=>React.createElement('option',{key:v,value:v},l))
        ),
        React.createElement('button', { onClick:()=>setShowFilt(!showFilt),
          style:{ padding:'11px 16px',borderRadius:10,background: showFilt?'#F59E0B':'#1a1a1a',color: showFilt?'#000':'#ccc',border:'1px solid #2a2a2a',cursor:'pointer',fontFamily:'inherit',fontSize:'.875rem' }
        }, '⚙ Filters'),
        React.createElement('button', { onClick:()=>navigate('create'),
          className:'btn-gold', style:{ padding:'11px 20px',borderRadius:10,fontSize:'.875rem' }
        }, '+ List Item')
      ),
      showFilt && React.createElement('div', { style:{ maxWidth:1280,margin:'10px auto 0',display:'flex',gap:10,flexWrap:'wrap',alignItems:'flex-end' } },
        React.createElement('select', { className:'input', value:filters.category, onChange:e=>setFilter('category',e.target.value), style:{width:160} },
          [React.createElement('option',{key:'',value:''},'All Categories'),
           ...categories.map(c=>React.createElement('option',{key:c.slug,value:c.slug},c.name))]
        ),
        React.createElement('select', { className:'input', value:filters.condition, onChange:e=>setFilter('condition',e.target.value), style:{width:130} },
          [['','Any Condition'],['new','New'],['like-new','Like New'],['excellent','Excellent'],['good','Good'],['fair','Fair']].map(([v,l])=>React.createElement('option',{key:v,value:v},l))
        ),
        React.createElement('input', { className:'input', type:'number', placeholder:'Min $', value:filters.minPrice, onChange:e=>setFilter('minPrice',e.target.value), style:{width:110} }),
        React.createElement('input', { className:'input', type:'number', placeholder:'Max $', value:filters.maxPrice, onChange:e=>setFilter('maxPrice',e.target.value), style:{width:110} }),
        React.createElement('button', { onClick:clearFilters, style:{ padding:'11px 16px',borderRadius:10,background:'none',border:'1px solid #ef4444',color:'#ef4444',cursor:'pointer',fontSize:'.875rem',fontFamily:'inherit' } }, 'Clear')
      )
    ),

    React.createElement('div', { style:{ maxWidth:1280,margin:'0 auto',padding:'24px 20px' } },
      React.createElement('p', { style:{ color:'#555',fontSize:'.875rem',marginBottom:16 } }, loading ? 'Loading...' : `${total} auctions`),
      loading ? React.createElement('div', { style:{ display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:20 } },
        Array(8).fill(0).map((_,i)=>React.createElement('div',{key:i,style:{background:'#1a1a1a',borderRadius:16,height:300,border:'1px solid #2a2a2a'}}))
      ) : auctions.length===0 ? React.createElement('div',{ style:{textAlign:'center',padding:60,color:'#555'} },
        React.createElement('div',{style:{fontSize:'3rem',marginBottom:12}},'🔍'),
        React.createElement('p',null,'No auctions found.'),
        React.createElement('button',{onClick:clearFilters,style:{marginTop:16,padding:'10px 24px',borderRadius:10,background:'#F59E0B',border:'none',color:'#000',fontWeight:600,cursor:'pointer',fontSize:'.875rem',fontFamily:'inherit'}},'Clear Filters')
      ) : React.createElement('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:20}},
        auctions.map(a=>React.createElement(AuctionCard,{key:a._id,auction:a,onClick:()=>navigate(`auction/${a._id}`)}))
      ),

      pages>1 && React.createElement('div',{style:{display:'flex',justifyContent:'center',gap:8,marginTop:32}},
        React.createElement('button',{onClick:()=>setPage(p=>Math.max(1,p-1)),disabled:page===1,style:{padding:'8px 16px',borderRadius:8,background:'#1a1a1a',border:'1px solid #2a2a2a',color:page===1?'#444':'#ccc',cursor:page===1?'not-allowed':'pointer',fontFamily:'inherit'}},'← Prev'),
        Array.from({length:Math.min(5,pages)},(_,i)=>{ const pg=page<=3?i+1:page+i-2; if(pg>pages)return null;
          return React.createElement('button',{key:pg,onClick:()=>setPage(pg),style:{width:40,height:36,borderRadius:8,background:pg===page?'#F59E0B':'#1a1a1a',border:'1px solid #2a2a2a',color:pg===page?'#000':'#ccc',cursor:'pointer',fontWeight:pg===page?700:400,fontFamily:'inherit'}},pg);
        }),
        React.createElement('button',{onClick:()=>setPage(p=>Math.min(pages,p+1)),disabled:page===pages,style:{padding:'8px 16px',borderRadius:8,background:'#1a1a1a',border:'1px solid #2a2a2a',color:page===pages?'#444':'#ccc',cursor:page===pages?'not-allowed':'pointer',fontFamily:'inherit'}},'Next →')
      )
    )
  );
}


// ── AUCTION DETAIL PAGE ───────────────────────────────────────
function AuctionDetailPage({ auctionId }) {
  const { user }  = useAuth();
  const { navigate } = useApp();
  const [auction,    setAuction]    = useState(null);
  const [bids,       setBids]       = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [bidAmount,  setBidAmount]  = useState('');
  const [maxBid,     setMaxBid]     = useState('');
  const [bidding,    setBidding]    = useState(false);
  const [watching,   setWatching]   = useState(false);
  const [viewers,    setViewers]    = useState(0);
  const [messages,   setMessages]   = useState([]);
  const [chatInput,  setChatInput]  = useState('');
  const [showAutoBid,setShowAutoBid]= useState(false);
  const chatRef = useRef(null);

  useEffect(() => {
    loadAuction();
    loadBids();
  }, [auctionId]);

  useEffect(() => {
    if (!auctionId) return;
    const s = getSocket();
    if (!s) return;
    s.emit('auction:join', auctionId);

    s.on('bid:new', (data) => {
      if (data.auctionId?.toString() !== auctionId) return;
      setAuction(a => a ? { ...a, currentPrice:data.amount, bidCount:data.bidCount, endTime:data.endTime, reserveMet:data.reserveMet } : a);
      setBids(prev => [{
        _id: Date.now(), amount:data.amount,
        bidder:{ name:data.bidder?.name||'User' },
        isAutoBid:data.isAutoBid, createdAt:new Date()
      }, ...prev].slice(0,50));
      showToast(`New bid: ${fmt(data.amount)}${data.isAutoBid?' (auto)':''}`, 'info', 2500);
    });

    s.on('auction:ended',     (d) => { if(d.auctionId?.toString()===auctionId) { loadAuction(); showToast('Auction has ended!','warning'); } });
    s.on('auction:viewers',   (d) => { if(d.auctionId===auctionId) setViewers(d.count); });
    s.on('auction:sold',      (d) => { if(d.auctionId?.toString()===auctionId) { loadAuction(); showToast('Item sold via Buy Now!','warning'); } });
    s.on('chat:message',      (m) => { if(m.auctionId===auctionId) setMessages(p=>[...p,m]); });
    s.on('auction:ending_soon',(d) => { if(d.auctionId?.toString()===auctionId) showToast(`⏰ Ending in ${d.minutesLeft} minutes!`,'warning',6000); });

    return () => {
      s.emit('auction:leave', auctionId);
      ['bid:new','auction:ended','auction:viewers','auction:sold','chat:message','auction:ending_soon'].forEach(e=>s.off(e));
    };
  }, [auctionId]);

  useEffect(() => { if(chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight; }, [messages]);

  const loadAuction = async () => {
    try {
      const d = await api(`/auctions/${auctionId}`);
      setAuction(d.auction);
      if(d.auction?.currentPrice) setBidAmount(String(d.auction.currentPrice + (d.auction.bidIncrement||1)));
    } catch(e) { showToast(e.message,'error'); }
    finally { setLoading(false); }
  };

  const loadBids = async () => {
    try {
      const d = await api(`/bids/${auctionId}/history`);
      setBids(d.bids||[]);
    } catch(e) {}
  };

  const placeBid = async () => {
    if (!user) return navigate('login');
    const amount = Number(bidAmount);
    const minBid = (auction.currentPrice||0) + (auction.bidIncrement||1);
    if (!amount || amount < minBid) return showToast(`Minimum bid is ${fmt(minBid)}`,'warning');
    setBidding(true);
    try {
      await api(`/bids/${auctionId}`, { method:'POST', body:JSON.stringify({ amount, maxAutoBid: maxBid ? Number(maxBid):undefined }) });
      showToast(`Bid of ${fmt(amount)} placed!`,'success');
      setMaxBid('');
    } catch(e) { showToast(e.message,'error'); }
    finally { setBidding(false); }
  };

  const buyNow = async () => {
    if (!user) return navigate('login');
    if (!confirm(`Buy now for ${fmt(auction.buyNowPrice)}?`)) return;
    try {
      await api(`/auctions/${auctionId}/buy-now`, { method:'POST' });
      showToast('Purchase successful! Proceed to payment.','success');
      navigate(`payment/${auctionId}`);
    } catch(e) { showToast(e.message,'error'); }
  };

  const toggleWatch = async () => {
    if (!user) return navigate('login');
    try {
      const d = await api(`/auctions/${auctionId}/watch`, { method:'POST' });
      setWatching(d.watching);
      showToast(d.watching ? 'Added to watchlist':'Removed from watchlist','success');
    } catch(e) { showToast(e.message,'error'); }
  };

  const sendChat = () => {
    if (!chatInput.trim()) return;
    const s = getSocket();
    if (!s) return showToast('Not connected','warning');
    if (!user) return showToast('Login to chat','warning');
    s.emit('chat:message', { auctionId, message:chatInput.trim() });
    setChatInput('');
  };

  if (loading) return React.createElement('div',{style:{paddingTop:80,textAlign:'center',color:'#555'}},'Loading auction...');
  if (!auction) return React.createElement('div',{style:{paddingTop:80,textAlign:'center',color:'#555'}},'Auction not found.');

  const isEnded  = ['ended','cancelled','sold'].includes(auction.status);
  const isWinner = user && auction.currentWinner?._id?.toString() === user._id?.toString();
  const isSeller = user && auction.seller?._id?.toString() === user._id?.toString();
  const minBid   = (auction.currentPrice||0) + (auction.bidIncrement||1);
  const img = getAuctionImageUrl(auction, 'detail');

  return React.createElement('div',{ style:{paddingTop:60} },
    React.createElement('div',{ style:{maxWidth:1200,margin:'0 auto',padding:'32px 20px'} },
      // Back button
      React.createElement('button',{ onClick:()=>navigate('auctions'), style:{background:'none',border:'none',cursor:'pointer',color:'#888',fontSize:'.875rem',marginBottom:20,display:'flex',alignItems:'center',gap:6,fontFamily:'inherit'} }, '← Back to Auctions'),

      React.createElement('div',{ style:{display:'grid',gridTemplateColumns:'1fr 380px',gap:32,alignItems:'start'} },
        // Left column
        React.createElement('div',null,
          // Image
          React.createElement('div',{ style:{borderRadius:16,overflow:'hidden',background:'#111',marginBottom:24,position:'relative'} },
            React.createElement('img',{ src:img, alt:auction.title, style:{width:'100%',maxHeight:450,objectFit:'cover'},
              onError:e=>{e.target.src = getAuctionImageFallback(auction, 'detail');} }),
            auction.status==='live' && React.createElement('div',{ style:{position:'absolute',top:16,left:16,display:'flex',alignItems:'center',gap:8,background:'rgba(0,0,0,.7)',borderRadius:99,padding:'6px 14px'} },
              React.createElement('span',{className:'live-dot'}),
              React.createElement('span',{style:{color:'#fff',fontSize:13,fontWeight:600}},'LIVE'),
              viewers>0 && React.createElement('span',{style:{color:'#aaa',fontSize:12}},`· ${viewers} watching`)
            )
          ),
          // Title & info
          React.createElement('h1',{ style:{fontSize:'1.8rem',fontWeight:700,marginBottom:8} }, auction.title),
          React.createElement('div',{ style:{display:'flex',gap:12,flexWrap:'wrap',marginBottom:20} },
            React.createElement('span',{ className:`badge ${isEnded?'badge-ended':'badge-live'}` }, auction.status.toUpperCase()),
            React.createElement('span',{ className:'badge badge-gold' }, auction.category),
            auction.condition && React.createElement('span',{ className:'badge',style:{background:'#1a1a1a',color:'#888',border:'1px solid #2a2a2a'} }, auction.condition)
          ),
          React.createElement('div',{ className:'card',style:{padding:20,marginBottom:20} },
            React.createElement('h3',{style:{fontWeight:600,marginBottom:12,color:'#F59E0B'}},'Description'),
            React.createElement('p',{style:{color:'#aaa',lineHeight:1.7,fontSize:'.9rem',whiteSpace:'pre-wrap'}}, auction.description)
          ),
          // Seller info
          React.createElement('div',{ className:'card',style:{padding:16,marginBottom:20,display:'flex',gap:12,alignItems:'center'} },
            React.createElement('div',{ style:{width:44,height:44,background:'linear-gradient(135deg,#F59E0B,#D97706)',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',color:'#000',fontWeight:700,fontSize:'1.1rem',flexShrink:0} },
              (auction.seller?.name||'S')[0].toUpperCase()
            ),
            React.createElement('div',null,
              React.createElement('p',{style:{fontWeight:600}}, auction.seller?.name||'Seller'),
              React.createElement('p',{style:{color:'#888',fontSize:'.8rem'}}, `⭐ ${auction.seller?.rating||5} · ${auction.seller?.reviewCount||0} reviews`)
            )
          ),
          // AI Price Recommendation
          auction.aiPriceRecommendation && React.createElement('div',{ style:{background:'rgba(245,158,11,.05)',border:'1px solid rgba(245,158,11,.15)',borderRadius:14,padding:16,marginBottom:20} },
            React.createElement('p',{style:{color:'#F59E0B',fontWeight:600,marginBottom:6}},'🤖 AI Price Estimate'),
            React.createElement('p',{style:{color:'#aaa',fontSize:'.875rem'}},
              `Recommended: ${fmt(auction.aiPriceRecommendation)} · Range: ${fmt(auction.aiPriceRange?.min)} – ${fmt(auction.aiPriceRange?.max)}`
            )
          ),
          React.createElement(LiveStreamPanel, { auctionId, auction, isSeller, isEnded }),
          // Bid history
          React.createElement('div',{ className:'card',style:{padding:16} },
            React.createElement('h3',{style:{fontWeight:600,marginBottom:12}}, `Bid History (${auction.bidCount||0})`),
            bids.length===0 ? React.createElement('p',{style:{color:'#555',fontSize:'.875rem',textAlign:'center',padding:20}},'No bids yet. Be the first!') :
            React.createElement('div',{style:{maxHeight:280,overflowY:'auto',display:'flex',flexDirection:'column',gap:8}},
              bids.map((b,i)=>React.createElement('div',{key:b._id||i,style:{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 12px',background:i===0?'rgba(245,158,11,.08)':'rgba(255,255,255,.03)',borderRadius:10,border:i===0?'1px solid rgba(245,158,11,.2)':'none'}},
                React.createElement('div',null,
                  React.createElement('span',{style:{fontWeight:600,fontSize:'.9rem'}}, b.bidder?.name||'User'),
                  b.isAutoBid && React.createElement('span',{style:{color:'#888',fontSize:11,marginLeft:8}},'(auto)')
                ),
                React.createElement('div',{style:{textAlign:'right'}},
                  React.createElement('div',{style:{color:'#F59E0B',fontWeight:700,fontFamily:'monospace'}}, fmt(b.amount)),
                  React.createElement('div',{style:{color:'#555',fontSize:11}}, new Date(b.createdAt).toLocaleTimeString())
                )
              ))
            )
          )
        ),

        // Right column - Bid panel
        React.createElement('div',{ style:{position:'sticky',top:76} },
          React.createElement('div',{ className:'card',style:{padding:24,marginBottom:16} },
            // Current price
            React.createElement('div',{style:{marginBottom:20}},
              React.createElement('p',{style:{color:'#888',fontSize:'.8rem',marginBottom:4}},'CURRENT BID'),
              React.createElement('p',{style:{fontSize:'2.5rem',fontWeight:700,color:'#F59E0B',fontFamily:'monospace',lineHeight:1}}, fmt(auction.currentPrice)),
              auction.bidCount>0 && React.createElement('p',{style:{color:'#666',fontSize:'.8rem',marginTop:4}}, `${auction.bidCount} bid${auction.bidCount!==1?'s':''}`),
              auction.reservePrice>0 && React.createElement('p',{style:{color: auction.reserveMet?'#22c55e':'#888',fontSize:'.75rem',marginTop:4}},
                auction.reserveMet ? '✅ Reserve met' : '⚠️ Reserve not met'
              )
            ),
            // Countdown
            !isEnded && auction.endTime && React.createElement('div',{style:{background:'#111',borderRadius:12,padding:'12px 16px',marginBottom:20,textAlign:'center'}},
              React.createElement('p',{style:{color:'#666',fontSize:11,marginBottom:4}},'ENDS IN'),
              React.createElement(Countdown, { endTime:auction.endTime, onEnd:()=>{ setAuction(a=>({...a,status:'ended'})); } })
            ),

            // Winner banner
            isEnded && isWinner && React.createElement('div',{style:{background:'rgba(245,158,11,.1)',border:'1px solid rgba(245,158,11,.3)',borderRadius:12,padding:16,marginBottom:16,textAlign:'center'}},
              React.createElement('p',{style:{fontSize:'1.5rem',marginBottom:4}},'🏆'),
              React.createElement('p',{style:{color:'#F59E0B',fontWeight:700}},'You won this auction!'),
              React.createElement('button',{onClick:()=>navigate(`payment/${auctionId}`), className:'btn-gold',style:{width:'100%',padding:'12px',borderRadius:10,marginTop:12}}, 'Proceed to Payment')
            ),

            // Bidding form
            !isEnded && !isSeller && React.createElement('div',null,
              React.createElement('div',{style:{marginBottom:12}},
                React.createElement('label',{style:{display:'block',color:'#888',fontSize:11,marginBottom:6}},'YOUR BID (min {fmt(minBid)})'.replace('{fmt(minBid)}',fmt(minBid))),
                React.createElement('input',{ className:'input', type:'number', value:bidAmount, min:minBid, step:auction.bidIncrement||1,
                  onChange:e=>setBidAmount(e.target.value), placeholder:`Min ${fmt(minBid)}`,
                  onKeyDown:e=>{ if(e.key==='Enter') placeBid(); }
                })
              ),
              React.createElement('button',{ onClick:placeBid, disabled:bidding||!user, className:'btn-gold',
                style:{width:'100%',padding:'13px',borderRadius:11,fontSize:'1rem',marginBottom:10}
              }, bidding ? '⏳ Placing bid...' : user ? `🔨 Place Bid ${bidAmount?fmt(Number(bidAmount)):''}` : 'Login to Bid'),
              auction.buyNowPrice>0 && React.createElement('button',{ onClick:buyNow,
                style:{width:'100%',padding:'12px',borderRadius:11,background:'rgba(34,197,94,.15)',border:'1px solid rgba(34,197,94,.3)',color:'#22c55e',fontWeight:600,cursor:'pointer',fontFamily:'inherit',marginBottom:10}
              }, `⚡ Buy Now ${fmt(auction.buyNowPrice)}`),
              // Auto-bid toggle
              React.createElement('button',{onClick:()=>setShowAutoBid(!showAutoBid),
                style:{width:'100%',padding:'10px',borderRadius:11,background:'none',border:'1px solid #2a2a2a',color:'#888',cursor:'pointer',fontFamily:'inherit',fontSize:'.875rem'}
              }, showAutoBid ? '▲ Hide Auto-Bid' : '🤖 Set Auto-Bid'),
              showAutoBid && React.createElement('div',{style:{marginTop:10,padding:14,background:'#111',borderRadius:12,border:'1px solid #2a2a2a'}},
                React.createElement('p',{style:{color:'#aaa',fontSize:'.8rem',marginBottom:8}},'Auto-bid up to your max. System bids the minimum needed to keep you winning.'),
                React.createElement('input',{className:'input',type:'number',value:maxBid,onChange:e=>setMaxBid(e.target.value),placeholder:`Max auto-bid (>${fmt(auction.currentPrice)})`,style:{marginBottom:8}}),
                React.createElement('button',{onClick:async()=>{
                  if(!user) return navigate('login');
                  if(!maxBid||Number(maxBid)<=auction.currentPrice) return showToast('Max bid must exceed current price','warning');
                  try{await api(`/bids/${auctionId}/autobid`,{method:'POST',body:JSON.stringify({maxBid:Number(maxBid)})});showToast('Auto-bid set!','success');setShowAutoBid(false);}catch(e){showToast(e.message,'error');}
                },className:'btn-gold',style:{width:'100%',padding:'10px',borderRadius:9}}, 'Set Auto-Bid')
              )
            ),

            !isEnded && isSeller && React.createElement('div',{style:{textAlign:'center',padding:16,color:'#666',fontSize:'.875rem'}},'You are the seller of this auction.'),
            isEnded && !isWinner && React.createElement('div',{style:{textAlign:'center',padding:16,color:'#666',fontSize:'.875rem'}},
              auction.currentWinner ? `Sold for ${fmt(auction.currentPrice)}` : 'Ended with no bids.'
            ),

            // Watch button
            React.createElement('button',{onClick:toggleWatch,
              style:{width:'100%',marginTop:12,padding:'10px',borderRadius:11,background:'none',border:`1px solid ${watching?'#F59E0B':'#2a2a2a'}`,color:watching?'#F59E0B':'#888',cursor:'pointer',fontFamily:'inherit',fontSize:'.875rem',fontWeight:600}
            }, watching ? '⭐ Watching' : '☆ Add to Watchlist')
          ),

          // Live Chat
          React.createElement('div',{className:'card',style:{overflow:'hidden'}},
            React.createElement('div',{style:{padding:'12px 16px',borderBottom:'1px solid #2a2a2a',display:'flex',alignItems:'center',gap:8}},
              React.createElement('span',{className:'live-dot'}),
              React.createElement('span',{style:{fontWeight:600,fontSize:'.9rem'}},'Live Chat')
            ),
            React.createElement('div',{ref:chatRef,style:{height:200,overflowY:'auto',padding:12,display:'flex',flexDirection:'column',gap:8}},
              messages.length===0 && React.createElement('p',{style:{color:'#555',fontSize:'.8rem',textAlign:'center',margin:'auto'}},'Chat is empty. Say hi!'),
              messages.map((m,i)=>React.createElement('div',{key:i},
                React.createElement('span',{style:{color:'#F59E0B',fontSize:11,fontWeight:600}},m.userName||'User'),
                React.createElement('span',{style:{color:'#ccc',fontSize:'.875rem',marginLeft:6}},m.message)
              ))
            ),
            React.createElement('div',{style:{padding:10,borderTop:'1px solid #2a2a2a',display:'flex',gap:8}},
              React.createElement('input',{className:'input',value:chatInput,onChange:e=>setChatInput(e.target.value),
                onKeyDown:e=>{if(e.key==='Enter')sendChat();},
                placeholder:user?'Type a message...':'Login to chat',
                disabled:!user,style:{flex:1,fontSize:'.8rem',padding:'8px 12px'}}),
              React.createElement('button',{onClick:sendChat,disabled:!chatInput.trim()||!user,
                className:'btn-gold',style:{padding:'8px 14px',borderRadius:9,fontSize:'.8rem'}
              },'Send')
            )
          )
        )
      )
    )
  );
}


// ── LOGIN PAGE ────────────────────────────────────────────────
function LoginPage() {
  const { login }  = useAuth();
  const { navigate } = useApp();
  const [email, setEmail]   = useState('');
  const [pass,  setPass]    = useState('');
  const [code,  setCode]    = useState('');
  const [needs2FA, setNeeds2FA] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const submit = async (e) => {
    e?.preventDefault();
    if (!email || !pass) return setError('Email and password required.');
    setLoading(true); setError('');
    try {
      const d = await login(email, pass, code||undefined);
      if (d.requires2FA) { setNeeds2FA(true); setLoading(false); return; }
      showToast(`Welcome back, ${d.user?.name?.split(' ')[0]}!`,'success');
      navigate('home');
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  };

  return React.createElement('div',{ style:{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',padding:'20px',paddingTop:80} },
    React.createElement('div',{ style:{width:'100%',maxWidth:420} },
      React.createElement('div',{style:{textAlign:'center',marginBottom:32}},
        React.createElement('div',{style:{fontFamily:'Bebas Neue,sans-serif',fontSize:'2.5rem',color:'#F59E0B',letterSpacing:'.08em'}},'BIDWARS'),
        React.createElement('p',{style:{color:'#666',marginTop:6}}, needs2FA ? 'Enter your 2FA code' : 'Sign in to your account')
      ),
      React.createElement('div',{className:'card',style:{padding:32}},
        error && React.createElement('div',{style:{background:'rgba(239,68,68,.1)',border:'1px solid rgba(239,68,68,.3)',borderRadius:10,padding:'10px 14px',color:'#ef4444',fontSize:'.875rem',marginBottom:16}},error),
        needs2FA ? React.createElement('div',null,
          React.createElement('label',{style:{display:'block',color:'#888',fontSize:.75+'rem',marginBottom:8,fontWeight:500}},'2FA CODE'),
          React.createElement('input',{className:'input',type:'text',value:code,onChange:e=>setCode(e.target.value),placeholder:'Enter 6-digit code',maxLength:6,onKeyDown:e=>e.key==='Enter'&&submit(),autoFocus:true}),
          React.createElement('button',{onClick:submit,disabled:loading,className:'btn-gold',style:{width:'100%',padding:'13px',borderRadius:11,marginTop:16,fontSize:'1rem'}}, loading?'Verifying...':'Verify')
        ) : React.createElement('form',{onSubmit:submit},
          React.createElement('div',{style:{marginBottom:14}},
            React.createElement('label',{style:{display:'block',color:'#888',fontSize:.75+'rem',marginBottom:8,fontWeight:500}},'EMAIL'),
            React.createElement('input',{className:'input',type:'email',value:email,onChange:e=>setEmail(e.target.value),placeholder:'you@email.com',autoFocus:true})
          ),
          React.createElement('div',{style:{marginBottom:8}},
            React.createElement('label',{style:{display:'block',color:'#888',fontSize:.75+'rem',marginBottom:8,fontWeight:500}},'PASSWORD'),
            React.createElement('input',{className:'input',type:'password',value:pass,onChange:e=>setPass(e.target.value),placeholder:'Your password'})
          ),
          React.createElement('button',{type:'button',onClick:()=>navigate('forgot-password'),style:{background:'none',border:'none',cursor:'pointer',color:'#888',fontSize:'.8rem',marginBottom:16,fontFamily:'inherit'}}, 'Forgot password?'),
          React.createElement('button',{type:'submit',disabled:loading,className:'btn-gold',style:{width:'100%',padding:'13px',borderRadius:11,fontSize:'1rem'}}, loading?'Signing in...':'Sign In')
        ),
        React.createElement('p',{style:{textAlign:'center',color:'#555',fontSize:'.875rem',marginTop:20}},
          "Don't have an account? ",
          React.createElement('button',{onClick:()=>navigate('register'),style:{background:'none',border:'none',cursor:'pointer',color:'#F59E0B',fontWeight:600,fontFamily:'inherit',fontSize:'.875rem'}},'Register')
        ),
        // Quick login hint
        React.createElement('div',{style:{marginTop:20,padding:12,background:'rgba(245,158,11,.05)',border:'1px solid rgba(245,158,11,.1)',borderRadius:10,fontSize:11,color:'#666',lineHeight:1.6}},
          React.createElement('p',{style:{color:'#F59E0B',fontWeight:600,marginBottom:4}},'Demo Accounts:'),
          React.createElement('p',null,'Admin:  admin@bidwars.com / admin@0000'),
          React.createElement('p',null,'Seller: seller@bidwars.com / seller@1234'),
          React.createElement('p',null,'Buyer:  buyer@bidwars.com / buyer@1234')
        )
      )
    )
  );
}

// ── REGISTER PAGE ─────────────────────────────────────────────
function RegisterPage() {
  const { register } = useAuth();
  const { navigate } = useApp();
  const [form,    setForm]    = useState({ name:'',email:'',password:'',confirm:'',role:'buyer' });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const submit = async (e) => {
    e?.preventDefault();
    if (!form.name||!form.email||!form.password) return setError('All fields required.');
    if (form.password.length < 6) return setError('Password must be at least 6 characters.');
    if (form.password !== form.confirm) return setError('Passwords do not match.');
    setLoading(true); setError('');
    try {
      const d = await register(form.name, form.email, form.password, form.role);
      showToast(`Welcome to BidWars, ${form.name.split(' ')[0]}!`,'success');
      navigate('home');
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const field = (key, type, label, placeholder) =>
    React.createElement('div',{style:{marginBottom:14}},
      React.createElement('label',{style:{display:'block',color:'#888',fontSize:.75+'rem',marginBottom:8,fontWeight:500}},label),
      React.createElement('input',{className:'input',type,value:form[key],onChange:e=>setForm(f=>({...f,[key]:e.target.value})),placeholder})
    );

  return React.createElement('div',{style:{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',padding:'20px',paddingTop:80}},
    React.createElement('div',{style:{width:'100%',maxWidth:420}},
      React.createElement('div',{style:{textAlign:'center',marginBottom:32}},
        React.createElement('div',{style:{fontFamily:'Bebas Neue,sans-serif',fontSize:'2.5rem',color:'#F59E0B',letterSpacing:'.08em'}},'BIDWARS'),
        React.createElement('p',{style:{color:'#666',marginTop:6}},'Create your account')
      ),
      React.createElement('div',{className:'card',style:{padding:32}},
        error && React.createElement('div',{style:{background:'rgba(239,68,68,.1)',border:'1px solid rgba(239,68,68,.3)',borderRadius:10,padding:'10px 14px',color:'#ef4444',fontSize:'.875rem',marginBottom:16}},error),
        React.createElement('form',{onSubmit:submit},
          field('name','text','FULL NAME','John Doe'),
          field('email','email','EMAIL','you@email.com'),
          field('password','password','PASSWORD','Min 6 characters'),
          field('confirm','password','CONFIRM PASSWORD','Re-enter password'),
          React.createElement('div',{style:{marginBottom:20}},
            React.createElement('label',{style:{display:'block',color:'#888',fontSize:.75+'rem',marginBottom:8,fontWeight:500}},'ACCOUNT TYPE'),
            React.createElement('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}},
              ['buyer','seller'].map(r=>React.createElement('button',{key:r,type:'button',onClick:()=>setForm(f=>({...f,role:r})),
                style:{padding:'10px',borderRadius:10,border:`2px solid ${form.role===r?'#F59E0B':'#2a2a2a'}`,background:form.role===r?'rgba(245,158,11,.1)':'transparent',color:form.role===r?'#F59E0B':'#888',cursor:'pointer',fontFamily:'inherit',fontWeight:600,fontSize:'.875rem',textTransform:'capitalize'}
              }, r==='buyer'?'🛒 Buyer':'🏷️ Seller'))
            )
          ),
          React.createElement('button',{type:'submit',disabled:loading,className:'btn-gold',style:{width:'100%',padding:'13px',borderRadius:11,fontSize:'1rem'}}, loading?'Creating account...':'Create Account')
        ),
        React.createElement('p',{style:{textAlign:'center',color:'#555',fontSize:'.875rem',marginTop:20}},
          'Already have an account? ',
          React.createElement('button',{onClick:()=>navigate('login'),style:{background:'none',border:'none',cursor:'pointer',color:'#F59E0B',fontWeight:600,fontFamily:'inherit',fontSize:'.875rem'}},'Sign In')
        )
      )
    )
  );
}

// ── FORGOT PASSWORD PAGE ─────────────────────────────────────
function ForgotPasswordPage() {
  const { navigate } = useApp();
  const [email, setEmail] = useState('');
  const [sent,  setSent]  = useState(false);
  const [loading, setLoading] = useState(false);
  const submit = async (e) => {
    e?.preventDefault();
    if (!email) return;
    setLoading(true);
    try { await api('/auth/forgot-password',{method:'POST',body:JSON.stringify({email})}); setSent(true); }
    catch(e) { showToast(e.message,'error'); }
    finally { setLoading(false); }
  };
  return React.createElement('div',{style:{minHeight:'100vh',display:'flex',alignItems:'center',justifyContent:'center',padding:20,paddingTop:80}},
    React.createElement('div',{style:{width:'100%',maxWidth:400}},
      sent ? React.createElement('div',{className:'card',style:{padding:32,textAlign:'center'}},
        React.createElement('div',{style:{fontSize:'3rem',marginBottom:16}},'📧'),
        React.createElement('h2',{style:{fontWeight:700,marginBottom:12}},'Check your email'),
        React.createElement('p',{style:{color:'#888',marginBottom:20}},'If that email exists, a password reset link was sent.'),
        React.createElement('button',{onClick:()=>navigate('login'),className:'btn-gold',style:{padding:'12px 32px',borderRadius:11}},'Back to Login')
      ) : React.createElement('div',{className:'card',style:{padding:32}},
        React.createElement('h2',{style:{fontWeight:700,marginBottom:8}},'Reset Password'),
        React.createElement('p',{style:{color:'#888',fontSize:'.875rem',marginBottom:24}},'Enter your email and we\'ll send a reset link.'),
        React.createElement('form',{onSubmit:submit},
          React.createElement('input',{className:'input',type:'email',value:email,onChange:e=>setEmail(e.target.value),placeholder:'your@email.com',style:{marginBottom:16}}),
          React.createElement('button',{type:'submit',disabled:loading,className:'btn-gold',style:{width:'100%',padding:'12px',borderRadius:11}}, loading?'Sending...':'Send Reset Link')
        ),
        React.createElement('button',{onClick:()=>navigate('login'),style:{width:'100%',marginTop:12,padding:'10px',background:'none',border:'none',cursor:'pointer',color:'#888',fontFamily:'inherit'}},'← Back to Login')
      )
    )
  );
}


// ── CREATE AUCTION PAGE ───────────────────────────────────────
function CreateAuctionPage() {
  const { user }     = useAuth();
  const { navigate } = useApp();
  const [form, setForm] = useState({
    title:'', description:'', category:'', startingPrice:'', reservePrice:'',
    buyNowPrice:'', bidIncrement:'', endTime:'', condition:'good', brand:'', tags:''
  });
  const [loading,  setLoading]  = useState(false);
  const [aiRec,    setAiRec]    = useState(null);
  const [categories, setCats]   = useState([]);
  const [selectedImages, setSelectedImages] = useState([]);

  useEffect(() => {
    if (!user) navigate('login');
    api('/categories').then(d=>setCats(d.categories||[])).catch(()=>{});
  }, [user]);

  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const getAIRec = async () => {
    if (!form.category) return showToast('Select a category first','warning');
    try {
      const price = await import('data:text/javascript,').catch(()=>null);
      // Simulate AI recommendation locally
      const basePrices = { electronics:500, fashion:150, collectibles:300, art:800, jewelry:1000, vehicles:15000, sports:200, home:400, toys:100, books:50 };
      const condMult = { new:1, 'like-new':.85, excellent:.75, good:.6, fair:.4, poor:.25 };
      const base = basePrices[form.category] || 200;
      const cond = condMult[form.condition] || .6;
      const rec  = Math.round(base * cond);
      setAiRec({ recommended:rec, min:Math.round(rec*.7), max:Math.round(rec*1.5) });
      showToast(`AI recommends starting at $${rec}`,'info');
    } catch(e) {}
  };

  const onImagesChange = (e) => {
    const files = Array.from(e.target.files || []).slice(0, 10);
    setSelectedImages(files);
  };

  const submit = async (e) => {
    e?.preventDefault();
    if (!form.title||!form.description||!form.category||!form.startingPrice||!form.endTime)
      return showToast('Please fill all required fields.','warning');
    if (!selectedImages.length)
      return showToast('Please upload at least 1 photo from your computer.','warning');
    if (Number(form.startingPrice) <= 0) return showToast('Starting price must be > 0','warning');
    const end = new Date(form.endTime);
    if (end <= new Date()) return showToast('End time must be in the future.','warning');
    setLoading(true);
    try {
      const body = {
        ...form,
        startTime: new Date().toISOString(),
        bidIncrement: form.bidIncrement || String(Math.max(1, Math.floor(Number(form.startingPrice)*0.01)))
      };
      const fd = new FormData();
      Object.entries(body).forEach(([k, v]) => {
        if (v !== undefined && v !== null) fd.append(k, String(v));
      });
      selectedImages.forEach(file => fd.append('images', file));
      const d = await api('/auctions', { method:'POST', body:fd });
      showToast('Auction created!','success');
      navigate(`auction/${d.auction._id}`);
    } catch(e) { showToast(e.message,'error'); }
    finally { setLoading(false); }
  };

  // Default end times
  const defaultEnds = (days) => {
    const d = new Date();
    d.setDate(d.getDate()+days);
    d.setMinutes(0,0,0);
    return d.toISOString().slice(0,16);
  };

  const input = (k, type, label, placeholder, required=false) =>
    React.createElement('div',{style:{marginBottom:16}},
      React.createElement('label',{style:{display:'block',color:'#888',fontSize:.75+'rem',marginBottom:6,fontWeight:500}}, label+(required?' *':'')),
      React.createElement('input',{className:'input',type,value:form[k],onChange:e=>set(k,e.target.value),placeholder})
    );

  return React.createElement('div',{style:{paddingTop:60,minHeight:'100vh'}},
    React.createElement('div',{style:{maxWidth:800,margin:'0 auto',padding:'32px 20px'}},
      React.createElement('h1',{style:{fontFamily:'Bebas Neue,sans-serif',fontSize:'2.2rem',letterSpacing:'.05em',marginBottom:4}},'List an Item'),
      React.createElement('p',{style:{color:'#666',marginBottom:32,fontSize:'.875rem'}},'Create a new auction listing'),
      React.createElement('form',{onSubmit:submit},
        React.createElement('div',{className:'card',style:{padding:24,marginBottom:20}},
          React.createElement('h3',{style:{fontWeight:600,marginBottom:16,color:'#F59E0B'}},'📋 Basic Info'),
          input('title','text','Title','MacBook Pro 16" M3 Max - Like New',true),
          React.createElement('div',{style:{marginBottom:16}},
            React.createElement('label',{style:{display:'block',color:'#888',fontSize:.75+'rem',marginBottom:6,fontWeight:500}},'DESCRIPTION *'),
            React.createElement('textarea',{className:'input',value:form.description,onChange:e=>set('description',e.target.value),
              placeholder:'Describe the item, condition, what\'s included, etc.',rows:4,style:{resize:'vertical',minHeight:100}})
          ),
          React.createElement('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}},
            React.createElement('div',null,
              React.createElement('label',{style:{display:'block',color:'#888',fontSize:.75+'rem',marginBottom:6,fontWeight:500}},'CATEGORY *'),
              React.createElement('select',{className:'input',value:form.category,onChange:e=>{set('category',e.target.value);setAiRec(null);}},
                [React.createElement('option',{key:'',value:''},'Select category'),
                 ...categories.map(c=>React.createElement('option',{key:c.slug,value:c.slug},`${c.icon} ${c.name}`))]
              )
            ),
            React.createElement('div',null,
              React.createElement('label',{style:{display:'block',color:'#888',fontSize:.75+'rem',marginBottom:6,fontWeight:500}},'CONDITION'),
              React.createElement('select',{className:'input',value:form.condition,onChange:e=>set('condition',e.target.value)},
                [['new','New'],['like-new','Like New'],['excellent','Excellent'],['good','Good'],['fair','Fair'],['poor','Poor']].map(([v,l])=>React.createElement('option',{key:v,value:v},l))
              )
            )
          ),
          input('brand','text','Brand (optional)','Apple, Nike, Sony...')
        ),

        React.createElement('div',{className:'card',style:{padding:24,marginBottom:20}},
          React.createElement('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}},
            React.createElement('h3',{style:{fontWeight:600,color:'#F59E0B'}},'💰 Pricing'),
            React.createElement('button',{type:'button',onClick:getAIRec,style:{background:'rgba(245,158,11,.1)',border:'1px solid rgba(245,158,11,.2)',borderRadius:8,padding:'6px 14px',color:'#F59E0B',cursor:'pointer',fontSize:'.8rem',fontFamily:'inherit'}},'🤖 AI Price Estimate')
          ),
          aiRec && React.createElement('div',{style:{background:'rgba(245,158,11,.05)',border:'1px solid rgba(245,158,11,.15)',borderRadius:10,padding:12,marginBottom:16,fontSize:'.8rem',color:'#aaa'}},
            `🤖 Recommended: $${aiRec.recommended} · Range: $${aiRec.min}–$${aiRec.max}`
          ),
          React.createElement('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12}},
            input('startingPrice','number','Starting Price ($) *','500'),
            input('bidIncrement','number','Bid Increment ($)','10 (default: 1% of start)'),
            input('reservePrice','number','Reserve Price ($)','Minimum price to sell (optional)'),
            input('buyNowPrice','number','Buy Now Price ($)','Leave blank to disable')
          )
        ),

        React.createElement('div',{className:'card',style:{padding:24,marginBottom:24}},
          React.createElement('h3',{style:{fontWeight:600,marginBottom:16,color:'#F59E0B'}},'⏱ Duration'),
          React.createElement('div',{style:{marginBottom:12}},
            React.createElement('label',{style:{display:'block',color:'#888',fontSize:.75+'rem',marginBottom:8,fontWeight:500}},'QUICK SET'),
            React.createElement('div',{style:{display:'flex',gap:8,flexWrap:'wrap'}},
              [[1,'1 Day'],[3,'3 Days'],[5,'5 Days'],[7,'7 Days']].map(([d,l])=>
                React.createElement('button',{key:d,type:'button',onClick:()=>set('endTime',defaultEnds(d)),
                  style:{padding:'7px 16px',borderRadius:8,background:'#1a1a1a',border:'1px solid #2a2a2a',color:'#ccc',cursor:'pointer',fontSize:'.8rem',fontFamily:'inherit'}
                },l)
              )
            )
          ),
          React.createElement('div',null,
            React.createElement('label',{style:{display:'block',color:'#888',fontSize:.75+'rem',marginBottom:6,fontWeight:500}},'EXACT END DATE/TIME *'),
            React.createElement('input',{className:'input',type:'datetime-local',value:form.endTime,onChange:e=>set('endTime',e.target.value),min:new Date().toISOString().slice(0,16)})
          )
        ),

        React.createElement('div',{className:'card',style:{padding:24,marginBottom:24}},
          React.createElement('h3',{style:{fontWeight:600,marginBottom:16,color:'#F59E0B'}},'📷 Photos'),
          React.createElement('div',{style:{marginBottom:12}},
            React.createElement('label',{style:{display:'block',color:'#888',fontSize:.75+'rem',marginBottom:6,fontWeight:500}},'UPLOAD FROM YOUR COMPUTER *'),
            React.createElement('input',{
              className:'input',
              type:'file',
              accept:'image/*',
              multiple:true,
              onChange:onImagesChange,
              style:{padding:'10px'}
            }),
            React.createElement('p',{style:{marginTop:8,color:'#777',fontSize:'.75rem'}},'At least 1 image is required. You can upload up to 10 images. The first image will be used as the listing thumbnail.')
          ),
          selectedImages.length > 0 && React.createElement('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(120px,1fr))',gap:10}},
            selectedImages.map((file, idx) => React.createElement('div',{key:`preview-${idx}`,style:{border:'1px solid #2a2a2a',borderRadius:10,padding:6,background:'#121212'}},
              React.createElement('img',{
                src: URL.createObjectURL(file),
                alt: file.name,
                style:{width:'100%',height:90,objectFit:'cover',borderRadius:6,display:'block',marginBottom:6}
              }),
              React.createElement('p',{style:{fontSize:'.7rem',color:'#999',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}},file.name)
            ))
          )
        ),

        React.createElement('button',{type:'submit',disabled:loading,className:'btn-gold',style:{width:'100%',padding:'15px',borderRadius:13,fontSize:'1.1rem'}},
          loading ? '⏳ Creating auction...' : '🚀 Publish Auction'
        )
      )
    )
  );
}

// ── DASHBOARD PAGE ────────────────────────────────────────────
function DashboardPage() {
  const { user }     = useAuth();
  const { navigate } = useApp();
  const [tab,      setTab]      = useState('bids');
  const [bids,     setBids]     = useState([]);
  const [won,      setWon]      = useState([]);
  const [myAuc,    setMyAuc]    = useState([]);
  const [payments, setPayments] = useState([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    if (!user) { navigate('login'); return; }
    loadData();
  }, [user, tab]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (tab==='bids')     { const d=await api('/users/my-bids');     setBids(d.bids||[]); }
      if (tab==='won')      { const d=await api('/users/won-auctions');setWon(d.auctions||[]); }
      if (tab==='listings') { const d=await api('/auctions/seller/my-auctions');setMyAuc(d.auctions||[]); }
      if (tab==='payments') { const d=await api('/payments/my-payments');setPayments(d.payments||[]); }
    } catch(e) { showToast(e.message,'error'); }
    finally { setLoading(false); }
  };

  if (!user) return null;

  const statBox = (icon,label,val) => React.createElement('div',{className:'card',style:{padding:20,textAlign:'center'}},
    React.createElement('div',{style:{fontSize:'1.8rem',marginBottom:6}}),icon,
    React.createElement('p',{style:{fontSize:'1.5rem',fontWeight:700,color:'#F59E0B'}}),val,
    React.createElement('p',{style:{color:'#666',fontSize:'.8rem'}}),label
  );

  return React.createElement('div',{style:{paddingTop:60,minHeight:'100vh'}},
    React.createElement('div',{style:{maxWidth:1100,margin:'0 auto',padding:'32px 20px'}},
      // Header
      React.createElement('div',{style:{display:'flex',alignItems:'center',gap:16,marginBottom:32}},
        React.createElement('div',{style:{width:60,height:60,background:'linear-gradient(135deg,#F59E0B,#D97706)',borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',color:'#000',fontWeight:700,fontSize:'1.5rem'}}, (user.name||'U')[0].toUpperCase()),
        React.createElement('div',null,
          React.createElement('h1',{style:{fontWeight:700,fontSize:'1.5rem'}}),user.name,
          React.createElement('p',{style:{color:'#666',fontSize:'.875rem'}}), `${user.email} · ${user.role}`
        )
      ),
      // Stats
      React.createElement('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))',gap:16,marginBottom:32}},
        React.createElement('div',{className:'card',style:{padding:20,textAlign:'center'}},React.createElement('div',{style:{fontSize:'1.8rem'}},'🔨'),React.createElement('p',{style:{fontSize:'1.4rem',fontWeight:700,color:'#F59E0B'}}),user.totalBids||0,React.createElement('p',{style:{color:'#666',fontSize:'.8rem'}}),'Total Bids'),
        React.createElement('div',{className:'card',style:{padding:20,textAlign:'center'}},React.createElement('div',{style:{fontSize:'1.8rem'}},'🏆'),React.createElement('p',{style:{fontSize:'1.4rem',fontWeight:700,color:'#F59E0B'}}),user.wonAuctions||0,React.createElement('p',{style:{color:'#666',fontSize:'.8rem'}}),'Auctions Won'),
        React.createElement('div',{className:'card',style:{padding:20,textAlign:'center'}},React.createElement('div',{style:{fontSize:'1.8rem'}},'⭐'),React.createElement('p',{style:{fontSize:'1.4rem',fontWeight:700,color:'#F59E0B'}}),user.rating||5,React.createElement('p',{style:{color:'#666',fontSize:'.8rem'}}),'Rating')
      ),
      // Tabs
      React.createElement('div',{style:{display:'flex',gap:8,marginBottom:24,flexWrap:'wrap'}},
        [['bids','🔨 My Bids'],['won','🏆 Won'],['listings','📦 My Listings'],['payments','💳 Payments']].map(([t,l])=>
          React.createElement('button',{key:t,onClick:()=>setTab(t),style:{padding:'9px 20px',borderRadius:10,border:`1px solid ${tab===t?'#F59E0B':'#2a2a2a'}`,background:tab===t?'rgba(245,158,11,.1)':'#1a1a1a',color:tab===t?'#F59E0B':'#888',cursor:'pointer',fontFamily:'inherit',fontWeight:tab===t?600:400}},l)
        )
      ),
      loading ? React.createElement('div',{style:{textAlign:'center',padding:40,color:'#555'}},'Loading...') : (
        tab==='bids' ? (bids.length===0?React.createElement('p',{style:{color:'#555',textAlign:'center',padding:40}},'No bids yet. Browse auctions to start bidding!'):
          React.createElement('div',{style:{display:'flex',flexDirection:'column',gap:12}},
            bids.map(b=>React.createElement('div',{key:b._id,className:'card',style:{padding:16,display:'flex',gap:16,alignItems:'center',cursor:'pointer'},onClick:()=>navigate(`auction/${b.auction?._id}`)},
              React.createElement('img',{src:getAuctionImageUrl(b.auction, 'thumb'),alt:'',style:{width:80,height:60,borderRadius:8,objectFit:'cover'},onError:e=>{e.target.src=getAuctionImageFallback(b.auction,'thumb')}}),
              React.createElement('div',{style:{flex:1}},
                React.createElement('p',{style:{fontWeight:600,marginBottom:4}}),b.auction?.title||'Auction',
                React.createElement('p',{style:{color:'#888',fontSize:'.8rem'}}),new Date(b.createdAt).toLocaleDateString()
              ),
              React.createElement('div',{style:{textAlign:'right'}},
                React.createElement('p',{style:{color:'#F59E0B',fontWeight:700,fontFamily:'monospace'}}),fmt(b.amount),
                React.createElement('p',{style:{color:b.status==='won'?'#22c55e':b.status==='outbid'?'#ef4444':'#888',fontSize:'.75rem',fontWeight:600,textTransform:'uppercase'}}),b.status
              )
            ))
          )
        ) :
        tab==='won' ? (won.length===0?React.createElement('p',{style:{color:'#555',textAlign:'center',padding:40}},'No auctions won yet. Keep bidding!'):
          React.createElement('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(250px,1fr))',gap:16}},
            won.map(a=>React.createElement(AuctionCard,{key:a._id,auction:a,onClick:()=>navigate(`auction/${a._id}`)}))
          )
        ) :
        tab==='listings' ? React.createElement('div',null,
          React.createElement('button',{onClick:()=>navigate('create'),className:'btn-gold',style:{padding:'10px 24px',borderRadius:10,marginBottom:20}},'+  New Listing'),
          myAuc.length===0?React.createElement('p',{style:{color:'#555',textAlign:'center',padding:40}},'No listings yet.'):
          React.createElement('div',{style:{display:'flex',flexDirection:'column',gap:12}},
            myAuc.map(a=>React.createElement('div',{key:a._id,className:'card',style:{padding:16,display:'flex',justifyContent:'space-between',alignItems:'center'}},
              React.createElement('div',{style:{cursor:'pointer'},onClick:()=>navigate(`auction/${a._id}`)},
                React.createElement('p',{style:{fontWeight:600}}),a.title,
                React.createElement('p',{style:{color:'#888',fontSize:'.8rem'}}),`${fmt(a.currentPrice)} · ${a.bidCount} bids`
              ),
              React.createElement('span',{className:`badge ${a.status==='live'?'badge-live':a.status==='ended'?'badge-ended':'badge-gold'}`},a.status.toUpperCase())
            ))
          )
        ) :
        payments.length===0?React.createElement('p',{style:{color:'#555',textAlign:'center',padding:40}},'No payments yet.'):
        React.createElement('div',{style:{display:'flex',flexDirection:'column',gap:12}},
          payments.map(p=>React.createElement('div',{key:p._id,className:'card',style:{padding:16,display:'flex',justifyContent:'space-between',alignItems:'center'}},
            React.createElement('div',null,
              React.createElement('p',{style:{fontWeight:600}}),p.auction?.title||'Auction',
              React.createElement('p',{style:{color:'#888',fontSize:'.75rem'}}),new Date(p.createdAt).toLocaleDateString()+' · '+p.paymentMethod
            ),
            React.createElement('div',{style:{textAlign:'right'}},
              React.createElement('p',{style:{color:'#F59E0B',fontWeight:700,fontFamily:'monospace'}}),fmt(p.amount),
              React.createElement('span',{className:`badge ${p.status==='released'?'badge-live':p.status==='escrow'?'badge-gold':'badge-ended'}`},p.status)
            )
          ))
        )
      )
    )
  );
}


// ── NOTIFICATIONS PAGE ────────────────────────────────────────
function NotificationsPage() {
  const { user }     = useAuth();
  const { navigate } = useApp();
  const [notifs,   setNotifs]  = useState([]);
  const [loading,  setLoading] = useState(true);

  useEffect(() => {
    if (!user) { navigate('login'); return; }
    load();
  }, [user]);

  const load = async () => {
    setLoading(true);
    try {
      const d = await api('/notifications?limit=50');
      setNotifs(d.notifications || []);
    } catch(e) { showToast(e.message, 'error'); }
    finally { setLoading(false); }
  };

  const markAllRead = async () => {
    try {
      await api('/notifications/read-all', { method:'PUT' });
      setNotifs(n => n.map(x => ({ ...x, isRead:true })));
    } catch(e) {}
  };

  const icons = { outbid:'😟', auction_won:'🏆', auction_ending:'⏰', payment_received:'💰', system:'📢', auction_started:'🚀', payment_due:'💳', new_bid:'🔨', stream_started:'📹', auction_lost:'😔' };

  return React.createElement('div', { style:{ paddingTop:60, minHeight:'100vh' } },
    React.createElement('div', { style:{ maxWidth:700, margin:'0 auto', padding:'32px 20px' } },
      React.createElement('div', { style:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 } },
        React.createElement('h1', { style:{ fontWeight:700, fontSize:'1.5rem' } }, '🔔 Notifications'),
        React.createElement('button', { onClick:markAllRead, style:{ background:'none', border:'1px solid #2a2a2a', borderRadius:8, padding:'7px 16px', color:'#888', cursor:'pointer', fontFamily:'inherit', fontSize:'.8rem' } }, 'Mark all read')
      ),
      loading ? React.createElement('p', { style:{ color:'#555', textAlign:'center', padding:40 } }, 'Loading...') :
      notifs.length === 0 ? React.createElement('div', { style:{ textAlign:'center', padding:60, color:'#555' } },
        React.createElement('div', { style:{ fontSize:'3rem', marginBottom:12 } }, '🔔'),
        React.createElement('p', null, 'No notifications yet.')
      ) :
      React.createElement('div', { style:{ display:'flex', flexDirection:'column', gap:8 } },
        notifs.map(n => React.createElement('div', {
          key:n._id,
          className:'card',
          style:{ padding:16, display:'flex', gap:14, alignItems:'flex-start', opacity: n.isRead ? .6 : 1, borderLeft:`3px solid ${n.isRead ? '#2a2a2a' : '#F59E0B'}`, cursor: n.auction ? 'pointer' : 'default' },
          onClick: () => { if(n.auction) navigate(`auction/${n.auction}`); }
        },
          React.createElement('span', { style:{ fontSize:'1.4rem', flexShrink:0 } }, icons[n.type] || '📢'),
          React.createElement('div', { style:{ flex:1 } },
            React.createElement('p', { style:{ fontWeight:600, marginBottom:3 } }, n.title),
            React.createElement('p', { style:{ color:'#888', fontSize:'.85rem' } }, n.message),
            React.createElement('p', { style:{ color:'#555', fontSize:'.75rem', marginTop:4 } }, new Date(n.createdAt).toLocaleString())
          ),
          !n.isRead && React.createElement('div', { style:{ width:8, height:8, background:'#F59E0B', borderRadius:'50%', flexShrink:0, marginTop:4 } })
        ))
      )
    )
  );
}

// ── PAYMENT PAGE ──────────────────────────────────────────────
function PaymentPage({ auctionId }) {
  const { user }     = useAuth();
  const { navigate } = useApp();
  const [auction,   setAuction]  = useState(null);
  const [method,    setMethod]   = useState('stripe');
  const [loading,   setLoading]  = useState(true);
  const [paying,    setPaying]   = useState(false);
  const [success,   setSuccess]  = useState(false);
  const [card, setCard] = useState({ number:'', expiry:'', cvc:'', name:'' });
  const [cardErr, setCardErr] = useState({});

  useEffect(() => {
    if (!user) { navigate('login'); return; }
    if (auctionId) api(`/auctions/${auctionId}`).then(d => setAuction(d.auction)).catch(e => showToast(e.message,'error')).finally(() => setLoading(false));
    else setLoading(false);
  }, [auctionId, user]);

  const fmtCard    = v => v.replace(/\D/g,'').replace(/(.{4})/g,'$1 ').trim().slice(0,19);
  const fmtExpiry  = v => { const n=v.replace(/\D/g,''); return n.length>=2 ? n.slice(0,2)+'/'+n.slice(2,4) : n; };

  const validate = () => {
    const e = {};
    if (!card.name.trim())                        e.name   = 'Required';
    if (card.number.replace(/\s/g,'').length < 16) e.number = 'Enter 16-digit card number';
    if (card.expiry.length < 5)                   e.expiry = 'Enter MM/YY';
    if (card.cvc.length < 3)                      e.cvc    = 'Enter 3-digit CVC';
    return e;
  };

  const payStripe = async () => {
    const errs = validate();
    if (Object.keys(errs).length) { setCardErr(errs); return; }
    setCardErr({});
    setPaying(true);
    try {
      const d = await api('/payments/stripe/create-intent', { method:'POST', body:JSON.stringify({ auctionId }) });
      if (d.demo) { setSuccess(true); showToast('Payment successful! (Demo mode)','success'); return; }
      // Real Stripe flow
      if (!STRIPE_KEY || !window.Stripe) throw new Error('Stripe not configured. Add STRIPE_PUBLISHABLE_KEY to your .env');
      const stripe = window.Stripe(STRIPE_KEY);
      const { error, paymentIntent } = await stripe.confirmCardPayment(d.clientSecret, {
        payment_method: { card: { number:card.number.replace(/\s/g,''), exp_month:parseInt(card.expiry.split('/')[0]), exp_year:parseInt('20'+card.expiry.split('/')[1]), cvc:card.cvc }, billing_details:{ name:card.name } }
      });
      if (error) throw new Error(error.message);
      await api('/payments/stripe/confirm', { method:'POST', body:JSON.stringify({ paymentIntentId:paymentIntent.id, auctionId }) });
      setSuccess(true);
    } catch(e) { showToast(e.message, 'error'); }
    finally { setPaying(false); }
  };

  const payPayPal = async () => {
    setPaying(true);
    try {
      const d = await api('/payments/paypal/create-order', { method:'POST', body:JSON.stringify({ auctionId }) });
      if (d.demo) { setSuccess(true); showToast('PayPal payment successful! (Demo mode)','success'); return; }
      if (d.approvalUrl) window.location.href = d.approvalUrl;
    } catch(e) { showToast(e.message,'error'); }
    finally { setPaying(false); }
  };

  const fee   = auction ? Math.round(auction.currentPrice * 0.05) : 0;
  const total = auction ? auction.currentPrice + fee : 0;

  if (loading) return React.createElement('div', { style:{ paddingTop:80, textAlign:'center', color:'#555' } }, 'Loading...');

  if (success) return React.createElement('div', { style:{ paddingTop:60, minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', padding:20 } },
    React.createElement('div', { className:'card', style:{ padding:40, textAlign:'center', maxWidth:400, width:'100%' } },
      React.createElement('div', { style:{ fontSize:'4rem', marginBottom:16 } }, '🎉'),
      React.createElement('h2', { style:{ fontWeight:700, marginBottom:12 } }, 'Payment Successful!'),
      React.createElement('p', { style:{ color:'#888', marginBottom:8 } }, `$${total.toLocaleString()} placed in escrow.`),
      React.createElement('p', { style:{ color:'#666', fontSize:'.8rem', marginBottom:24 } }, 'Funds will be released to the seller when you confirm receipt.'),
      React.createElement('button', { onClick:()=>navigate('dashboard'), className:'btn-gold', style:{ padding:'12px 32px', borderRadius:11 } }, 'View My Orders')
    )
  );

  return React.createElement('div', { style:{ paddingTop:60, minHeight:'100vh' } },
    React.createElement('div', { style:{ maxWidth:900, margin:'0 auto', padding:'32px 20px' } },
      React.createElement('button', { onClick:()=>window.history.back(), style:{ background:'none', border:'none', cursor:'pointer', color:'#888', marginBottom:24, fontFamily:'inherit', display:'flex', alignItems:'center', gap:6 } }, '← Back'),
      React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1fr 340px', gap:24, alignItems:'start' } },
        // Payment form
        React.createElement('div', { className:'card', style:{ padding:28 } },
          React.createElement('h2', { style:{ fontWeight:700, marginBottom:20 } }, '💳 Complete Payment'),
          // Method tabs
          React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:24 } },
            React.createElement('button', { onClick:()=>setMethod('stripe'), style:{ padding:14, borderRadius:12, border:`2px solid ${method==='stripe'?'#F59E0B':'#2a2a2a'}`, background:method==='stripe'?'rgba(245,158,11,.08)':'#111', color:method==='stripe'?'#F59E0B':'#888', cursor:'pointer', fontFamily:'inherit', fontWeight:600 } }, '💳 Credit Card'),
            React.createElement('button', { onClick:()=>setMethod('paypal'), style:{ padding:14, borderRadius:12, border:`2px solid ${method==='paypal'?'#3b82f6':'#2a2a2a'}`, background:method==='paypal'?'rgba(59,130,246,.08)':'#111', color:method==='paypal'?'#60a5fa':'#888', cursor:'pointer', fontFamily:'inherit', fontWeight:600 } }, '🅿 PayPal')
          ),
          method === 'stripe' ? React.createElement('div', null,
            React.createElement('div', { style:{ background:'rgba(245,158,11,.05)', border:'1px solid rgba(245,158,11,.1)', borderRadius:10, padding:'10px 14px', fontSize:'.8rem', color:'#888', marginBottom:20 } },
              '🔒 Test card: 4242 4242 4242 4242 · Any future date · Any CVC'
            ),
            [['name','text','CARDHOLDER NAME','John Doe'],['number','text','CARD NUMBER','4242 4242 4242 4242']].map(([k,t,l,p]) =>
              React.createElement('div', { key:k, style:{ marginBottom:14 } },
                React.createElement('label', { style:{ display:'block', color:'#888', fontSize:.75+'rem', marginBottom:6, fontWeight:500 } }, l),
                React.createElement('input', { className:'input', type:t, value:card[k],
                  onChange:e=>setCard(c=>({...c,[k]:k==='number'?fmtCard(e.target.value):e.target.value})),
                  placeholder:p, maxLength:k==='number'?19:60 }),
                cardErr[k] && React.createElement('p', { style:{ color:'#ef4444', fontSize:'.75rem', marginTop:4 } }, cardErr[k])
              )
            ),
            React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:20 } },
              [['expiry','text','EXPIRY','MM/YY'],['cvc','text','CVC','123']].map(([k,t,l,p])=>
                React.createElement('div', { key:k },
                  React.createElement('label', { style:{ display:'block', color:'#888', fontSize:.75+'rem', marginBottom:6, fontWeight:500 } }, l),
                  React.createElement('input', { className:'input', type:t, value:card[k],
                    onChange:e=>setCard(c=>({...c,[k]:k==='expiry'?fmtExpiry(e.target.value):e.target.value.replace(/\D/g,'').slice(0,4)})),
                    placeholder:p, maxLength:k==='expiry'?5:4 }),
                  cardErr[k] && React.createElement('p', { style:{ color:'#ef4444', fontSize:'.75rem', marginTop:4 } }, cardErr[k])
                )
              )
            ),
            React.createElement('button', { onClick:payStripe, disabled:paying, className:'btn-gold', style:{ width:'100%', padding:'14px', borderRadius:12, fontSize:'1rem' } },
              paying ? '⏳ Processing...' : `🔒 Pay ${fmt(total)} Securely`
            )
          ) : React.createElement('div', { style:{ textAlign:'center', padding:'32px 0' } },
            React.createElement('div', { style:{ fontSize:'3.5rem', marginBottom:16 } }, '🅿'),
            React.createElement('p', { style:{ color:'#888', marginBottom:8 } }, 'You\'ll be redirected to PayPal to complete payment securely.'),
            React.createElement('p', { style:{ color:'#555', fontSize:'.8rem', marginBottom:24 } }, 'PayPal sandbox mode for testing.'),
            React.createElement('button', { onClick:payPayPal, disabled:paying, style:{ padding:'14px 32px', borderRadius:12, background:'#FFC439', border:'none', color:'#000', fontWeight:700, cursor:'pointer', fontSize:'1rem', fontFamily:'inherit' } },
              paying ? 'Redirecting...' : `Pay ${fmt(total)} with PayPal`
            )
          )
        ),
        // Order summary
        React.createElement('div', null,
          auction && React.createElement('div', { className:'card', style:{ padding:20, marginBottom:16 } },
            React.createElement('h3', { style:{ fontWeight:600, marginBottom:16 } }, 'Order Summary'),
            React.createElement('div', { style:{ display:'flex', gap:12, marginBottom:16, paddingBottom:16, borderBottom:'1px solid #2a2a2a' } },
              React.createElement('div', { style:{ width:70, height:55, background:'#111', borderRadius:8, overflow:'hidden', flexShrink:0 } },
                React.createElement('img', { src:getAuctionImageUrl(auction, 'mini'), alt:'', style:{ width:'100%', height:'100%', objectFit:'cover' }, onError:e=>{e.target.src=getAuctionImageFallback(auction,'mini');} })
              ),
              React.createElement('div', null,
                React.createElement('p', { style:{ fontWeight:600, fontSize:'.875rem', marginBottom:4 } }, auction.title),
                React.createElement('p', { style:{ color:'#888', fontSize:'.75rem' } }, auction.category)
              )
            ),
            [['Winning Bid', fmt(auction.currentPrice)], ['Platform Fee (5%)', fmt(fee)]].map(([l,v])=>
              React.createElement('div', { key:l, style:{ display:'flex', justifyContent:'space-between', marginBottom:8, fontSize:'.875rem' } },
                React.createElement('span', { style:{ color:'#888' } }, l),
                React.createElement('span', null, v)
              )
            ),
            React.createElement('div', { style:{ display:'flex', justifyContent:'space-between', paddingTop:12, borderTop:'1px solid #2a2a2a', fontWeight:700 } },
              React.createElement('span', null, 'Total'),
              React.createElement('span', { style:{ color:'#F59E0B', fontFamily:'monospace', fontSize:'1.2rem' } }, fmt(total))
            )
          ),
          React.createElement('div', { style:{ background:'rgba(34,197,94,.05)', border:'1px solid rgba(34,197,94,.15)', borderRadius:14, padding:16 } },
            React.createElement('p', { style:{ color:'#22c55e', fontWeight:600, marginBottom:6 } }, '🛡️ Escrow Protection'),
            React.createElement('p', { style:{ color:'#888', fontSize:'.8rem', lineHeight:1.6 } }, 'Your payment is held securely. Released to seller only after you confirm receipt.')
          )
        )
      )
    )
  );
}

// ── ADMIN PAGE ────────────────────────────────────────────────
function AdminPage() {
  const { user }     = useAuth();
  const { navigate } = useApp();
  const [tab,      setTab]      = useState('dashboard');
  const [stats,    setStats]    = useState(null);
  const [users,    setUsers]    = useState([]);
  const [auctions, setAuctions] = useState([]);
  const [payments, setPayments] = useState([]);
  const [reported, setReported] = useState([]);
  const [cats,     setCats]     = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [broadcast,setBroadcast]= useState('');
  const [newCat,   setNewCat]   = useState({ name:'', slug:'', icon:'📦', description:'' });

  useEffect(() => {
    if (!user) { navigate('login'); return; }
    if (user.role !== 'admin') { showToast('Admin access required.','error'); navigate('home'); return; }
    loadTab(tab);
  }, [user, tab]);

  const loadTab = async (t) => {
    setLoading(true);
    try {
      if (t==='dashboard') { const d=await api('/admin/stats');     setStats(d.stats); }
      if (t==='users')     { const d=await api('/admin/users');     setUsers(d.users||[]); }
      if (t==='auctions')  { const d=await api('/admin/auctions');  setAuctions(d.auctions||[]); }
      if (t==='payments')  { const d=await api('/admin/payments');  setPayments(d.payments||[]); }
      if (t==='reported')  { const d=await api('/admin/reported-auctions'); setReported(d.auctions||[]); }
      if (t==='categories'){ const d=await api('/categories');      setCats(d.categories||[]); }
    } catch(e) { showToast(e.message,'error'); }
    finally { setLoading(false); }
  };

  const banUser = async (id, ban) => {
    try {
      await api(`/admin/users/${id}`, { method:'PUT', body:JSON.stringify({ isBanned:ban }) });
      setUsers(u => u.map(x => x._id===id ? {...x,isBanned:ban} : x));
      showToast(ban?'User banned':'User unbanned','success');
    } catch(e) { showToast(e.message,'error'); }
  };

  const auctionAction = async (id, action) => {
    try {
      await api(`/admin/auctions/${id}`, { method:'PUT', body:JSON.stringify({ action }) });
      loadTab(tab);
      showToast(`Auction ${action}d`,'success');
    } catch(e) { showToast(e.message,'error'); }
  };

  const sendBroadcast = async () => {
    if (!broadcast.trim()) return;
    try {
      await api('/admin/broadcast', { method:'POST', body:JSON.stringify({ title:'Admin Notice', message:broadcast }) });
      showToast('Broadcast sent!','success');
      setBroadcast('');
    } catch(e) { showToast(e.message,'error'); }
  };

  const addCategory = async () => {
    if (!newCat.name || !newCat.slug) return showToast('Name and slug required.','warning');
    try {
      await api('/admin/categories', { method:'POST', body:JSON.stringify(newCat) });
      showToast('Category added!','success');
      setNewCat({ name:'', slug:'', icon:'📦', description:'' });
      loadTab('categories');
    } catch(e) { showToast(e.message,'error'); }
  };

  const tabs = [['dashboard','📊 Dashboard'],['users','👥 Users'],['auctions','🏷 Auctions'],['payments','💳 Payments'],['reported','🚨 Reports'],['categories','📁 Categories'],['broadcast','📢 Broadcast']];

  const statCard = (icon, label, val, color='#F59E0B') =>
    React.createElement('div', { className:'card', style:{ padding:20 } },
      React.createElement('div', { style:{ fontSize:'1.8rem', marginBottom:8 } }, icon),
      React.createElement('div', { style:{ fontSize:'1.8rem', fontWeight:700, color } }, val),
      React.createElement('div', { style:{ color:'#888', fontSize:'.8rem' } }, label)
    );

  return React.createElement('div', { style:{ paddingTop:60, minHeight:'100vh' } },
    React.createElement('div', { style:{ maxWidth:1200, margin:'0 auto', padding:'32px 20px' } },
      React.createElement('div', { style:{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:24 } },
        React.createElement('div', null,
          React.createElement('h1', { style:{ fontWeight:700, fontSize:'1.6rem' } }, '⚙️ Admin Panel'),
          React.createElement('p', { style:{ color:'#666', fontSize:'.875rem' } }, 'BidWars management dashboard')
        ),
        React.createElement('span', { className:'badge badge-live' }, 'ADMIN')
      ),
      // Tabs
      React.createElement('div', { style:{ display:'flex', gap:8, marginBottom:24, overflowX:'auto', paddingBottom:4 } },
        tabs.map(([t,l]) => React.createElement('button', { key:t, onClick:()=>setTab(t),
          style:{ padding:'9px 18px', borderRadius:10, border:`1px solid ${tab===t?'#F59E0B':'#2a2a2a'}`, background:tab===t?'rgba(245,158,11,.1)':'#1a1a1a', color:tab===t?'#F59E0B':'#888', cursor:'pointer', whiteSpace:'nowrap', fontFamily:'inherit', fontWeight:tab===t?600:400, fontSize:'.875rem' }
        }, l))
      ),

      loading ? React.createElement('div',{ style:{ textAlign:'center', padding:60, color:'#555' } }, 'Loading...') : React.createElement('div', null,

        // ── DASHBOARD ──
        tab==='dashboard' && stats && React.createElement('div', null,
          React.createElement('div', { style:{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:16, marginBottom:32 } },
            statCard('👥','Total Users', stats.totalUsers),
            statCard('🏷','Total Auctions', stats.totalAuctions),
            statCard('🔨','Total Bids', stats.totalBids, '#22c55e'),
            statCard('💰','Platform Revenue', fmt(stats.platformRevenue), '#F59E0B'),
            statCard('⚡','Live Auctions', stats.liveAuctions, '#ef4444'),
            statCard('🚨','Flagged', stats.flaggedAuctions, '#f59e0b')
          )
        ),

        // ── USERS ──
        tab==='users' && React.createElement('div', { style:{ overflowX:'auto' } },
          React.createElement('table', { style:{ width:'100%', borderCollapse:'collapse' } },
            React.createElement('thead', null,
              React.createElement('tr', { style:{ borderBottom:'1px solid #2a2a2a' } },
                ['Name','Email','Role','Joined','Status','Action'].map(h=>React.createElement('th',{key:h,style:{textAlign:'left',padding:'10px 12px',color:'#555',fontSize:'.75rem',fontWeight:600,textTransform:'uppercase'}},h))
              )
            ),
            React.createElement('tbody', null,
              users.map(u => React.createElement('tr', { key:u._id, style:{ borderBottom:'1px solid #1a1a1a' } },
                React.createElement('td',{style:{padding:'12px',fontWeight:500}}, u.name),
                React.createElement('td',{style:{padding:'12px',color:'#888',fontSize:'.875rem'}}, u.email),
                React.createElement('td',{style:{padding:'12px'}}, React.createElement('span',{className:`badge ${u.role==='admin'?'badge-live':u.role==='seller'?'badge-gold':'badge-ended'}`}, u.role.toUpperCase())),
                React.createElement('td',{style:{padding:'12px',color:'#888',fontSize:'.8rem'}}, new Date(u.createdAt).toLocaleDateString()),
                React.createElement('td',{style:{padding:'12px'}}, React.createElement('span',{className:`badge ${u.isBanned?'badge-live':'badge-ended'}`}, u.isBanned?'BANNED':'ACTIVE')),
                React.createElement('td',{style:{padding:'12px'}},
                  u.role !== 'admin' && React.createElement('button', {
                    onClick:()=>banUser(u._id, !u.isBanned),
                    style:{ padding:'5px 14px', borderRadius:7, border:'none', background:u.isBanned?'rgba(34,197,94,.15)':'rgba(239,68,68,.15)', color:u.isBanned?'#22c55e':'#ef4444', cursor:'pointer', fontFamily:'inherit', fontSize:'.8rem', fontWeight:600 }
                  }, u.isBanned ? 'Unban' : 'Ban')
                )
              ))
            )
          )
        ),

        // ── AUCTIONS ──
        tab==='auctions' && React.createElement('div', { style:{ overflowX:'auto' } },
          React.createElement('table', { style:{ width:'100%', borderCollapse:'collapse' } },
            React.createElement('thead', null,
              React.createElement('tr', { style:{ borderBottom:'1px solid #2a2a2a' } },
                ['Title','Seller','Price','Status','Fraud','Actions'].map(h=>React.createElement('th',{key:h,style:{textAlign:'left',padding:'10px 12px',color:'#555',fontSize:'.75rem',fontWeight:600,textTransform:'uppercase'}},h))
              )
            ),
            React.createElement('tbody', null,
              auctions.map(a => React.createElement('tr', { key:a._id, style:{ borderBottom:'1px solid #1a1a1a' } },
                React.createElement('td',{style:{padding:'12px',maxWidth:200}}, React.createElement('button',{onClick:()=>navigate(`auction/${a._id}`),style:{background:'none',border:'none',cursor:'pointer',color:'#F59E0B',textAlign:'left',fontFamily:'inherit',fontSize:'.875rem',fontWeight:500}},a.title?.slice(0,45)+(a.title?.length>45?'...':''))),
                React.createElement('td',{style:{padding:'12px',color:'#888',fontSize:'.875rem'}}, a.seller?.name),
                React.createElement('td',{style:{padding:'12px',fontFamily:'monospace',fontWeight:600}}, fmt(a.currentPrice)),
                React.createElement('td',{style:{padding:'12px'}}, React.createElement('span',{className:`badge ${a.status==='live'?'badge-live':a.status==='ended'?'badge-ended':'badge-gold'}`},a.status.toUpperCase())),
                React.createElement('td',{style:{padding:'12px',color: a.fraudScore>70?'#ef4444':a.fraudScore>40?'#F59E0B':'#22c55e',fontWeight:600}}, a.fraudScore||0),
                React.createElement('td',{style:{padding:'12px',display:'flex',gap:6}},
                  a.status==='live' && React.createElement('button',{onClick:()=>auctionAction(a._id,'cancel'),style:{padding:'4px 12px',borderRadius:6,border:'none',background:'rgba(239,68,68,.15)',color:'#ef4444',cursor:'pointer',fontFamily:'inherit',fontSize:'.8rem',fontWeight:600}},'Cancel'),
                  a.isFlagged && React.createElement('button',{onClick:()=>auctionAction(a._id,'approve'),style:{padding:'4px 12px',borderRadius:6,border:'none',background:'rgba(34,197,94,.15)',color:'#22c55e',cursor:'pointer',fontFamily:'inherit',fontSize:'.8rem',fontWeight:600}},'Approve')
                )
              ))
            )
          )
        ),

        // ── PAYMENTS ──
        tab==='payments' && React.createElement('div', { style:{ overflowX:'auto' } },
          React.createElement('table', { style:{ width:'100%', borderCollapse:'collapse' } },
            React.createElement('thead', null,
              React.createElement('tr', { style:{ borderBottom:'1px solid #2a2a2a' } },
                ['Auction','Buyer','Amount','Method','Status','Date'].map(h=>React.createElement('th',{key:h,style:{textAlign:'left',padding:'10px 12px',color:'#555',fontSize:'.75rem',fontWeight:600,textTransform:'uppercase'}},h))
              )
            ),
            React.createElement('tbody', null,
              payments.map(p => React.createElement('tr', { key:p._id, style:{ borderBottom:'1px solid #1a1a1a' } },
                React.createElement('td',{style:{padding:'12px',fontSize:'.875rem',maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}, p.auction?.title||'—'),
                React.createElement('td',{style:{padding:'12px',color:'#888',fontSize:'.875rem'}}, p.buyer?.name||'—'),
                React.createElement('td',{style:{padding:'12px',fontFamily:'monospace',fontWeight:700,color:'#F59E0B'}}, fmt(p.amount)),
                React.createElement('td',{style:{padding:'12px',color:'#888',fontSize:'.875rem',textTransform:'capitalize'}}, p.paymentMethod),
                React.createElement('td',{style:{padding:'12px'}}, React.createElement('span',{className:`badge ${p.status==='released'?'badge-live':p.status==='escrow'?'badge-gold':'badge-ended'}`},p.status.toUpperCase())),
                React.createElement('td',{style:{padding:'12px',color:'#888',fontSize:'.8rem'}}, new Date(p.createdAt).toLocaleDateString())
              ))
            )
          )
        ),

        // ── REPORTED ──
        tab==='reported' && (reported.length===0 ?
          React.createElement('div',{style:{textAlign:'center',padding:60,color:'#555'}}, React.createElement('div',{style:{fontSize:'3rem',marginBottom:12}},'✅'), React.createElement('p',null,'No reported auctions.')) :
          React.createElement('div',{style:{display:'flex',flexDirection:'column',gap:12}},
            reported.map(a => React.createElement('div',{key:a._id,className:'card',style:{padding:16,borderLeft:'3px solid #ef4444'}},
              React.createElement('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}},
                React.createElement('div',null,
                  React.createElement('p',{style:{fontWeight:600,marginBottom:4}},a.title),
                  React.createElement('p',{style:{color:'#888',fontSize:'.8rem'}},`Fraud score: ${a.fraudScore} · ${a.reports?.length||0} reports`),
                  a.reports?.slice(0,2).map((r,i)=>React.createElement('p',{key:i,style:{color:'#666',fontSize:'.75rem',marginTop:4}},`"${r.reason}: ${r.description?.slice(0,80)}"`)  )
                ),
                React.createElement('div',{style:{display:'flex',gap:8,flexShrink:0,marginLeft:16}},
                  React.createElement('button',{onClick:()=>{navigate(`auction/${a._id}`)},style:{padding:'6px 14px',borderRadius:8,background:'#2a2a2a',border:'none',color:'#ccc',cursor:'pointer',fontSize:'.8rem',fontFamily:'inherit'}},'View'),
                  React.createElement('button',{onClick:()=>auctionAction(a._id,'cancel'),style:{padding:'6px 14px',borderRadius:8,background:'rgba(239,68,68,.15)',border:'none',color:'#ef4444',cursor:'pointer',fontSize:'.8rem',fontFamily:'inherit',fontWeight:600}},'Remove')
                )
              )
            ))
          )
        ),

        // ── CATEGORIES ──
        tab==='categories' && React.createElement('div',{style:{display:'grid',gridTemplateColumns:'1fr 1fr',gap:24}},
          React.createElement('div',{className:'card',style:{padding:20}},
            React.createElement('h3',{style:{fontWeight:600,marginBottom:16,color:'#F59E0B'}},'Add Category'),
            [['name','Name *'],['slug','Slug *'],['icon','Icon (emoji)'],['description','Description']].map(([k,l])=>
              React.createElement('div',{key:k,style:{marginBottom:12}},
                React.createElement('label',{style:{display:'block',color:'#888',fontSize:'.75rem',marginBottom:5,fontWeight:500}},l),
                React.createElement('input',{className:'input',value:newCat[k],onChange:e=>setNewCat(c=>({...c,[k]:e.target.value})),placeholder:l})
              )
            ),
            React.createElement('button',{onClick:addCategory,className:'btn-gold',style:{width:'100%',padding:'11px',borderRadius:10}},'Add Category')
          ),
          React.createElement('div',{className:'card',style:{padding:20}},
            React.createElement('h3',{style:{fontWeight:600,marginBottom:16}},`Categories (${cats.length})`),
            React.createElement('div',{style:{maxHeight:360,overflowY:'auto',display:'flex',flexDirection:'column',gap:8}},
              cats.map(c=>React.createElement('div',{key:c._id,style:{display:'flex',alignItems:'center',gap:12,padding:'8px 10px',background:'#111',borderRadius:10}},
                React.createElement('span',{style:{fontSize:'1.3rem'}},c.icon||'📦'),
                React.createElement('span',{style:{fontWeight:500,fontSize:'.875rem'}},c.name)
              ))
            )
          )
        ),

        // ── BROADCAST ──
        tab==='broadcast' && React.createElement('div',{style:{maxWidth:500}},
          React.createElement('div',{className:'card',style:{padding:24}},
            React.createElement('h3',{style:{fontWeight:600,marginBottom:8,color:'#F59E0B'}},'📢 Broadcast Notification'),
            React.createElement('p',{style:{color:'#666',fontSize:'.875rem',marginBottom:16}},'Send a message to all connected users in real-time.'),
            React.createElement('textarea',{className:'input',value:broadcast,onChange:e=>setBroadcast(e.target.value),placeholder:'Enter broadcast message...',rows:4,style:{resize:'none',marginBottom:12}}),
            React.createElement('div',{style:{display:'flex',justifyContent:'space-between',alignItems:'center'}},
              React.createElement('span',{style:{color:'#555',fontSize:'.8rem'}},`${broadcast.length}/500`),
              React.createElement('button',{onClick:sendBroadcast,disabled:!broadcast.trim(),className:'btn-gold',style:{padding:'10px 28px',borderRadius:10}},'Send')
            )
          )
        )
      )
    )
  );
}

// ── CATEGORIES PAGE ───────────────────────────────────────────
function CategoriesPage() {
  const { navigate } = useApp();
  const [cats, setCats] = useState([]);
  useEffect(() => { api('/categories').then(d=>setCats(d.categories||[])).catch(()=>{}); }, []);
  const fallback = [
    {name:'Electronics',slug:'electronics',icon:'💻'},{name:'Fashion',slug:'fashion',icon:'👗'},
    {name:'Collectibles',slug:'collectibles',icon:'🏆'},{name:'Art',slug:'art',icon:'🎨'},
    {name:'Jewelry',slug:'jewelry',icon:'💍'},{name:'Vehicles',slug:'vehicles',icon:'🚗'},
    {name:'Sports',slug:'sports',icon:'⚽'},{name:'Home & Garden',slug:'home',icon:'🏠'},
    {name:'Toys & Hobbies',slug:'toys',icon:'🧸'},{name:'Books & Media',slug:'books',icon:'📚'}
  ];
  const display = cats.length ? cats : fallback;
  return React.createElement('div',{style:{paddingTop:60,minHeight:'100vh'}},
    React.createElement('div',{style:{maxWidth:1100,margin:'0 auto',padding:'40px 20px'}},
      React.createElement('h1',{style:{fontFamily:'Bebas Neue,sans-serif',fontSize:'2.5rem',letterSpacing:'.05em',marginBottom:8,color:'#F59E0B'}},'Categories'),
      React.createElement('p',{style:{color:'#666',marginBottom:36}},'Browse auctions by category'),
      React.createElement('div',{style:{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))',gap:16}},
        display.map(c=>React.createElement('div',{key:c.slug||c.name,onClick:()=>navigate(`auctions?category=${c.slug||c.name}`),
          className:'card',style:{padding:28,cursor:'pointer',textAlign:'center',transition:'all .2s'},
          onMouseEnter:e=>{e.currentTarget.style.borderColor='#F59E0B';e.currentTarget.style.transform='translateY(-4px)';},
          onMouseLeave:e=>{e.currentTarget.style.borderColor='#2a2a2a';e.currentTarget.style.transform='translateY(0)';}
        },
          React.createElement('div',{style:{fontSize:'2.5rem',marginBottom:12}},c.icon||'📦'),
          React.createElement('h3',{style:{fontWeight:600,marginBottom:4}},c.name),
          React.createElement('p',{style:{color:'#555',fontSize:'.8rem'}},c.description||'Explore listings')
        ))
      )
    )
  );
}

// ── OAUTH CALLBACK PAGE ───────────────────────────────────────
function OAuthCallbackPage() {
  const { setUser } = useAuth();
  const { navigate } = useApp();
  useEffect(() => {
    const hash = window.location.hash;
    const match = hash.match(/token=([^&]+)/);
    if (match) {
      const token = match[1];
      localStorage.setItem('bw_token', token);
      api('/auth/me').then(d => { setUser(d.user); navigate('home'); showToast('Logged in!','success'); }).catch(()=>navigate('login'));
    } else navigate('login');
  }, []);
  return React.createElement('div',{style:{paddingTop:80,textAlign:'center',color:'#888'}},'Completing login...');
}

// ── 404 PAGE ──────────────────────────────────────────────────
function NotFoundPage() {
  const { navigate } = useApp();
  return React.createElement('div',{style:{paddingTop:60,minHeight:'100vh',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',textAlign:'center'}},
    React.createElement('div',{style:{fontSize:'5rem',marginBottom:16}},'🔍'),
    React.createElement('h1',{style:{fontFamily:'Bebas Neue,sans-serif',fontSize:'3rem',letterSpacing:'.05em',marginBottom:8}},'PAGE NOT FOUND'),
    React.createElement('p',{style:{color:'#666',marginBottom:24}},'The page you are looking for does not exist.'),
    React.createElement('button',{onClick:()=>navigate('home'),className:'btn-gold',style:{padding:'12px 32px',borderRadius:11}},'Back to Home')
  );
}


// ── ERROR BOUNDARY ────────────────────────────────────────────
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(err) { return { error: err }; }
  componentDidCatch(err, info) { console.error('React error:', err, info); }
  render() {
    if (this.state.error) return React.createElement('div', {
      style:{ minHeight:'100vh', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'#0F0F0F', padding:20, textAlign:'center' }
    },
      React.createElement('div',{style:{fontSize:'3rem',marginBottom:16}},'⚠️'),
      React.createElement('h2',{style:{fontFamily:'Bebas Neue,sans-serif',fontSize:'2rem',color:'#F59E0B',letterSpacing:'.05em',marginBottom:12}},'SOMETHING WENT WRONG'),
      React.createElement('p',{style:{color:'#888',maxWidth:400,marginBottom:24,fontSize:'.9rem'}}, this.state.error.message),
      React.createElement('button',{onClick:()=>window.location.reload(), className:'btn-gold', style:{padding:'12px 28px',borderRadius:10}}, 'Reload Page')
    );
    return this.props.children;
  }
}

// ── ROUTER ────────────────────────────────────────────────────
function Router() {
  const { page } = useApp();

  const parsePage = () => {
    const raw  = page || 'home';
    const base = raw.split('?')[0];
    const parts = base.split('/').filter(Boolean);
    if (!parts.length || parts[0]==='home')         return { route:'home',         params:{} };
    if (parts[0]==='auctions')                       return { route:'auctions',     params:{} };
    if (parts[0]==='auction' && parts[1])            return { route:'auction',      params:{ auctionId:parts[1] } };
    if (parts[0]==='create')                         return { route:'create',       params:{} };
    if (parts[0]==='login')                          return { route:'login',        params:{} };
    if (parts[0]==='register')                       return { route:'register',     params:{} };
    if (parts[0]==='forgot-password')                return { route:'forgot',       params:{} };
    if (parts[0]==='oauth-callback')                 return { route:'oauth',        params:{} };
    if (parts[0]==='dashboard' || parts[0]==='my-bids') return { route:'dashboard', params:{} };
    if (parts[0]==='notifications')                  return { route:'notifications',params:{} };
    if (parts[0]==='payment' && parts[1])            return { route:'payment',      params:{ auctionId:parts[1] } };
    if (parts[0]==='admin')                          return { route:'admin',        params:{} };
    if (parts[0]==='categories')                     return { route:'categories',   params:{} };
    return { route:'404', params:{} };
  };

  const { route, params } = parsePage();
  const renderPage = () => {
    switch (route) {
      case 'home':          return React.createElement(HomePage);
      case 'auctions':      return React.createElement(AuctionsPage);
      case 'auction':       return React.createElement(AuctionDetailPage, params);
      case 'create':        return React.createElement(CreateAuctionPage);
      case 'login':         return React.createElement(LoginPage);
      case 'register':      return React.createElement(RegisterPage);
      case 'forgot':        return React.createElement(ForgotPasswordPage);
      case 'oauth':         return React.createElement(OAuthCallbackPage);
      case 'dashboard':     return React.createElement(DashboardPage);
      case 'notifications': return React.createElement(NotificationsPage);
      case 'payment':       return React.createElement(PaymentPage, params);
      case 'admin':         return React.createElement(AdminPage);
      case 'categories':    return React.createElement(CategoriesPage);
      default:              return React.createElement(NotFoundPage);
    }
  };

  return React.createElement('div', null,
    React.createElement(Navbar),
    React.createElement('main', null, renderPage())
  );
}

// ── ROOT APP ──────────────────────────────────────────────────
function App() {
  return React.createElement(ErrorBoundary, null,
    React.createElement(AuthProvider, null,
      React.createElement(AppProvider, null,
        React.createElement(Router)
      )
    )
  );
}

// ── MOUNT ─────────────────────────────────────────────────────
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(React.createElement(App));
