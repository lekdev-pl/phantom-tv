const express = require('express');
const multer = require('multer');
const path = require('path');
const { getDb } = require('../database');
const { verifyToken, requireAdmin } = require('../middleware/auth');
const bcrypt = require('bcryptjs');

const router = express.Router();
router.use(verifyToken, requireAdmin);

// Multer for M3U uploads
const upload = multer({
  dest: path.join(__dirname, '../uploads/'),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    if (file.originalname.match(/\.(m3u|m3u8|txt)$/i)) cb(null, true);
    else cb(new Error('Seuls les fichiers M3U sont acceptés'));
  }
});

// ─── STATS ────────────────────────────────────────────────────────────────────
router.get('/stats', (req, res) => {
  const db = getDb();
  const stats = {
    users: db.prepare('SELECT COUNT(*) as c FROM users').get().c,
    active_users: db.prepare("SELECT COUNT(*) as c FROM users WHERE is_active = 1").get().c,
    channels: db.prepare('SELECT COUNT(*) as c FROM channels').get().c,
    active_channels: db.prepare('SELECT COUNT(*) as c FROM channels WHERE is_active = 1').get().c,
    favorites: db.prepare('SELECT COUNT(*) as c FROM favorites').get().c,
    views_today: db.prepare("SELECT COUNT(*) as c FROM view_history WHERE date(watched_at) = date('now')").get().c,
    views_total: db.prepare('SELECT SUM(views) as c FROM channels').get().c || 0,
    top_channels: db.prepare('SELECT id, name, logo, views FROM channels ORDER BY views DESC LIMIT 5').all(),
    recent_users: db.prepare('SELECT id, username, email, created_at, subscription_plan FROM users ORDER BY created_at DESC LIMIT 5').all(),
    categories_stats: db.prepare(`
      SELECT cat.name, cat.icon, COUNT(c.id) as count
      FROM categories cat LEFT JOIN channels c ON c.category_id = cat.id
      GROUP BY cat.id ORDER BY count DESC
    `).all(),
  };
  res.json(stats);
});

// ─── ACCOUNTS (création admin) ────────────────────────────────────────────────
router.post('/users', (req, res) => {
  const {
    username, email, password,
    role = 'user',
    subscription_plan = 'premium',
    subscription_duration, // '1' '3' '6' '12' ou 'unlimited' ou null
    max_streams = 1,
    notes = ''
  } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Username, email et password sont requis' });
  }
  if (username.length < 3 || username.length > 30) {
    return res.status(400).json({ error: 'Le nom doit faire entre 3 et 30 caractères' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'Mot de passe trop court (min 4 caractères)' });
  }

  // Calcul de la date d'expiration
  let subscription_end = null;
  if (subscription_duration && subscription_duration !== 'unlimited') {
    const months = parseInt(subscription_duration, 10);
    if (!isNaN(months) && months > 0) {
      const end = new Date();
      end.setMonth(end.getMonth() + months);
      subscription_end = end.toISOString();
    }
  }

  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email.toLowerCase());
  if (existing) {
    return res.status(409).json({ error: 'Nom d\'utilisateur ou email déjà utilisé' });
  }

  const hash = bcrypt.hashSync(password, 10);
  try {
    const result = db.prepare(`
      INSERT INTO users (username, email, password_hash, role, subscription_plan, subscription_end, max_streams, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).run(username, email.toLowerCase(), hash, role, subscription_plan, subscription_end, parseInt(max_streams) || 1);

    const user = db.prepare(`
      SELECT id, username, email, role, subscription_plan, subscription_end, max_streams, is_active, created_at
      FROM users WHERE id = ?
    `).get(result.lastInsertRowid);

    res.status(201).json(user);
  } catch (err) {
    console.error('[CREATE USER]', err);
    res.status(500).json({ error: 'Erreur lors de la création du compte' });
  }
});

// GET /admin/accounts/stats — infos rapides pour le widget
router.get('/accounts/stats', (req, res) => {
  const db = getDb();
  const now = new Date().toISOString();
  const soon = new Date();
  soon.setDate(soon.getDate() + 7);
  const soonIso = soon.toISOString();

  res.json({
    total: db.prepare("SELECT COUNT(*) as c FROM users WHERE role != 'admin'").get().c,
    active: db.prepare("SELECT COUNT(*) as c FROM users WHERE role != 'admin' AND is_active = 1 AND (subscription_end IS NULL OR subscription_end > ?)").get(now).c,
    expiring_soon: db.prepare("SELECT COUNT(*) as c FROM users WHERE role != 'admin' AND subscription_end IS NOT NULL AND subscription_end > ? AND subscription_end <= ?").get(now, soonIso).c,
    expired: db.prepare("SELECT COUNT(*) as c FROM users WHERE role != 'admin' AND subscription_end IS NOT NULL AND subscription_end <= ?").get(now).c,
    unlimited: db.prepare("SELECT COUNT(*) as c FROM users WHERE role != 'admin' AND subscription_end IS NULL AND subscription_plan != 'free'").get().c,
  });
});

// PUT /admin/users/:id/extend — prolonger l'abonnement
router.put('/users/:id/extend', (req, res) => {
  const { months } = req.body;
  if (!months || isNaN(parseInt(months))) {
    return res.status(400).json({ error: 'Nombre de mois requis' });
  }
  const db = getDb();
  const user = db.prepare('SELECT id, subscription_end FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

  // Partir de la date actuelle ou de la fin d'abonnement actuelle si elle est dans le futur
  const now = new Date();
  const base = user.subscription_end && new Date(user.subscription_end) > now
    ? new Date(user.subscription_end)
    : now;
  base.setMonth(base.getMonth() + parseInt(months));

  db.prepare('UPDATE users SET subscription_end = ? WHERE id = ?').run(base.toISOString(), req.params.id);
  res.json({ ok: true, subscription_end: base.toISOString() });
});

// ─── USERS ────────────────────────────────────────────────────────────────────
router.get('/users', (req, res) => {
  const db = getDb();
  const { search, page = 1, limit = 20, role } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let where = [];
  let params = [];
  if (search) { where.push('(username LIKE ? OR email LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
  if (role) { where.push('role = ?'); params.push(role); }

  const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const users = db.prepare(`
    SELECT id, username, email, role, is_active, subscription_plan, subscription_end, created_at, last_login
    FROM users ${whereStr} ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), offset);

  const total = db.prepare(`SELECT COUNT(*) as c FROM users ${whereStr}`).get(...params);
  res.json({ users, total: total.c, pages: Math.ceil(total.c / parseInt(limit)) });
});

