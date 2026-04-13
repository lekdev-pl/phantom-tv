const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const path = require('path');
const { initDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// ─── DATABASE ─────────────────────────────────────────────────────────────────
initDatabase();

// ─── SUBSCRIPTION EXPIRY CLEANUP ─────────────────────────────────────────────
function runExpiryCleanup() {
  const { getDb } = require('./database');
  const db = getDb();
  const now = new Date().toISOString();

  try {
    // Récupérer les comptes expirés (hors admin)
    const expired = db.prepare(`
      SELECT id, username, email, subscription_end
      FROM users
      WHERE role != 'admin'
        AND subscription_end IS NOT NULL
        AND subscription_end < ?
    `).all(now);

    if (expired.length > 0) {
      const ids = expired.map(u => u.id);
      db.prepare(`DELETE FROM users WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);
      console.log(`[EXPIRY] ${expired.length} compte(s) supprimé(s) : ${expired.map(u => `${u.username} (exp: ${u.subscription_end})`).join(', ')}`);
    }
  } catch (err) {
    console.error('[EXPIRY] Erreur lors du nettoyage:', err.message);
  }
}

// Lancer immédiatement puis toutes les 10 minutes
runExpiryCleanup();
setInterval(runExpiryCleanup, 10 * 60 * 1000);

// ─── ROUTES ───────────────────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/channels', require('./routes/channels'));
app.use('/api/admin', require('./routes/admin'));

// ─── SEARCH ENDPOINT ──────────────────────────────────────────────────────────
app.get('/api/search', (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 2) return res.json([]);

  const { getDb } = require('./database');
  const db = getDb();
  const results = db.prepare(`
    SELECT c.id, c.name, c.logo, c.quality, c.views,
           cat.name as category_name, cat.icon as category_icon
    FROM channels c
    LEFT JOIN categories cat ON c.category_id = cat.id
    WHERE c.is_active = 1 AND (c.name LIKE ? OR c.group_title LIKE ?)
    ORDER BY c.views DESC, c.name ASC
    LIMIT 10
  `).all(`%${q}%`, `%${q}%`);
  res.json(results);
});

// ─── EPG NOW PLAYING ──────────────────────────────────────────────────────────
app.get('/api/epg/now', (req, res) => {
  const { getDb } = require('./database');
  const db = getDb();
  const now = new Date().toISOString();
  const programs = db.prepare(`
    SELECT ep.*, c.name as channel_name, c.logo as channel_logo
    FROM epg_programs ep
    JOIN channels c ON ep.channel_id = c.id
    WHERE ep.start_time <= ? AND ep.end_time > ? AND c.is_active = 1
    ORDER BY ep.channel_id
  `).all(now, now);
  res.json(programs);
});

// ─── SPA FALLBACK ─────────────────────────────────────────────────────────────
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public/dashboard.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public/login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'public/register.html')));
app.get('/watch/:id', (req, res) => res.sendFile(path.join(__dirname, 'public/player.html')));
app.get('/admin*', (req, res) => res.sendFile(path.join(__dirname, 'public/admin.html')));

// ─── ERROR HANDLING ───────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Erreur interne du serveur' });
});

// ─── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n▓░▒▓ PHANTOM TV ▓▒░▓`);
  console.log(`🌐 http://localhost:${PORT}`);
  console.log(`🔐 Admin: admin / admin123`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
});
