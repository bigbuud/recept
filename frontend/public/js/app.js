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

// ── PWA INSTALL PROMPT ────────────────────────────────
let _deferredInstallPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  _deferredInstallPrompt = e;
  showInstallBanner();
});

window.addEventListener('appinstalled', () => {
  hideInstallBanner();
  showToast('✅ ReceptBox geïnstalleerd!', 'success');
});

function showInstallBanner() {
  if (document.getElementById('install-banner')) return;
  const banner = document.createElement('div');
  banner.id = 'install-banner';
  banner.className = 'install-banner';
  banner.innerHTML = `
    <div class="install-banner-content">
      <span class="install-banner-icon">📱</span>
      <div class="install-banner-text">
        <strong>Installeer ReceptBox</strong>
        <span>Voeg toe aan je beginscherm</span>
      </div>
    </div>
    <div class="install-banner-btns">
      <button class="install-btn-yes" onclick="triggerInstall()">Installeren</button>
      <button class="install-btn-no" onclick="hideInstallBanner()">✕</button>
    </div>
  `;
  document.body.appendChild(banner);
  setTimeout(() => banner.classList.add('visible'), 100);
}

function hideInstallBanner() {
  const banner = document.getElementById('install-banner');
  if (banner) {
    banner.classList.remove('visible');
    setTimeout(() => banner.remove(), 400);
  }
}

async function triggerInstall() {
  if (!_deferredInstallPrompt) return;
  _deferredInstallPrompt.prompt();
  const { outcome } = await _deferredInstallPrompt.userChoice;
  _deferredInstallPrompt = null;
  hideInstallBanner();
  if (outcome === 'accepted') showToast('✅ ReceptBox geïnstalleerd!', 'success');
}

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

// ── UPLOAD STATE ─────────────────────────────────────
let _uploadMode   = 'image';   // 'image' | 'text'
let _pdfDoc       = null;       // PDF.js document
let _pdfPageCount = 0;
let _pdfCurPage   = 1;
let _pdfPageCanvases = {};      // cache: pageNum → canvas
let _imageRotation = 0;         // graden
let _pageSelectMode = false;
let _selectedPages = new Set(); // geselecteerde pagina-nummers

// ── MODUS TOGGLE ──────────────────────────────────────
function setUploadMode(mode) {
  _uploadMode = mode;
  document.getElementById('mode-image-btn').classList.toggle('active', mode === 'image');
  document.getElementById('mode-text-btn').classList.toggle('active', mode === 'text');
  document.getElementById('upload-image-wrap').classList.toggle('hidden', mode === 'text');
  document.getElementById('upload-text-mode').classList.toggle('hidden', mode === 'image');
}

// ── TOON PREVIEW ──────────────────────────────────────
async function showUploadPreview(result, filename, originalFile) {
  const preview = document.getElementById('upload-preview');
  preview._uploadResult = result;
  preview._finalImagePath = null;
  _imageRotation = 0;
  _pdfDoc = null;
  _pdfPageCount = 0;
  _pdfCurPage = 1;
  _pdfPageCanvases = {};
  _selectedPages = new Set([1]);
  _pageSelectMode = false;

  document.getElementById('upload-text').value = result.extractedText || '';
  document.getElementById('pdf-page-nav').classList.add('hidden');
  document.getElementById('pdf-pages-grid').classList.add('hidden');
  document.getElementById('page-select-check').checked = false;

  const isPdf = originalFile && originalFile.type === 'application/pdf';
  document.getElementById('upload-mode-bar').style.display = isPdf ? 'flex' : 'none';
  setUploadMode('image');

  const display = document.getElementById('upload-image-display');
  const toolbar = document.getElementById('image-toolbar');

  if (result.imagePath) {
    // Foto
    display.innerHTML = `<img id="preview-img" src="${result.imagePath}" alt="Recept">`;
    preview._finalImagePath = result.imagePath;
    toolbar.classList.remove('hidden');
  } else if (isPdf) {
    display.innerHTML = `<div class="pdf-placeholder"><div class="pdf-icon" style="animation:spinAnim 1s linear infinite">⏳</div><p>PDF laden…</p></div>`;
    toolbar.classList.add('hidden');
    await loadPdfJs();
    const arrayBuffer = await originalFile.arrayBuffer();
    _pdfDoc = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    _pdfPageCount = _pdfDoc.numPages;
    await renderPdfPage(1);
    if (_pdfPageCount > 1) {
      document.getElementById('pdf-page-nav').classList.remove('hidden');
    }
  } else {
    display.innerHTML = `<div class="pdf-placeholder"><div class="pdf-icon">📄</div><p>${esc(filename)}</p></div>`;
    toolbar.classList.add('hidden');
  }

  const titleInput = document.getElementById('upload-title');
  titleInput.value = '';
  preview.classList.remove('hidden');
  setTimeout(() => titleInput.focus(), 150);
  titleInput.onkeydown = e => { if (e.key === 'Enter') saveUploadedRecipe(); };
}

