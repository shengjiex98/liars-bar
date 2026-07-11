'use strict';

const $ = sel => document.querySelector(sel);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rand = n => Math.floor(Math.random() * n);

const SUITS = {
  Q: { name: 'Queen', plural: 'Queens', icon: '♛' },
  K: { name: 'King',  plural: 'Kings',  icon: '♚' },
  A: { name: 'Ace',   plural: 'Aces',   icon: '♠' },
  J: { name: 'Joker', plural: 'Jokers', icon: '🃏' },
};
const HAND_ORDER = { Q: 0, K: 1, A: 2, J: 3 };
const BOT_NAMES = ['Rusty', 'Vega', 'Bruno'];
const MAX_PLAY = 3;

let G = null;
let selected = new Set(); // indices into the human hand

// ---------- game setup ----------

function newGame() {
  const seats = [{ name: 'You', human: true }, ...BOT_NAMES.map(name => ({ name }))];
  G = {
    players: seats.map((s, i) => ({
      i, name: s.name, human: !!s.human,
      hand: [], alive: true,
      bullet: rand(6), // fixed chamber holding the live round
      pulls: 0,        // trigger pulls survived so far
    })),
    round: 0,
    table: 'Q',
    lastPlay: null,    // { player, cards } — the only play that can be challenged
    priorClaims: 0,    // cards claimed earlier this round (no longer challengeable)
    turn: 0,
    humanTurn: false,
  };
  newRound(rand(G.players.length));
}

