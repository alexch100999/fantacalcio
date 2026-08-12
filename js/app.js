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
  onlyChiave: false,
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

async function loadAmichevoli() {
  try {
    const res = await fetch('data/amichevoli.json');
    if (!res.ok) return;
    const data = await res.json();
    const byKey = new Map();
    (data.giocatori || []).forEach(g => {
      byKey.set(normalizeKey(g.nome), g);
    });
    STATE.players.forEach(p => {
      const match = byKey.get(normalizeKey(p.nome));
      if (match) {
        p.golAmichevoli = match.golAmichevoli;
        p.assistAmichevoli = match.assistAmichevoli;
      }
    });
    STATE.amichevoliMeta = {
      analizzate: data.amichevoliAnalizzate,
      totali: data.amichevoliTotaliTrovate,
    };
  } catch (e) {
    // file assente o non ancora generato: va bene, il sito funziona comunque
  }
}

async function loadCalendario() {
  try {
    const res = await fetch('data/calendario.json');
    if (!res.ok) return;
    STATE.calendario = await res.json();
  } catch (e) {
    STATE.calendario = null;
  }
}

async function loadGerarchie() {
  try {
    const res = await fetch('data/gerarchie.json');
    if (!res.ok) return;
    const data = await res.json();
    STATE.gerarchie = data.filter(g => !g._commento && g.titolare && g.riserva);
  } catch (e) {
    STATE.gerarchie = [];
  }
}

async function loadAllenatori() {
  try {
    const res = await fetch('data/allenatori.json');
    if (!res.ok) return;
    const data = await res.json();
    STATE.allenatori = data.filter(a => a.squadra);

    const bySquadra = new Map();
    STATE.allenatori.forEach(a => bySquadra.set(a.squadra, a));

    STATE.players.forEach(p => {
      const info = bySquadra.get(p.squadra);
      if (!info) return;
      p.allenatore = info.allenatore || null;
      p.modulo = info.modulo || null;

      const chiave = (info.giocatoriChiave || []).find(g => normalizeKey(g.nome) === normalizeKey(p.nome));
      if (chiave) {
        p.giocatoreChiave = true;
        p.motivoChiave = chiave.motivo;
      }

      const nascosto = (info.nomiNascosti || []).find(g => normalizeKey(g.nome) === normalizeKey(p.nome));
      if (nascosto) {
        p.nomeNascosto = true;
        p.motivoNascosto = nascosto.motivo;
      }

      const penalizzato = (info.giocatoriPenalizzati || []).find(g => normalizeKey(g.nome) === normalizeKey(p.nome));
      if (penalizzato) {
        p.giocatorePenalizzato = true;
        p.motivoPenalizzato = penalizzato.motivo;
      }
    });
  } catch (e) {
    STATE.allenatori = [];
  }
}