// ── PDF.JS LADEN ──────────────────────────────────────
async function loadPdfJs() {
  if (window.pdfjsLib) return;
  await new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
  window.pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// ── PDF PAGINA RENDEREN ───────────────────────────────
// _pdfPageCanvases = full-res (scale 2.0) — voor opslaan
// _pdfThumbCanvases = low-res (scale 0.4) — enkel voor thumbnails
let _pdfThumbCanvases = {};

async function renderPdfPageFull(pageNum) {
  if (!_pdfPageCanvases[pageNum]) {
    const page     = await _pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas   = document.createElement('canvas');
    canvas.width   = viewport.width;
    canvas.height  = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    _pdfPageCanvases[pageNum] = canvas;
  }
  return _pdfPageCanvases[pageNum];
}

async function renderPdfPageThumb(pageNum) {
  if (!_pdfThumbCanvases[pageNum]) {
    const page     = await _pdfDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 0.4 });
    const canvas   = document.createElement('canvas');
    canvas.width   = viewport.width;
    canvas.height  = viewport.height;
    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
    _pdfThumbCanvases[pageNum] = canvas;
  }
  return _pdfThumbCanvases[pageNum];
}

async function renderPdfPage(pageNum) {
  _pdfCurPage = pageNum;
  const display = document.getElementById('upload-image-display');
  const toolbar = document.getElementById('image-toolbar');
  const label   = document.getElementById('pdf-page-label');

  label.textContent = `Pagina ${pageNum} / ${_pdfPageCount}`;

  const canvas = await renderPdfPageFull(pageNum);

  display.innerHTML = '';
  const img = document.createElement('img');
  img.id  = 'preview-img';
  img.src = canvas.toDataURL('image/jpeg', 0.92);
  img.alt = `Pagina ${pageNum}`;
  img.style.transform = `rotate(${_imageRotation}deg)`;
  display.appendChild(img);
  toolbar.classList.remove('hidden');
  _imageRotation = 0;
}

// ── PDF NAVIGATIE ─────────────────────────────────────
async function pdfGoPage(delta) {
  const next = _pdfCurPage + delta;
  if (next < 1 || next > _pdfPageCount) return;
  await renderPdfPage(next);
}

// ── PAGINA SELECTIE (multi) ───────────────────────────
async function togglePageSelect(on) {
  _pageSelectMode = on;
  const grid = document.getElementById('pdf-pages-grid');
  if (!on) {
    grid.classList.add('hidden');
    _selectedPages = new Set([_pdfCurPage]);
    return;
  }
  grid.classList.remove('hidden');
  grid.innerHTML = '';
  // Standaard: alle pagina's geselecteerd
  _selectedPages = new Set(Array.from({length: _pdfPageCount}, (_, i) => i + 1));

  for (let p = 1; p <= _pdfPageCount; p++) {
    const thumbCanvas = await renderPdfPageThumb(p);

    const thumb = document.createElement('div');
    thumb.className = 'pdf-thumb selected'; // allen standaard aan
    thumb.dataset.page = p;

    const tCanvas = document.createElement('canvas');
    tCanvas.width  = thumbCanvas.width;
    tCanvas.height = thumbCanvas.height;
    tCanvas.getContext('2d').drawImage(thumbCanvas, 0, 0);

    const check = document.createElement('div');
    check.className = 'pdf-thumb-check';
    check.textContent = '✓';

    const num = document.createElement('div');
    num.className = 'pdf-thumb-num';
    num.textContent = p;

    thumb.appendChild(tCanvas);
    thumb.appendChild(check);
    thumb.appendChild(num);

    thumb.onclick = () => {
      if (_selectedPages.has(p)) {
        if (_selectedPages.size === 1) return; // minstens 1 pagina
        _selectedPages.delete(p);
        thumb.classList.remove('selected');
      } else {
        _selectedPages.add(p);
        thumb.classList.add('selected');
      }
    };
    grid.appendChild(thumb);
  }
}

// ── ROTEREN ───────────────────────────────────────────
function rotateImage(deg) {
  _imageRotation = (_imageRotation + deg + 360) % 360;
  const img = document.getElementById('preview-img');
  if (img) img.style.transform = `rotate(${_imageRotation}deg)`;
}

