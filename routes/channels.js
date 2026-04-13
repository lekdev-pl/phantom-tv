const express = require('express');
const { getDb } = require('../database');
const { verifyToken, optionalToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/channels
router.get('/', optionalToken, (req, res) => {
  const db = getDb();
  const { category, search, page = 1, limit = 48, featured, quality, sort = 'name' } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  let where = ['c.is_active = 1'];
  let params = [];

  if (category && category !== 'all') {
    where.push('cat.slug = ?');
    params.push(category);
  }
  if (featured === '1') {
    where.push('c.is_featured = 1');
  }
  if (quality) {
    where.push('c.quality = ?');
    params.push(quality);
  }
  if (search) {
    where.push('(c.name LIKE ? OR c.group_title LIKE ?)');
    params.push(`%${search}%`, `%${search}%`);
  }

  const whereStr = where.length ? 'WHERE ' + where.join(' AND ') : '';
  const orderMap = {
    name: 'c.name ASC',
    views: 'c.views DESC',
    newest: 'c.added_at DESC',
  };
  const orderBy = orderMap[sort] || 'c.name ASC';

  const channels = db.prepare(`
    SELECT c.id, c.name, c.logo, c.stream_url, c.quality, c.country, c.language,
           c.is_featured, c.views, c.group_title,
           cat.name as category_name, cat.slug as category_slug, cat.icon as category_icon, cat.color as category_color
    FROM channels c
    LEFT JOIN categories cat ON c.category_id = cat.id
    ${whereStr}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), offset);

  const total = db.prepare(`
    SELECT COUNT(*) as count FROM channels c
    LEFT JOIN categories cat ON c.category_id = cat.id
    ${whereStr}
  `).get(...params);

  // Add user favorite flag
  if (req.user) {
    const favs = db.prepare('SELECT channel_id FROM favorites WHERE user_id = ?').all(req.user.id);
    const favSet = new Set(favs.map(f => f.channel_id));
    channels.forEach(ch => ch.is_favorite = favSet.has(ch.id));
  }

  res.json({
    channels,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: total.count,
      pages: Math.ceil(total.count / parseInt(limit))
    }
  });
});

// GET /api/channels/categories
router.get('/categories', (req, res) => {
  const db = getDb();
  const categories = db.prepare(`
    SELECT cat.*, COUNT(c.id) as channel_count
    FROM categories cat
    LEFT JOIN channels c ON c.category_id = cat.id AND c.is_active = 1
    GROUP BY cat.id
    ORDER BY cat.position ASC
  `).all();
  res.json(categories);
});

// GET /api/channels/favorites
router.get('/favorites', verifyToken, (req, res) => {
  const db = getDb();
  const channels = db.prepare(`
    SELECT c.id, c.name, c.logo, c.stream_url, c.quality, c.country,
           cat.name as category_name, cat.slug as category_slug, cat.icon as category_icon,
           f.added_at as favorited_at, 1 as is_favorite
    FROM favorites f
    JOIN channels c ON f.channel_id = c.id
    LEFT JOIN categories cat ON c.category_id = cat.id
    WHERE f.user_id = ? AND c.is_active = 1
    ORDER BY f.added_at DESC
  `).all(req.user.id);
  res.json(channels);
});

// GET /api/channels/history
router.get('/history', verifyToken, (req, res) => {
  const db = getDb();
  const history = db.prepare(`
    SELECT DISTINCT c.id, c.name, c.logo, c.stream_url, c.quality, c.country,
           cat.name as category_name, cat.icon as category_icon,
           MAX(vh.watched_at) as last_watched, SUM(vh.duration) as total_duration
    FROM view_history vh
    JOIN channels c ON vh.channel_id = c.id
    LEFT JOIN categories cat ON c.category_id = cat.id
    WHERE vh.user_id = ? AND c.is_active = 1
    GROUP BY c.id
    ORDER BY last_watched DESC
    LIMIT 20
  `).all(req.user.id);
  res.json(history);
});

// GET /api/channels/:id
router.get('/:id', optionalToken, (req, res) => {
  const db = getDb();
  const channel = db.prepare(`
    SELECT c.*, cat.name as category_name, cat.slug as category_slug,
           cat.icon as category_icon, cat.color as category_color
    FROM channels c
    LEFT JOIN categories cat ON c.category_id = cat.id
    WHERE c.id = ? AND c.is_active = 1
  `).get(req.params.id);

  if (!channel) return res.status(404).json({ error: 'Chaîne introuvable' });

  if (req.user) {
    const fav = db.prepare('SELECT id FROM favorites WHERE user_id = ? AND channel_id = ?').get(req.user.id, channel.id);
    channel.is_favorite = !!fav;
  }

  // Increment view count
  db.prepare('UPDATE channels SET views = views + 1 WHERE id = ?').run(channel.id);

  res.json(channel);
});

// GET /api/channels/:id/epg
router.get('/:id/epg', (req, res) => {
  const db = getDb();
  const { date } = req.query;
  const targetDate = date || new Date().toISOString().split('T')[0];

  const programs = db.prepare(`
    SELECT * FROM epg_programs
    WHERE channel_id = ?
    AND date(start_time) = date(?)
    ORDER BY start_time ASC
  `).all(req.params.id, targetDate);

  // Find current program
  const now = new Date().toISOString();
  const current = programs.find(p => p.start_time <= now && p.end_time > now);

  res.json({ programs, current: current || null });
});

// POST /api/channels/:id/favorite
router.post('/:id/favorite', verifyToken, (req, res) => {
  const db = getDb();
  const channel = db.prepare('SELECT id FROM channels WHERE id = ? AND is_active = 1').get(req.params.id);
  if (!channel) return res.status(404).json({ error: 'Chaîne introuvable' });

  try {
    db.prepare('INSERT OR IGNORE INTO favorites (user_id, channel_id) VALUES (?, ?)').run(req.user.id, channel.id);
    res.json({ favorited: true });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// DELETE /api/channels/:id/favorite
router.delete('/:id/favorite', verifyToken, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM favorites WHERE user_id = ? AND channel_id = ?').run(req.user.id, req.params.id);
  res.json({ favorited: false });
});

// POST /api/channels/:id/watch
router.post('/:id/watch', verifyToken, (req, res) => {
  const { duration = 0 } = req.body;
  const db = getDb();
  db.prepare('INSERT INTO view_history (user_id, channel_id, duration) VALUES (?, ?, ?)').run(req.user.id, req.params.id, duration);
  res.json({ ok: true });
});

module.exports = router;
