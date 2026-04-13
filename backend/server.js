const express = require('express');
const path = require('path');
const cors = require('cors');
const Database = require('better-sqlite3');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const session = require('express-session');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;

const DB_PATH        = process.env.DB_PATH        || '/data/recept.db';
const UPLOADS_PATH   = process.env.UPLOADS_PATH   || '/uploads';
const SESSION_SECRET = process.env.SESSION_SECRET  || 'changeme-very-secret-key';
const APP_USERNAME   = process.env.APP_USERNAME    || 'admin';
const APP_PASSWORD_HASH = process.env.APP_PASSWORD_HASH || null;
const APP_PASSWORD   = process.env.APP_PASSWORD    || 'recept123';

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS recipes (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT,
    category TEXT DEFAULT 'algemeen', tags TEXT DEFAULT '[]',
    ingredients TEXT DEFAULT '[]', instructions TEXT,
    prep_time INTEGER, cook_time INTEGER, servings INTEGER DEFAULT 4,
    image_path TEXT, source_file TEXT, source_type TEXT, rating INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, icon TEXT DEFAULT '🍽️', color TEXT DEFAULT '#f97316'
  );
  INSERT OR IGNORE INTO categories VALUES
    ('ontbijt','Ontbijt','🥐','#f59e0b'),('lunch','Lunch','🥗','#84cc16'),
    ('diner','Diner','🍝','#f97316'),('belgisch','Belgisch','🍺','#b45309'),
    ('vlees','Vlees & Gevogelte','🥩','#dc2626'),('vis','Vis & Zeevruchten','🐟','#0ea5e9'),
    ('soep','Soep','🍲','#06b6d4'),('pasta','Pasta & Rijst','🍝','#f97316'),
    ('groenten','Groenten','🥦','#22c55e'),('snack','Snack & Hapje','🧇','#ec4899'),
    ('dessert','Dessert & Gebak','🍰','#a855f7'),('internationaal','Internationaal','🌍','#6366f1'),
    ('algemeen','Algemeen','🍽️','#94a3b8');