// ── CANVAS ROTEREN & UPLOADEN ─────────────────────────
async function canvasToUploadedPath(canvas, rotation, serverFilename, suffix) {
  let finalCanvas = canvas;
  if (rotation !== 0) {
    const rad = (rotation * Math.PI) / 180;
    const sin = Math.abs(Math.sin(rad));
    const cos = Math.abs(Math.cos(rad));
    const w = Math.round(canvas.width * cos + canvas.height * sin);
    const h = Math.round(canvas.width * sin + canvas.height * cos);
    const rot = document.createElement('canvas');
    rot.width  = w;
    rot.height = h;
    const ctx = rot.getContext('2d');
    ctx.translate(w / 2, h / 2);
    ctx.rotate(rad);
    ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
    finalCanvas = rot;
  }
  const blob = await new Promise(res => finalCanvas.toBlob(res, 'image/jpeg', 0.92));
  const fname = serverFilename.replace(/\.[^.]+$/, `${suffix}.jpg`);
  const fd = new FormData();
  fd.append('file', new File([blob], fname, { type: 'image/jpeg' }));
  const r = await fetch('/api/upload', { method: 'POST', body: fd }).then(r => r.json());
  return r.imagePath;
}

// ── OPSLAAN ───────────────────────────────────────────
async function saveUploadedRecipe() {
  const titleEl = document.getElementById('upload-title');
  const title   = titleEl.value.trim();
  if (!title) {
    titleEl.focus();
    titleEl.classList.add('shake');
    setTimeout(() => titleEl.classList.remove('shake'), 400);
    return;
  }

  const preview = document.getElementById('upload-preview');
  const result  = preview._uploadResult;
  showSpinner(true);

  try {
    let imagePath = null;

    if (_uploadMode === 'image') {
      if (_pdfDoc) {
        // PDF: geselecteerde pagina('s) samenvoegen tot één lange afbeelding
        const pages = Array.from(_selectedPages).sort((a, b) => a - b);

        // Altijd full-res renderen voor opslaan
        for (const p of pages) {
          await renderPdfPageFull(p);
        }

        if (pages.length === 1) {
          // Één pagina — met rotatie
          imagePath = await canvasToUploadedPath(
            _pdfPageCanvases[pages[0]], _imageRotation, result.filename, '_p' + pages[0]
          );
        } else {
          // Meerdere pagina's — stapelen onder elkaar
          const canvases = pages.map(p => _pdfPageCanvases[p]);
          const maxW     = Math.max(...canvases.map(c => c.width));
          const totalH   = canvases.reduce((s, c) => s + c.height, 0);
          const merged   = document.createElement('canvas');
          merged.width   = maxW;
          merged.height  = totalH;
          const ctx      = merged.getContext('2d');
          let y = 0;
          for (const c of canvases) { ctx.drawImage(c, 0, y); y += c.height; }
          imagePath = await canvasToUploadedPath(merged, 0, result.filename, '_merged');
        }
      } else if (preview._finalImagePath) {
        // Foto: rotatie verwerken
        if (_imageRotation !== 0) {
          const img = new Image();
          img.src = preview._finalImagePath;
          await new Promise(res => { img.onload = res; });
          const c = document.createElement('canvas');
          c.width = img.width; c.height = img.height;
          c.getContext('2d').drawImage(img, 0, 0);
          imagePath = await canvasToUploadedPath(c, _imageRotation, result.filename, '_r');
        } else {
          imagePath = preview._finalImagePath;
        }
      }
    }

    const body = {
      title,
      category:     'algemeen',
      instructions: _uploadMode === 'text'
        ? (document.getElementById('upload-text').value || '')
        : '',
      ingredients:  [],
      description:  '',
      tags:         [],
      source_type:  result.sourceType,
      source_file:  result.filename,
      image_path:   imagePath || null
    };

    const r = await apiFetch('/api/recipes', 'POST', body);
    showToast('Recept opgeslagen! 🎉', 'success');
    resetUpload();
    viewRecipe(r.id);
  } catch (e) {
    console.error(e);
    showToast('Opslaan mislukt', 'error');
  } finally {
    showSpinner(false);
  }
}

