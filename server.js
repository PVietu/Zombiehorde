// ============================================================
// ZOMBIE HORDE — Static Server + ngrok tunnel
// Node.js + Express + ngrok
// ============================================================

const express = require('express');
const path = require('path');
const http = require('http');

const PORT = process.env.PORT || 3000;
const app = express();
const server = http.createServer(app);

// ─── Static files ───────────────────────────────────────────
app.use(express.static(path.join(__dirname, 'dist')));

// ─── SPA fallback ───────────────────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

// ─── Start server ───────────────────────────────────────────
server.listen(PORT, async () => {
  console.log(`\n🎮 Zombie Horde Server`);
  console.log(`📡 Local: http://localhost:${PORT}`);

  // Try to start ngrok tunnel
  try {
    const ngrok = require('ngrok');
    const url = await ngrok.connect({
      addr: PORT,
      authtoken: '3ER3n9UuUjAf4z0flHlfDXaP6ST_7SGNJYjwX7zRSUWB5NTEK',
    });
    console.log(`🌐 Public URL: ${url}`);
    console.log(`\nShare this URL with friends to play together!\n`);
  } catch (e) {
    console.log(`⚠️  ngrok not available (${e.message})`);
    console.log(`   Install with: npm install ngrok`);
    console.log(`   Then restart the server.\n`);
  }
});
