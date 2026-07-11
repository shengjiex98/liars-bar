'use strict';

// ---------- tabs ----------

const TAB_KEY = 'liarsbar-tab';

function showTab(name) {
  document.querySelectorAll('#tabs .tab').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === name));
  $('#onlineTab').hidden = name !== 'online';
  $('#offlineTab').hidden = name !== 'offline';
  $('#roundLabel').hidden = name !== 'online';
  try { localStorage.setItem(TAB_KEY, name); } catch (e) {}
}

document.querySelectorAll('#tabs .tab').forEach(b =>
  b.addEventListener('click', () => showTab(b.dataset.tab)));

// ---------- offline gun tracker ----------

const OFF_KEY = 'liarsbar-offline';
const OFF_MIN = 2, OFF_MAX = 8;

let OFF = null; // { players: [{ name, bullet, pulls, alive }] }

function offSave() {
  try { localStorage.setItem(OFF_KEY, JSON.stringify(OFF)); } catch (e) {}
}

function offLoad() {
  try {
    const s = JSON.parse(localStorage.getItem(OFF_KEY));
    if (s && Array.isArray(s.players) && s.players.length >= OFF_MIN) return s;
  } catch (e) {}
  return null;
}

// --- setup view ---

function offAddNameRow(value = '') {
  const rows = $('#offNames');
  if (rows.children.length >= OFF_MAX) return;
  const row = document.createElement('div');
  row.className = 'name-row';
  row.innerHTML =
    `<input type="text" maxlength="14" placeholder="Player ${rows.children.length + 1}" enterkeyhint="next">` +
    `<button class="rm" aria-label="Remove player">✕</button>`;
  row.querySelector('input').value = value;
  row.querySelector('.rm').addEventListener('click', () => {
    if (rows.children.length > OFF_MIN) { row.remove(); offRefreshSetup(); }
  });
  rows.appendChild(row);
  offRefreshSetup();
}

function offRefreshSetup() {
  const rows = [...$('#offNames').children];
  rows.forEach((row, i) => {
    row.querySelector('input').placeholder = `Player ${i + 1}`;
    row.querySelector('.rm').disabled = rows.length <= OFF_MIN;
  });
  $('#offAddBtn').disabled = rows.length >= OFF_MAX;
}

function offShowSetup() {
  $('#offSetup').hidden = false;
  $('#offGame').hidden = true;
  const names = OFF ? OFF.players.map(p => p.name) : ['', '', '', ''];
  $('#offNames').innerHTML = '';
  names.forEach(n => offAddNameRow(n));
}

function offStart() {
  const names = [...$('#offNames').querySelectorAll('input')]
    .map((inp, i) => (inp.value.trim() || `Player ${i + 1}`).slice(0, 14));
  OFF = {
    players: names.map(name => ({ name, bullet: rand(6), pulls: 0, alive: true })),
  };
  offSave();
  offShowGame();
}

// --- game view ---

function cylinderSvg(p) {
  let chambers = '';
  for (let i = 0; i < 6; i++) {
    const a = (i * 60 - 90) * Math.PI / 180;
    const cx = 50 + 27 * Math.cos(a), cy = 50 + 27 * Math.sin(a);
    const spent = i < p.pulls;
    const fatal = !p.alive && i === p.bullet;
    chambers += `<circle class="ch ${spent || fatal ? 'spent' : ''}" cx="${cx}" cy="${cy}" r="11"/>`;
    if (fatal) chambers += `<circle class="fatal" cx="${cx}" cy="${cy}" r="15"/>` +
      `<text x="${cx}" y="${cy + 4.5}" text-anchor="middle" font-size="13">💥</text>`;
  }
  return `<svg class="cyl" viewBox="0 0 100 100" aria-hidden="true">` +
    `<circle class="frame" cx="50" cy="50" r="46"/>` +
    `<g class="rotor">${chambers}<circle class="pin" cx="50" cy="50" r="8"/></g>` +
    `</svg>`;
}

function offRender() {
  const alive = OFF.players.filter(p => p.alive);
  $('#offBanner').innerHTML = alive.length === 1
    ? `🏆 <b>${alive[0].name}</b> is the last one standing!`
    : `${alive.length} of ${OFF.players.length} still standing`;

  $('#offGrid').innerHTML = OFF.players.map((p, i) => {
    const odds = p.alive ? `1 in ${6 - p.pulls} next pull` : 'gone';
    return `<div class="gun-tile ${p.alive ? '' : 'dead'}" data-i="${i}">` +
      `<div class="gname">${escapeHtml(p.name)}</div>` +
      `<div class="odds">${odds}</div>` +
      cylinderSvg(p) +
      `<button class="fire-btn" data-fire="${i}" ${p.alive && alive.length > 1 ? '' : 'disabled'}>Pull trigger</button>` +
      `<div class="result"></div>` +
      (p.alive ? '' : '<div class="skull">💀</div>') +
      `</div>`;
  }).join('');
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let offFiring = false;

async function offFire(i) {
  if (offFiring) return;
  const p = OFF.players[i];
  if (!p.alive) return;
  offFiring = true;

  const tile = $(`#offGrid .gun-tile[data-i="${i}"]`);
  tile.querySelector('.cyl').classList.add('spin');
  tile.querySelector('.result').textContent = '…';
  document.querySelectorAll('#offGrid .fire-btn').forEach(b => b.disabled = true);
  await sleep(1200);

  const dead = p.pulls === p.bullet;
  if (dead) {
    p.alive = false;
    if (navigator.vibrate) navigator.vibrate(300);
  } else {
    p.pulls++;
    if (navigator.vibrate) navigator.vibrate(40);
  }
  offSave();
  offRender();
  const t = $(`#offGrid .gun-tile[data-i="${i}"] .result`);
  t.innerHTML = dead ? '<span class="bang">💥 BANG.</span>' : '<span class="click">😮‍💨 *click*</span>';
  offFiring = false;
}

function offShowGame() {
  $('#offSetup').hidden = true;
  $('#offGame').hidden = false;
  offRender();
}

function offReset() {
  for (const p of OFF.players) { p.bullet = rand(6); p.pulls = 0; p.alive = true; }
  offSave();
  offRender();
}

// --- events ---

$('#offAddBtn').addEventListener('click', () => offAddNameRow());
$('#offStartBtn').addEventListener('click', offStart);
$('#offEditBtn').addEventListener('click', offShowSetup);
$('#offResetBtn').addEventListener('click', offReset);
$('#offGrid').addEventListener('click', e => {
  const btn = e.target.closest('[data-fire]');
  if (btn) offFire(+btn.dataset.fire);
});

// --- init ---

OFF = offLoad();
if (OFF) offShowGame(); else offShowSetup();

let startTab = 'online';
try { startTab = localStorage.getItem(TAB_KEY) || 'online'; } catch (e) {}
showTab(startTab === 'offline' ? 'offline' : 'online');
