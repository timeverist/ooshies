/* Ooshie Tracker */

const LS_STATE = 'ooshie.state.v1';
const LS_ROOM  = 'ooshie.room.v1';
const LS_NAME  = 'ooshie.name.v1';
const LS_SORT  = 'ooshie.sort.v1';
const LS_ZOOM  = 'ooshie.zoom.v1';
const FB_VER   = '10.12.5';

/* ---------------- state ---------------- */

let OOSHIES = [];
let state = {};              // id -> { have:boolean, dupes:number }
let filter = 'all';
let query = '';              // normalised search text
let sortMode = 'checklist';  // 'checklist' (PDF order) | 'az'
let zoomCols = null;         // null = responsive; a number pins columns per row
const haystack = new Map();  // id -> normalised "name + series"
const cards = new Map();     // id -> card element
let remote = null;           // { db, ref, update } once Firebase connects
let applyingRemote = false;  // guard so remote echoes don't re-publish

const $ = sel => document.querySelector(sel);
const grid = $('#grid');

/* ---------------- helpers ---------------- */

function entry(id) {
  const e = state[id];
  return e && typeof e === 'object' ? e : { have: false, dupes: 0 };
}

function normalise(raw) {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, v] of Object.entries(raw)) {
    if (!v || typeof v !== 'object') continue;
    const have  = !!(v.have ?? v.h);
    const dupes = Math.max(0, Math.min(999, Number(v.dupes ?? v.d) || 0));
    if (have || dupes) out[id] = { have, dupes: have ? dupes : 0 };
  }
  return out;
}

/** Union merge — the more complete record wins, so nobody's taps get lost. */
function merge(a, b) {
  const out = {};
  for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const x = a[id] || { have: false, dupes: 0 };
    const y = b[id] || { have: false, dupes: 0 };
    const have = x.have || y.have;
    if (have || x.dupes || y.dupes) {
      out[id] = { have, dupes: have ? Math.max(x.dupes, y.dupes) : 0 };
    }
  }
  return out;
}

function saveLocal() {
  try { localStorage.setItem(LS_STATE, JSON.stringify(state)); } catch (_) {}
}

function loadLocal() {
  try { return normalise(JSON.parse(localStorage.getItem(LS_STATE) || '{}')); }
  catch (_) { return {}; }
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}

function setSync(text, mode) {
  const el = $('#syncStat');
  el.textContent = text;
  el.dataset.state = mode;
}

/* ---------------- rendering ---------------- */

const TICK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12.5l5.5 5.5L20 7"/></svg>';

/* Strip everything but letters and digits so "spiderman" finds Spider-Man,
   "r2d2" finds R2-D2 and "hei hei" finds Hei Hei. */
function searchKey(s) {
  return s.toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');
}

function matches(id) {
  if (query && !(haystack.get(id) || '').includes(query)) return false;
  const e = entry(id);
  if (filter === 'collected')  return e.have;
  if (filter === 'missing')    return !e.have;
  if (filter === 'duplicates') return e.dupes > 0;
  return true;
}

/* OOSHIES arrives in checklist order — the order the figures appear on the
   printed sheet — so that mode is just the array as loaded. */
function sortedOoshies() {
  if (sortMode === 'az') {
    return [...OOSHIES].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }
  return OOSHIES;
}

/* Reorders the existing cards rather than rebuilding them, so the artwork
   isn't re-decoded on every change. */
function applySort() {
  const frag = document.createDocumentFragment();
  for (const o of sortedOoshies()) {
    const card = cards.get(o.id);
    if (card) frag.appendChild(card);
  }
  grid.appendChild(frag);
}