function buildDeck() {
  const d = [];
  for (const c of ['Q', 'K', 'A']) for (let k = 0; k < 6; k++) d.push(c);
  d.push('J', 'J');
  for (let i = d.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}

function newRound(starter) {
  G.round++;
  const deck = buildDeck();
  for (const p of G.players) {
    p.hand = p.alive ? deck.splice(0, 5) : [];
    p.hand.sort((a, b) => HAND_ORDER[a] - HAND_ORDER[b]);
  }
  G.table = ['Q', 'K', 'A'][rand(3)];
  G.lastPlay = null;
  G.priorClaims = 0;
  G.turn = nextAliveIdx(starter);
  selected.clear();
  render();
  setMsg(`Round ${G.round} — ${SUITS[G.table].plural} on the table.`);
  setTimeout(runTurn, 1100);
}

// ---------- helpers ----------

function alivePlayers() { return G.players.filter(p => p.alive); }
function isTruth(c) { return c === G.table || c === 'J'; }

function nextAliveIdx(from) {
  let i = from % G.players.length;
  for (let k = 0; k < G.players.length; k++) {
    if (G.players[i].alive) return i;
    i = (i + 1) % G.players.length;
  }
  return -1;
}

function pileTotal() {
  return G.priorClaims + (G.lastPlay ? G.lastPlay.cards.length : 0);
}

// ---------- turn engine ----------

async function runTurn() {
  const holders = alivePlayers().filter(p => p.hand.length > 0);

  if (holders.length === 0) {
    // everyone went out and the final play was never challenged
    await overlay(`<h2>Round over</h2><p>Everyone emptied their hands — the last play goes unchallenged. No one faces the gun.</p>`);
    return newRound(nextAliveIdx(G.turn));
  }

  const p = G.players[G.turn];
  if (!p.alive || p.hand.length === 0) {
    G.turn = (G.turn + 1) % G.players.length;
    return runTurn();
  }

  render();

  if (holders.length === 1 && holders[0] === p) {
    // last player still holding cards
    if (G.lastPlay) {
      setMsg(`${p.name} ${p.human ? 'are' : 'is'} the last with cards — forced to challenge!`);
      await sleep(1400);
      return resolveChallenge(p.i);
    }
    await overlay(`<h2>Caught holding</h2><p><b>${p.name}</b> ${p.human ? 'are' : 'is'} the only one left with cards. The bar demands a toll…</p>`);
    return shootout(p, null);
  }

  if (p.human) {
    G.humanTurn = true;
    render();
    setMsg(G.lastPlay ? 'Your turn — play cards or call Liar.' : 'Your turn — open the round.');
  } else {
    await sleep(1000 + rand(700));
    botAct(p);
  }
}

function endTurnAdvance() {
  G.turn = (G.turn + 1) % G.players.length;
  render();
  setTimeout(runTurn, 900);
}

function commitPlay(p, cards) {
  for (const c of cards) p.hand.splice(p.hand.indexOf(c), 1);
  if (G.lastPlay) G.priorClaims += G.lastPlay.cards.length;
  G.lastPlay = { player: p.i, cards };
  const n = cards.length;
  setMsg(`${p.name} play${p.human ? '' : 's'} ${n} card${n > 1 ? 's' : ''} — “${SUITS[G.table].plural}!”${p.hand.length === 0 ? ` ${p.human ? 'Your hand is' : 'They\'re'} empty.` : ''}`);
}

// ---------- human actions ----------

function humanPlay() {
  if (!G.humanTurn || selected.size < 1 || selected.size > MAX_PLAY) return;
  G.humanTurn = false;
  const me = G.players[0];
  const cards = [...selected].map(i => me.hand[i]);
  selected.clear();
  commitPlay(me, cards);
  endTurnAdvance();
}

function humanCall() {
  if (!G.humanTurn || !G.lastPlay) return;
  G.humanTurn = false;
  selected.clear();
  render();
  resolveChallenge(0);
}

// ---------- bot brain ----------

function botCallProb(bot) {
  const lp = G.lastPlay;
  if (!lp) return 0;
  const claimed = lp.cards.length;
  const knownTruths = bot.hand.filter(isTruth).length;
  // 6 table cards + 2 jokers exist; subtract ones the bot holds and ones already claimed
  const plausible = 8 - knownTruths - G.priorClaims;
  if (claimed > plausible) return 0.93; // claim can't (likely) be real
  let prob = 0.10 + 0.15 * (claimed - 1);
  if (G.players[lp.player].hand.length === 0) prob += 0.22; // they just went out — tempting target
  if (plausible - claimed <= 1) prob += 0.15;
  if (bot.pulls >= 3) prob -= 0.08; // gun is getting hot; be a bit more careful
  return Math.max(0.05, Math.min(prob, 0.9));
}

function botChoosePlay(bot) {
  const truths = bot.hand.filter(isTruth);
  const lies = bot.hand.filter(c => !isTruth(c));

  if (lies.length === 0) {
    return truths.slice(0, Math.min(MAX_PLAY, truths.length));
  }
  if (truths.length === 0) {
    // must lie: small lies are safer, but dump everything when close to empty
    const n = bot.hand.length <= 2 ? bot.hand.length : (Math.random() < 0.3 ? 2 : 1);
    return lies.slice(0, n);
  }
  // has both: usually tell the truth, occasionally slip a lie in with it
  let cards = truths.slice(0, Math.min(2, truths.length));
  if (Math.random() < 0.25 && cards.length < MAX_PLAY) cards = [...cards, lies[0]];
  if (Math.random() < 0.35 && cards.length > 1) cards = cards.slice(0, 1);
  return cards;
}

function botAct(bot) {
  if (G.lastPlay && Math.random() < botCallProb(bot)) {
    setMsg(`${bot.name} slams the table — “LIAR!”`);
    setTimeout(() => resolveChallenge(bot.i), 900);
    return;
  }
  commitPlay(bot, botChoosePlay(bot));
  endTurnAdvance();
}

// ---------- challenge & roulette ----------

function cardFace(c, cls = '') {
  return `<div class="card ${c === 'J' ? 'joker' : ''} ${cls}">` +
    `<span class="icon">${SUITS[c].icon}</span><span>${SUITS[c].name}</span></div>`;
}

async function resolveChallenge(challengerIdx) {
  G.humanTurn = false;
  render();
  const lp = G.lastPlay;
  const accused = G.players[lp.player];
  const challenger = G.players[challengerIdx];
  const truthful = lp.cards.every(isTruth);
  const loser = truthful ? challenger : accused;

  const revealed = lp.cards
    .map(c => cardFace(c, isTruth(c) ? 'reveal-good' : 'reveal-bad'))
    .join('');
  const verdict = truthful
    ? `All real ${SUITS[G.table].plural}. <b>${accused.name}</b> told the truth — <b>${challenger.name}</b> take${challenger.human ? '' : 's'} the gun.`
    : `<b>${accused.name}</b> LIED — and take${accused.human ? '' : 's'} the gun.`;

  await overlay(
    `<h2>${challenger.name} call${challenger.human ? '' : 's'} LIAR!</h2>` +
    `<p>${accused.name} claimed ${lp.cards.length} ${lp.cards.length === 1 ? SUITS[G.table].name : SUITS[G.table].plural}…</p>` +
    `<div class="revealed">${revealed}</div><p>${verdict}</p>`
  );

  shootout(loser, challengerIdx);
}

async function shootout(loser, challengerIdx) {
  const chamber = loser.pulls + 1;
  const dead = loser.pulls === loser.bullet;
  const el = ovShow(
    `<h2>🔫 ${loser.name}</h2>` +
    `<p>Chamber ${chamber} of 6…</p><div class="gun-line">🌀</div>`
  );
  await sleep(1600);

  if (dead) {
    loser.alive = false;
    el.innerHTML = `<h2>🔫 ${loser.name}</h2><p>Chamber ${chamber} of 6…</p>` +
      `<div class="gun-line">💥</div><div class="bang">BANG.</div>` +
      `<p>${loser.human ? 'You are' : `${loser.name} is`} out.</p>`;
    el.closest('.ov-box').classList.add('shake');
  } else {
    loser.pulls++;
    el.innerHTML = `<h2>🔫 ${loser.name}</h2><p>Chamber ${chamber} of 6…</p>` +
      `<div class="gun-line">😮‍💨</div><div class="click">*click*</div>` +
      `<p>${loser.human ? 'You survive' : `${loser.name} survives`} — this time.</p>` +
      `<p class="subtle">Next pull: 1 in ${6 - loser.pulls} odds of the bullet.</p>`;
  }
  await ovWait();

  const alive = alivePlayers();
  if (alive.length === 1) return gameOver(alive[0]);
  const starter = loser.alive ? loser.i
    : (challengerIdx !== null && G.players[challengerIdx].alive ? challengerIdx : nextAliveIdx(loser.i + 1));
  newRound(starter);
}

async function gameOver(winner) {
  render();
  await overlay(
    `<h2>${winner.human ? '🏆 You win!' : '☠️ Game over'}</h2>` +
    `<p><b>${winner.name}</b> ${winner.human ? 'are' : 'is'} the last one standing after ${G.round} round${G.round > 1 ? 's' : ''}.</p>`,
    'Play again'
  );
  newGame();
}

// ---------- overlay ----------

function ovShow(html) {
  const ov = $('#overlay');
  ov.hidden = false;
  $('#ovBtn').hidden = true;
  $('#ovContent').innerHTML = html;
  const box = ov.querySelector('.ov-box');
  box.classList.remove('shake');
  return $('#ovContent');
}

function ovWait(btnText = 'Continue') {
  return new Promise(res => {
    const btn = $('#ovBtn');
    btn.textContent = btnText;
    btn.hidden = false;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      btn.hidden = true;
      $('#overlay').hidden = true;
      res();
    };
    btn.onclick = finish;
    if (!G.players[0].alive && btnText === 'Continue') setTimeout(finish, 2200);
  });
}