// ---------- Matching nomi squadra tra fonti diverse ----------
function normalizeTeamName(name) {
  return normalizeKey(name)
    .replace(/^(ac |as |ss |ssc |us |hellas |uc |calcio )/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function findCalendarioSquadra(nomeSquadra) {
  if (!STATE.calendario || !STATE.calendario.squadre) return null;
  const keys = Object.keys(STATE.calendario.squadre);
  const target = normalizeTeamName(nomeSquadra);
  let match = keys.find(k => normalizeTeamName(k) === target);
  if (!match) {
    match = keys.find(k => normalizeTeamName(k).includes(target) || target.includes(normalizeTeamName(k)));
  }
  return match ? STATE.calendario.squadre[match] : null;
}

function normalizeKey(s) {
  return (s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

// ---------- Formattazione ----------
function fmt(val, decimals) {
  if (val === null || val === undefined || val === '') {
    return '<span class="no-data">—</span>';
  }
  if (decimals) return Number(val).toFixed(decimals);
  return String(val);
}

// ---------- Badge amichevoli ----------
function amichevoliBadge(p) {
  const g = p.golAmichevoli || 0;
  const a = p.assistAmichevoli || 0;
  if (g === 0 && a === 0) return '';
  const parts = [];
  if (g > 0) parts.push(`${g}⚽`);
  if (a > 0) parts.push(`${a}👟`);
  return ` <span class="amichevoli-badge" title="Amichevoli precampionato 2026/27">${parts.join(' ')}</span>`;
}

// ---------- Badge giocatore chiave ----------
function chiaveBadge(p) {
  if (!p.giocatoreChiave) return '';
  const motivo = p.motivoChiave ? ` — ${p.motivoChiave}` : '';
  const titolo = `Giocatore chiave${p.modulo ? ` nel modulo (${p.modulo})` : ''}${motivo}`;
  return ` <span class="chiave-badge" title="${titolo.replace(/"/g, '&quot;')}">★</span>`;
}

// ---------- Badge nome nascosto (alto potenziale) ----------
function nascostoBadge(p) {
  if (!p.nomeNascosto) return '';
  const motivo = p.motivoNascosto ? ` — ${p.motivoNascosto}` : '';
  const titolo = `Nome nascosto (alto potenziale)${motivo}`;
  return ` <span class="nascosto-badge" title="${titolo.replace(/"/g, '&quot;')}">💎</span>`;
}

// ---------- Badge giocatore penalizzato dalle idee dell'allenatore ----------
function penalizzatoBadge(p) {
  if (!p.giocatorePenalizzato) return '';
  const motivo = p.motivoPenalizzato ? ` — ${p.motivoPenalizzato}` : '';
  const titolo = `Potrebbe risentire delle idee dell'allenatore${motivo}`;
  return ` <span class="penalizzato-badge" title="${titolo.replace(/"/g, '&quot;')}">⚠</span>`;
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
  if (STATE.onlyChiave) {
    rows = rows.filter(p => p.giocatoreChiave);
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
      } else if (c.key === 'nome') {
        td.innerHTML = fmt(p[c.key], c.decimals) + chiaveBadge(p) + nascostoBadge(p) + penalizzatoBadge(p) + amichevoliBadge(p);
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

// ---------- Punteggio suggerimento (FVM + bonus potenziale) ----------
function punteggioSuggerimento(p) {
  let score = p.fvm;
  if (p.giocatoreChiave) score *= 1.15;     // giocatore segnalato come chiave nel modulo del suo allenatore
  if (p.nomeNascosto) score *= 1.08;        // nome ad alto potenziale secondo l'analisi tattica
  if (p.giocatorePenalizzato) score *= 0.88; // potrebbe risentire delle idee dell'allenatore
  return score;
}

function renderSuggeriti() {
  document.getElementById('suggeriti-role-label').textContent = ROLE_LABELS[STATE.currentRole];
  const list = document.getElementById('suggeriti-list');
  const free = STATE.players
    .filter(p => p.ruolo === STATE.currentRole && getStato(p.id) === 'Libero')
    .sort((a, b) => punteggioSuggerimento(b) - punteggioSuggerimento(a))
    .slice(0, 12);

  list.innerHTML = '';
  if (free.length === 0) {
    list.innerHTML = '<li class="suggeriti-empty">Nessun giocatore libero rimasto in questo ruolo.</li>';
    return;
  }
  free.forEach(p => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="sugg-name">${p.nome}${chiaveBadge(p)}${nascostoBadge(p)}${penalizzatoBadge(p)} <small style="color:var(--ink-faint)">${p.squadra}</small></span>
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

// ---------- Coppie portieri (per calendario) ----------
function computeGoalkeeperPairs() {
  if (!STATE.calendario) return [];

  const keepers = STATE.players.filter(p => p.ruolo === 'P');
  const scheduleByKeeper = new Map();
  keepers.forEach(k => {
    const sched = findCalendarioSquadra(k.squadra);
    if (sched) {
      const byGiornata = new Map();
      sched.forEach(g => { if (g.giornata) byGiornata.set(g.giornata, g.difficolta); });
      scheduleByKeeper.set(k.id, byGiornata);
    }
  });

  const usable = keepers.filter(k => scheduleByKeeper.has(k.id));
  const pairs = [];

  for (let i = 0; i < usable.length; i++) {
    for (let j = i + 1; j < usable.length; j++) {
      const a = usable[i], b = usable[j];
      if (a.squadra === b.squadra) continue; // stessa squadra, non ha senso come coppia
      const schedA = scheduleByKeeper.get(a.id);
      const schedB = scheduleByKeeper.get(b.id);
      const giornateComuni = [...schedA.keys()].filter(g => schedB.has(g));
      if (giornateComuni.length < 20) continue; // dati insufficienti per un confronto sensato

      let sommaMin = 0;
      giornateComuni.forEach(g => {
        sommaMin += Math.min(schedA.get(g), schedB.get(g));
      });
      const diffMedia = sommaMin / giornateComuni.length;

      pairs.push({
        a, b,
        diffMedia: Math.round(diffMedia * 10) / 10,
        qtaTot: a.qtA + b.qtA,
        giornateAnalizzate: giornateComuni.length,
      });
    }
  }

  pairs.sort((x, y) => x.diffMedia - y.diffMedia);
  return pairs.slice(0, 25);
}

function renderCoppiePortieri() {
  const tbody = document.getElementById('coppie-portieri-tbody');
  const note = document.getElementById('coppie-portieri-note');

  if (!STATE.calendario) {
    tbody.innerHTML = '<tr><td colspan="6" class="no-data">Calendario non ancora disponibile — esegui la GitHub Action "Aggiorna calendario e difficoltà".</td></tr>';
    return;
  }

  const pairs = computeGoalkeeperPairs();
  note.textContent = `Basato su ${STATE.calendario.squadre ? Object.keys(STATE.calendario.squadre).length : 0} squadre, stagione ${STATE.calendario.stagione}. Difficoltà stimata dal FVM medio della rosa avversaria — è un'approssimazione.`;

  if (pairs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" class="no-data">Nessuna coppia calcolabile con i dati attuali.</td></tr>';
    return;
  }

  tbody.innerHTML = pairs.map(p => `
    <tr>
      <td class="col-nome">${p.a.nome}</td><td class="col-squadra">${p.a.squadra}</td>
      <td class="col-nome">${p.b.nome}</td><td class="col-squadra">${p.b.squadra}</td>
      <td>${p.diffMedia}</td><td>${p.qtaTot}</td>
    </tr>
  `).join('');
}

// ---------- Coppie titolare-riserva (da gerarchie.json) ----------
function renderCoppieGerarchie() {
  const container = document.getElementById('coppie-gerarchie-container');
  const gerarchie = STATE.gerarchie || [];

  if (gerarchie.length === 0) {
    container.innerHTML = '<p class="coppie-note">Nessuna gerarchia inserita ancora in data/gerarchie.json.</p>';
    return;
  }

  const byRuolo = { D: [], C: [], A: [] };
  gerarchie.forEach(g => {
    const titolare = STATE.players.find(p => normalizeKey(p.nome) === normalizeKey(g.titolare) && p.squadra === g.squadra);
    const riserva = STATE.players.find(p => normalizeKey(p.nome) === normalizeKey(g.riserva) && p.squadra === g.squadra);
    if (titolare && riserva && byRuolo[g.ruolo]) {
      byRuolo[g.ruolo].push({ squadra: g.squadra, titolare, riserva, ballottaggio: g.ballottaggio });
    }
  });

  let html = '';
  Object.entries(ROLE_LABELS).forEach(([code, label]) => {
    if (code === 'P' || !byRuolo[code] || byRuolo[code].length === 0) return;
    html += `<h3 class="coppie-subhead">${label[0].toUpperCase() + label.slice(1)}</h3>
      <div class="table-wrap"><table>
        <thead><tr>
          <th class="col-squadra">Squadra</th>
          <th class="col-nome">Titolare</th><th>Qt.A</th>
          <th class="col-nome">Riserva</th><th>Qt.A</th>
          <th>Ballottaggio</th>
          <th>Costo coppia</th>
        </tr></thead>
        <tbody>`;
    byRuolo[code]
      .sort((x, y) => (x.titolare.qtA + x.riserva.qtA) - (y.titolare.qtA + y.riserva.qtA))
      .forEach(row => {
        html += `<tr>
          <td class="col-squadra">${row.squadra}</td>
          <td class="col-nome">${row.titolare.nome}${chiaveBadge(row.titolare)}${nascostoBadge(row.titolare)}${amichevoliBadge(row.titolare)}</td><td>${row.titolare.qtA}</td>
          <td class="col-nome">${row.riserva.nome}${chiaveBadge(row.riserva)}${nascostoBadge(row.riserva)}${amichevoliBadge(row.riserva)}</td><td>${row.riserva.qtA}</td>
          <td class="ballottaggio-pct">${row.ballottaggio || ''}</td>
          <td>${row.titolare.qtA + row.riserva.qtA}</td>
        </tr>`;
      });
    html += '</tbody></table></div>';
  });

  container.innerHTML = html || '<p class="coppie-note">Le gerarchie inserite non corrispondono a nessun giocatore nel listone (controlla nomi/squadra).</p>';
}

function renderCoppieView() {
  renderCoppiePortieri();
  renderCoppieGerarchie();
}

// ---------- Vista Formazioni ----------
function starRating(value) {
  const full = Math.floor(value);
  const half = value - full >= 0.5;
  let html = '';
  for (let i = 0; i < full; i++) html += '★';
  if (half) html += '⯪';
  for (let i = full + (half ? 1 : 0); i < 5; i++) html += '☆';
  return `<span class="star-rating" title="${value}/5">${html}</span>`;
}

function populateFormazioniSelect() {
  const select = document.getElementById('formazioni-select');
  const squadre = (STATE.allenatori || []).map(a => a.squadra).sort();
  select.innerHTML = squadre.map(s => `<option value="${s}">${s}</option>`).join('');
}

function renderFormazione(squadraSelezionata) {
  const container = document.getElementById('formazioni-content');
  const info = (STATE.allenatori || []).find(a => a.squadra === squadraSelezionata);

  if (!info) {
    container.innerHTML = '<p class="coppie-note">Nessun dato disponibile per questa squadra.</p>';
    return;
  }

  const roleOrder = { P: 0, D: 1, C: 2, A: 3 };
  const formazionePlayers = (info.probabileFormazione || [])
    .map(nome => STATE.players.find(p => p.squadra === squadraSelezionata && normalizeKey(p.nome) === normalizeKey(nome)))
    .filter(Boolean)
    .sort((a, b) => (roleOrder[a.ruolo] ?? 9) - (roleOrder[b.ruolo] ?? 9));

  const formazioneHtml = formazionePlayers.map(p => `
    <li class="formazione-riga">
      <span class="formazione-ruolo">${p.ruolo}</span>
      <span class="col-nome">${p.nome}${chiaveBadge(p)}${nascostoBadge(p)}</span>
      <span class="formazione-squadra-mini">${p.qtA} Qt.A</span>
    </li>`).join('');

  const puntiChiaveHtml = (info.puntiChiave || []).map(pc => {
    const cls = pc.positivo === true ? 'punto-positivo' : pc.positivo === false ? 'punto-negativo' : '';
    const icona = pc.positivo === true ? '＋' : pc.positivo === false ? '－' : '•';
    return `<li class="${cls}"><span class="punto-icona">${icona}</span>${pc.testo}</li>`;
  }).join('');

  const chiaveHtml = (info.giocatoriChiave || []).map(g => `
    <div class="motivo-riga"><strong>${g.nome}</strong> — ${g.motivo}</div>`).join('') || '<p class="coppie-note">Nessuno segnalato.</p>';

  const nascostiHtml = (info.nomiNascosti || []).map(g => `
    <div class="motivo-riga">💎 <strong>${g.nome}</strong> — ${g.motivo}</div>`).join('') || '<p class="coppie-note">Nessuno segnalato.</p>';

  const penalizzatiHtml = (info.giocatoriPenalizzati || []).map(g => `
    <div class="motivo-riga motivo-penalizzato">⚠ <strong>${g.nome}</strong> — ${g.motivo}</div>`).join('') || '<p class="coppie-note">Nessuno segnalato.</p>';

  container.innerHTML = `
    <div class="formazioni-grid">
      <div class="formazioni-card">
        <h2>${info.allenatore} <span class="modulo-tag">${info.modulo}</span></h2>
        <div class="rating-row"><span>Attacco</span> ${starRating(info.attacco)}</div>
        <div class="rating-row"><span>Difesa</span> ${starRating(info.difesa)}</div>
        <h3 class="coppie-subhead">Punti chiave</h3>
        <ul class="punti-chiave-list">${puntiChiaveHtml}</ul>
      </div>

      <div class="formazioni-card">
        <h3 class="coppie-subhead">Probabile formazione</h3>
        <ul class="formazione-list">${formazioneHtml}</ul>
      </div>

      <div class="formazioni-card">
        <h3 class="coppie-subhead">★ Giocatori chiave e perché</h3>
        ${chiaveHtml}
      </div>

      <div class="formazioni-card">
        <h3 class="coppie-subhead">💎 Nomi nascosti (alto potenziale)</h3>
        ${nascostiHtml}
      </div>

      <div class="formazioni-card">
        <h3 class="coppie-subhead">⚠ Giocatori penalizzati dalle idee dell'allenatore</h3>
        ${penalizzatiHtml}
      </div>
    </div>`;
}

function initFormazioni() {
  populateFormazioniSelect();
  const select = document.getElementById('formazioni-select');
  select.addEventListener('change', () => renderFormazione(select.value));
  if (select.options.length > 0) renderFormazione(select.options[0].value);
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
  { key: 'allenatore', label: 'Allenatore', text: true },
  { key: 'modulo', label: 'Modulo', text: true },
  { key: 'giocatoreChiave', label: 'Chiave nel modulo', bool: true },
  { key: 'nomeNascosto', label: 'Nome nascosto 💎', bool: true },
  { key: 'giocatorePenalizzato', label: 'Penalizzato dal mister ⚠', bool: true, invert: true },
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
  { key: 'golAmichevoli', label: 'Gol amichevoli', better: true },
  { key: 'assistAmichevoli', label: 'Assist amichevoli', better: true },
];

function fmtCompareVal(row, val) {
  if (row.bool) {
    const icon = row.invert ? '⚠' : '★';
    return val ? `${icon} sì` : 'no';
  }
  if (row.text) return val || '<span class="no-data">—</span>';
  return fmt(val, row.decimals);
}

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
    if (r.bool && av !== bv) {
      const aGood = r.invert ? !av : av;
      const bGood = r.invert ? !bv : bv;
      aCls = aGood ? 'win' : '';
      bCls = bGood ? 'win' : '';
    }
    rows += `<tr>
      <td class="label">${r.label}</td>
      <td class="val ${aCls}">${fmtCompareVal(r, av)}</td>
      <td class="val ${bCls}">${fmtCompareVal(r, bv)}</td>
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
      document.getElementById('view-role').classList.add('hidden');
      document.getElementById('view-compare').classList.add('hidden');
      document.getElementById('view-coppie').classList.add('hidden');
      document.getElementById('view-formazioni').classList.add('hidden');

      if (role === 'COMPARE') {
        document.getElementById('view-compare').classList.remove('hidden');
      } else if (role === 'COPPIE') {
        document.getElementById('view-coppie').classList.remove('hidden');
        renderCoppieView();
      } else if (role === 'FORMAZIONI') {
        document.getElementById('view-formazioni').classList.remove('hidden');
      } else {
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
  document.getElementById('only-chiave').addEventListener('change', (e) => {
    STATE.onlyChiave = e.target.checked;
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
  await loadAmichevoli();
  await loadCalendario();
  await loadGerarchie();
  await loadAllenatori();
  initTabs();
  initToolbar();
  initCompare();
  initFormazioni();
  populateDatalist();
  renderRoleView();
}

main();
