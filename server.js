const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const db = require('./db');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret_in_prod';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@abigigs.ci';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'changeme';

function getSetting(key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}
function setSetting(key, value) {
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, String(value));
}

// Une annonce publiée est visible avec son contact — c'est gratuit et public pour les clients.
function toPublicJob(j) {
  return { id: j.id, title: j.title, cat: j.cat, commune: j.commune, desc: j.desc_text, price: j.price, whatsapp: j.whatsapp, featured: !!j.featured, status: j.status, created_at: j.created_at };
}

function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Non autorisé' });
  try {
    req.admin = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Session invalide ou expirée' });
  }
}

// ============ PUBLIC: JOBS ============
// Visible par tout le monde, contact inclus — gratuit pour le client.
app.get('/api/jobs', (req, res) => {
  const rows = db.prepare("SELECT * FROM jobs WHERE status = 'published' ORDER BY featured DESC, created_at DESC").all();
  res.json(rows.map(toPublicJob));
});

// Le prestataire crée son annonce — elle reste invisible tant qu'il n'a pas payé
// ET que le paiement n'a pas été vérifié par l'admin.
app.post('/api/jobs', (req, res) => {
  const { title, cat, commune, desc, price, whatsapp } = req.body;
  if (!title || !desc || !price || !whatsapp || !cat || !commune) {
    return res.status(400).json({ error: 'Champs manquants' });
  }
  const info = db.prepare(`
    INSERT INTO jobs (title, cat, commune, desc_text, price, whatsapp, featured, status)
    VALUES (?, ?, ?, ?, ?, ?, 0, 'pending_payment')
  `).run(title, cat, commune, desc, price, whatsapp);
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(info.lastInsertRowid);
  res.json(toPublicJob(job));
});

// Infos affichées au PRESTATAIRE pour qu'il paie la publication de son annonce
app.get('/api/payment-info', (req, res) => {
  res.json({
    publish_price: parseInt(getSetting('publish_price', '500')),
    momo_number: getSetting('momo_number', ''),
    momo_operator: getSetting('momo_operator', ''),
  });
});

// Le prestataire déclare avoir payé pour publier son annonce
app.post('/api/jobs/:jobId/pay', (req, res) => {
  const jobId = parseInt(req.params.jobId);
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(jobId);
  if (!job) return res.status(404).json({ error: 'Annonce introuvable' });

  const { momo_reference } = req.body;
  if (!momo_reference) {
    return res.status(400).json({ error: 'Merci de renseigner le code de transaction reçu par SMS.' });
  }

  const amount = parseInt(getSetting('publish_price', '500'));
  const info = db.prepare(`
    INSERT INTO job_payment_requests (job_id, momo_reference, amount, status)
    VALUES (?, ?, ?, 'pending')
  `).run(jobId, momo_reference, amount);

  res.json({ request_id: info.lastInsertRowid });
});

// Le prestataire vérifie si sa publication a été confirmée
app.get('/api/job-payment-request/:id/status', (req, res) => {
  const r = db.prepare('SELECT * FROM job_payment_requests WHERE id = ?').get(parseInt(req.params.id));
  if (!r) return res.status(404).json({ status: 'UNKNOWN' });
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(r.job_id);
  res.json({ status: r.status, jobStatus: job ? job.status : null, jobTitle: job ? job.title : null });
});

// ============ ADMIN: AUTH ============
app.post('/api/admin/login', (req, res) => {
  const { email, password } = req.body;
  if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
    const token = jwt.sign({ email }, JWT_SECRET, { expiresIn: '12h' });
    return res.json({ token });
  }
  res.status(401).json({ error: 'Identifiants incorrects' });
});

// ============ ADMIN: STATS ============
app.get('/api/admin/stats', requireAdmin, (req, res) => {
  const totalJobs = db.prepare('SELECT COUNT(*) n FROM jobs').get().n;
  const pendingJobs = db.prepare("SELECT COUNT(*) n FROM jobs WHERE status = 'pending_payment'").get().n;
  const publishedJobs = db.prepare("SELECT COUNT(*) n FROM jobs WHERE status = 'published'").get().n;
  const totalPublications = db.prepare("SELECT COUNT(*) n FROM job_payment_requests WHERE status = 'confirmed'").get().n;
  const revenue = db.prepare("SELECT COALESCE(SUM(amount),0) s FROM job_payment_requests WHERE status = 'confirmed'").get().s;
  const pendingRequests = db.prepare("SELECT COUNT(*) n FROM job_payment_requests WHERE status = 'pending'").get().n;
  res.json({ totalJobs, pendingJobs, publishedJobs, totalPublications, revenue, pendingRequests });
});

// ============ ADMIN: JOBS ============
app.get('/api/admin/jobs', requireAdmin, (req, res) => {
  const rows = db.prepare('SELECT * FROM jobs ORDER BY created_at DESC').all();
  res.json(rows.map(toPublicJob));
});

app.patch('/api/admin/jobs/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id);
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
  if (!job) return res.status(404).json({ error: 'Introuvable' });
  const { status, featured } = req.body;
  const newStatus = status !== undefined ? status : job.status;
  const newFeatured = featured !== undefined ? (featured ? 1 : 0) : job.featured;
  db.prepare('UPDATE jobs SET status = ?, featured = ? WHERE id = ?').run(newStatus, newFeatured, id);
  res.json({ ok: true });
});

app.delete('/api/admin/jobs/:id', requireAdmin, (req, res) => {
  db.prepare('DELETE FROM jobs WHERE id = ?').run(parseInt(req.params.id));
  res.json({ ok: true });
});

// ============ ADMIN: DEMANDES DE PAIEMENT (publication) ============
app.get('/api/admin/job-payment-requests', requireAdmin, (req, res) => {
  const rows = db.prepare(`
    SELECT p.*, j.title as job_title, j.whatsapp as job_whatsapp
    FROM job_payment_requests p LEFT JOIN jobs j ON j.id = p.job_id
    ORDER BY p.created_at DESC
  `).all();
  res.json(rows);
});

// Confirmer = tu as vérifié toi-même (SMS/appli Mobile Money) que l'argent est bien arrivé
// → l'annonce passe automatiquement en "published"
app.patch('/api/admin/job-payment-requests/:id', requireAdmin, (req, res) => {
  const { status } = req.body; // 'confirmed' ou 'rejected'
  if (!['confirmed', 'rejected'].includes(status)) return res.status(400).json({ error: 'Statut invalide' });

  const request = db.prepare('SELECT * FROM job_payment_requests WHERE id = ?').get(parseInt(req.params.id));
  if (!request) return res.status(404).json({ error: 'Introuvable' });

  db.prepare('UPDATE job_payment_requests SET status = ? WHERE id = ?').run(status, request.id);
  if (status === 'confirmed') {
    db.prepare("UPDATE jobs SET status = 'published' WHERE id = ?").run(request.job_id);
  }
  res.json({ ok: true });
});

// ============ ADMIN: PARAMÈTRES ============
app.get('/api/admin/settings', requireAdmin, (req, res) => {
  res.json({
    publish_price: parseInt(getSetting('publish_price', '500')),
    momo_number: getSetting('momo_number', ''),
    momo_operator: getSetting('momo_operator', ''),
  });
});

app.patch('/api/admin/settings', requireAdmin, (req, res) => {
  const { publish_price, momo_number, momo_operator } = req.body;
  if (publish_price !== undefined) setSetting('publish_price', publish_price);
  if (momo_number !== undefined) setSetting('momo_number', momo_number);
  if (momo_operator !== undefined) setSetting('momo_operator', momo_operator);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`AbiGigs backend sur le port ${PORT}`));
