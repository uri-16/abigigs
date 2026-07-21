// Utilise le module SQLite intégré à Node.js (node:sqlite) — aucune compilation
// native requise, contrairement à better-sqlite3 qui exige Visual Studio sur Windows.
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'abigigs.db'));
db.exec('PRAGMA journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  cat TEXT NOT NULL,
  commune TEXT NOT NULL,
  desc_text TEXT NOT NULL,
  price TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  featured INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending_payment', -- pending_payment | published | rejected
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Demandes de paiement du PRESTATAIRE pour faire publier son annonce
CREATE TABLE IF NOT EXISTS job_payment_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL,
  momo_reference TEXT,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- pending | confirmed | rejected
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(job_id) REFERENCES jobs(id)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

// Réglages par défaut
const defaults = {
  publish_price: '500',
  momo_number: '07 00 00 00 00',
  momo_operator: 'Orange Money',
};
for (const [key, value] of Object.entries(defaults)) {
  const exists = db.prepare('SELECT 1 FROM settings WHERE key = ?').get(key);
  if (!exists) db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(key, value);
}

// Données de démonstration (seulement si la base est vide)
const jobCount = db.prepare('SELECT COUNT(*) as n FROM jobs').get().n;
if (jobCount === 0) {
  const insert = db.prepare(`
    INSERT INTO jobs (title, cat, commune, desc_text, price, whatsapp, featured, status)
    VALUES (@title, @cat, @commune, @desc_text, @price, @whatsapp, @featured, @status)
  `);
  const seed = [
    { title: "Cours de maths & physique", cat: "Cours particuliers", commune: "Cocody", desc_text: "Étudiant Master 1 donne cours niveau lycée/collège.", price: "3000/h", whatsapp: "2250700000001", featured: 1, status: 'published' },
    { title: "Ménage complet appartement", cat: "Ménage", commune: "Marcory", desc_text: "Service de ménage sérieux et rapide.", price: "5000", whatsapp: "2250700000002", featured: 0, status: 'published' },
    { title: "Livraison de colis express", cat: "Livraison", commune: "Yopougon", desc_text: "Livraison à moto, rapide et fiable.", price: "1500", whatsapp: "2250700000003", featured: 1, status: 'published' },
  ];
  seed.forEach(r => insert.run(r));
}

module.exports = db;