function buildCards() {
  grid.innerHTML = '';
  haystack.clear();
  cards.clear();
  for (const o of OOSHIES) {
    // brand is searchable but not shown, so "star wars" finds the Mandalorian
    // figures too, and "marvel" / "pixar" pull up a whole franchise.
    haystack.set(o.id, searchKey(`${o.name} ${o.movie} ${o.brand}`));
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = o.id;
    card.setAttribute('role', 'button');
    card.tabIndex = 0;
    card.innerHTML = `
      <span class="tick">${TICK}</span>
      <span class="dupe-badge" data-badge>+0</span>
      <span class="thumb"><img src="${o.img}" alt="${o.name}" loading="lazy" decoding="async"></span>
      <span class="name">${o.name}</span>
      <span class="movie">${o.movie}</span>
      <span class="spare">
        <button type="button" data-act="minus" aria-label="One less spare ${o.name}">&minus;</button>
        <span class="spare-label" data-spare>Add spare</span>
        <button type="button" data-act="plus" aria-label="One more spare ${o.name}">+</button>
      </span>`;
    cards.set(o.id, card);
    grid.appendChild(card);
  }
  applySort();
}

function paint() {
  let collected = 0, dupes = 0, dupeItems = 0, shown = 0;

  for (const card of grid.children) {
    const e = entry(card.dataset.id);
    if (e.have) collected++;
    if (e.dupes > 0) { dupes += e.dupes; dupeItems++; }

    card.classList.toggle('have', e.have);
    card.classList.toggle('dupe', e.dupes > 0);
    card.querySelector('[data-badge]').textContent = '+' + e.dupes;
    card.querySelector('[data-spare]').textContent = e.dupes === 0 ? 'spare' : '×' + e.dupes;
    card.querySelector('[data-act="minus"]').disabled = e.dupes === 0;
    card.setAttribute('aria-pressed', String(e.have));

    const vis = matches(card.dataset.id);
    card.hidden = !vis;
    if (vis) shown++;
  }

  const total = OOSHIES.length;
  $('#collectedCount').textContent = collected;
  $('#totalCount').textContent = total;
  $('#progressFill').style.width = total ? (collected / total * 100) + '%' : '0%';
  $('#statMissing').textContent = total - collected;
  $('#statDupes').textContent = dupes;

  $('#cntAll').textContent = total;
  $('#cntCollected').textContent = collected;
  $('#cntMissing').textContent = total - collected;
  $('#cntDuplicates').textContent = dupeItems;

  const empty = $('#emptyState');
  empty.hidden = shown > 0;
  const term = $('#search').value.trim();
  empty.textContent =
    query                   ? `No ooshies match “${term}”${filter === 'all' ? '' : ' in this filter'}.` :
    filter === 'collected'  ? "Nothing collected yet — tap an ooshie to mark it." :
    filter === 'missing'    ? "You've got the whole set. Amazing!" :
    filter === 'duplicates' ? "No spares yet. Tap + on a collected ooshie to log one." :
                              "Nothing to show.";
}

/* ---------------- mutations ---------------- */

function commit() {
  saveLocal();
  paint();
  if (remote && !applyingRemote) push();
}

function toggle(id) {
  const e = entry(id);
  if (e.have) delete state[id];
  else state[id] = { have: true, dupes: 0 };
  commit();
}

function bumpSpare(id, delta) {
  const e = entry(id);
  if (!e.have) return;
  const dupes = Math.max(0, Math.min(999, e.dupes + delta));
  state[id] = { have: true, dupes };
  commit();
}

/* ---------------- events ---------------- */

grid.addEventListener('click', ev => {
  const card = ev.target.closest('.card');
  if (!card) return;
  const btn = ev.target.closest('[data-act]');
  if (btn) {
    ev.stopPropagation();
    bumpSpare(card.dataset.id, btn.dataset.act === 'plus' ? 1 : -1);
  } else {
    toggle(card.dataset.id);
  }
});

grid.addEventListener('keydown', ev => {
  if (ev.key !== 'Enter' && ev.key !== ' ') return;
  const card = ev.target.closest('.card');
  if (!card || ev.target.closest('[data-act]')) return;
  ev.preventDefault();
  toggle(card.dataset.id);
});

