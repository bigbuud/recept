/* ── ReceptBox App ────────────────────────────────── */
'use strict';

const API = '';  // same origin
let currentPage = 'home';
let categories = [];
let allRecipes = [];
let searchTimeout = null;
let activeCategory = 'alle';
let rouletteCategory = 'alle';
let uploadedFile = null;
let currentRecipeId = null;

// ── INIT ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  registerSW();
  updateGreeting();
  await loadCategories();
  await loadHome();
  bindEvents();
});

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
}

function updateGreeting() {
  const h = new Date().getHours();
  const greet = h < 12 ? 'Goedemorgen' : h < 18 ? 'Goedemiddag' : 'Goedenavond';
  const el = document.querySelector('#page-home .page-header h1');
  if (el) el.textContent = `${greet} 👋`;
}

// ── NAVIGATION ────────────────────────────────────────
function navigate(page, data = null) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item, .bnav-btn').forEach(b => b.classList.remove('active'));

  const pageEl = document.getElementById(`page-${page}`);
  if (!pageEl) return;
  pageEl.classList.add('active');

  document.querySelectorAll(`[data-page="${page}"]`).forEach(b => b.classList.add('active'));

  currentPage = page;
  window.scrollTo(0, 0);

  if (page === 'home') loadHome();
  else if (page === 'search') initSearch();
  else if (page === 'roulette') initRoulette();
  else if (page === 'upload') initUpload();
  else if (page === 'add') initAddForm(data);
}

// ── BIND EVENTS ───────────────────────────────────────
function bindEvents() {
  // Sidebar + bottom nav clicks
  document.querySelectorAll('.nav-item, .bnav-btn').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.page));
  });

  // Search input
  const si = document.getElementById('search-input');
  const sc = document.getElementById('search-clear');
  si.addEventListener('input', () => {
    sc.classList.toggle('hidden', !si.value);
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => doSearch(si.value, activeCategory), 280);
  });
  sc.addEventListener('click', () => { si.value = ''; sc.classList.add('hidden'); doSearch('', activeCategory); });

  // Drag & drop upload
  const dz = document.getElementById('drop-zone');
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('drag-over'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag-over'));
  dz.addEventListener('drop', e => {
    e.preventDefault();
    dz.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  });
  document.getElementById('file-input').addEventListener('change', e => {
    if (e.target.files[0]) handleFileUpload(e.target.files[0]);
  });
}

// ── HOME ──────────────────────────────────────────────
async function loadHome() {
  await loadStats();
  renderCategories();
  const recipes = await fetchRecipes({ limit: 8 });
  allRecipes = recipes;
  const grid = document.getElementById('recent-grid');
  const empty = document.getElementById('empty-state');
  grid.innerHTML = '';

  if (recipes.length === 0) {
    empty.classList.remove('hidden');
  } else {
    empty.classList.add('hidden');
    recipes.slice(0, 8).forEach((r, i) => {
      grid.appendChild(createRecipeCard(r, i));
    });
  }
}

async function loadStats() {
  try {
    const s = await apiFetch('/api/stats');
    document.getElementById('recipe-count').textContent = `${s.total} recepten`;
  } catch {}
}

// ── CATEGORIES ───────────────────────────────────────
async function loadCategories() {
  categories = await apiFetch('/api/categories');
  renderCategories();
  populateCategoryFilters();
  populateCategorySelects();
}

function renderCategories() {
  const grid = document.getElementById('categories-grid');
  if (!grid) return;
  grid.innerHTML = '';
  categories.forEach(cat => {
    const div = document.createElement('div');
    div.className = 'cat-card';
    div.innerHTML = `
      <span class="cat-emoji">${cat.icon}</span>
      <div class="cat-name">${cat.name}</div>
    `;
    div.onclick = () => { navigate('search'); filterByCategory(cat.id); };
    grid.appendChild(div);
  });
}

function populateCategoryFilters() {
  ['cat-filter-row', 'roulette-cat-filter'].forEach(id => {
    const row = document.getElementById(id);
    if (!row) return;
    row.innerHTML = '';
    const allPill = document.createElement('button');
    allPill.className = 'cat-pill active';
    allPill.textContent = '🍽️ Alle';
    allPill.onclick = () => id === 'cat-filter-row'
      ? filterByCategory('alle')
      : filterRoulette('alle');
    row.appendChild(allPill);

    categories.forEach(cat => {
      const pill = document.createElement('button');
      pill.className = 'cat-pill';
      pill.textContent = `${cat.icon} ${cat.name}`;
      pill.dataset.catId = cat.id;
      pill.onclick = () => id === 'cat-filter-row'
        ? filterByCategory(cat.id)
        : filterRoulette(cat.id);
      row.appendChild(pill);
    });
  });
}

