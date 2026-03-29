const express = require('express');
const path = require('path');
const cors = require('cors');
const Database = require('better-sqlite3');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// DB setup
const DB_PATH = process.env.DB_PATH || '/data/recept.db';
const UPLOADS_PATH = process.env.UPLOADS_PATH || '/uploads';

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS recipes (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT DEFAULT 'algemeen',
    tags TEXT DEFAULT '[]',
    ingredients TEXT DEFAULT '[]',
    instructions TEXT,
    prep_time INTEGER,
    cook_time INTEGER,
    servings INTEGER DEFAULT 4,
    image_path TEXT,
    source_file TEXT,
    source_type TEXT,
    rating INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT DEFAULT '🍽️',
    color TEXT DEFAULT '#f97316'
  );

  INSERT OR IGNORE INTO categories VALUES
    ('ontbijt',   'Ontbijt',        '🥐', '#f59e0b'),
    ('lunch',     'Lunch',          '🥗', '#84cc16'),
    ('diner',     'Diner',          '🍝', '#f97316'),
    ('belgisch',  'Belgisch',       '🍺', '#b45309'),
    ('vlees',     'Vlees & Gevogelte','🥩','#dc2626'),
    ('vis',       'Vis & Zeevruchten','🐟','#0ea5e9'),
    ('soep',      'Soep',           '🍲', '#06b6d4'),
    ('pasta',     'Pasta & Rijst',  '🍝', '#f97316'),
    ('groenten',  'Groenten',       '🥦', '#22c55e'),
    ('snack',     'Snack & Hapje',  '🧇', '#ec4899'),
    ('dessert',   'Dessert & Gebak','🍰', '#a855f7'),
    ('internationaal','Internationaal','🌍','#6366f1'),
    ('algemeen',  'Algemeen',       '🍽️', '#94a3b8');
`);

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOADS_PATH));
app.use(express.static(path.join(__dirname, '../frontend/public')));

// Multer config
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_PATH),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

// ── ROUTES ──────────────────────────────────────────────

// GET all recipes
app.get('/api/recipes', (req, res) => {
  const { q, category, random } = req.query;
  let sql = 'SELECT * FROM recipes WHERE 1=1';
  const params = [];

  if (q) {
    sql += ` AND (title LIKE ? OR description LIKE ? OR tags LIKE ? OR ingredients LIKE ?)`;
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  if (category && category !== 'alle') {
    sql += ` AND category = ?`;
    params.push(category);
  }
  if (random === '1') {
    sql += ` ORDER BY RANDOM() LIMIT 1`;
  } else {
    sql += ` ORDER BY created_at DESC`;
  }

  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(parseRecipe));
});

// GET single recipe
app.get('/api/recipes/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM recipes WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Niet gevonden' });
  res.json(parseRecipe(row));
});

// POST new recipe (manual)
app.post('/api/recipes', (req, res) => {
  const id = uuidv4();
  const {
    title, description = '', category = 'algemeen',
    tags = [], ingredients = [], instructions = '',
    prep_time = 0, cook_time = 0, servings = 4
  } = req.body;

  db.prepare(`
    INSERT INTO recipes (id, title, description, category, tags, ingredients, instructions, prep_time, cook_time, servings)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, title, description, category,
    JSON.stringify(tags), JSON.stringify(ingredients),
    instructions, prep_time, cook_time, servings);

  res.json({ id, success: true });
});

// PUT update recipe
app.put('/api/recipes/:id', (req, res) => {
  const {
    title, description, category, tags, ingredients,
    instructions, prep_time, cook_time, servings, rating
  } = req.body;

  db.prepare(`
    UPDATE recipes SET
      title=?, description=?, category=?, tags=?, ingredients=?,
      instructions=?, prep_time=?, cook_time=?, servings=?, rating=?,
      updated_at=datetime('now')
    WHERE id=?
  `).run(title, description, category,
    JSON.stringify(tags), JSON.stringify(ingredients),
    instructions, prep_time, cook_time, servings, rating,
    req.params.id);

  res.json({ success: true });
});

// DELETE recipe
app.delete('/api/recipes/:id', (req, res) => {
  db.prepare('DELETE FROM recipes WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// GET categories
app.get('/api/categories', (req, res) => {
  res.json(db.prepare('SELECT * FROM categories').all());
});

// POST upload file (pdf / docx / image)
app.post('/api/upload', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Geen bestand' });

  const filePath = path.join(UPLOADS_PATH, req.file.filename);
  const ext = path.extname(req.file.originalname).toLowerCase();
  let extractedText = '';
  let imagePath = null;

  try {
    if (ext === '.pdf') {
      const pdfParse = require('pdf-parse');
      const buffer = fs.readFileSync(filePath);
      const data = await pdfParse(buffer);
      extractedText = data.text;
    } else if (ext === '.docx') {
      const mammoth = require('mammoth');
      const result = await mammoth.extractRawText({ path: filePath });
      extractedText = result.value;
    } else if (['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(ext)) {
      imagePath = `/uploads/${req.file.filename}`;
      extractedText = '(afbeelding geüpload — voeg details handmatig toe)';
    }

    res.json({
      success: true,
      filename: req.file.filename,
      originalName: req.file.originalname,
      extractedText,
      imagePath,
      sourceType: ext.replace('.', '')
    });
  } catch (err) {
    console.error('Upload parse error:', err);
    res.json({
      success: true,
      filename: req.file.filename,
      originalName: req.file.originalname,
      extractedText: '',
      imagePath: ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) ? `/uploads/${req.file.filename}` : null,
      sourceType: ext.replace('.', '')
    });
  }
});

// GET roulette — random recipe per category or global
app.get('/api/roulette', (req, res) => {
  const { category } = req.query;
  let sql = 'SELECT * FROM recipes';
  const params = [];
  if (category && category !== 'alle') {
    sql += ' WHERE category = ?';
    params.push(category);
  }
  sql += ' ORDER BY RANDOM() LIMIT 6';
  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(parseRecipe));
});

// GET stats
app.get('/api/stats', (req, res) => {
  const total = db.prepare('SELECT COUNT(*) as c FROM recipes').get().c;
  const byCat = db.prepare('SELECT category, COUNT(*) as c FROM recipes GROUP BY category').all();
  res.json({ total, byCategory: byCat });
});

// Serve PWA for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../frontend/public/index.html'));
});

function parseRecipe(row) {
  return {
    ...row,
    tags: safeJson(row.tags, []),
    ingredients: safeJson(row.ingredients, [])
  };
}

function safeJson(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

app.listen(PORT, () => {
  console.log(`✅ Recept server draait op poort ${PORT}`);
  const count = db.prepare('SELECT COUNT(*) as c FROM recipes').get().c;
  if (count === 0) {
    try { require('./seed'); console.log('🌱 Voorbeeldrecepten geladen'); }
    catch (e) { console.log('Seed overgeslagen:', e.message); }
  }
});