$('#filters').addEventListener('click', ev => {
  const btn = ev.target.closest('.filter');
  if (!btn) return;
  filter = btn.dataset.filter;
  for (const b of $('#filters').children) {
    const on = b === btn;
    b.classList.toggle('active', on);
    b.setAttribute('aria-selected', String(on));
  }
  paint();
});

const searchInput = $('#search');

function runSearch() {
  query = searchKey(searchInput.value);
  $('#clearSearch').hidden = searchInput.value === '';
  paint();
}

searchInput.addEventListener('input', runSearch);
searchInput.addEventListener('keydown', ev => {
  if (ev.key === 'Escape' && searchInput.value) {
    ev.stopPropagation();
    searchInput.value = '';
    runSearch();
  }
});

$('#clearSearch').addEventListener('click', () => {
  searchInput.value = '';
  runSearch();
  searchInput.focus();
});

/* ---------------- zoom (items per row) ---------------- */

const MIN_COLS = 2, MAX_COLS = 10, MIN_TILE = 56;

/** How many columns the responsive grid is currently producing. Read from the
    resolved track list rather than by measuring cards, so a filter that leaves
    only one item on screen doesn't report a one-column grid. */
function renderedCols() {
  const tracks = getComputedStyle(grid).gridTemplateColumns;
  if (!tracks || tracks === 'none') return MIN_COLS;
  return tracks.split(/\s+/).filter(Boolean).length;
}

/** Upper bound that still leaves tiles big enough to make out. */
function maxColsForWidth() {
  const styles = getComputedStyle(grid);
  const gap = parseFloat(styles.columnGap) || 10;
  const w = grid.clientWidth;
  return Math.max(MIN_COLS, Math.min(MAX_COLS, Math.floor((w + gap) / (MIN_TILE + gap))));
}

function applyZoom() {
  const cap = maxColsForWidth();
  if (zoomCols === null) {
    grid.classList.remove('zoomed');
    grid.style.removeProperty('--cols');
  } else {
    zoomCols = Math.max(MIN_COLS, Math.min(cap, zoomCols));
    grid.style.setProperty('--cols', zoomCols);
    grid.classList.add('zoomed');
  }
  const now = zoomCols === null ? renderedCols() : zoomCols;
  $('#zoomIn').disabled  = now <= MIN_COLS;   // fewer per row = bigger
  $('#zoomOut').disabled = now >= cap;
}

function stepZoom(delta) {
  const cap = maxColsForWidth();
  const from = zoomCols === null ? renderedCols() : zoomCols;
  const next = Math.max(MIN_COLS, Math.min(cap, from + delta));
  if (next === from && zoomCols !== null) return;
  zoomCols = next;
  try { localStorage.setItem(LS_ZOOM, String(zoomCols)); } catch (_) {}
  applyZoom();
}

$('#zoomIn').addEventListener('click',  () => stepZoom(-1));
$('#zoomOut').addEventListener('click', () => stepZoom(+1));

let resizeTimer = null;
addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(applyZoom, 150);
});

const sortSelect = $('#sort');
sortSelect.addEventListener('change', () => {
  sortMode = sortSelect.value === 'az' ? 'az' : 'checklist';
  try { localStorage.setItem(LS_SORT, sortMode); } catch (_) {}
  applySort();
});

$('#resetBtn').addEventListener('click', () => {
  if (!confirm('Clear every tick and spare? This affects everyone sharing this list.')) return;
  state = {};
  commit();
  toast('Collection cleared');
});

/* ---------------- sharing ---------------- */

function roomCode() {
  const fromUrl = new URLSearchParams(location.search).get('room');
  if (fromUrl && /^[a-z0-9]{6,32}$/i.test(fromUrl)) {
    localStorage.setItem(LS_ROOM, fromUrl);
    return fromUrl;
  }
  let code = localStorage.getItem(LS_ROOM);
  if (!code || !/^[a-z0-9]{6,32}$/i.test(code)) {
    const bytes = crypto.getRandomValues(new Uint8Array(8));
    code = Array.from(bytes, b => b.toString(36).padStart(2, '0')).join('').slice(0, 14);
    localStorage.setItem(LS_ROOM, code);
  }
  return code;
}

