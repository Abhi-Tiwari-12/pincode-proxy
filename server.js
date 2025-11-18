require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3001;

const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbwXLyrSRGTG6evmY32bPyUvjgVAEsMaGRc_mENsqYisLO6Cj6oCG0XveSY6jqDLNpst/exec';

// CORS: Explicitly allow your Netlify domain + localhost
app.use(cors({
  origin: [
    'https://store-mapper-20.netlify.app',
    'http://localhost:3000',
    'http://localhost:5173'
  ],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  credentials: true,
}));

// Handle preflight OPTIONS explicitly (fixes cold start issues)
app.options('*', cors());

app.use(express.json({ limit: '10kb' }));

// Simple rate limiter
const rateLimitMap = new Map();
const RATE_LIMIT = 100;
const WINDOW_MS = 60000;

const rateLimiter = (req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress;
  const now = Date.now();
  const userRequests = rateLimitMap.get(ip) || [];
  const recent = userRequests.filter(time => now - time < WINDOW_MS);

  if (recent.length >= RATE_LIMIT) {
    return res.status(429).json({ error: 'Rate limit exceeded' });
  }

  recent.push(now);
  rateLimitMap.set(ip, recent);
  next();
};

app.post('/pincodes', rateLimiter, async (req, res) => {
  const { store } = req.body;

  if (!store || typeof store !== 'string' || !store.trim()) {
    return res.status(400).json({ error: 'Valid store required' });
  }

  const trimmedStore = store.trim().toLowerCase();
  const validStores = ['all', 'amazon', 'flipkart', 'myntra', 'meesho', 'jiomart', 'bigbasket'];
  if (!validStores.includes(trimmedStore)) {
    return res.status(400).json({ error: 'Invalid store' });
  }

  try {
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'StoreMapper/1.0',
      },
      body: JSON.stringify({ store: trimmedStore }),
      signal: AbortSignal.timeout(15000), // 15s timeout
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Upstream ${response.status}: ${errorText}`);
      return res.status(502).json({ error: 'Upstream error' });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Fetch error:', error);
    if (error.name === 'AbortError') {
      return res.status(504).json({ error: 'Timeout' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

// Health check (tests CORS too)
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Proxy running on port ${PORT}`);
});

// Graceful shutdown for Render
process.on('SIGTERM', () => {
  console.log('Shutting down gracefully');
  server.close(() => process.exit(0));
});