router.put('/users/:id', (req, res) => {
  const { role, is_active, subscription_plan, subscription_end, max_streams, password } = req.body;
  const db = getDb();

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

  const updates = {};
  if (role !== undefined) updates.role = role;
  if (is_active !== undefined) updates.is_active = is_active ? 1 : 0;
  if (subscription_plan !== undefined) updates.subscription_plan = subscription_plan;
  if (subscription_end !== undefined) updates.subscription_end = subscription_end;
  if (max_streams !== undefined) updates.max_streams = parseInt(max_streams);
  if (password) updates.password_hash = bcrypt.hashSync(password, 12);

  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Aucune modification' });

  const sets = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE users SET ${sets} WHERE id = ?`).run(...Object.values(updates), req.params.id);
  res.json({ ok: true });
});

router.delete('/users/:id', (req, res) => {
  if (parseInt(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'Impossible de supprimer votre propre compte' });
  }
  const db = getDb();
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── CHANNELS ─────────────────────────────────────────────────────────────────
router.get('/channels', (req, res) => {
  const db = getDb();
  const { search, page = 1, limit = 30, category } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let where = [];
  let params = [];
  if (search) { where.push('(c.name LIKE ? OR c.group_title LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
  if (category) { where.push('c.category_id = ?'); params.push(category); }

  const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const channels = db.prepare(`
    SELECT c.*, cat.name as category_name FROM channels c
    LEFT JOIN categories cat ON c.category_id = cat.id
    ${whereStr} ORDER BY c.name ASC LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), offset);

  const total = db.prepare(`SELECT COUNT(*) as c FROM channels c ${whereStr}`).get(...params);
  res.json({ channels, total: total.c, pages: Math.ceil(total.c / parseInt(limit)) });
});

router.post('/channels', (req, res) => {
  const { name, logo, stream_url, category_id, group_title, country, language, quality, is_featured } = req.body;
  if (!name || !stream_url) return res.status(400).json({ error: 'Nom et URL requis' });

  const db = getDb();
  const result = db.prepare(`
    INSERT INTO channels (name, logo, stream_url, category_id, group_title, country, language, quality, is_featured)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, logo || null, stream_url, category_id || null, group_title || null, country || null, language || null, quality || 'HD', is_featured ? 1 : 0);

  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(channel);
});

router.put('/channels/:id', (req, res) => {
  const { name, logo, stream_url, category_id, group_title, country, language, quality, is_active, is_featured } = req.body;
  const db = getDb();

  const channel = db.prepare('SELECT id FROM channels WHERE id = ?').get(req.params.id);
  if (!channel) return res.status(404).json({ error: 'Chaîne introuvable' });

  const updates = {};
  if (name !== undefined) updates.name = name;
  if (logo !== undefined) updates.logo = logo;
  if (stream_url !== undefined) updates.stream_url = stream_url;
  if (category_id !== undefined) updates.category_id = category_id;
  if (group_title !== undefined) updates.group_title = group_title;
  if (country !== undefined) updates.country = country;
  if (language !== undefined) updates.language = language;
  if (quality !== undefined) updates.quality = quality;
  if (is_active !== undefined) updates.is_active = is_active ? 1 : 0;
  if (is_featured !== undefined) updates.is_featured = is_featured ? 1 : 0;

  if (Object.keys(updates).length === 0) return res.status(400).json({ error: 'Aucune modification' });

  const sets = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE channels SET ${sets} WHERE id = ?`).run(...Object.values(updates), req.params.id);
  res.json({ ok: true });
});

