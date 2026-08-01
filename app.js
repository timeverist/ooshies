/* Rosie's Ooshie Tracker */

const LS_STATE = 'ooshie.state.v1';
const LS_ROOM  = 'ooshie.room.v1';
const FB_VER   = '10.12.5';

/* ---------------- state ---------------- */

let OOSHIES = [];
let state = {};              // id -> { have:boolean, dupes:number }
let filter = 'all';
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

function matches(id) {
  const e = entry(id);
  if (filter === 'collected')  return e.have;
  if (filter === 'missing')    return !e.have;
  if (filter === 'duplicates') return e.dupes > 0;
  return true;
}

function buildCards() {
  grid.innerHTML = '';
  for (const o of OOSHIES) {
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
    grid.appendChild(card);
  }
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
  empty.textContent =
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

$('#shareBtn').addEventListener('click', async () => {
  const url = location.origin + location.pathname + '?room=' + ROOM;
  const configured = !!remote;
  $('#shareNote').textContent = configured
    ? "Send this link to anyone you collect with. You'll both see the same list, updating live."
    : "Live sharing isn't switched on yet — see SETUP.md. For now this link only opens the app.";
  $('#shareLink').value = url;
  $('#roomCodeText').textContent = ROOM;

  if (navigator.share) {
    try {
      await navigator.share({ title: "Rosie's Ooshie Tracker", url });
      return;
    } catch (_) { /* cancelled — fall through to the dialog */ }
  }
  $('#shareDlg').showModal();
});

$('#copyBtn').addEventListener('click', async () => {
  const input = $('#shareLink');
  try {
    await navigator.clipboard.writeText(input.value);
    toast('Link copied');
  } catch (_) {
    input.select();
    toast('Press Ctrl+C to copy');
  }
});

$('#closeShare').addEventListener('click', () => $('#shareDlg').close());

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
    const res = await fetch('ooshies.json');
    OOSHIES = await res.json();
  } catch (err) {
    grid.innerHTML = '<p class="empty">Could not load the ooshie list. Try refreshing.</p>';
    console.error(err);
    return;
  }
  buildCards();
  paint();
  connect();
}

boot();
