// server.js — FINAL VERSION (Accepts ANY store name from The Sleep Company)
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3001;

const GOOGLE_SCRIPT_URL =
  process.env.GOOGLE_SCRIPT_URL ||
  'https://script.google.com/macros/s/AKfycbwXLyrSRGTG6evmY32bPyUvjgVAEsMaGRc_mENsqYisLO6Cj6oCG0XveSY6jqDLNpst/exec';

app.use(cors({
  origin: [
    'https://store-mapper-20.netlify.app',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://127.0.0.1'
  ],
  credentials: true
}));

app.options('*', cors());
app.use(express.json({ limit: '10kb' }));

// MAIN ENDPOINT — ACCEPTS ANY STORE NAME
app.post('/pincodes', async (req, res) => {
  let { store } = req.body;

  if (!store || typeof store !== 'string' || store.trim() === '') {
    return res.status(400).json({ error: 'Store name is required' });
  }

  store = store.trim();

  try {
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ store })  // Forward exact store name
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Upstream error:', response.status, text);
      return res.status(response.status).send(text);
    }

    const data = await response.json();
    res.json(data);

  } catch (error) {
    console.error('Proxy error:', error.message);
    res.status(504).json({ error: 'Service timeout — try again' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', time: new Date().toISOString() });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Proxy LIVE → https://pincode-proxy.onrender.com`);
  console.log(`Accepting ANY The Sleep Company store name`);
});