// ── RESET ─────────────────────────────────────────────
function resetUpload() {
  document.getElementById('drop-zone').classList.remove('hidden');
  document.getElementById('upload-progress').classList.add('hidden');
  document.getElementById('upload-preview').classList.add('hidden');
  document.getElementById('upload-image-display').innerHTML = '';
  document.getElementById('image-toolbar').classList.add('hidden');
  document.getElementById('pdf-page-nav').classList.add('hidden');
  document.getElementById('pdf-pages-grid').classList.add('hidden');
  document.getElementById('upload-text').value = '';
  document.getElementById('file-input').value = '';
  uploadedFile = null;
  _uploadMode = 'image';
  _pdfDoc = null;
  _pdfPageCanvases = {};
  _pdfThumbCanvases = {};
  _imageRotation = 0;
  _selectedPages = new Set();
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
      ? `<div class="detail-image">
           <img src="${r.image_path}" alt="${esc(r.title)}" onclick="openLightbox('${r.image_path}')">
           <span class="zoom-hint">🔍 Klik om te vergroten</span>
         </div>`
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
          <button class="btn-share" onclick="shareRecipe(${JSON.stringify(r).replace(/"/g, '&quot;')})">📤 Delen</button>
          <button class="btn-download" onclick="downloadRecipePdf(${JSON.stringify(r).replace(/"/g, '&quot;')})">⬇️ Download</button>
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

// ── LIGHTBOX ──────────────────────────────────────────
let _lbRotation = 0;

function openLightbox(src) {
  _lbRotation = 0;
  const lb  = document.getElementById('lightbox');
  const img = document.getElementById('lightbox-img');
  img.src = src;
  img.style.transform = 'rotate(0deg)';
  lb.classList.remove('hidden');
  // Scroll naar top bij openen
  document.getElementById('lightbox-scroll').scrollTop = 0;
  lb.scrollTop = 0;
  document.body.style.overflow = 'hidden';
  document.onkeydown = e => { if (e.key === 'Escape') closeLightbox(); };
}

function closeLightbox(e) {
  // Sluit enkel als je op de donkere achtergrond klikt (niet op de foto zelf)
  if (e && (e.target === document.getElementById('lightbox-img') ||
            e.target.closest('.lb-bottom-bar'))) return;
  document.getElementById('lightbox').classList.add('hidden');
  document.body.style.overflow = '';
  document.onkeydown = null;
}

function lbRotate(deg) {
  _lbRotation = (_lbRotation + deg + 360) % 360;
  const img = document.getElementById('lightbox-img');
  img.style.transform = `rotate(${_lbRotation}deg)`;
  // Bij 90/270° aanpassen zodat afbeelding niet buiten scherm valt
  if (_lbRotation === 90 || _lbRotation === 270) {
    img.style.maxWidth = '90vh';
  } else {
    img.style.maxWidth = 'min(100%, 1200px)';
  }
}

// ── SHARE ─────────────────────────────────────────────
async function shareRecipe(r) {
  const cat = categories.find(c => c.id === r.category);
  const totalTime = (r.prep_time || 0) + (r.cook_time || 0);

  const ingr = (r.ingredients || []).map(i => `• ${i}`).join('\n');
  const text = [
    `🍽️ ${r.title}`,
    cat ? `${cat.icon} ${cat.name}` : '',
    r.description || '',
    totalTime ? `⏱ ${totalTime} min  |  🍽 ${r.servings} porties` : `🍽 ${r.servings} porties`,
    '',
    ingr ? `🛒 Ingrediënten:\n${ingr}` : '',
    r.instructions ? `\n👨‍🍳 Bereiding:\n${r.instructions}` : '',
    r.tags?.length ? `\n🏷️ ${r.tags.join(', ')}` : ''
  ].filter(Boolean).join('\n');

  // Try native Web Share API first (mobile)
  if (navigator.share) {
    try {
      await navigator.share({
        title: r.title,
        text: text,
      });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return; // user cancelled
    }
  }

  // Fallback: show share sheet modal
  showShareModal(r, text);
}