const ROOM = roomCode();

/* ---------------- export as image ---------------- */

const SECTIONS = [
  { key: 'missing',    label: 'Missing',    opt: '#optMissing',    pick: e => !e.have },
  { key: 'duplicates', label: 'Duplicates', opt: '#optDuplicates', pick: e => e.dupes > 0 },
  { key: 'collected',  label: 'Collected',  opt: '#optCollected',  pick: e => e.have }
];

function sectionItems(section) {
  return sortedOoshies().filter(o => section.pick(entry(o.id)));
}

function refreshExportDialog() {
  let any = false;
  for (const s of SECTIONS) {
    const n = sectionItems(s).length;
    $(s.opt + 'Count').textContent = n === 1 ? '1 ooshie' : `${n} ooshies`;
    const box = $(s.opt);
    box.disabled = n === 0;
    if (n === 0) box.checked = false;
    if (box.checked) any = true;
  }
  $('#doExport').disabled = !any;
  $('#exportHint').textContent = any ? '' : 'Pick at least one section.';
}

$('#exportBtn').addEventListener('click', () => {
  refreshExportDialog();
  try { $('#exportName').value = localStorage.getItem(LS_NAME) || ''; } catch (_) {}
  $('#exportDlg').showModal();
});
$('#closeExport').addEventListener('click', () => $('#exportDlg').close());
for (const s of SECTIONS) $(s.opt).addEventListener('change', refreshExportDialog);

const loadImage = src => new Promise((resolve, reject) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => reject(new Error('could not load ' + src));
  img.src = src;
});

