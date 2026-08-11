/* ===========================================================
   Il Listone — logica applicativa (nessun backend, nessun account)
   Lo stato Libero / Preso da me / Preso da avversario viene
   salvato in localStorage, quindi resta solo su questo browser.
   =========================================================== */

const STORAGE_KEY = 'listone_stato_v1';
const ROLE_ORDER = ['P', 'D', 'C', 'A'];

const COLUMNS = {
  P: [
    { key: 'nome', label: 'Nome', cls: 'col-nome' },
    { key: 'squadra', label: 'Sq', cls: 'col-squadra' },
    { key: 'qtA', label: 'Qt.A' },
    { key: 'fvm', label: 'FVM' },
    { key: 'pv', label: 'PV' },
    { key: 'mv', label: 'MV', decimals: 2 },
    { key: 'fm', label: 'FM', decimals: 2 },
    { key: 'golSub', label: 'Gol Sub' },
    { key: 'rigParati', label: 'Rig Par' },
    { key: 'amm', label: 'Amm' },
    { key: 'esp', label: 'Esp' },
  ],
  D: [
    { key: 'nome', label: 'Nome', cls: 'col-nome' },
    { key: 'squadra', label: 'Sq', cls: 'col-squadra' },
    { key: 'qtA', label: 'Qt.A' },
    { key: 'fvm', label: 'FVM' },
    { key: 'pv', label: 'PV' },
    { key: 'mv', label: 'MV', decimals: 2 },
    { key: 'fm', label: 'FM', decimals: 2 },
    { key: 'gol', label: 'Gol' },
    { key: 'assist', label: 'Ass' },
    { key: 'amm', label: 'Amm' },
    { key: 'esp', label: 'Esp' },
  ],
  C: [
    { key: 'nome', label: 'Nome', cls: 'col-nome' },
    { key: 'squadra', label: 'Sq', cls: 'col-squadra' },
    { key: 'qtA', label: 'Qt.A' },
    { key: 'fvm', label: 'FVM' },
    { key: 'pv', label: 'PV' },
    { key: 'mv', label: 'MV', decimals: 2 },
    { key: 'fm', label: 'FM', decimals: 2 },
    { key: 'gol', label: 'Gol' },
    { key: 'assist', label: 'Ass' },
    { key: 'amm', label: 'Amm' },
    { key: 'esp', label: 'Esp' },
  ],
  A: [
    { key: 'nome', label: 'Nome', cls: 'col-nome' },
    { key: 'squadra', label: 'Sq', cls: 'col-squadra' },
    { key: 'qtA', label: 'Qt.A' },
    { key: 'fvm', label: 'FVM' },
    { key: 'pv', label: 'PV' },
    { key: 'mv', label: 'MV', decimals: 2 },
    { key: 'fm', label: 'FM', decimals: 2 },
    { key: 'gol', label: 'Gol' },
    { key: 'rigSegn', label: 'Rig S/T', combine: 'rigTir' },
    { key: 'assist', label: 'Ass' },
    { key: 'amm', label: 'Amm' },
  ],
};

const STATE = {
  players: [],
  byId: new Map(),
  stato: {},          // { [id]: 'Libero' | 'Mio' | 'Avversario' }
  currentRole: 'P',
  sortKey: 'fvm',
  sortDir: 'desc',
  search: '',
  onlyFree: false,
};

// ---------- Persistenza stato asta ----------
function loadStato() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    STATE.stato = raw ? JSON.parse(raw) : {};
  } catch (e) {
    STATE.stato = {};
  }
}
function saveStato() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(STATE.stato));
}
function getStato(id) {
  return STATE.stato[id] || 'Libero';
}
function setStato(id, val) {
  if (val === 'Libero') delete STATE.stato[id];
  else STATE.stato[id] = val;
  saveStato();
}

// ---------- Caricamento dati ----------
async function loadPlayers() {
  const res = await fetch('data/players.json');
  const data = await res.json();
  STATE.players = data;
  data.forEach(p => STATE.byId.set(p.id, p));
}

// ---------- Formattazione ----------
function fmt(val, decimals) {
  if (val === null || val === undefined || val === '') {
    return '<span class="no-data">—</span>';
  }
  if (decimals) return Number(val).toFixed(decimals);
  return String(val);
}

