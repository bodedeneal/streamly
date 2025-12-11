/* Browser-only Streamly (no add/upload UI)
   - Loads catalog from catalog.json on first run (seeds IndexedDB)
   - Search bar filters items live
   - Play videos directly from URL listed in item.sources
*/
const DB_NAME = 'streamly-db-v1';
const DB_VERSION = 1;
const ITEMS_STORE = 'items';
const CARDS_PER_ROW = 8;

let db = null;
let itemsCache = [];
let currentPlayUrl = null;

// ---------- IndexedDB helpers ----------
function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains(ITEMS_STORE)) {
        d.createObjectStore(ITEMS_STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => { db = req.result; resolve(db); };
    req.onerror = () => reject(req.error);
  });
}

function idbPut(storeName, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const r = store.put(value);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function idbGetAll(storeName) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const r = store.getAll();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

// ---------- App logic ----------
async function init() {
  await openDb();
  await loadItems();
  await seedFromCatalogIfEmpty();
  setupUI();
  renderAll();
}

async function loadItems() {
  const items = await idbGetAll(ITEMS_STORE);
  itemsCache = items || [];
}

async function seedFromCatalogIfEmpty() {
  if (itemsCache && itemsCache.length > 0) return;
  try {
    const res = await fetch('catalog.json');
    if (!res.ok) throw new Error('catalog.json not found');
    const catalog = await res.json();
    // Normalize items and save to IDB
    for (const it of catalog) {
      // ensure id exists
      const id = it.id || (it.title ? `${it.title.toLowerCase().replace(/[^a-z0-9]+/g,'-')}-${Date.now()}` : `item-${Date.now()}`);
      const item = {
        id,
        title: it.title || 'Untitled',
        year: it.year,
        description: it.description || '',
        poster: it.poster || '',
        category: it.category || 'Uncategorized',
        themeColor: it.themeColor || null,
        sources: it.sources || (it.source ? [it.source] : [])
      };
      await idbPut(ITEMS_STORE, item);
    }
    await loadItems();
  } catch (err) {
    console.warn('No catalog.json seed or failed to load:', err);
    // Leave itemsCache empty - UI will show no content message
  }
}

function groupItems(items) {
  return items.reduce((acc, item) => {
    const cat = item.category || 'Featured';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});
}

function pickHero() {
  if (!itemsCache.length) {
    return { title: 'No content', description: 'Add items via catalog.json in the repository', poster: '', themeColor:'#e50914' };
  }
  const themed = itemsCache.find(i => i.themeColor);
  return themed || itemsCache[0];
}

function renderAll() {
  const heroItem = pickHero();
  renderHero(heroItem);

  const grouped = groupItems(itemsCache);
  renderRows(grouped);
}

function renderHero(item) {
  document.getElementById('hero-title').innerText = item.title || 'No content';
  document.getElementById('hero-desc').innerText = item.description || '';
  const poster = document.getElementById('hero-poster');
  poster.src = item.poster || '';
  const color = item.themeColor || '#e50914';
  document.documentElement.style.setProperty('--hero-accent', color);

  document.getElementById('play-hero').onclick = () => {
    if (item && item.sources && item.sources.length) openPlayer(item);
  };
  document.getElementById('more-info').onclick = () => {
    if (item) alert(`${item.title || ''}\n\n${item.description || ''}`);
  };
}

function renderRows(grouped) {
  const rowsEl = document.getElementById('rows');
  rowsEl.innerHTML = '';
  if (!Object.keys(grouped).length) {
    rowsEl.innerHTML = '<p style="padding:24px;color:var(--muted)">No content available. Edit catalog.json in the repository to add items (see example).</p>';
    return;
  }
  for (const cat of Object.keys(grouped)) {
    const raw = grouped[cat].slice();
    const remainder = raw.length % CARDS_PER_ROW;
    if (remainder !== 0) {
      const toAdd = CARDS_PER_ROW - remainder;
      for (let i = 0; i < toAdd; i++) raw.push(null);
    }

    for (let start = 0; start < raw.length; start += CARDS_PER_ROW) {
      const chunk = raw.slice(start, start + CARDS_PER_ROW);
      const row = document.createElement('section');
      row.className = 'row';
      const title = document.createElement('h3');
      title.innerText = cat + (start > 0 ? ' (more)' : '');
      row.appendChild(title);

      const left = document.createElement('div'); left.className = 'chev left';
      left.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z" fill="#fff"/></svg>';
      const right = document.createElement('div'); right.className = 'chev right';
      right.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z" fill="#fff"/></svg>';

      const track = document.createElement('div'); track.className = 'row-track';

      chunk.forEach(item => {
        const card = document.createElement('div'); card.className = 'card';
        if (!item) {
          card.classList.add('empty-card');
          card.innerHTML = `<div class="placeholder-poster"></div><div class="meta"><div class="title"> </div><div class="sub"></div></div>`;
        } else {
          const inner = document.createElement('div');
          inner.className = 'card-inner';
          if (item.themeColor) {
            inner.style.border = `2px solid ${item.themeColor}`;
            inner.style.padding = '4px';
            inner.style.borderRadius = '6px';
          }
          const img = document.createElement('img');
          img.alt = item.title + ' poster';
          img.loading = 'lazy';
          img.src = item.poster || '';
          const meta = document.createElement('div'); meta.className = 'meta';
          meta.innerHTML = `<div class="title">${item.title}</div><div class="sub">${item.year || ''} • ${item.category || ''}</div>`;
          inner.appendChild(img);
          inner.appendChild(meta);
          card.appendChild(inner);
          card.onclick = () => openPlayer(item);
        }
        track.appendChild(card);
      });

      left.onclick = () => track.scrollBy({ left: -520, behavior: 'smooth' });
      right.onclick = () => track.scrollBy({ left: 520, behavior: 'smooth' });

      row.appendChild(left);
      row.appendChild(track);
      row.appendChild(right);
      rowsEl.appendChild(row);
    }
  }
}

// ---------- Player ----------
async function openPlayer(item) {
  if (!item || !item.sources || !item.sources.length) {
    alert('No playable source for this item.');
    return;
  }
  const source = item.sources[0];
  const modal = document.getElementById('player-modal');
  const title = document.getElementById('modal-title');
  const meta = document.getElementById('modal-meta');
  const video = document.getElementById('modal-player');
  title.innerText = item.title;
  meta.innerText = `${item.year || ''} • ${item.category || ''} — ${item.description || ''}`;

  // play either direct URL or object URL (none are stored in this no-add version)
  if (currentPlayUrl) { URL.revokeObjectURL(currentPlayUrl); currentPlayUrl = null; }
  video.src = source.url;
  modal.classList.remove('hidden');
  modal.setAttribute('aria-hidden', 'false');
  try { await video.play(); } catch (e) {}
}

function closeModal() {
  const modal = document.getElementById('player-modal');
  const video = document.getElementById('modal-player');
  video.pause();
  video.src = '';
  if (currentPlayUrl) { URL.revokeObjectURL(currentPlayUrl); currentPlayUrl = null; }
  modal.classList.add('hidden');
  modal.setAttribute('aria-hidden', 'true');
}

// ---------- UI / Search ----------
function setupUI() {
  document.getElementById('close-modal').addEventListener('click', closeModal);
  document.querySelector('.modal-backdrop').addEventListener('click', closeModal);
  document.getElementById('search').addEventListener('input', onSearch);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
}

function onSearch(e) {
  const q = e.target.value.toLowerCase().trim();
  if (!q) {
    renderAll();
    return;
  }
  const filtered = itemsCache.filter(i => (i.title + ' ' + (i.description||'') + ' ' + (i.category||'')).toLowerCase().includes(q));
  const grouped = groupItems(filtered);
  renderRows(grouped);
}

// ---------- Start ----------
init();