/* Draws a poster-style image: a header, then one block per chosen section. */
async function buildExport(chosen, who) {
  const S = 2;                       // render at 2x for a crisp image
  const W = 900, PAD = 36, COLS = 5;
  const TILE = (W - PAD * 2) / COLS; // 165.6
  const IMG = TILE - 22, CAP = 34;
  const ROW = IMG + CAP;

  // Measure first so the canvas is exactly tall enough.
  let h = 132;
  const blocks = chosen.map(s => {
    const items = sectionItems(s);
    const rows = Math.ceil(items.length / COLS);
    const top = h;
    h += 46 + rows * ROW + 14;
    return { s, items, rows, top };
  });
  h += 34;

  const canvas = document.createElement('canvas');
  canvas.width = W * S;
  canvas.height = h * S;
  const ctx = canvas.getContext('2d');
  ctx.scale(S, S);

  const bg = ctx.createLinearGradient(0, 0, W * 0.35, h);
  bg.addColorStop(0, '#0b1657');
  bg.addColorStop(0.45, '#12277d');
  bg.addColorStop(1, '#1a54c4');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, h);

  const font = (px, weight = '400') =>
    `${weight} ${px}px "Segoe UI", system-ui, -apple-system, Helvetica, Arial, sans-serif`;

  // header — a supplied name becomes the headline, so whoever gets the image
  // can see whose list it is at a glance.
  const collected = OOSHIES.filter(o => entry(o.id).have).length;
  ctx.fillStyle = '#ffc844';
  ctx.font = font(34, '800');
  ctx.textBaseline = 'alphabetic';
  let heading = who || 'Ooshie Tracker';
  while (ctx.measureText(heading).width > W - PAD * 2 - 200 && heading.length > 3) {
    heading = heading.slice(0, -1);
  }
  if (heading !== (who || 'Ooshie Tracker')) heading = heading.slice(0, -1) + '…';
  ctx.fillText(heading, PAD, 58);
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  ctx.font = font(17);
  const sub = `${collected} of ${OOSHIES.length} collected`;
  ctx.fillText(who ? `Ooshie Tracker · ${sub}` : sub, PAD, 86);
  ctx.textAlign = 'right';
  ctx.fillStyle = 'rgba(255,255,255,.45)';
  ctx.font = font(15);
  ctx.fillText(new Date().toLocaleDateString(), W - PAD, 86);
  ctx.textAlign = 'left';
  ctx.strokeStyle = 'rgba(255,255,255,.16)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(PAD, 104); ctx.lineTo(W - PAD, 104); ctx.stroke();

  for (const { s, items, top } of blocks) {
    ctx.fillStyle = '#fff';
    ctx.font = font(21, '700');
    ctx.fillText(s.label, PAD, top + 28);
    ctx.fillStyle = 'rgba(255,255,255,.5)';
    ctx.font = font(15);
    ctx.fillText(`${items.length}`, PAD + ctx.measureText(s.label).width + 42, top + 28);

    for (let i = 0; i < items.length; i++) {
      const o = items[i];
      const x = PAD + (i % COLS) * TILE;
      const y = top + 46 + Math.floor(i / COLS) * ROW;

      ctx.fillStyle = 'rgba(255,255,255,.07)';
      ctx.beginPath();
      ctx.roundRect(x + 4, y + 2, TILE - 8, ROW - 6, 12);
      ctx.fill();

      try {
        const img = await loadImage(o.img);
        // contain the artwork inside the tile's square
        const box = IMG - 16;
        const k = Math.min(box / img.width, box / img.height);
        const w = img.width * k, hh = img.height * k;
        ctx.drawImage(img, x + (TILE - w) / 2, y + 10 + (IMG - 20 - hh) / 2, w, hh);
      } catch (_) { /* skip artwork, keep the label */ }

      const e = entry(o.id);
      if (e.dupes > 0) {
        const t = '+' + e.dupes;
        ctx.font = font(13, '800');
        const tw = ctx.measureText(t).width;
        ctx.fillStyle = '#ff5f8f';
        ctx.beginPath();
        ctx.roundRect(x + TILE - tw - 26, y + 8, tw + 16, 21, 11);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillText(t, x + TILE - tw - 18, y + 23);
      }

      ctx.fillStyle = 'rgba(255,255,255,.92)';
      ctx.font = font(13, '600');
      ctx.textAlign = 'center';
      let name = o.name;
      while (ctx.measureText(name).width > TILE - 14 && name.length > 4) {
        name = name.slice(0, -1);
      }
      if (name !== o.name) name = name.slice(0, -1) + '…';
      ctx.fillText(name, x + TILE / 2, y + IMG + 4);
      ctx.fillStyle = 'rgba(255,255,255,.4)';
      ctx.font = font(11);
      let mv = o.movie.toUpperCase();
      while (ctx.measureText(mv).width > TILE - 14 && mv.length > 4) mv = mv.slice(0, -1);
      ctx.fillText(mv, x + TILE / 2, y + IMG + 20);
      ctx.textAlign = 'left';
    }
  }

  ctx.fillStyle = 'rgba(255,255,255,.3)';
  ctx.font = font(11);
  ctx.fillText('© Disney · Disney/Pixar · MARVEL · & ™ Lucasfilm Ltd.', PAD, h - 16);

  return canvas;
}