// ---------- Rendering tabella ruolo ----------
function renderTableHead() {
  const cols = COLUMNS[STATE.currentRole];
  const thead = document.getElementById('players-thead');
  const tr = document.createElement('tr');
  cols.forEach(c => {
    const th = document.createElement('th');
    th.textContent = c.label;
    th.dataset.key = c.key;
    if (c.cls) th.classList.add(c.cls);
    if (c.key === STATE.sortKey) {
      th.classList.add(STATE.sortDir === 'asc' ? 'sorted-asc' : 'sorted');
    }
    th.addEventListener('click', () => {
      if (STATE.sortKey === c.key) {
        STATE.sortDir = STATE.sortDir === 'desc' ? 'asc' : 'desc';
      } else {
        STATE.sortKey = c.key;
        STATE.sortDir = 'desc';
      }
      renderRoleView();
    });
    tr.appendChild(th);
  });
  const thStato = document.createElement('th');
  thStato.textContent = 'Stato';
  tr.appendChild(thStato);
  thead.innerHTML = '';
  thead.appendChild(tr);
}

function getFilteredSorted() {
  const cols = COLUMNS[STATE.currentRole];
  let rows = STATE.players.filter(p => p.ruolo === STATE.currentRole);

  if (STATE.search.trim()) {
    const q = STATE.search.trim().toLowerCase();
    rows = rows.filter(p =>
      p.nome.toLowerCase().includes(q) || p.squadra.toLowerCase().includes(q));
  }
  if (STATE.onlyFree) {
    rows = rows.filter(p => getStato(p.id) === 'Libero');
  }

  const key = STATE.sortKey;
  const dir = STATE.sortDir === 'asc' ? 1 : -1;
  rows.sort((a, b) => {
    let av = a[key], bv = b[key];
    if (key === 'nome' || key === 'squadra') {
      return dir * String(av).localeCompare(String(bv));
    }
    av = (av === null || av === undefined) ? -Infinity : av;
    bv = (bv === null || bv === undefined) ? -Infinity : bv;
    return dir * (av - bv);
  });
  return rows;
}

function renderTableBody() {
  const cols = COLUMNS[STATE.currentRole];
  const tbody = document.getElementById('players-tbody');
  const rows = getFilteredSorted();
  tbody.innerHTML = '';

  rows.forEach(p => {
    const tr = document.createElement('tr');
    const stato = getStato(p.id);
    if (stato === 'Mio') tr.classList.add('is-mine');
    if (stato === 'Avversario') tr.classList.add('is-taken');

    cols.forEach(c => {
      const td = document.createElement('td');
      if (c.cls) td.classList.add(c.cls);
      if (c.key === 'rigSegn' && c.combine) {
        const a = p.rigSegn, b = p.rigTir;
        td.innerHTML = (a === null || a === undefined) ? fmt(null) : `${a}/${b}`;
      } else {
        td.innerHTML = fmt(p[c.key], c.decimals);
      }
      tr.appendChild(td);
    });

    const tdStato = document.createElement('td');
    const select = document.createElement('select');
    select.className = 'stato-select';
    [['Libero', 'Libero'], ['Mio', 'Preso da me'], ['Avversario', 'Preso da avv.']]
      .forEach(([val, label]) => {
        const opt = document.createElement('option');
        opt.value = val; opt.textContent = label;
        if (val === stato) opt.selected = true;
        select.appendChild(opt);
      });
    if (stato === 'Mio') select.classList.add('stato-mio');
    if (stato === 'Avversario') select.classList.add('stato-avv');
    select.addEventListener('change', () => {
      setStato(p.id, select.value);
      renderRoleView();
    });
    tdStato.appendChild(select);
    tr.appendChild(tdStato);

    tbody.appendChild(tr);
  });
}

// ---------- Sidebar suggerimenti ----------
const ROLE_LABELS = { P: 'portieri', D: 'difensori', C: 'centrocampisti', A: 'attaccanti' };