function populateCategorySelects() {
  ['form-category', 'upload-category'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = '';
    categories.forEach(cat => {
      const opt = document.createElement('option');
      opt.value = cat.id;
      opt.textContent = `${cat.icon} ${cat.name}`;
      sel.appendChild(opt);
    });
    // Default to diner
    const diner = sel.querySelector('[value="diner"]');
    if (diner) diner.selected = true;
  });
}

// ── SEARCH ───────────────────────────────────────────
function initSearch() {
  doSearch('', 'alle');
}

function filterByCategory(catId) {
  activeCategory = catId;
  document.querySelectorAll('#cat-filter-row .cat-pill').forEach(p => {
    p.classList.toggle('active',
      catId === 'alle' ? p.textContent.includes('Alle') : p.dataset.catId === catId
    );
  });
  doSearch(document.getElementById('search-input').value, catId);
}

async function doSearch(q, category) {
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (category && category !== 'alle') params.set('category', category);
  const results = await apiFetch(`/api/recipes?${params}`);
  const grid = document.getElementById('search-results');
  const empty = document.getElementById('search-empty');
  grid.innerHTML = '';

  if (results.length === 0) {
    empty.classList.remove('hidden');
  } else {
    empty.classList.add('hidden');
    results.forEach((r, i) => grid.appendChild(createRecipeCard(r, i)));
  }
}

// ── ROULETTE ─────────────────────────────────────────
function initRoulette() {
  document.getElementById('roulette-results').classList.add('hidden');
  document.getElementById('roulette-empty').classList.add('hidden');
}

function filterRoulette(catId) {
  rouletteCategory = catId;
  document.querySelectorAll('#roulette-cat-filter .cat-pill').forEach(p => {
    p.classList.toggle('active',
      catId === 'alle' ? p.textContent.includes('Alle') : p.dataset.catId === catId
    );
  });
}

async function spinRoulette() {
  const btn = document.getElementById('spin-btn');
  const wheel = document.getElementById('roulette-wheel');
  const display = document.getElementById('wheel-display');
  const resultsEl = document.getElementById('roulette-results');
  const emptyEl = document.getElementById('roulette-empty');

  btn.disabled = true;
  wheel.classList.add('spinning');
  display.innerHTML = `<span class="wheel-emoji">🎲</span><span class="wheel-text">Draaien…</span>`;

  // Fetch results during spin
  const params = new URLSearchParams();
  if (rouletteCategory !== 'alle') params.set('category', rouletteCategory);
  const [results] = await Promise.all([
    apiFetch(`/api/roulette?${params}`),
    new Promise(r => setTimeout(r, 2200))
  ]);

  wheel.classList.remove('spinning');
  btn.disabled = false;

  if (results.length === 0) {
    display.innerHTML = `<span class="wheel-emoji">😅</span><span class="wheel-text">Geen recepten</span>`;
    emptyEl.classList.remove('hidden');
    resultsEl.classList.add('hidden');
    return;
  }

  const pick = results[0];
  const cat = categories.find(c => c.id === pick.category);
  display.innerHTML = `<span class="wheel-emoji">${cat ? cat.icon : '🍽️'}</span><span class="wheel-text">${pick.title.length > 18 ? pick.title.slice(0, 16) + '…' : pick.title}</span>`;

  emptyEl.classList.add('hidden');
  resultsEl.classList.remove('hidden');
  const grid = document.getElementById('roulette-cards');
  grid.innerHTML = '';
  results.forEach((r, i) => grid.appendChild(createRecipeCard(r, i)));
}

// ── UPLOAD ───────────────────────────────────────────
function initUpload() {
  resetUpload();
}

async function handleFileUpload(file) {
  uploadedFile = file;
  const dz = document.getElementById('drop-zone');
  const progressEl = document.getElementById('upload-progress');
  const fill = document.getElementById('progress-fill');
  const txt = document.getElementById('progress-text');

  dz.classList.add('hidden');
  progressEl.classList.remove('hidden');
  fill.style.width = '0%';

  const formData = new FormData();
  formData.append('file', file);

  try {
    // Fake progress animation
    let prog = 0;
    const interval = setInterval(() => {
      prog = Math.min(prog + Math.random() * 20, 85);
      fill.style.width = prog + '%';
      txt.textContent = prog < 40 ? 'Bestand uploaden…' : prog < 70 ? 'Tekst extracten…' : 'Bijna klaar…';
    }, 200);

    const result = await fetch('/api/upload', { method: 'POST', body: formData }).then(r => r.json());

    clearInterval(interval);
    fill.style.width = '100%';
    txt.textContent = '✅ Klaar!';

    setTimeout(() => {
      progressEl.classList.add('hidden');
      showUploadPreview(result, file.name);
    }, 400);
  } catch (err) {
    progressEl.classList.add('hidden');
    dz.classList.remove('hidden');
    showToast('Upload mislukt', 'error');
  }
}