`);

app.set('trust proxy', 1); // Vertrouw reverse proxy (Nginx / Traefik) voor HTTPS
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,      // Alleen via HTTPS versturen
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000  // 7 dagen
  }
}));

function checkPassword(plain) {
  return APP_PASSWORD_HASH ? bcrypt.compareSync(plain, APP_PASSWORD_HASH) : plain === APP_PASSWORD;
}
function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  res.status(401).json({ error: 'Niet ingelogd', redirect: '/login' });
}

// Public static (icons, manifest, sw, css, login page)
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, '../frontend/public/login.html')));
app.use('/icons',        express.static(path.join(__dirname, '../frontend/public/icons')));
app.use('/manifest.json',express.static(path.join(__dirname, '../frontend/public/manifest.json')));
app.use('/sw.js',        express.static(path.join(__dirname, '../frontend/public/sw.js')));
app.use('/css',          express.static(path.join(__dirname, '../frontend/public/css')));

// Auth routes
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Vul alle velden in' });
  if (username === APP_USERNAME && checkPassword(password)) {
    req.session.authenticated = true;
    req.session.username = username;
    return res.json({ success: true });
  }
  setTimeout(() => res.status(401).json({ error: 'Ongeldige inloggegevens' }), 600);
});
app.post('/api/auth/logout', (req, res) => { req.session.destroy(() => res.json({ success: true })); });
app.get('/api/auth/me', (req, res) => {
  if (req.session?.authenticated) return res.json({ authenticated: true, username: req.session.username });
  res.json({ authenticated: false });
});

// Protected static
app.use('/uploads', requireAuth, express.static(UPLOADS_PATH));
app.use('/js',      requireAuth, express.static(path.join(__dirname, '../frontend/public/js')));

// Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_PATH),
  filename: (req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// API routes
app.get('/api/recipes', requireAuth, (req, res) => {
  const { q, category, random } = req.query;
  let sql = 'SELECT * FROM recipes WHERE 1=1'; const params = [];
  if (q) { sql += ` AND (title LIKE ? OR description LIKE ? OR tags LIKE ? OR ingredients LIKE ?)`; const like=`%${q}%`; params.push(like,like,like,like); }
  if (category && category !== 'alle') { sql += ` AND category = ?`; params.push(category); }
  sql += random === '1' ? ` ORDER BY RANDOM() LIMIT 1` : ` ORDER BY created_at DESC`;
  res.json(db.prepare(sql).all(...params).map(parseRecipe));
});
app.get('/api/recipes/:id', requireAuth, (req, res) => {
  const row = db.prepare('SELECT * FROM recipes WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Niet gevonden' });
  res.json(parseRecipe(row));
});
app.post('/api/recipes', requireAuth, (req, res) => {
  const id = uuidv4();
  const { title, description='', category='algemeen', tags=[], ingredients=[], instructions='', prep_time=0, cook_time=0, servings=4, image_path=null } = req.body;
  db.prepare(`INSERT INTO recipes (id,title,description,category,tags,ingredients,instructions,prep_time,cook_time,servings,image_path) VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
    .run(id,title,description,category,JSON.stringify(tags),JSON.stringify(ingredients),instructions,prep_time,cook_time,servings,image_path);
  res.json({ id, success: true });
});
app.put('/api/recipes/:id', requireAuth, (req, res) => {
  const { title,description,category,tags,ingredients,instructions,prep_time,cook_time,servings,rating } = req.body;
  db.prepare(`UPDATE recipes SET title=?,description=?,category=?,tags=?,ingredients=?,instructions=?,prep_time=?,cook_time=?,servings=?,rating=?,updated_at=datetime('now') WHERE id=?`)
    .run(title,description,category,JSON.stringify(tags),JSON.stringify(ingredients),instructions,prep_time,cook_time,servings,rating,req.params.id);
  res.json({ success: true });
});
app.delete('/api/recipes/:id', requireAuth, (req, res) => {
  db.prepare('DELETE FROM recipes WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});
app.get('/api/categories', requireAuth, (req, res) => res.json(db.prepare('SELECT * FROM categories').all()));
app.post('/api/upload', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Geen bestand' });
  const filePath = path.join(UPLOADS_PATH, req.file.filename);
  const ext = path.extname(req.file.originalname).toLowerCase();
  let extractedText = '', imagePath = null;
  try {
    if (['.jpg','.jpeg','.png','.webp','.gif'].includes(ext)) { imagePath = `/uploads/${req.file.filename}`; }
    else if (ext === '.pdf') { try { const d=await require('pdf-parse')(fs.readFileSync(filePath)); extractedText=d.text.slice(0,2000); } catch(e){} }
    else if (ext === '.docx') { const r=await require('mammoth').extractRawText({path:filePath}); extractedText=r.value.slice(0,2000); }
    res.json({ success:true, filename:req.file.filename, originalName:req.file.originalname, extractedText, imagePath, sourceType:ext.replace('.','') });
  } catch(err) {
    res.json({ success:true, filename:req.file.filename, originalName:req.file.originalname, extractedText:'', imagePath:['.jpg','.jpeg','.png','.webp'].includes(ext)?`/uploads/${req.file.filename}`:null, sourceType:ext.replace('.','') });
  }
});
app.get('/api/roulette', requireAuth, (req, res) => {
  const { category } = req.query; let sql='SELECT * FROM recipes'; const params=[];
  if (category && category !== 'alle') { sql+=' WHERE category = ?'; params.push(category); }
  sql+=' ORDER BY RANDOM() LIMIT 6';
  res.json(db.prepare(sql).all(...params).map(parseRecipe));
});
app.get('/api/stats', requireAuth, (req, res) => {
  res.json({ total: db.prepare('SELECT COUNT(*) as c FROM recipes').get().c, byCategory: db.prepare('SELECT category,COUNT(*) as c FROM recipes GROUP BY category').all() });
});
app.get('/health', (req, res) => res.json({ ok: true }));

app.get('*', (req, res) => {
  if (req.session?.authenticated) return res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
  res.redirect('/login');
});

function parseRecipe(row) { return { ...row, tags: safeJson(row.tags,[]), ingredients: safeJson(row.ingredients,[]) }; }
function safeJson(str, fb) { try { return JSON.parse(str); } catch { return fb; } }

app.listen(PORT, () => {
  console.log(`✅ ReceptBox draait op poort ${PORT}  |  Gebruiker: ${APP_USERNAME}`);
  const count = db.prepare('SELECT COUNT(*) as c FROM recipes').get().c;
  if (count === 0) { try { require('./seed'); console.log('🌱 Seed geladen'); } catch(e) { console.log('Seed skip:', e.message); } }
});
