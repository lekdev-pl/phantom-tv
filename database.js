const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'phantom.db');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function initDatabase() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      avatar TEXT DEFAULT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      subscription_plan TEXT DEFAULT 'free',
      subscription_end TEXT DEFAULT NULL,
      max_streams INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_login TEXT DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      icon TEXT DEFAULT '📺',
      color TEXT DEFAULT '#6c63ff',
      position INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS channels (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      logo TEXT DEFAULT NULL,
      stream_url TEXT NOT NULL,
      category_id INTEGER DEFAULT NULL,
      group_title TEXT DEFAULT NULL,
      epg_id TEXT DEFAULT NULL,
      country TEXT DEFAULT NULL,
      language TEXT DEFAULT NULL,
      quality TEXT DEFAULT 'HD',
      is_active INTEGER NOT NULL DEFAULT 1,
      is_featured INTEGER DEFAULT 0,
      views INTEGER DEFAULT 0,
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS epg_programs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT DEFAULT NULL,
      thumbnail TEXT DEFAULT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      category TEXT DEFAULT NULL,
      rating TEXT DEFAULT NULL,
      FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      channel_id INTEGER NOT NULL,
      added_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, channel_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT NULL,
      is_public INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS playlist_channels (
      playlist_id INTEGER NOT NULL,
      channel_id INTEGER NOT NULL,
      position INTEGER DEFAULT 0,
      PRIMARY KEY (playlist_id, channel_id),
      FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
      FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS view_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      channel_id INTEGER NOT NULL,
      watched_at TEXT NOT NULL DEFAULT (datetime('now')),
      duration INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tokens_blacklist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // ── Seed categories ──────────────────────────────────────────
  const catCount = db.prepare('SELECT COUNT(*) as c FROM categories').get();
  if (catCount.c === 0) {
    const cats = [
      { name: 'Tous',           slug: 'all',           icon: '🌐', color: '#6c63ff', position: 0 },
      { name: 'Actualités',     slug: 'news',          icon: '📰', color: '#ff6b6b', position: 1 },
      { name: 'Sports',         slug: 'sports',        icon: '⚽', color: '#ffa502', position: 2 },
      { name: 'Films',          slug: 'movies',        icon: '🎬', color: '#2ed573', position: 3 },
      { name: 'Séries',         slug: 'series',        icon: '📺', color: '#1e90ff', position: 4 },
      { name: 'Documentaires',  slug: 'docs',          icon: '🎥', color: '#a29bfe', position: 5 },
      { name: 'Musique',        slug: 'music',         icon: '🎵', color: '#fd79a8', position: 6 },
      { name: 'Enfants',        slug: 'kids',          icon: '🧸', color: '#fdcb6e', position: 7 },
      { name: 'International',  slug: 'international', icon: '🌍', color: '#00cec9', position: 8 },
      { name: 'Adultes',        slug: 'adults',        icon: '🔞', color: '#e17055', position: 9 },
    ];
    const insertCat = db.prepare('INSERT OR IGNORE INTO categories (name, slug, icon, color, position) VALUES (?, ?, ?, ?, ?)');
    for (const c of cats) insertCat.run(c.name, c.slug, c.icon, c.color, c.position);
    console.log('[DB] Catégories créées');
  }

  // ── Seed admin user ──────────────────────────────────────────
  const adminExists = db.prepare("SELECT id FROM users WHERE role = 'admin'").get();
  if (!adminExists) {
    const hash = bcrypt.hashSync('admin123', 10);
    db.prepare(`
      INSERT INTO users (username, email, password_hash, role, subscription_plan, is_active)
      VALUES ('admin', 'admin@phantom.tv', ?, 'admin', 'premium', 1)
    `).run(hash);
    console.log('[DB] Admin créé: admin / admin123');
  }

  // ── Seed channels (488 chaînes) ──────────────────────────────
  const chanCount = db.prepare('SELECT COUNT(*) as c FROM channels').get();
  if (chanCount.c === 0) {
    seedChannels(db);
  }

  console.log(`[DB] Initialisé — ${db.prepare('SELECT COUNT(*) as c FROM channels').get().c} chaînes`);
  return db;
}

// ── Seed channels from catalog ───────────────────────────────────
function seedChannels(db) {
  const channelCatalog = require('./seeds/channels');

  // Build category slug → id map
  const catRows = db.prepare('SELECT id, slug FROM categories').all();
  const catMap = {};
  for (const row of catRows) catMap[row.slug] = row.id;

  const insert = db.prepare(`
    INSERT OR IGNORE INTO channels
      (name, logo, stream_url, category_id, group_title, country, quality, is_featured, is_active, views)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `);

  const insertMany = db.transaction((channels) => {
    let count = 0;
    for (const ch of channels) {
      const catId = catMap[ch.cat] || null;
      // Give popular news channels some base views for realism
      const baseViews = ch.featured ? Math.floor(Math.random() * 50000 + 10000) : Math.floor(Math.random() * 5000);
      insert.run(
        ch.name,
        ch.logo || null,
        ch.url,
        catId,
        ch.group || null,
        ch.country || null,
        ch.quality || 'HD',
        ch.featured ? 1 : 0,
        baseViews
      );
      count++;
    }
    return count;
  });

  const inserted = insertMany(channelCatalog);
  console.log(`[DB] ${inserted} chaînes insérées depuis le catalogue`);

  // ── Seed EPG for major news channels ────────────────────────
  seedEpg(db);
}

function seedEpg(db) {
  const newsChannels = db.prepare(`
    SELECT c.id, c.name FROM channels c
    JOIN categories cat ON c.category_id = cat.id
    WHERE cat.slug = 'news'
    ORDER BY c.is_featured DESC, c.views DESC
    LIMIT 10
  `).all();

  if (!newsChannels.length) return;

  const epgTemplates = {
    default: [
      { title: 'Journal du matin',          desc: 'Le tour de l\'actualité mondiale',            dur: 60 },
      { title: 'Flash info',                 desc: 'Les titres en bref',                          dur: 15 },
      { title: 'Grand reportage',            desc: 'Un reportage exclusif au cœur de l\'info',    dur: 45 },
      { title: 'Débat du jour',              desc: 'Analyse et débat avec nos experts',            dur: 60 },
      { title: 'Sport & Monde',              desc: 'L\'actualité sportive internationale',         dur: 30 },
      { title: 'Économie & Marchés',         desc: 'Bourse, finances et économie mondiale',        dur: 30 },
      { title: 'Journal de 13h',             desc: 'Le journal de la mi-journée',                 dur: 30 },
      { title: 'Enquête exclusive',          desc: 'Nos journalistes sur le terrain',              dur: 60 },
      { title: 'Culture & Société',          desc: 'Arts, culture et tendances du moment',         dur: 30 },
      { title: 'Météo mondiale',             desc: 'Prévisions météo sur les 5 continents',        dur: 15 },
      { title: 'Tech & Innovation',          desc: 'Les dernières avancées technologiques',         dur: 30 },
      { title: 'Journal du soir',            desc: 'Le grand journal de 20 heures',               dur: 60 },
      { title: 'Le fil de la nuit',          desc: 'L\'actualité en continu jusqu\'à l\'aube',     dur: 60 },
      { title: 'Revue de presse',            desc: 'Tour des grands titres de la presse mondiale', dur: 30 },
      { title: 'Géopolitique',               desc: 'Analyse des grands enjeux géopolitiques',      dur: 45 },
      { title: 'Interview exclusive',        desc: 'Notre invité répond à vos questions',          dur: 30 },
      { title: 'Dossier du jour',            desc: 'Décryptage d\'un sujet chaud de l\'actualité', dur: 45 },
      { title: 'Sport Flash',                desc: 'Résultats et highlights sportifs',              dur: 15 },
      { title: 'Environnement & Climat',     desc: 'Actualité climatique et environnementale',     dur: 30 },
      { title: 'Edition spéciale',           desc: 'Couverture en direct d\'un événement majeur',  dur: 60 },
      { title: 'Business Today',             desc: 'L\'économie mondiale en temps réel',           dur: 30 },
      { title: 'Santé & Sciences',           desc: 'Découvertes médicales et scientifiques',        dur: 30 },
      { title: 'Nuit blanche',               desc: 'Le monde ne dort jamais — en direct',          dur: 60 },
    ],
  };

  const insertEpg = db.prepare(`
    INSERT OR IGNORE INTO epg_programs (channel_id, title, description, start_time, end_time)
    VALUES (?, ?, ?, ?, ?)
  `);

  const seedEpgTx = db.transaction((channels) => {
    const now = new Date();
    // Start EPG from beginning of current day minus 6 hours
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    dayStart.setTime(dayStart.getTime() - 6 * 3600000);

    for (const ch of channels) {
      let cursor = new Date(dayStart);
      const templates = epgTemplates.default;
      let tIdx = 0;

      // Fill 48 hours of EPG
      while (cursor.getTime() < dayStart.getTime() + 48 * 3600000) {
        const prog = templates[tIdx % templates.length];
        const start = new Date(cursor);
        const end   = new Date(cursor.getTime() + prog.dur * 60000);

        insertEpg.run(ch.id, prog.title, prog.desc, start.toISOString(), end.toISOString());

        cursor = end;
        tIdx++;
      }
    }
  });

  seedEpgTx(newsChannels);
  console.log(`[DB] EPG généré pour ${newsChannels.length} chaînes info`);
}

module.exports = { getDb, initDatabase };