router.delete('/channels/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM channels WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── CATEGORIES ───────────────────────────────────────────────────────────────
router.get('/categories', (req, res) => {
  const db = getDb();
  res.json(db.prepare('SELECT * FROM categories ORDER BY position').all());
});

router.post('/categories', (req, res) => {
  const { name, slug, icon, color } = req.body;
  if (!name || !slug) return res.status(400).json({ error: 'Nom et slug requis' });
  const db = getDb();
  const maxPos = db.prepare('SELECT MAX(position) as m FROM categories').get().m || 0;
  const result = db.prepare('INSERT INTO categories (name, slug, icon, color, position) VALUES (?, ?, ?, ?, ?)').run(name, slug, icon || '📺', color || '#6c63ff', maxPos + 1);
  res.status(201).json(db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid));
});

router.put('/categories/:id', (req, res) => {
  const { name, slug, icon, color, position } = req.body;
  const db = getDb();
  db.prepare('UPDATE categories SET name=COALESCE(?,name), slug=COALESCE(?,slug), icon=COALESCE(?,icon), color=COALESCE(?,color), position=COALESCE(?,position) WHERE id=?')
    .run(name, slug, icon, color, position, req.params.id);
  res.json({ ok: true });
});

router.delete('/categories/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── M3U IMPORT ───────────────────────────────────────────────────────────────
router.post('/import-m3u', upload.single('file'), (req, res) => {
  const { url, category_id, overwrite = false } = req.body;
  const fs = require('fs');
  let content = '';

  try {
    if (req.file) {
      content = fs.readFileSync(req.file.path, 'utf8');
      fs.unlinkSync(req.file.path);
    } else if (url) {
      // For simplicity, return instruction to use file upload
      return res.status(400).json({ error: 'Importation par URL: utilisez le fichier directement' });
    } else {
      return res.status(400).json({ error: 'Fichier ou URL requis' });
    }

    const channels = parseM3U(content);
    if (channels.length === 0) return res.status(400).json({ error: 'Aucune chaîne trouvée dans le fichier' });

    const db = getDb();
    let inserted = 0, updated = 0, skipped = 0;

    const insert = db.prepare(`
      INSERT OR IGNORE INTO channels (name, logo, stream_url, category_id, group_title, quality)
      VALUES (?, ?, ?, ?, ?, 'HD')
    `);

    const insertMany = db.transaction((chans) => {
      for (const ch of chans) {
        if (!ch.name || !ch.url) { skipped++; continue; }
        const exists = db.prepare('SELECT id FROM channels WHERE stream_url = ?').get(ch.url);
        if (exists && !overwrite) { skipped++; continue; }
        if (exists && overwrite) {
          db.prepare('UPDATE channels SET name=?, logo=?, group_title=? WHERE id=?').run(ch.name, ch.logo || null, ch.group || null, exists.id);
          updated++;
        } else {
          insert.run(ch.name, ch.logo || null, ch.url, category_id || null, ch.group || null);
          inserted++;
        }
      }
    });
    insertMany(channels);

    res.json({ ok: true, imported: inserted, updated, skipped, total: channels.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur lors de l\'importation: ' + err.message });
  }
});

function parseM3U(content) {
  const channels = [];
  const lines = content.split('\n').map(l => l.trim()).filter(Boolean);

  if (!lines[0]?.startsWith('#EXTM3U')) return channels;

  let current = {};
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#EXTINF:')) {
      current = {};
      const nameMatch = line.match(/,(.+)$/);
      if (nameMatch) current.name = nameMatch[1].trim();
      const logoMatch = line.match(/tvg-logo="([^"]+)"/);
      if (logoMatch) current.logo = logoMatch[1];
      const groupMatch = line.match(/group-title="([^"]+)"/);
      if (groupMatch) current.group = groupMatch[1];
      const idMatch = line.match(/tvg-id="([^"]+)"/);
      if (idMatch) current.epg_id = idMatch[1];
    } else if (line.startsWith('http') || line.startsWith('rtmp') || line.startsWith('rtsp')) {
      current.url = line;
      if (current.name) channels.push({ ...current });
      current = {};
    }
  }
  return channels;
}

// ─── EPG MANAGEMENT ───────────────────────────────────────────────────────────
router.post('/channels/:id/epg', (req, res) => {
  const { title, description, start_time, end_time, thumbnail, category } = req.body;
  if (!title || !start_time || !end_time) return res.status(400).json({ error: 'Titre, début et fin requis' });

  const db = getDb();
  const result = db.prepare(`
    INSERT INTO epg_programs (channel_id, title, description, start_time, end_time, thumbnail, category)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(req.params.id, title, description || null, start_time, end_time, thumbnail || null, category || null);

  res.status(201).json(db.prepare('SELECT * FROM epg_programs WHERE id = ?').get(result.lastInsertRowid));
});

router.delete('/epg/:id', (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM epg_programs WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
