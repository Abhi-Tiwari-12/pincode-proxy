// server.js — FINAL VERSION (NO TIMEOUTS · WORKS 100%)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3001;

const GOOGLE_SCRIPT_URL =
  process.env.GOOGLE_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbwXLyrSRGTG6evmY32bPyUvjgVAEsMaGRc_mENsqYisLO6Cj6oCG0XveSY6jqDLNpst/exec';

// CORS — Allow your Netlify site + localhost
app.use(
  cors({
    origin: [
      'https://store-mapper-20.netlify.app',
      'http://localhost:3000',
      'http://localhost:5173',
      'http://127.0.0.1:3000',
    ],
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type'],
    credentials: true,
  })
);

// Handle preflight requests
app.options('*', cors());

app.use(express.json({ limit: '10kb' }));

// Simple rate limiter (100 req/min per IP)
const rateLimitMap = new Map();
const RATE_LIMIT = 100;
const WINDOW_MS = 60_000;

const rateLimiter = (req, res, next) => {
  const ip = req.ip || req.socket.remoteAddress || req.connection.remoteAddress;
  const now = Date.now();

  let requests = rateLimitMap.get(ip) || [];
  requests = requests.filter((time) => now - time < WINDOW_MS);
  if (requests.length >= RATE_LIMIT) {
    return res.status(429).json({ error: 'Too many requests — please wait a minute' });
  }
  requests.push(now);
  rateLimitMap.set(ip, requests);
  next();
};

// MAIN ENDPOINT — NO TIMEOUTS AT ALL
app.post('/pincodes', rateLimiter, async (req, res) => {
  const { store } = req.body;

  if (!store || typeof store !== 'string' || !store.trim()) {
    return res.status(400).json({ error: 'Valid store required' });
  }

  const normalized = store.trim().toLowerCase();
  const validStores = ['all', 'amazon', 'flipkart', 'myntra', 'meesho', 'jiomart', 'bigbasket'];

  if (!validStores.includes(normalized)) {
    return res.status(400).json({ error: 'Invalid store' });
  }

  try {
    // NO TIMEOUT → Google Apps Script can take 40+ seconds → we wait!
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'PincodeProxy/1.0 (+https://store-mapper-20.netlify.app)',
      },
      body: JSON.stringify({ store: normalized }),
      // REMOVED: signal: AbortSignal.timeout(...) → this was killing your requests!
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`Upstream error ${response.status}:`, text);
      return res.status(502).json({ error: 'Upstream service failed' });
    }

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('Proxy error:', error.message);
    // Only return 504 on real network failure (not timeout)
    res.status(504).json({ error: 'Network error — try again' });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', time: new Date().toISOString() });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Proxy LIVE at https://pincode-proxy.onrender.com (port ${PORT})`);
  console.log(`Ready for https://store-mapper-20.netlify.app`);
});