function showUploadPreview(result, filename) {
  const preview = document.getElementById('upload-preview');
  document.getElementById('preview-filename').textContent = filename;

  if (result.imagePath) {
    document.getElementById('preview-image-wrap').classList.remove('hidden');
    document.getElementById('preview-image').src = result.imagePath;
  }

  // Try to auto-extract a title from filename
  const guessTitle = filename.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
  document.getElementById('upload-title').value = guessTitle;
  document.getElementById('upload-text').value = result.extractedText || '';

  preview.classList.remove('hidden');
  preview._uploadResult = result;
}

async function saveUploadedRecipe() {
  const title = document.getElementById('upload-title').value.trim();
  if (!title) { showToast('Voeg een titel toe', 'error'); return; }

  const preview = document.getElementById('upload-preview');
  const result = preview._uploadResult;
  const instrText = document.getElementById('upload-text').value;
  const ingredRaw = document.getElementById('upload-ingredients').value;
  const ingredients = ingredRaw.split('\n').map(s => s.trim()).filter(Boolean);
  const category = document.getElementById('upload-category').value;

  const body = {
    title,
    category,
    instructions: instrText,
    ingredients,
    description: '',
    tags: [],
    source_type: result.sourceType,
    source_file: result.filename
  };

  if (result.imagePath) body.image_path = result.imagePath;

  try {
    const r = await apiFetch('/api/recipes', 'POST', body);
    showToast('Recept opgeslagen! 🎉', 'success');
    resetUpload();
    navigate('home');
  } catch {
    showToast('Opslaan mislukt', 'error');
  }
}

function resetUpload() {
  document.getElementById('drop-zone').classList.remove('hidden');
  document.getElementById('upload-progress').classList.add('hidden');
  document.getElementById('upload-preview').classList.add('hidden');
  document.getElementById('preview-image-wrap').classList.add('hidden');
  document.getElementById('file-input').value = '';
  uploadedFile = null;
}

// ── ADD / EDIT FORM ───────────────────────────────────
function initAddForm(editRecipe = null) {
  const titleEl = document.getElementById('form-title');
  const idEl = document.getElementById('edit-id');
  const form = document.getElementById('recipe-form');

  if (editRecipe) {
    titleEl.textContent = '✏️ Recept bewerken';
    idEl.value = editRecipe.id;
    document.getElementById('form-title-input').value = editRecipe.title || '';
    document.getElementById('form-description').value = editRecipe.description || '';
    document.getElementById('form-instructions').value = editRecipe.instructions || '';
    document.getElementById('form-servings').value = editRecipe.servings || 4;
    document.getElementById('form-prep').value = editRecipe.prep_time || 0;
    document.getElementById('form-cook').value = editRecipe.cook_time || 0;
    document.getElementById('form-tags').value = (editRecipe.tags || []).join(', ');
    document.getElementById('form-ingredients').value = (editRecipe.ingredients || []).join('\n');
    // Set category
    const sel = document.getElementById('form-category');
    if (sel) sel.value = editRecipe.category || 'algemeen';
  } else {
    titleEl.textContent = '✏️ Nieuw recept';
    idEl.value = '';
    form.reset();
    const sel = document.getElementById('form-category');
    if (sel) sel.value = 'diner';
  }
}

async function saveRecipe(e) {
  e.preventDefault();
  const id = document.getElementById('edit-id').value;
  const body = {
    title:        document.getElementById('form-title-input').value.trim(),
    description:  document.getElementById('form-description').value,
    category:     document.getElementById('form-category').value,
    servings:     parseInt(document.getElementById('form-servings').value) || 4,
    prep_time:    parseInt(document.getElementById('form-prep').value) || 0,
    cook_time:    parseInt(document.getElementById('form-cook').value) || 0,
    instructions: document.getElementById('form-instructions').value,
    ingredients:  document.getElementById('form-ingredients').value
                    .split('\n').map(s => s.trim()).filter(Boolean),
    tags:         document.getElementById('form-tags').value
                    .split(',').map(s => s.trim()).filter(Boolean),
    rating: 0
  };

  if (!body.title) { showToast('Vul een titel in', 'error'); return; }

  try {
    if (id) {
      await apiFetch(`/api/recipes/${id}`, 'PUT', body);
      showToast('Recept bijgewerkt ✅', 'success');
      viewRecipe(id);
    } else {
      const r = await apiFetch('/api/recipes', 'POST', body);
      showToast('Recept toegevoegd 🎉', 'success');
      viewRecipe(r.id);
    }
  } catch {
    showToast('Opslaan mislukt', 'error');
  }
}

function cancelEdit() {
  const id = document.getElementById('edit-id').value;
  if (id) viewRecipe(id);
  else navigate('home');
}