async function overlay(html, btnText = 'Continue') {
  ovShow(html);
  await sleep(400);
  await ovWait(btnText);
}

// ---------- rendering ----------

function setMsg(text) {
  $('#msg').textContent = text;
}

function chambersHtml(p) {
  let h = '<span class="chambers">';
  for (let i = 0; i < 6; i++) h += `<i class="${i < p.pulls ? 'spent' : ''}"></i>`;
  return h + '</span>';
}

function render() {
  $('#roundLabel').textContent = G.round ? `Round ${G.round}` : '';

  // opponents
  $('#opponents').innerHTML = G.players.slice(1).map(p => {
    const cards = p.alive
      ? (p.hand.map(() => '<span class="mini-card"></span>').join('') || '<span style="font-size:.7rem;opacity:.6;line-height:22px">empty</span>')
      : '<span class="opp-dead-icon">💀</span>';
    return `<div class="opp ${p.alive && G.turn === p.i ? 'active' : ''} ${p.alive ? '' : 'dead'}">` +
      `<div class="opp-name">${p.name}</div>` +
      `<div class="opp-cards">${cards}</div>` +
      chambersHtml(p) + `</div>`;
  }).join('');

  // table
  const s = SUITS[G.table];
  $('#tableCard').innerHTML = `on the table<span class="big">${s.icon} ${s.plural.toUpperCase()}</span>`;
  const pile = pileTotal();
  $('#pileInfo').textContent = G.lastPlay
    ? `${G.players[G.lastPlay.player].name}'s last play: ${G.lastPlay.cards.length} card${G.lastPlay.cards.length > 1 ? 's' : ''} · pile: ${pile}`
    : (pile ? `pile: ${pile} cards` : 'fresh round — no cards played yet');

  // you
  const me = G.players[0];
  $('#youInfo').className = G.humanTurn ? 'active-turn' : '';
  $('#youInfo').innerHTML = me.alive
    ? `${G.humanTurn ? '▶ Your turn' : 'Your gun'} &nbsp;${chambersHtml(me)}`
    : `💀 You're out — watching the bots finish it. ${chambersHtml(me)}`;

  const hand = $('#hand');
  hand.className = G.humanTurn ? '' : 'disabled';
  hand.innerHTML = me.hand.map((c, i) =>
    `<button class="card ${c === 'J' ? 'joker' : ''} ${selected.has(i) ? 'selected' : ''}" data-i="${i}">` +
    `<span class="icon">${SUITS[c].icon}</span><span>${SUITS[c].name}</span></button>`
  ).join('');

  // actions
  $('#callBtn').disabled = !(G.humanTurn && G.lastPlay);
  $('#playBtn').disabled = !(G.humanTurn && selected.size >= 1 && selected.size <= MAX_PLAY);
  $('#playBtn').textContent = selected.size ? `Play ${selected.size}` : 'Play';
}

// ---------- events ----------

$('#hand').addEventListener('click', e => {
  const el = e.target.closest('.card');
  if (!el || !G.humanTurn) return;
  const i = +el.dataset.i;
  if (selected.has(i)) selected.delete(i);
  else if (selected.size < MAX_PLAY) selected.add(i);
  render();
});

$('#playBtn').addEventListener('click', humanPlay);
$('#callBtn').addEventListener('click', humanCall);
$('#helpBtn').addEventListener('click', () => { $('#helpModal').hidden = false; });
$('#helpClose').addEventListener('click', () => { $('#helpModal').hidden = true; });

newGame();