function renderSuggeriti() {
  document.getElementById('suggeriti-role-label').textContent = ROLE_LABELS[STATE.currentRole];
  const list = document.getElementById('suggeriti-list');
  const free = STATE.players
    .filter(p => p.ruolo === STATE.currentRole && getStato(p.id) === 'Libero')
    .sort((a, b) => b.fvm - a.fvm)
    .slice(0, 12);

  list.innerHTML = '';
  if (free.length === 0) {
    list.innerHTML = '<li class="suggeriti-empty">Nessun giocatore libero rimasto in questo ruolo.</li>';
    return;
  }
  free.forEach(p => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="sugg-name">${p.nome} <small style="color:var(--ink-faint)">${p.squadra}</small></span>
                     <span class="sugg-fvm">${p.fvm}</span>`;
    list.appendChild(li);
  });
}

// ---------- Contatori header ----------
function renderChips() {
  document.getElementById('chip-total').textContent = STATE.players.length;
  document.getElementById('chip-stats').textContent = STATE.players.filter(p => p.hasStats).length;
  const free = STATE.players.filter(p => getStato(p.id) === 'Libero').length;
  document.getElementById('chip-free').textContent = free;
}

function renderRoleView() {
  renderTableHead();
  renderTableBody();
  renderSuggeriti();
  renderChips();
}

// ---------- Vista Confronto ----------
function populateDatalist() {
  const dl = document.getElementById('players-datalist');
  dl.innerHTML = '';
  STATE.players.forEach(p => {
    const opt = document.createElement('option');
    opt.value = `${p.nome} (${p.squadra})`;
    opt.dataset.id = p.id;
    dl.appendChild(opt);
  });
}

function findPlayerByInputValue(val) {
  const match = val.match(/^(.*) \(([^()]+)\)$/);
  if (!match) return null;
  const [, nome, squadra] = match;
  return STATE.players.find(p => p.nome === nome && p.squadra === squadra) || null;
}

const COMPARE_ROWS = [
  { key: 'ruoloLabel', label: 'Ruolo' },
  { key: 'squadra', label: 'Squadra' },
  { key: 'qtA', label: 'Qt.A', lowerBetter: false },
  { key: 'fvm', label: 'FVM', better: true },
  { key: 'mv', label: 'Media voto', better: true, decimals: 2 },
  { key: 'fm', label: 'Fantamedia', better: true, decimals: 2 },
  { key: 'pv', label: 'Presenze', better: true },
  { key: 'gol', label: 'Gol', better: true },
  { key: 'assist', label: 'Assist', better: true },
  { key: 'rigParati', label: 'Rigori parati', better: true },
  { key: 'golSub', label: 'Gol subiti', better: false },
  { key: 'amm', label: 'Ammonizioni', better: false },
  { key: 'esp', label: 'Espulsioni', better: false },
];

function renderCompare() {
  const a = findPlayerByInputValue(document.getElementById('pick-a').value);
  const b = findPlayerByInputValue(document.getElementById('pick-b').value);
  const container = document.getElementById('compare-result');

  if (!a || !b) {
    container.innerHTML = '<p class="compare-empty">Scegli due giocatori dalle caselle sopra per confrontarli.</p>';
    return;
  }

  let rows = '';
  COMPARE_ROWS.forEach(r => {
    const av = a[r.key], bv = b[r.key];
    let aCls = '', bCls = '';
    if (r.better !== undefined && typeof av === 'number' && typeof bv === 'number' && av !== bv) {
      const aWins = r.better ? av > bv : av < bv;
      aCls = aWins ? 'win' : '';
      bCls = !aWins ? 'win' : '';
    }
    rows += `<tr>
      <td class="label">${r.label}</td>
      <td class="val ${aCls}">${fmt(av, r.decimals)}</td>
      <td class="val ${bCls}">${fmt(bv, r.decimals)}</td>
    </tr>`;
  });

  container.innerHTML = `
    <table>
      <thead>
        <tr><th></th><th>${a.nome}</th><th>${b.nome}</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// ---------- Event wiring ----------
function initTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const role = btn.dataset.role;
      if (role === 'COMPARE') {
        document.getElementById('view-role').classList.add('hidden');
        document.getElementById('view-compare').classList.remove('hidden');
      } else {
        document.getElementById('view-compare').classList.add('hidden');
        document.getElementById('view-role').classList.remove('hidden');
        STATE.currentRole = role;
        STATE.sortKey = 'fvm';
        STATE.sortDir = 'desc';
        renderRoleView();
      }
    });
  });
}

function initToolbar() {
  document.getElementById('search-box').addEventListener('input', (e) => {
    STATE.search = e.target.value;
    renderTableBody();
  });
  document.getElementById('only-free').addEventListener('change', (e) => {
    STATE.onlyFree = e.target.checked;
    renderTableBody();
  });
  document.getElementById('reset-stato').addEventListener('click', () => {
    if (confirm('Azzerare tutte le marcature Libero/Preso e ricominciare una nuova asta?')) {
      STATE.stato = {};
      saveStato();
      renderRoleView();
    }
  });
}

function initCompare() {
  document.getElementById('pick-a').addEventListener('input', renderCompare);
  document.getElementById('pick-b').addEventListener('input', renderCompare);
}

async function main() {
  loadStato();
  await loadPlayers();
  initTabs();
  initToolbar();
  initCompare();
  populateDatalist();
  renderRoleView();
}

main();
