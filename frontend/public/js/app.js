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

  // Render big winner card
  renderRouletteWinner(pick, cat);

  // Render alt suggestions (rest of results)
  const alts = results.slice(1);
  const altsWrap = document.getElementById('roulette-alts-wrap');
  const altGrid = document.getElementById('roulette-alt-cards');
  if (alts.length > 0) {
    altsWrap.classList.remove('hidden');
    altGrid.innerHTML = '';
    alts.forEach((r, i) => {
      const altCat = categories.find(c => c.id === r.category);
      const card = document.createElement('div');
      card.className = 'roulette-alt-card';
      card.style.animationDelay = `${i * 60 + 100}ms`;
      card.innerHTML = `
        <div class="alt-icon">${altCat ? altCat.icon : '🍽️'}</div>
        <div class="alt-info">
          <div class="alt-title">${esc(r.title)}</div>
          <div class="alt-cat">${altCat ? altCat.name : ''}</div>
        </div>`;
      card.onclick = () => viewRecipe(r.id);
      altGrid.appendChild(card);
    });
  } else {
    altsWrap.classList.add('hidden');
  }

  // Scroll to results
  resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderRouletteWinner(recipe, cat) {
  const totalTime = (recipe.prep_time || 0) + (recipe.cook_time || 0);
  const thumbHtml = recipe.image_path
    ? `<img src="${recipe.image_path}" alt="${esc(recipe.title)}">`
    : `${cat ? cat.icon : '🍽️'}`;

  document.getElementById('roulette-winner').innerHTML = `
    <div class="winner-thumb">
      ${thumbHtml}
      <div class="winner-badge">🎰 Vandaag koken!</div>
    </div>
    <div class="winner-body">
      <div class="winner-cat">${cat ? `${cat.icon} ${cat.name}` : 'Recept'}</div>
      <div class="winner-title">${esc(recipe.title)}</div>
      ${recipe.description ? `<div class="winner-desc">${esc(recipe.description)}</div>` : ''}
      <div class="winner-meta">
        ${totalTime ? `<div class="winner-meta-item">⏱ ${totalTime} min</div>` : ''}
        <div class="winner-meta-item">🍽 ${recipe.servings || 4} porties</div>
        ${(recipe.tags || []).slice(0,2).map(t => `<div class="winner-meta-item">#${esc(t)}</div>`).join('')}
      </div>
      <div class="winner-actions">
        <button class="btn-primary" onclick="viewRecipe('${recipe.id}')">📖 Bekijk recept</button>
        <button class="winner-spin-again" onclick="spinRoulette()">🎲 Nog eens spinnen</button>
      </div>
    </div>`;
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
      txt.textContent = prog < 60 ? 'Uploaden…' : 'Bijna klaar…';
    }, 200);

    const result = await fetch('/api/upload', { method: 'POST', body: formData }).then(r => r.json());

    clearInterval(interval);
    fill.style.width = '100%';
    txt.textContent = '✅ Klaar!';

    setTimeout(() => {
      progressEl.classList.add('hidden');
      showUploadPreview(result, file.name, file);
    }, 400);
  } catch (err) {
    progressEl.classList.add('hidden');
    dz.classList.remove('hidden');
    showToast('Upload mislukt', 'error');
  }
}

let _uploadMode = 'image'; // 'image' | 'text'

function setUploadMode(mode) {
  _uploadMode = mode;
  document.getElementById('mode-image-btn').classList.toggle('active', mode === 'image');
  document.getElementById('mode-text-btn').classList.toggle('active', mode === 'text');
  document.getElementById('upload-image-display').classList.toggle('hidden', mode === 'text');
  document.getElementById('upload-text-mode').classList.toggle('hidden', mode === 'image');
}

async function showUploadPreview(result, filename, originalFile) {
  const preview = document.getElementById('upload-preview');
  const display = document.getElementById('upload-image-display');

  // Bewaar result voor opslaan
  preview._uploadResult = result;
  preview._finalImagePath = null;

  // Vul tekstveld altijd in (ook als mode=image)
  document.getElementById('upload-text').value = result.extractedText || '';

  // Toon/verberg mode-bar: alleen bij PDF zinvol (foto heeft geen tekst)
  const isPdf = originalFile && originalFile.type === 'application/pdf';
  document.getElementById('upload-mode-bar').style.display = isPdf ? 'flex' : 'none';

  // Reset naar image-modus
  setUploadMode('image');

  if (result.imagePath) {
    // Directe afbeelding (jpg/png/webp)
    display.innerHTML = `<img src="${result.imagePath}" alt="Recept uitknipsel">`;
    preview._finalImagePath = result.imagePath;
  } else if (isPdf) {
    // PDF → render eerste pagina client-side
    display.innerHTML = `<div class="pdf-placeholder"><div class="pdf-icon" style="animation:spinAnim 1s linear infinite">⏳</div><p>PDF renderen…</p></div>`;
    try {
      const imagePath = await renderPdfToImage(originalFile, result.filename);
      display.innerHTML = `<img src="${imagePath}" alt="PDF pagina 1">`;
      preview._finalImagePath = imagePath;
    } catch (e) {
      display.innerHTML = `<div class="pdf-placeholder"><div class="pdf-icon">📄</div><p>${esc(filename)}</p></div>`;
    }
  } else {
    display.innerHTML = `<div class="pdf-placeholder"><div class="pdf-icon">📄</div><p>${esc(filename)}</p></div>`;
  }

  const titleInput = document.getElementById('upload-title');
  titleInput.value = '';
  preview.classList.remove('hidden');
  setTimeout(() => titleInput.focus(), 150);
  titleInput.onkeydown = e => { if (e.key === 'Enter') saveUploadedRecipe(); };
}

async function renderPdfToImage(file, serverFilename) {
  // Laad PDF.js dynamisch
  if (!window.pdfjsLib) {
    await new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
      s.onload = res; s.onerror = rej;
      document.head.appendChild(s);
    });
    window.pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  }

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(1);

  const viewport = page.getViewport({ scale: 2.0 }); // hoge resolutie
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

  // Canvas → blob → upload als PNG
  const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.92));
  const formData = new FormData();
  formData.append('file', new File([blob], serverFilename.replace(/\.pdf$/i, '_p1.jpg'), { type: 'image/jpeg' }));
  const r = await fetch('/api/upload', { method: 'POST', body: formData }).then(r => r.json());
  return r.imagePath;
}

async function saveUploadedRecipe() {
  const titleEl = document.getElementById('upload-title');
  const title = titleEl.value.trim();
  if (!title) {
    titleEl.focus();
    titleEl.classList.add('shake');
    setTimeout(() => titleEl.classList.remove('shake'), 400);
    return;
  }

  const preview = document.getElementById('upload-preview');
  const result = preview._uploadResult;

  const body = {
    title,
    category: 'algemeen',
    instructions: _uploadMode === 'text'
      ? (document.getElementById('upload-text').value || '')
      : '',
    ingredients: [],
    description: '',
    tags: [],
    source_type: result.sourceType,
    source_file: result.filename
  };

  // Afbeelding alleen opslaan in image-modus
  if (_uploadMode === 'image' && preview._finalImagePath) {
    body.image_path = preview._finalImagePath;
  }

  try {
    const r = await apiFetch('/api/recipes', 'POST', body);
    showToast('Recept opgeslagen! 🎉', 'success');
    resetUpload();
    viewRecipe(r.id);
  } catch {
    showToast('Opslaan mislukt', 'error');
  }
}

function resetUpload() {
  document.getElementById('drop-zone').classList.remove('hidden');
  document.getElementById('upload-progress').classList.add('hidden');
  document.getElementById('upload-preview').classList.add('hidden');
  document.getElementById('upload-image-display').innerHTML = '';
  document.getElementById('upload-text').value = '';
  document.getElementById('file-input').value = '';
  uploadedFile = null;
  _uploadMode = 'image';
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