function showShareModal(r, text) {
  const existing = document.getElementById('share-modal');
  if (existing) existing.remove();

  const encoded = encodeURIComponent(text);
  const subject = encodeURIComponent(`Recept: ${r.title}`);

  const modal = document.createElement('div');
  modal.id = 'share-modal';
  modal.className = 'share-modal-overlay';
  modal.innerHTML = `
    <div class="share-modal" onclick="event.stopPropagation()">
      <div class="share-modal-header">
        <h3>📤 Recept delen</h3>
        <button class="share-close" onclick="document.getElementById('share-modal').remove()">✕</button>
      </div>
      <div class="share-grid">
        <a class="share-option" href="https://wa.me/?text=${encoded}" target="_blank" rel="noopener">
          <span class="share-opt-icon">💬</span>
          <span>WhatsApp</span>
        </a>
        <a class="share-option" href="mailto:?subject=${subject}&body=${encoded}" target="_blank" rel="noopener">
          <span class="share-opt-icon">✉️</span>
          <span>E-mail</span>
        </a>
        <a class="share-option" href="sms:?body=${encoded}" target="_blank" rel="noopener">
          <span class="share-opt-icon">📱</span>
          <span>SMS</span>
        </a>
        <button class="share-option" onclick="copyShareText(${JSON.stringify(text).replace(/"/g,'&quot;')})">
          <span class="share-opt-icon">📋</span>
          <span>Kopiëren</span>
        </button>
        <button class="share-option" onclick="downloadRecipePdf(${JSON.stringify(r).replace(/"/g,'&quot;')}); document.getElementById('share-modal').remove()">
          <span class="share-opt-icon">📄</span>
          <span>PDF</span>
        </button>
      </div>
    </div>
  `;
  modal.onclick = () => modal.remove();
  document.body.appendChild(modal);
  setTimeout(() => modal.querySelector('.share-modal').classList.add('visible'), 30);
}

async function copyShareText(text) {
  try {
    await navigator.clipboard.writeText(text);
    showToast('📋 Gekopieerd naar klembord!', 'success');
    document.getElementById('share-modal')?.remove();
  } catch {
    showToast('Kopiëren mislukt', 'error');
  }
}

// ── DOWNLOAD AS PDF ────────────────────────────────────
function downloadRecipePdf(r) {
  const cat = categories.find(c => c.id === r.category);
  const totalTime = (r.prep_time || 0) + (r.cook_time || 0);
  const ingrHtml = (r.ingredients || []).map(i => `<li>${esc(i)}</li>`).join('');
  const instHtml = (r.instructions || '').replace(/\n/g, '<br>');

  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <title>${esc(r.title)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Nunito', 'Segoe UI', sans-serif; color: #1a1a1a; padding: 40px; max-width: 700px; margin: auto; }
    .header { border-bottom: 3px solid #f97316; padding-bottom: 16px; margin-bottom: 24px; }
    .header h1 { font-size: 28px; font-weight: 700; color: #f97316; margin-bottom: 4px; }
    .cat { font-size: 14px; color: #888; margin-bottom: 8px; }
    .desc { font-size: 15px; color: #555; margin-bottom: 12px; }
    .meta { display: flex; gap: 20px; font-size: 13px; color: #666; }
    .meta span { background: #fef3e2; padding: 4px 10px; border-radius: 20px; }
    .tags { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 6px; }
    .tag { background: #ffe4cc; color: #c2440f; font-size: 12px; padding: 2px 8px; border-radius: 12px; }
    .section { margin-top: 28px; }
    .section h2 { font-size: 16px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #f97316; margin-bottom: 12px; border-bottom: 1px solid #fde8d0; padding-bottom: 6px; }
    ul { padding-left: 20px; }
    li { margin-bottom: 6px; font-size: 15px; line-height: 1.5; }
    .instructions { font-size: 15px; line-height: 1.8; white-space: pre-wrap; }
    .footer { margin-top: 40px; font-size: 11px; color: #bbb; text-align: center; border-top: 1px solid #eee; padding-top: 12px; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <div class="header">
    <div class="cat">${cat ? `${cat.icon} ${cat.name}` : 'Recept'}</div>
    <h1>${esc(r.title)}</h1>
    ${r.description ? `<p class="desc">${esc(r.description)}</p>` : ''}
    <div class="meta">
      ${r.prep_time ? `<span>⏱ Voorber. ${r.prep_time}m</span>` : ''}
      ${r.cook_time ? `<span>🔥 Koken ${r.cook_time}m</span>` : ''}
      ${totalTime ? `<span>⏰ Totaal ${totalTime}m</span>` : ''}
      <span>🍽 ${r.servings} porties</span>
    </div>
    ${r.tags?.length ? `<div class="tags">${r.tags.map(t => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
  </div>
  ${ingrHtml ? `<div class="section"><h2>🛒 Ingrediënten</h2><ul>${ingrHtml}</ul></div>` : ''}
  ${r.instructions ? `<div class="section"><h2>👨‍🍳 Bereiding</h2><div class="instructions">${instHtml}</div></div>` : ''}
  <div class="footer">ReceptBox • ${new Date().toLocaleDateString('nl-BE')}</div>
  <script>window.onload = () => { window.print(); }<\/script>
</body>
</html>`);
  win.document.close();
}