// ── DETAIL VIEW ───────────────────────────────────────
async function viewRecipe(id) {
  currentRecipeId = id;
  navigate('detail');
  showSpinner(true);

  try {
    const r = await apiFetch(`/api/recipes/${id}`);
    const cat = categories.find(c => c.id === r.category);
    const totalTime = (r.prep_time || 0) + (r.cook_time || 0);

    const thumbHtml = r.image_path
      ? `<div class="detail-image"><img src="${r.image_path}" alt="${esc(r.title)}"></div>`
      : `<div class="detail-image">${cat ? cat.icon : '🍽️'}</div>`;

    const tagsHtml = (r.tags || []).map(t => `<span class="tag-chip">${esc(t)}</span>`).join('');
    const ingrHtml = (r.ingredients || []).map(i => `<li>${esc(i)}</li>`).join('');

    document.getElementById('detail-content').innerHTML = `
      <div class="detail-view">
        <div class="detail-back" onclick="history.back()">← Terug</div>
        ${thumbHtml}
        <div class="detail-cat">${cat ? `${cat.icon} ${cat.name}` : 'Recept'}</div>
        <h1 class="detail-title">${esc(r.title)}</h1>
        ${r.description ? `<p class="detail-desc">${esc(r.description)}</p>` : ''}
        <div class="detail-meta">
          ${r.prep_time ? `<div class="meta-item"><div class="meta-label">Voorbereid</div><div class="meta-value">⏱ ${r.prep_time}m</div></div>` : ''}
          ${r.cook_time ? `<div class="meta-item"><div class="meta-label">Kooktijd</div><div class="meta-value">🔥 ${r.cook_time}m</div></div>` : ''}
          ${totalTime ? `<div class="meta-item"><div class="meta-label">Totaal</div><div class="meta-value">⏰ ${totalTime}m</div></div>` : ''}
          <div class="meta-item"><div class="meta-label">Porties</div><div class="meta-value">🍽 ${r.servings}</div></div>
        </div>
        ${tagsHtml ? `<div class="detail-tags">${tagsHtml}</div>` : ''}
        ${ingrHtml ? `
          <div class="detail-section-title">🛒 Ingrediënten</div>
          <ul class="ingredients-list">${ingrHtml}</ul>
        ` : ''}
        ${r.instructions ? `
          <div class="detail-section-title">👨‍🍳 Bereiding</div>
          <div class="instructions-text">${esc(r.instructions)}</div>
        ` : ''}
        <div class="detail-actions">
          <button class="btn-primary" onclick="navigate('add', ${JSON.stringify(r).replace(/"/g, '&quot;')})">✏️ Bewerken</button>
          <button class="btn-danger" onclick="deleteRecipe('${r.id}')">🗑️ Verwijderen</button>
        </div>
      </div>
    `;

    // Back button history trick
    window.onpopstate = () => navigate('home');
    history.pushState({}, '', '');
  } finally {
    showSpinner(false);
  }
}

async function deleteRecipe(id) {
  if (!confirm('Recept verwijderen?')) return;
  await apiFetch(`/api/recipes/${id}`, 'DELETE');
  showToast('Recept verwijderd', 'success');
  navigate('home');
}

// ── RECIPE CARD ───────────────────────────────────────
function createRecipeCard(recipe, index) {
  const card = document.createElement('div');
  card.className = 'recipe-card';
  card.style.animationDelay = `${index * 50}ms`;
  const cat = categories.find(c => c.id === recipe.category);
  const totalTime = (recipe.prep_time || 0) + (recipe.cook_time || 0);

  const thumbContent = recipe.image_path
    ? `<img src="${recipe.image_path}" alt="${esc(recipe.title)}" loading="lazy">`
    : cat ? cat.icon : '🍽️';

  card.innerHTML = `
    <div class="card-thumb">${thumbContent}</div>
    <div class="card-body">
      <div class="card-cat">${cat ? `${cat.icon} ${cat.name}` : ''}</div>
      <div class="card-title">${esc(recipe.title)}</div>
      <div class="card-meta">
        ${totalTime ? `<span>⏱ ${totalTime}m</span>` : ''}
        <span>🍽 ${recipe.servings || 4}p</span>
      </div>
    </div>
  `;
  card.onclick = () => viewRecipe(recipe.id);
  return card;
}

// ── API HELPERS ───────────────────────────────────────
async function apiFetch(url, method = 'GET', body = null) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(API + url, opts);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function fetchRecipes(params = {}) {
  const q = new URLSearchParams(params);
  return apiFetch(`/api/recipes?${q}`);
}

// ── UI UTILS ──────────────────────────────────────────
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast show ${type}`;
  clearTimeout(t._timeout);
  t._timeout = setTimeout(() => t.classList.remove('show'), 2800);
}

function showSpinner(on) {
  document.getElementById('spinner').classList.toggle('hidden', !on);
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