$('#doExport').addEventListener('click', async () => {
  const chosen = SECTIONS.filter(s => $(s.opt).checked);
  if (!chosen.length) return;

  const btn = $('#doExport');
  btn.disabled = true;
  btn.textContent = 'Building…';
  try {
    const who = $('#exportName').value.trim().replace(/\s+/g, ' ');
    try { localStorage.setItem(LS_NAME, who); } catch (_) {}
    const canvas = await buildExport(chosen, who);
    // JPEG over PNG — the poster is opaque, and this is the difference between
    // a ~400KB image that texts fine and a ~5MB one that some apps reject.
    let type = 'image/jpeg';
    let blob = await new Promise(res => canvas.toBlob(res, type, 0.92));
    if (!blob) {
      type = 'image/png';
      blob = await new Promise(res => canvas.toBlob(res, type));
    }
    if (!blob) throw new Error('canvas produced no image');

    const stamp = new Date().toISOString().slice(0, 10);
    const ext = type === 'image/jpeg' ? 'jpg' : 'png';
    const slug = who.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const file = `${slug ? slug + '-' : ''}ooshies-${chosen.map(s => s.key).join('-')}-${stamp}.${ext}`;

    // On a phone the share sheet is what you want (send it straight to someone,
    // or save to Photos). On desktop it's a clumsy detour, so download instead.
    const asFile = new File([blob], file, { type });
    const onPhone = matchMedia('(pointer: coarse)').matches;
    if (onPhone && navigator.canShare && navigator.canShare({ files: [asFile] })) {
      try {
        await navigator.share({ files: [asFile], title: 'Ooshie Tracker' });
        $('#exportDlg').close();
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return;   // user backed out
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    $('#exportDlg').close();
    toast('Image saved');
  } catch (err) {
    console.error('[ooshies] export failed', err);
    toast("Couldn't build the image");
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save image';
    refreshExportDialog();
  }
});

/* ---------------- firebase sync (optional) ---------------- */

function toWire(s) {
  const out = {};
  for (const [id, e] of Object.entries(s)) out[id] = { h: !!e.have, d: e.dupes | 0 };
  return out;
}

let push = () => {};

async function connect() {
  const cfg = (window.OOSHIE_CONFIG || {}).firebase || {};
  if (!cfg.apiKey || !cfg.databaseURL) {
    setSync('This device only', 'local');
    return;
  }

  setSync('Connecting…', 'local');
  try {
    const [{ initializeApp }, dbMod] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${FB_VER}/firebase-database.js`)
    ]);
    const { getDatabase, ref, onValue, set } = dbMod;

    const db   = getDatabase(initializeApp(cfg));
    const node = ref(db, `rooms/${ROOM}/items`);

    let seeded = false;
    let writeTimer = null;

    push = () => {
      clearTimeout(writeTimer);
      writeTimer = setTimeout(() => {
        set(node, toWire(state)).catch(err => {
          console.error('[ooshies] write failed', err);
          setSync('Sync error', 'error');
        });
      }, 250);
    };

    onValue(node, snap => {
      const incoming = normalise(snap.val());
      setSync('Shared & live', 'live');

      if (!seeded) {
        // First contact: fold this device's history into whatever is already there.
        seeded = true;
        const merged = merge(state, incoming);
        const changed = JSON.stringify(merged) !== JSON.stringify(incoming);
        state = merged;
        saveLocal();
        paint();
        if (changed) push();
        return;
      }

      applyingRemote = true;
      state = incoming;
      saveLocal();
      paint();
      applyingRemote = false;
    }, err => {
      console.error('[ooshies] read failed', err);
      setSync('Sync error', 'error');
      remote = null;
    });

    remote = { db, node };
  } catch (err) {
    console.error('[ooshies] firebase failed to load', err);
    setSync('Offline — saved here', 'error');
  }
}

/* ---------------- boot ---------------- */

async function boot() {
  state = loadLocal();
  try {
    if (localStorage.getItem(LS_SORT) === 'az') sortMode = 'az';
    const z = parseInt(localStorage.getItem(LS_ZOOM), 10);
    if (z >= MIN_COLS && z <= MAX_COLS) zoomCols = z;
  } catch (_) {}
  sortSelect.value = sortMode;
  try {
    const res = await fetch('ooshies.json');
    OOSHIES = await res.json();
  } catch (err) {
    grid.innerHTML = '<p class="empty">Could not load the ooshie list. Try refreshing.</p>';
    console.error(err);
    return;
  }
  buildCards();
  paint();
  applyZoom();
  connect();
}

boot();
