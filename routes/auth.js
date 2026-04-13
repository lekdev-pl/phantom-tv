const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../database');
const { verifyToken, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/register
router.post('/register', (req, res) => {
  const { username, email, password } = req.body;

  if (!username || !email || !password) {
    return res.status(400).json({ error: 'Tous les champs sont requis' });
  }
  if (username.length < 3 || username.length > 30) {
    return res.status(400).json({ error: 'Le nom doit faire entre 3 et 30 caractères' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Mot de passe trop court (min 6 caractères)' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Email invalide' });
  }

  const db = getDb();
  try {
    const existing = db.prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
    if (existing) {
      return res.status(409).json({ error: 'Nom d\'utilisateur ou email déjà utilisé' });
    }

    const hash = bcrypt.hashSync(password, 12);
    const result = db.prepare(`
      INSERT INTO users (username, email, password_hash, role, subscription_plan)
      VALUES (?, ?, ?, 'user', 'free')
    `).run(username, email.toLowerCase(), hash);

    const user = db.prepare('SELECT id, username, email, role, subscription_plan, created_at FROM users WHERE id = ?').get(result.lastInsertRowid);

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Identifiants requis' });
  }

  const db = getDb();
  try {
    const user = db.prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(username, username);
    if (!user) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }
    if (!user.is_active) {
      return res.status(403).json({ error: 'Compte suspendu' });
    }

    const valid = bcrypt.compareSync(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Identifiants incorrects' });
    }

    db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const { password_hash, ...safeUser } = user;
    res.json({ token, user: safeUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/auth/logout
router.post('/logout', verifyToken, (req, res) => {
  const token = req.headers['authorization']?.split(' ')[1];
  const db = getDb();
  db.prepare('INSERT INTO tokens_blacklist (token) VALUES (?)').run(token);
  res.json({ message: 'Déconnecté avec succès' });
});

// GET /api/auth/me
router.get('/me', verifyToken, (req, res) => {
  const db = getDb();
  const user = db.prepare(`
    SELECT id, username, email, role, avatar, subscription_plan, subscription_end,
           max_streams, created_at, last_login, is_active
    FROM users WHERE id = ?
  `).get(req.user.id);

  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });
  res.json(user);
});

// PUT /api/auth/profile
router.put('/profile', verifyToken, (req, res) => {
  const { email, currentPassword, newPassword, avatar } = req.body;
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);

  if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

  let updates = {};
  if (email && email !== user.email) {
    const exists = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, user.id);
    if (exists) return res.status(409).json({ error: 'Email déjà utilisé' });
    updates.email = email.toLowerCase();
  }

  if (avatar) updates.avatar = avatar;

  if (newPassword) {
    if (!currentPassword) return res.status(400).json({ error: 'Mot de passe actuel requis' });
    if (!bcrypt.compareSync(currentPassword, user.password_hash)) {
      return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
    }
    if (newPassword.length < 6) return res.status(400).json({ error: 'Nouveau mot de passe trop court' });
    updates.password_hash = bcrypt.hashSync(newPassword, 12);
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'Aucune modification' });
  }

  const sets = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  db.prepare(`UPDATE users SET ${sets} WHERE id = ?`).run(...Object.values(updates), user.id);

  const updated = db.prepare('SELECT id, username, email, role, avatar, subscription_plan, created_at FROM users WHERE id = ?').get(user.id);
  res.json(updated);
});

module.exports = router;
