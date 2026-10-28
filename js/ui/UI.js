'use strict';
/* =====================================================================
   DUST STRIKE — ui.js
   HUD, radar, tienda, menús, controles, pointer lock y bucle principal.
   ===================================================================== */

const $ = id => document.getElementById(id);

const ui = {
  canvas: $('view'),
  hud: $('hud'), menu: $('menu'), buy: $('buy'), pause: $('pause'),
  roundOver: $('roundOver'), gameOver: $('gameOver'), scoreboard: $('scoreboard'),
  lockHint: $('lockHint'),
  killfeed: $('killfeed'),
  hp: $('hp'), armor: $('armor'), money: $('money'),
  timer: $('timer'), scoreCT: $('scoreCT'), scoreT: $('scoreT'),
  bombStatus: $('bombStatus'), bombTimer: $('bombTimer'),
  roundLabel: $('roundLabel'),
  wname: $('wname'), mag: $('mag'), reserve: $('reserve'),
  prompt: $('prompt'), centerBanner: $('centerBanner'),
  bannerBig: $('bannerBig'), bannerSub: $('bannerSub'),
  defuseWrap: $('defuseWrap'), defuseFill: $('defuseFill'), defusePct: $('defusePct'),
  hitmarker: $('hitmarker'), dmgDir: $('dmgDir'), dmgFlash: $('dmgFlash'),
  lowhp: $('lowhp'),
  buyMoney: $('buyMoney'), buyClock: $('buyClock'), shopGrid: $('shopGrid'),
  buyToast: $('buyToast'), readyBtn: $('readyBtn'),
  roKicker: $('roKicker'), roTitle: $('roTitle'), roReason: $('roReason'),
  roScore: $('roScore'), roReward: $('roReward'), roBtn: $('roBtn'), roAuto: $('roAuto'),
  goKicker: $('goKicker'), goTitle: $('goTitle'), goSub: $('goSub'),
  goScore: $('goScore'), goKills: $('goKills'), goHS: $('goHS'), goAcc: $('goAcc'),
  bKills: $('bKills'), bDeaths: $('bDeaths'), bHs: $('bHs'),
  bAlive: $('bAlive'), bRound: $('bRound'), boardScore: $('boardScore'),
  radar: $('radar')
};

function safeGetStorage(key, fallback) {
  try {
    const val = localStorage.getItem(key);
    return val !== null ? val : fallback;
  } catch (e) {
    return fallback;
  }
}
function safeSetStorage(key, val) {
  try {
    localStorage.setItem(key, String(val));
  } catch (e) {}
}

game.sens = parseFloat(safeGetStorage('dust_sens', '2.2')) || 2.2;
game.difficulty = safeGetStorage('dust_diff', 'normal');
if (!DIFF[game.difficulty]) game.difficulty = 'normal';
game.crosshairColor = safeGetStorage('dust_crosshair', 'green');

const careerStats = {
  get roundsWon() { return parseInt(safeGetStorage('dust_stat_rw', '0'), 10) || 0; },
  get matchesWon() { return parseInt(safeGetStorage('dust_stat_mw', '0'), 10) || 0; },
  get kills() { return parseInt(safeGetStorage('dust_stat_k', '0'), 10) || 0; },
  get deaths() { return parseInt(safeGetStorage('dust_stat_d', '0'), 10) || 0; },
  get headshots() { return parseInt(safeGetStorage('dust_stat_hs', '0'), 10) || 0; },
  get shots() { return parseInt(safeGetStorage('dust_stat_sh', '0'), 10) || 0; },
  get hits() { return parseInt(safeGetStorage('dust_stat_h', '0'), 10) || 0; },
  recordKill(head) {
    safeSetStorage('dust_stat_k', this.kills + 1);
    if (head) safeSetStorage('dust_stat_hs', this.headshots + 1);
    updateCareerUI();
  },
  recordDeath() {
    safeSetStorage('dust_stat_d', this.deaths + 1);
    updateCareerUI();
  },
  recordShot(hit) {
    safeSetStorage('dust_stat_sh', this.shots + 1);
    if (hit) safeSetStorage('dust_stat_h', this.hits + 1);
    updateCareerUI();
  },
  recordRound(won) {
    if (won) safeSetStorage('dust_stat_rw', this.roundsWon + 1);
    updateCareerUI();
  },
  recordMatch(won) {
    if (won) safeSetStorage('dust_stat_mw', this.matchesWon + 1);
    updateCareerUI();
  }
};
window.careerStats = careerStats;

function updateCareerUI() {
  const k = careerStats.kills;
  const d = careerStats.deaths;
  const hs = careerStats.headshots;
  const kd = (k / Math.max(1, d)).toFixed(2);
  const hsPct = k > 0 ? Math.round((hs / k) * 100) + '%' : '0%';
  const mw = careerStats.matchesWon;

  if ($('statKd')) $('statKd').textContent = kd;
  if ($('statKills')) $('statKills').textContent = k;
  if ($('statHs')) $('statHs').textContent = hsPct;
  if ($('statWins')) $('statWins').textContent = mw;
}

const keys = Object.create(null);
let mouseDown = false;
let locked = false;
let shopBuilt = false;

/* ---------------------------------------------------------------------
   PANTALLAS / AVISOS
   --------------------------------------------------------------------- */
function hideAllScreens() {
  const screens = [ui.menu, ui.buy, ui.pause, ui.roundOver, ui.gameOver, ui.scoreboard, ui.lockHint, $('userModal'), $('mpLobby')];
  for (const el of screens) {
    if (el) el.classList.add('hidden');
  }
  const warn = document.querySelector('.plant-warning');
  if (warn) warn.remove();
}
function openBuyMenu() {
  hideAllScreens();
  ui.buy.classList.remove('hidden');
  ui.hud.classList.remove('hidden');
  updateShop();
  updateBuyPanel();
}
function showRoundOverUI() {
  if (game.state !== 'roundover' || game.roundOverShown) return;
  game.roundOverShown = true;
  const res = game.lastResult || { ctWin: false, reason: '' };
  const playerWon = (player.team === 'ct' && res.ctWin) || (player.team === 't' && !res.ctWin);
  ui.roKicker.textContent = `RONDA ${game.round} FINALIZADA · CT ${game.ctScore} — ${game.tScore} T`;
  ui.roTitle.textContent = playerWon ? 'RONDA GANADA' : 'RONDA PERDIDA';
  ui.roTitle.style.color = playerWon ? '#8cf0a2' : '#ff7a68';
  ui.roReason.textContent = res.reason;
  ui.roScore.textContent = `CT ${game.ctScore} — ${game.tScore} T`;
  ui.roReward.textContent = `+$${game.roundReward}`;
  ui.roBtn.textContent = game.matchOver ? 'VER RESULTADO ▶' : 'SIGUIENTE RONDA ▶';
  ui.roAuto.textContent = game.matchOver ? 'La partida ha terminado' : 'Pulsa ENTER o el botón para continuar';
  ui.roundOver.classList.remove('hidden');
  ui.lockHint.classList.add('hidden');
}
function showGameOver() {
  game.state = 'gameover';
  hideAllScreens();
  ui.hud.classList.add('hidden');
  ui.gameOver.classList.remove('hidden');
  const win = (player.team === 'ct' && game.ctScore > game.tScore) || (player.team === 't' && game.tScore > game.ctScore);
  ui.goKicker.textContent = win ? 'OPERACIÓN COMPLETADA' : 'OPERACIÓN FALLIDA';
  ui.goTitle.textContent = win ? 'VICTORIA' : 'DERROTA';
  ui.goTitle.style.color = win ? '#8cf0a2' : '#ff7a68';
  ui.goSub.textContent = win
    ? (player.team === 't' ? 'Los terroristas han dominado el sitio A con éxito.' : 'El sitio A ha resistido. Los terroristas se retiran y la operación es un éxito.')
    : (player.team === 't' ? 'Las fuerzas de seguridad han repelido el asalto terrorista.' : 'Los terroristas han completado su objetivo. El sitio A está perdido.');
  ui.goScore.textContent = `${game.ctScore} — ${game.tScore}`;
  ui.goKills.textContent = player.kills;
  ui.goHS.textContent = player.headshots;
  ui.goAcc.textContent = player.shots > 0 ? Math.round(player.hitsShots / player.shots * 100) + '%' : '0%';
  if (document.pointerLockElement) document.exitPointerLock();
  ui.lockHint.classList.add('hidden');
}
function quitToMenu() {
  game.state = 'menu';
  game.started = false;
  hideAllScreens();
  ui.hud.classList.add('hidden');
  ui.menu.classList.remove('hidden');
  ui.lockHint.classList.add('hidden');
  bots = [];
  corpses = [];
  particles = [];
  tracers = [];
  bomb.state = 'carried';
  bomb.carrier = null;
  if (document.pointerLockElement) document.exitPointerLock();
}

let bannerTimeout = null;
function banner(big, sub, kind, duration) {
  ui.bannerBig.textContent = big;
  ui.bannerSub.textContent = sub || '';
  ui.bannerBig.className = kind || '';
  ui.centerBanner.classList.add('show');
  if (bannerTimeout) clearTimeout(bannerTimeout);
  bannerTimeout = setTimeout(() => {
    ui.centerBanner.classList.remove('show');
  }, (duration || 2.2) * 1000);
}

let hitTimeout = null;
function showHitmarker(head) {
  ui.hitmarker.classList.remove('on');
  ui.hitmarker.classList.toggle('hs', !!head);
  void ui.hitmarker.offsetWidth;
  ui.hitmarker.classList.add('on');
  if (hitTimeout) clearTimeout(hitTimeout);
  hitTimeout = setTimeout(() => ui.hitmarker.classList.remove('on'), 240);
}

function addKillfeed(html) {
  const el = document.createElement('div');
  el.className = 'kf';
  el.innerHTML = html;
  ui.killfeed.appendChild(el);
  while (ui.killfeed.children.length > 5) ui.killfeed.removeChild(ui.killfeed.firstChild);
  setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 5200);
}

let toastTimeout = null;
function toast(text) {
  ui.buyToast.textContent = text;
  ui.buyToast.classList.add('on');
  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => ui.buyToast.classList.remove('on'), 1800);
}

/* ---------------------------------------------------------------------
   TIENDA
   --------------------------------------------------------------------- */
const SHOP = [
  {
    id: 'deagle', icon: 'deagle', name: 'DESERT EAGLE', price: 700,
    desc: 'Pistola .50 · 60 daño · disparo único',
    owned: () => player.slots[2] && player.slots[2].id === 'deagle',
    apply: () => { player.slots[2] = gunObj('deagle'); player.slot = 2; }
  },
  {
    id: 'mp5', icon: 'm4', name: 'MP5-SD', price: 1500,
    desc: 'Subfusil · automático · 26 daño · 750 RPM',
    owned: () => player.slots[1] && player.slots[1].id === 'mp5',
    apply: () => { player.slots[1] = gunObj('mp5'); player.slot = 1; }
  },
  {
    id: 'm4', icon: 'm4', name: 'M4A1-S', price: 3100,
    desc: 'Rifle de asalto CT · silenciado · 34 daño',
    owned: () => player.slots[1] && player.slots[1].id === 'm4',
    apply: () => { player.slots[1] = gunObj('m4'); player.slot = 1; }
  },
  {
    id: 'ak', icon: 'ak', name: 'AK-47', price: 2700,
    desc: 'Rifle de asalto T · alta potencia · 38 daño',
    owned: () => player.slots[1] && player.slots[1].id === 'ak',
    apply: () => { player.slots[1] = gunObj('ak'); player.slot = 1; }
  },
  {
    id: 'awp', icon: 'awp', name: 'AWP', price: 4750,
    desc: 'Francotirador · 122 daño · mira con clic derecho',
    owned: () => player.slots[1] && player.slots[1].id === 'awp',
    apply: () => { player.slots[1] = gunObj('awp'); player.slot = 1; }
  },
  {
    id: 'armor', icon: 'armor', name: 'CHALECO KEVLAR', price: 650,
    desc: 'Absorbe el 55% del daño recibido · se pierde al final de la ronda',
    owned: () => player.armor > 0,
    apply: () => { player.armor = 100; }
  },
  {
    id: 'kit', icon: 'kit', name: 'KIT DE DESACTIVACIÓN', price: 400,
    desc: 'Reduce la desactivación del C4 de 10s a 5s · permanente',
    owned: () => player.kit,
    apply: () => { player.kit = true; }
  }
];

function buildShop() {
  if (shopBuilt) return;
  shopBuilt = true;
  SHOP.forEach((item, i) => {
    const card = document.createElement('div');
    card.className = 'shop-card';
    card.dataset.index = i;
    card.innerHTML =
      `<div class="sc-key">${i + 1}</div>` +
      `<canvas class="sc-icon" width="240" height="80"></canvas>` +
      `<div class="sc-name">${item.name}</div>` +
      `<div class="sc-desc">${item.desc}</div>` +
      `<div class="sc-price">${item.price}</div>`;
    ui.shopGrid.appendChild(card);
    drawWeaponIcon(card.querySelector('canvas'), item.icon);
    card.addEventListener('click', () => buyItem(i));
  });
}

function updateShop() {
  if (!shopBuilt) return;
  ui.buyMoney.textContent = '$' + player.money;
  const cards = ui.shopGrid.children;
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i], item = SHOP[i];
    if (!item) continue;
    const owned = item.owned();
    const canBuy = !owned && player.money >= item.price && !game.buyExpired;
    card.classList.toggle('owned', owned);
    card.classList.toggle('cant', !owned && !canBuy);
    const priceEl = card.querySelector('.sc-price');
    if (owned) priceEl.textContent = item.id === 'kit' ? 'EQUIPADO' : 'EN TU EQUIPO';
    else priceEl.textContent = item.price;
  }
}

function buyItem(index) {
  if (game.state !== 'buy') return;
  const item = SHOP[index];
  if (!item) return;
  if (game.buyExpired) { toast('TIEMPO DE COMPRA AGOTADO'); sfxDeny(); return; }
  if (item.owned()) { toast('YA TIENES ESE EQUIPO'); sfxDeny(); return; }
  if (player.money < item.price) { toast('FONDOS INSUFICIENTES'); sfxDeny(); return; }
  player.money -= item.price;
  item.apply();
  refillAmmo();
  sfxBuy();
  toast(item.name + ' ADQUIRIDO');
  const card = ui.shopGrid.children[index];
  if (card) {
    card.classList.remove('flash');
    void card.offsetWidth;
    card.classList.add('flash');
    setTimeout(() => card.classList.remove('flash'), 350);
  }
  updateShop();
  updateHUD();
}

function updateBuyPanel() {
  if (!ui.buyMoney) return;
  ui.buyMoney.textContent = '$' + player.money;
  ui.buyClock.textContent = Math.ceil(Math.max(0, game.buyTimer));
}

/* ---------------------------------------------------------------------
   HUD
   --------------------------------------------------------------------- */
const hudCache = Object.create(null);
function setText(el, val) {
  if (!el) return;
  if (hudCache[el.id] !== val) { el.textContent = val; hudCache[el.id] = val; }
}
function fmtTime(s) {
  s = Math.max(0, s);
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return m + ':' + String(ss).padStart(2, '0');
}

function updateHUD() {
  if (!ui.hp) return;
  const def = getCurrentDef();
  const gun = getCurrentGun();
  setText(ui.hp, String(Math.max(0, Math.ceil(player.hp))));
  setText(ui.armor, String(Math.max(0, Math.ceil(player.armor))));
  setText(ui.scoreCT, String(game.ctScore));
  setText(ui.scoreT, String(game.tScore));
  setText(ui.money, String(player.money));
  setText(ui.roundLabel, 'RONDA ' + Math.max(1, game.round));
  setText(ui.wname, def ? def.name : '—');
  if (def && def.melee) {
    setText(ui.mag, '—');
    setText(ui.reserve, '');
  } else if (gun) {
    setText(ui.mag, String(gun.mag));
    setText(ui.reserve, '/ ' + gun.reserve);
  }

  // temporizador
  let timerText = '1:45', timerRed = false;
  if (game.state === 'buy') {
    timerText = fmtTime(game.buyTimer);
  } else if (bomb.state === 'planted') {
    timerText = fmtTime(bomb.timer);
    timerRed = true;
  } else {
    timerText = fmtTime(game.roundTime);
    timerRed = game.roundTime < 20;
  }
  setText(ui.timer, timerText);
  ui.timer.style.color = timerRed ? '#ff7a68' : '#f4efe2';

  // estado C4
  const showBomb = bomb.state === 'planted' && game.state !== 'menu';
  ui.bombStatus.classList.toggle('hidden', !showBomb);
  if (showBomb) setText(ui.bombTimer, Math.max(0, bomb.timer).toFixed(1));

  // plantado o desactivación
  const isPlanting = bomb.state === 'carried' && (bomb.plantProgress > 0.001 || player.planting);
  const isDefusing = bomb.state === 'planted' && (bomb.defuseProgress > 0.001 || player.defusing);
  const showBar = (isPlanting || isDefusing) && game.state !== 'menu';
  ui.defuseWrap.classList.toggle('hidden', !showBar);
  if (showBar) {
    if (isPlanting) {
      const pct = clamp(bomb.plantProgress / 3.2, 0, 1);
      ui.defuseFill.style.width = (pct * 100) + '%';
      ui.defuseFill.style.background = 'linear-gradient(90deg, #ff7a68, #ffb267)';
      ui.defuseLabel.innerHTML = `PLANTANDO C4 <span id="defusePct">${Math.floor(pct * 100)}%</span>`;
    } else {
      const pct = clamp(bomb.defuseProgress, 0, 1);
      ui.defuseFill.style.width = (pct * 100) + '%';
      ui.defuseFill.style.background = 'linear-gradient(90deg, #4fc3ff, #9ef0ff)';
      ui.defuseLabel.innerHTML = `DESACTIVANDO C4 <span id="defusePct">${Math.floor(pct * 100)}%</span>`;
    }
  }

  // prompts
  let prompt = '';
  if (game.state === 'live' && player.alive) {
    if (player.team === 'ct') {
      if (bomb.state === 'planted') {
        const d = dist2D(player.x, player.y, bomb.x, bomb.y);
        const still = Math.hypot(player.vx, player.vy) < 0.7;
        if (d < 1.75 && still) {
          prompt = `MANTÉN [E] PARA DESACTIVAR · ${player.kit ? 'KIT 5s' : '10s'}`;
        } else if (d < 4.5) {
          prompt = 'ACÉRCATE AL C4 Y MANTÉN [E] SIN MOVERTE';
        }
      }
    } else if (player.team === 't') {
      if (bomb.state === 'carried' && (bomb.carrier === player || player.hasBomb)) {
        const inSite = dist2D(player.x, player.y, SITE_CENTER.x, SITE_CENTER.y) < 3.8;
        if (inSite) {
          prompt = 'MANTÉN [E] PARA PLANTAR EL C4';
        } else {
          prompt = 'LLEVA EL C4 AL SITIO A PARA PLANTAR';
        }
      } else if (bomb.state === 'dropped') {
        const d = dist2D(player.x, player.y, bomb.x, bomb.y);
        if (d < 3.0) prompt = 'ACÉRCATE AL C4 PARA RECOGERLO';
      }
    }
    if (!prompt) {
      if (player.reload > 0) prompt = 'RECARGANDO…';
      else if (def && !def.melee && gun && gun.mag === 0) {
        prompt = gun.reserve > 0 ? 'SIN MUNICIÓN · PULSA [R] PARA RECARGAR' : 'SIN MUNICIÓN · CAMBIA DE ARMA [1] [2] [3]';
      }
    }
  }
  ui.prompt.textContent = prompt;
  ui.prompt.classList.toggle('on', !!prompt);

  // daño
  ui.dmgFlash.style.opacity = String(clamp(game.damageFlash, 0, 1) * 0.85);
  ui.lowhp.classList.toggle('on', player.alive && player.hp < 35 && game.state === 'live');
  if (game.damageDirTimer > 0) {
    ui.dmgDir.style.transform = `rotate(${game.damageDir * 180 / Math.PI}deg)`;
    ui.dmgDir.classList.add('on');
  } else {
    ui.dmgDir.classList.remove('on');
  }

  // candado del ratón
  const needLock = game.state === 'live' && player.alive && !locked;
  ui.lockHint.classList.toggle('hidden', !needLock);

  // tienda
  if (game.state === 'buy') {
    updateBuyPanel();
    if (game.buyExpired) {
      ui.buyClock.textContent = '0';
    }
  }

  // marcador
  if (!ui.scoreboard.classList.contains('hidden')) updateScoreboard();

  drawRadar();
}

function escHTML(s) {
  return String(s || '').replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c] || c));
}

function updateScoreboard() {
  if (ui.bRound) setText(ui.bRound, String(Math.max(1, game.round)));
  if (ui.boardScore) setText(ui.boardScore, `CT ${game.ctScore} — ${game.tScore} T`);
  const scoreCtEl = $('boardScoreCt');
  if (scoreCtEl) scoreCtEl.textContent = `${game.ctScore} RONDAS`;
  const scoreTEl = $('boardScoreT');
  if (scoreTEl) scoreTEl.textContent = `${game.tScore} RONDAS`;

  // Clasificar miembros de CT y T
  const ctMembers = [];
  const tMembers = [];

  // Jugador local
  const localObj = {
    name: player.name || (player.team === 'ct' ? 'OPERADOR CT' : 'OPERADOR T'),
    isPlayer: true,
    team: player.team,
    alive: !!player.alive,
    kills: player.kills || 0,
    deaths: player.deaths || 0,
    hs: player.headshots || 0
  };
  if (player.team === 'ct') ctMembers.push(localObj);
  else tMembers.push(localObj);

  // Jugadores remotos (multijugador)
  if (window.Multiplayer && typeof Multiplayer.getRemotePlayers === 'function') {
    const remotes = Multiplayer.getRemotePlayers();
    for (const rp of remotes) {
      const rpObj = {
        name: rp.name || 'JUGADOR',
        isPlayer: false,
        team: rp.team || 't',
        alive: rp.alive !== false,
        kills: rp.kills || 0,
        deaths: rp.deaths || 0,
        hs: rp.headshots || 0
      };
      if (rpObj.team === 'ct') ctMembers.push(rpObj);
      else tMembers.push(rpObj);
    }
  }

  // Bots
  for (const b of bots) {
    const bObj = {
      name: b.name || (b.team === 'ct' ? 'BOT CT' : 'BOT T'),
      isPlayer: false,
      team: b.team || 't',
      alive: !!b.alive,
      kills: b.kills || 0,
      deaths: b.alive ? 0 : 1,
      hs: b.hs || 0
    };
    if (bObj.team === 'ct') ctMembers.push(bObj);
    else tMembers.push(bObj);
  }

  function renderList(list, containerId) {
    const container = $(containerId);
    if (!container) return;
    let html = '';
    for (const m of list) {
      const statusClass = m.alive ? 'alive' : 'dead';
      const statusText = m.alive ? 'VIVO' : '☠';
      const rowClass = m.isPlayer ? 'board-row my-row' : 'board-row';
      const displayName = escHTML(m.name) + (m.isPlayer ? ' <small class="me-tag">(TÚ)</small>' : '');
      html += `<div class="${rowClass} ${statusClass}">
        <span class="p-name">${displayName}</span>
        <span class="p-status ${statusClass}">${statusText}</span>
        <span class="p-k">${m.kills}</span>
        <span class="p-d">${m.deaths}</span>
        <span class="p-hs">${m.hs}</span>
      </div>`;
    }
    container.innerHTML = html;
  }

  renderList(ctMembers, 'boardCtBody');
  renderList(tMembers, 'boardTBody');

  // Retrocompatibilidad con elementos simples
  if (ui.bKills) setText(ui.bKills, String(player.kills));
  if (ui.bDeaths) setText(ui.bDeaths, String(player.deaths));
  if (ui.bHs) setText(ui.bHs, String(player.headshots));
  if (ui.bAlive) setText(ui.bAlive, String(bots.filter(b => b.alive).length));

  const ctRow = document.querySelector('.ct-row span:first-child');
  if (ctRow) {
    ctRow.textContent = player.team === 'ct' ? `${player.name || 'TÚ'} · CT` : 'DEFENSORES CT';
  }
  const tRow = document.querySelector('.t-row span:first-child');
  if (tRow) {
    tRow.textContent = player.team === 't' ? `${player.name || 'TÚ'} · T` : 'FUERZAS T';
  }
}

/* ---------------------------------------------------------------------
   RADAR
   --------------------------------------------------------------------- */
const radarCtx = ui.radar.getContext('2d');
const radarBg = document.createElement('canvas');
radarBg.width = radarBg.height = 336;

function buildRadarBg() {
  const g = radarBg.getContext('2d');
  const s = 336 / MW;
  g.fillStyle = '#080a08';
  g.fillRect(0, 0, 336, 336);
  for (let y = 0; y < MH; y++) {
    for (let x = 0; x < MW; x++) {
      const cell = GRID[y * MW + x];
      let col;
      if (cell) {
        col = cell === 2 ? '#3a3126' : cell === 4 ? '#2c3a41' : '#302d27';
      } else {
        const f = FLOOR_MAP[y * MW + x];
        col = f === 2 ? '#7d4a33' : f === 1 ? '#56564c' : f === 3 ? '#4b5961' : '#6b5d42';
      }
      g.fillStyle = col;
      g.fillRect(x * s, y * s, s + 0.4, s + 0.4);
    }
  }
  // rejilla
  g.strokeStyle = 'rgba(0,0,0,.18)';
  g.lineWidth = 0.5;
  for (let i = 0; i <= MW; i++) {
    g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, 336); g.stroke();
    g.beginPath(); g.moveTo(0, i * s); g.lineTo(336, i * s); g.stroke();
  }
  // sitio A
  g.font = 'bold 15px monospace';
  g.fillStyle = 'rgba(255,210,120,.9)';
  g.fillText('A', 8.6 * s, 10 * s);
  g.fillStyle = 'rgba(233,215,180,.32)';
  g.font = 'bold 8px monospace';
  g.fillText('SITIO A', 4.4 * s, 15.4 * s);
  g.fillText('CT', 4.8 * s, 34.8 * s);
  g.fillText('T', 33.4 * s, 29.4 * s);
  g.strokeStyle = 'rgba(233,215,180,.18)';
  g.lineWidth = 1;
  g.strokeRect(0.5, 0.5, 335, 335);
}

function drawRadar() {
  if (!ui.radar) return;
  const g = radarCtx;
  const s = 336 / MW;
  g.clearRect(0, 0, 336, 336);
  g.drawImage(radarBg, 0, 0);

  // cono de visión
  g.save();
  g.translate(player.x * s, player.y * s);
  g.rotate(player.yaw);
  g.fillStyle = 'rgba(120,255,160,.075)';
  g.beginPath();
  g.moveTo(0, 0);
  g.arc(0, 0, s * 15, -0.68, 0.68);
  g.closePath();
  g.fill();
  g.restore();

  // C4
  if (bomb.state === 'planted' || bomb.state === 'dropped') {
    const blink = 0.45 + 0.55 * Math.abs(Math.sin(performance.now() / 250));
    g.save();
    g.translate(bomb.x * s, bomb.y * s);
    if (bomb.state === 'planted') {
      g.fillStyle = `rgba(255,90,60,${blink})`;
      g.beginPath(); g.arc(0, 0, 5.5, 0, TAU); g.fill();
      g.strokeStyle = `rgba(255,90,60,${blink * 0.6})`;
      g.lineWidth = 1.5;
      g.beginPath(); g.arc(0, 0, 10 + blink * 4, 0, TAU); g.stroke();
    } else {
      g.fillStyle = 'rgba(255,190,80,.9)';
      g.fillRect(-4, -4, 8, 8);
    }
    g.restore();
  }

  // terroristas (solo detectados o que han disparado)
  for (const b of bots) {
    if (!b.alive) continue;
    const d = dist2D(player.x, player.y, b.x, b.y);
    const visible = (d < 26 && losClear(player.x, player.y, b.x, b.y)) || b.reveal > 0;
    if (!visible) continue;
    const a = b.reveal > 0 && !(d < 26 && losClear(player.x, player.y, b.x, b.y)) ? 0.55 : 1;
    g.fillStyle = `rgba(255,80,60,${a})`;
    g.beginPath(); g.arc(b.x * s, b.y * s, 4.2, 0, TAU); g.fill();
    g.strokeStyle = `rgba(255,200,160,${a * 0.5})`;
    g.lineWidth = 1;
    g.beginPath(); g.arc(b.x * s, b.y * s, 6.4, 0, TAU); g.stroke();
  }

  // jugador
  g.save();
  g.translate(player.x * s, player.y * s);
  g.rotate(player.yaw);
  g.fillStyle = player.alive ? '#8cf0a2' : '#ff6a58';
  g.beginPath();
  g.moveTo(8, 0);
  g.lineTo(-5, -5.5);
  g.lineTo(-2, 0);
  g.lineTo(-5, 5.5);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,.7)'; g.lineWidth = 1; g.stroke();
  g.restore();
}

/* ---------------------------------------------------------------------
   MOVIMIENTO / ACTUALIZACIÓN DEL JUGADOR
   --------------------------------------------------------------------- */
function rotateToward(cur, target, maxDelta) {
  const d = angleDiff(target, cur);
  return cur + clamp(d, -maxDelta, maxDelta);
}

function updatePlayer(dt) {
  if (!player.alive) {
    player.eyeOff = lerp(player.eyeOff, -0.34, 1 - Math.exp(-dt * 5));
    player.recoilPitch *= Math.exp(-dt * 4);
    return;
  }
  player.fireCd = Math.max(0, player.fireCd - dt);
  player.viewKick = Math.max(0, player.viewKick - dt * 3.4);
  player.flashTimer = Math.max(0, player.flashTimer - dt);
  player.drawTimer = Math.max(0, player.drawTimer - dt);
  player.heat = Math.max(0, player.heat - dt * 0.7);
  player.recoilShots = Math.max(0, player.recoilShots - dt * 2.2);
  player.recoilPitch *= Math.exp(-dt * 4.8);
  player.recoilYaw *= Math.exp(-dt * 5.5);
  player.knifeSwing = Math.max(0, player.knifeSwing - dt);
  player.crossSpread = Math.max(0, player.crossSpread - dt * 28);

  if (player.reload > 0) {
    player.reload -= dt;
    if (player.reload <= 0) {
      const gun = getCurrentGun();
      const def = getCurrentDef();
      if (gun && def && !def.melee) {
        const take = Math.min(def.mag - gun.mag, gun.reserve);
        gun.mag += take;
        gun.reserve -= take;
      }
      player.reload = 0;
    }
  }

  const def = getCurrentDef();
  if (!def || !def.scope || player.reload > 0) player.scope = false;

  player.crouch = !!(keys.ControlLeft || keys.ControlRight || keys.KeyC);
  player.walking = !!(keys.ShiftLeft || keys.ShiftRight);

  let fwd = 0, strafe = 0;
  if (keys.KeyW) fwd += 1;
  if (keys.KeyS) fwd -= 1;
  if (keys.KeyD) strafe += 1;
  if (keys.KeyA) strafe -= 1;

  let dx = 0, dy = 0;
  if (fwd || strafe) {
    const fx = Math.cos(player.yaw), fy = Math.sin(player.yaw);
    const rx = -fy, ry = fx;
    dx = fx * fwd + rx * strafe;
    dy = fy * fwd + ry * strafe;
    const len = Math.hypot(dx, dy);
    dx /= len; dy /= len;
  }

  let speed = player.crouch ? 1.35 : player.walking ? 1.8 : 3.25;
  if (player.scope) speed = 1.35;
  if (player.reload > 0) speed *= 0.9;

  const targetVX = dx * speed;
  const targetVY = dy * speed;
  const accel = 1 - Math.exp(-dt * 13);
  player.vx += (targetVX - player.vx) * accel;
  player.vy += (targetVY - player.vy) * accel;
  if (Math.hypot(player.vx, player.vy) < 0.02) { player.vx = 0; player.vy = 0; }

  const moved = moveEntity(player, player.vx * dt, player.vy * dt, 0.28);
  if (!moved) { player.vx *= 0.4; player.vy *= 0.4; }

  const sp = Math.hypot(player.vx, player.vy);
  player.bob += sp * dt * 1.65;
  if (player.onGround && sp > 0.35) {
    player.stepDist += sp * dt;
    const stepLen = player.crouch ? 2.1 : player.walking ? 1.65 : 1.15;
    if (player.stepDist > stepLen) {
      player.stepDist = 0;
      const cx = Math.floor(player.x), cy = Math.floor(player.y);
      const cell = (cx >= 0 && cy >= 0 && cx < MW && cy < MH) ? GRID[cy * MW + cx] : 1;
      const floor = (cx >= 0 && cy >= 0 && cx < MW && cy < MH) ? FLOOR_MAP[cy * MW + cx] : 0;
      const surf = cell === 2 ? 'wood' : floor === 3 ? 'metal' : floor === 1 ? 'concrete' : 'sand';
      sfxFootstep(player.crouch ? 0.3 : player.walking ? 0.55 : 1, surf);
    }
  }

  if (player.jumpQueued) {
    player.jumpQueued = false;
    if (player.onGround) {
      player.vz = 3.15;
      player.onGround = false;
    }
  }
  if (!player.onGround) {
    player.z += player.vz * dt;
    player.vz -= 11 * dt;
    if (player.z <= 0) {
      player.z = 0;
      player.vz = 0;
      player.onGround = true;
      const cx = Math.floor(player.x), cy = Math.floor(player.y);
      const cell = (cx >= 0 && cy >= 0 && cx < MW && cy < MH) ? GRID[cy * MW + cx] : 1;
      const floor = (cx >= 0 && cy >= 0 && cx < MW && cy < MH) ? FLOOR_MAP[cy * MW + cx] : 0;
      const surf = cell === 2 ? 'wood' : floor === 3 ? 'metal' : floor === 1 ? 'concrete' : 'sand';
      sfxFootstep(1.15, surf);
    }
  }

  // Recogida de armas del suelo si la ranura primaria está vacía
  if (typeof droppedWeapons !== 'undefined') {
    for (let i = droppedWeapons.length - 1; i >= 0; i--) {
      const dw = droppedWeapons[i];
      const d = dist2D(player.x, player.y, dw.x, dw.y);
      if (d < 1.15) {
        if (!player.slots[1]) {
          player.slots[1] = { id: dw.id, mag: dw.mag, reserve: dw.reserve };
          droppedWeapons.splice(i, 1);
          sfxPickup();
          const wDef = WEAPONS[dw.id];
          toast('RECOGISTE ' + (wDef ? wDef.name : 'ARMA'));
          selectSlot(1);
          updateHUD();
          break;
        }
      }
    }
  }

  const targetEye = player.crouch ? -0.15 : 0;
  player.eyeOff += (targetEye - player.eyeOff) * (1 - Math.exp(-dt * 12));

  if (mouseDown && def && def.auto) tryShoot();
}

/* ---------------------------------------------------------------------
   ESTADOS DE ACTUALIZACIÓN
   --------------------------------------------------------------------- */
function updateAttract() {
  player.x = 13.3;
  player.y = 14.7;
  player.yaw = -2.12 + Math.sin(game.time * 0.075) * 0.55;
  player.pitch = -0.035 + Math.sin(game.time * 0.13) * 0.01;
  player.eyeOff = 0;
  player.z = 0;
  player.scope = false;
  player.alive = true;
  player.vx = 0; player.vy = 0;
}

function updateBuy(dt) {
  if (game.buyTimer > 0) {
    game.buyTimer = Math.max(0, game.buyTimer - dt);
    if (game.buyTimer <= 0 && !game.buyExpired) {
      game.buyExpired = true;
      updateShop();
      toast('TIEMPO DE COMPRA AGOTADO · PULSA TODO LISTO');
    }
  }
}

function updateLive(dt) {
  if (game.state !== 'live') return;

  if (bomb.state !== 'planted') {
    game.roundTime -= dt;
    if (game.roundTime <= 0) {
      game.roundTime = 0;
      endRound(true, 'Tiempo agotado · sitio A protegido');
      return;
    }
  }

  updatePlayer(dt);
  updateBots(dt);
  updateBomb(dt);
  updateEffects(dt);

  game.damageFlash = Math.max(0, game.damageFlash - dt * 1.6);
  game.damageDirTimer = Math.max(0, game.damageDirTimer - dt);

  if (!player.alive && game.state === 'live') {
    game.deathTimer -= dt;
    if (game.deathTimer <= 0) {
      const allDead = bots.length > 0 && bots.every(b => !b.alive);
      if (allDead && bomb.state !== 'planted') endRound(true, 'Terroristas eliminados');
      else endRound(false, 'Has caído en combate');
    }
  }
  if (game.state === 'live') checkRoundState();
}

function updateRoundOver(dt) {
  if (game.roundOverDelay > 0) {
    game.roundOverDelay -= dt;
    if (game.roundOverDelay <= 0) showRoundOverUI();
  }
}

/* ---------------------------------------------------------------------
   POINTER LOCK
   --------------------------------------------------------------------- */
function tryLockPointer() {
  if (game.state !== 'live') return;
  if (document.pointerLockElement) return;
  try {
    const p = ui.canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => { });
  } catch (e) { /* sin pointer lock */ }
}
function pauseGame() {
  if (game.state !== 'live') return;
  game.state = 'paused';
  mouseDown = false;
  ui.pause.classList.remove('hidden');
  ui.lockHint.classList.add('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
}
function resumeGame() {
  if (game.state !== 'paused') return;
  ui.pause.classList.add('hidden');
  game.state = 'live';
  ui.hud.classList.remove('hidden');
  tryLockPointer();
}

document.addEventListener('pointerlockchange', () => {
  const wasLocked = locked;
  locked = document.pointerLockElement === ui.canvas;
  if (!locked) {
    mouseDown = false;
    if (wasLocked && game.state === 'live') pauseGame();
  }
  ui.lockHint.classList.toggle('hidden', !(game.state === 'live' && player.alive && !locked));
});
document.addEventListener('pointerlockerror', () => {
  ui.lockHint.classList.remove('hidden');
});

/* ---------------------------------------------------------------------
   ENTRADA
   --------------------------------------------------------------------- */
window.addEventListener('keydown', (e) => {
  if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
  if (['Tab', 'Space', 'ControlLeft', 'ControlRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
    e.preventDefault();
  }
  keys[e.code] = true;

  if (e.code === 'Tab') { showScoreboard(true); return; }
  if (e.code === 'KeyM') { toggleMute(); return; }

  if (game.state === 'menu') {
    if (e.code === 'Enter') startMatch();
    return;
  }
  if (game.state === 'buy') {
    if (e.code === 'Enter' || e.code === 'NumpadEnter') beginLive();
    else if (/^(Digit|Numpad)[1-7]$/.test(e.code)) {
      const num = parseInt(e.code.replace(/^(Digit|Numpad)/, ''), 10);
      buyItem(num - 1);
    }
    return;
  }
  if (game.state === 'live') {
    if (e.code === 'KeyR' && !e.repeat) startReload();
    if (e.code === 'KeyG' && !e.repeat) dropCurrentWeapon();
    if ((e.code === 'KeyY' || e.code === 'KeyT') && !e.repeat) { openChat(); return; }
    if ((e.code === 'Digit1' || e.code === 'Numpad1') && !e.repeat) selectSlot(1);
    if ((e.code === 'Digit2' || e.code === 'Numpad2') && !e.repeat) selectSlot(2);
    if ((e.code === 'Digit3' || e.code === 'Numpad3') && !e.repeat) selectSlot(3);
    if (e.code === 'Space' && !e.repeat) player.jumpQueued = true;
    return;
  }
  if (game.state === 'paused') {
    if (e.code === 'Enter' || e.code === 'Escape') resumeGame();
    return;
  }
  if (game.state === 'roundover') {
    if (e.code === 'Enter') advanceRound();
    return;
  }
  if (game.state === 'gameover') {
    if (e.code === 'Enter') startMatch();
    return;
  }
});

window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
  if (e.code === 'Tab') showScoreboard(false);
});

document.addEventListener('mousemove', (e) => {
  if (!locked || game.state !== 'live' || !player.alive) return;
  const sens = game.sens * 0.0011 * (player.scope ? 0.42 : 1);
  player.yaw += e.movementX * sens;
  player.pitch = clamp(player.pitch - e.movementY * sens, -0.42, 0.42);
});

ui.canvas.addEventListener('mousedown', (e) => {
  ensureAudio();
  if (game.state === 'live' && !locked) { tryLockPointer(); return; }
  if (game.state !== 'live' || !locked) return;
  if (e.button === 0) {
    mouseDown = true;
    if (player.alive) tryShoot();
  } else if (e.button === 2) {
    e.preventDefault();
    toggleScope();
  }
});
window.addEventListener('mouseup', (e) => {
  if (e.button === 0) mouseDown = false;
});
ui.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
ui.lockHint.addEventListener('click', () => tryLockPointer());
ui.canvas.addEventListener('click', () => {
  if (game.state === 'live' && !locked) tryLockPointer();
});

window.addEventListener('wheel', (e) => {
  if (game.state !== 'live' || !player.alive) return;
  const availableSlots = [1, 2, 3].filter(s => player.slots[s]);
  if (availableSlots.length <= 1) return;
  const curIdx = availableSlots.indexOf(player.slot);
  let nextIdx;
  if (e.deltaY > 0) {
    nextIdx = (curIdx + 1) % availableSlots.length;
  } else if (e.deltaY < 0) {
    nextIdx = (curIdx - 1 + availableSlots.length) % availableSlots.length;
  }
  if (nextIdx !== undefined && availableSlots[nextIdx] !== player.slot) {
    selectSlot(availableSlots[nextIdx]);
  }
}, { passive: true });

function showScoreboard(show) {
  if (show) {
    if (!['live', 'paused', 'buy', 'roundover'].includes(game.state)) return;
    ui.scoreboard.classList.remove('hidden');
    updateScoreboard();
  } else {
    ui.scoreboard.classList.add('hidden');
  }
}

/* ---------------------------------------------------------------------
   BOTONES / MENÚ
   --------------------------------------------------------------------- */
function setSensitivity(v) {
  game.sens = clamp(parseFloat(v) || 2.2, 0.3, 8);
  safeSetStorage('dust_sens', String(game.sens));
  $('sens').value = game.sens;
  $('sens2').value = game.sens;
  $('sensVal').textContent = game.sens.toFixed(1);
  $('sensVal2').textContent = game.sens.toFixed(1);
  if (typeof Engine !== 'undefined' && Engine.input) {
    Engine.input.setSensitivity(game.sens);
  }
}

function setVolume(v) {
  game.volume = clamp(parseFloat(v) !== undefined && !isNaN(parseFloat(v)) ? parseFloat(v) : 0.5, 0, 1);
  safeSetStorage('dust_volume', String(game.volume));
  const s1 = $('volSlider'), s2 = $('volSlider2');
  if (s1) s1.value = game.volume;
  if (s2) s2.value = game.volume;
  const pct = Math.round(game.volume * 100) + '%';
  const v1 = $('volVal'), v2 = $('volVal2');
  if (v1) v1.textContent = pct;
  if (v2) v2.textContent = pct;
  if (typeof setMasterVolume === 'function') {
    setMasterVolume(game.volume);
  } else if (typeof master !== 'undefined' && master) {
    master.gain.value = game.muted ? 0 : game.volume;
  }
}

function setCrosshairColor(c) {
  game.crosshairColor = c || 'green';
  safeSetStorage('dust_crosshair', game.crosshairColor);
  document.querySelectorAll('.ch-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.color === game.crosshairColor);
  });
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
}

function openChat() {
  if (game.state !== 'live') return;
  const chatForm = $('chatForm');
  const chatInput = $('chatInput');
  if (!chatForm || !chatInput) return;
  chatForm.classList.remove('hidden');
  if (document.pointerLockElement) document.exitPointerLock();
  setTimeout(() => chatInput.focus(), 50);
}

function closeChat() {
  const chatForm = $('chatForm');
  const chatInput = $('chatInput');
  if (chatForm) chatForm.classList.add('hidden');
  if (chatInput) chatInput.value = '';
  if (game.state === 'live') tryLockPointer();
}

function addChatMessage(sender, team, text) {
  const container = $('chatMessages');
  if (!container) return;
  const msgEl = document.createElement('div');
  msgEl.className = 'chat-msg ' + (team === 'ct' ? 'ct' : 't');
  msgEl.innerHTML = `<b>${escHTML(sender)}:</b> ${escHTML(text)}`;
  container.appendChild(msgEl);
  while (container.children.length > 5) container.removeChild(container.firstChild);
  setTimeout(() => { if (msgEl.parentNode) msgEl.parentNode.removeChild(msgEl); }, 9000);
}

function initUI() {
  buildShop();
  buildRadarBg();
  setSensitivity(game.sens);
  const savedVol = parseFloat(safeGetStorage('dust_volume', '0.5'));
  setVolume(!isNaN(savedVol) ? savedVol : (game.volume !== undefined ? game.volume : 0.5));
  setCrosshairColor(game.crosshairColor);
  updateCareerUI();

  // detector táctil informativo
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0) {
    const tn = $('touchNotice');
    if (tn) tn.classList.remove('hidden');
  }

  // botones de color de mira
  document.querySelectorAll('.ch-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.color === game.crosshairColor);
    btn.addEventListener('click', () => setCrosshairColor(btn.dataset.color));
  });

  // botones de pantalla completa
  const fs1 = $('fsBtn'), fs2 = $('fsBtnPause');
  if (fs1) fs1.addEventListener('click', toggleFullscreen);
  if (fs2) fs2.addEventListener('click', toggleFullscreen);

  // chat táctico
  const chatForm = $('chatForm');
  const chatInput = $('chatInput');
  if (chatForm && chatInput) {
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const txt = (chatInput.value || '').trim();
      if (txt) {
        if (window.Multiplayer && Multiplayer.active) {
          Multiplayer.sendChat(txt);
        } else {
          addChatMessage(player.name || 'TÚ', player.team, txt);
        }
      }
      closeChat();
    });
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeChat();
      }
    });
  }

  // dificultad
  document.querySelectorAll('.diff').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.diff === game.difficulty);
    btn.addEventListener('click', () => {
      game.difficulty = btn.dataset.diff;
      safeSetStorage('dust_diff', game.difficulty);
      document.querySelectorAll('.diff').forEach(b => b.classList.toggle('active', b.dataset.diff === game.difficulty));
      ensureAudio();
    });
  });
  document.querySelectorAll('#sens, #sens2').forEach(inp => {
    inp.value = game.sens;
    inp.addEventListener('input', () => setSensitivity(inp.value));
  });
  document.querySelectorAll('#volSlider, #volSlider2').forEach(inp => {
    inp.value = game.volume !== undefined ? game.volume : 0.5;
    inp.addEventListener('input', () => setVolume(inp.value));
  });

  $('playBtn').addEventListener('click', startMatch);
  const playSingle = $('playSingleBtn');
  if (playSingle) playSingle.addEventListener('click', () => { game.mode = 'single'; startMatch(); });
  const openMp = $('openMpBtn');
  if (openMp) openMp.addEventListener('click', openMultiplayerLobby);
  const backLobby = $('backToMenuFromLobbyBtn');
  if (backLobby) backLobby.addEventListener('click', () => { hideAllScreens(); ui.menu.classList.remove('hidden'); });

  const createRoom = $('createRoomBtn');
  if (createRoom) createRoom.addEventListener('click', () => {
    Multiplayer.createRoom();
    $('lobbyJoinSection').classList.add('hidden');
    $('lobbyRoomSection').classList.remove('hidden');
    $('roomLinkInput').value = Multiplayer.getShareUrl();
  });

  const joinRoom = $('joinRoomBtn');
  if (joinRoom) joinRoom.addEventListener('click', () => {
    const code = ($('joinRoomCodeInput').value || '').trim();
    if (!code) { toast('INGRESA UN CÓDIGO DE SALA'); return; }
    Multiplayer.joinRoom(code);
    $('lobbyJoinSection').classList.add('hidden');
    $('lobbyRoomSection').classList.remove('hidden');
    $('roomLinkInput').value = Multiplayer.getShareUrl(code);
  });

  const copyLink = $('copyRoomLinkBtn');
  if (copyLink) copyLink.addEventListener('click', () => {
    const link = $('roomLinkInput').value || Multiplayer.getShareUrl();
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(link).then(() => {
        const prev = copyLink.textContent;
        copyLink.textContent = '¡COPIADO! ✓';
        setTimeout(() => copyLink.textContent = prev, 2000);
        toast('ENLACE COPIADO AL PORTAPAPELES');
      }).catch(() => toast('COPIA EL ENLACE MANUALMENTE'));
    } else {
      $('roomLinkInput').select();
      toast('COPIA EL ENLACE DEL CUADRO');
    }
  });

  const joinCt = $('joinCtBtn');
  if (joinCt) joinCt.addEventListener('click', () => Multiplayer.selectTeam('ct'));
  const joinT = $('joinTBtn');
  if (joinT) joinT.addEventListener('click', () => Multiplayer.selectTeam('t'));

  const fillCheck = $('fillBotsCheck');
  if (fillCheck) fillCheck.addEventListener('change', (e) => { Multiplayer.fillBots = e.target.checked; });

  const startMp = $('startMpMatchBtn');
  if (startMp) startMp.addEventListener('click', () => Multiplayer.startMatch());

  const leaveRoom = $('leaveRoomBtn');
  if (leaveRoom) leaveRoom.addEventListener('click', () => {
    Multiplayer.leaveRoom();
    $('lobbyJoinSection').classList.remove('hidden');
    $('lobbyRoomSection').classList.add('hidden');
  });

  ui.readyBtn.addEventListener('click', beginLive);
  $('resumeBtn').addEventListener('click', resumeGame);
  $('quitBtn').addEventListener('click', quitToMenu);
  ui.roBtn.addEventListener('click', advanceRound);
  $('goRestart').addEventListener('click', startMatch);
  $('goMenu').addEventListener('click', quitToMenu);

  window.addEventListener('blur', () => {
    mouseDown = false;
    for (const k in keys) keys[k] = false;
    showScoreboard(false);
  });

  if (typeof Engine !== 'undefined') {
    Engine.input.init(ui.canvas);
    Engine.input.setSensitivity(game.sens);

    Engine.fsm.register('menu', {
      enter() { game.state = 'menu'; },
      update(dt) { updateAttract(); }
    });
    Engine.fsm.register('buy', {
      enter() { game.state = 'buy'; },
      update(dt) { updateBuy(dt); }
    });
    Engine.fsm.register('live', {
      enter() { game.state = 'live'; },
      update(dt) { if (locked) updateLive(dt); }
    });
    Engine.fsm.register('roundover', {
      enter() { game.state = 'roundover'; },
      update(dt) { updateRoundOver(dt); }
    });
    Engine.fsm.register('paused', {
      enter() { game.state = 'paused'; },
      update(dt) {}
    });

    Engine.events.on('combat:damage', () => updateHUD());
    Engine.events.on('combat:kill', () => updateHUD());
    Engine.events.on('player:damage', () => updateHUD());
    Engine.events.on('weapon:fire', () => updateHUD());
    Engine.events.on('weapon:reload', () => updateHUD());
    Engine.events.on('weapon:switch', () => updateHUD());
    Engine.events.on('round:start', () => updateHUD());
    Engine.events.on('round:end', () => updateHUD());
  }

  initUsername();
}

function openMultiplayerLobby() {
  hideAllScreens();
  const lobby = $('mpLobby');
  if (lobby) lobby.classList.remove('hidden');
  const joinSec = $('lobbyJoinSection');
  const roomSec = $('lobbyRoomSection');
  if (Multiplayer.active || Multiplayer.inLobby) {
    if (joinSec) joinSec.classList.add('hidden');
    if (roomSec) roomSec.classList.remove('hidden');
  } else {
    if (joinSec) joinSec.classList.remove('hidden');
    if (roomSec) roomSec.classList.add('hidden');
  }
}

function initUsername() {
  player.name = (safeGetStorage('dust_username', '') || '').trim();
  const modal = $('userModal');
  const input = $('usernameInput');
  const err = $('usernameError');
  const display = $('displayUsername');
  const lobbyDisp = $('lobbyUsername');

  function updateDisplays() {
    const n = player.name || 'OPERADOR';
    if (display) display.textContent = n;
    if (lobbyDisp) lobbyDisp.textContent = n;
  }

  function submitName() {
    const val = (input.value || '').trim();
    if (val.length < 2 || val.length > 14) {
      if (err) err.classList.remove('hidden');
      return;
    }
    if (err) err.classList.add('hidden');
    player.name = val;
    safeSetStorage('dust_username', player.name);
    updateDisplays();
    if (modal) modal.classList.add('hidden');

    const autoRoom = Multiplayer.checkUrlForRoom();
    if (autoRoom) {
      openMultiplayerLobby();
      $('joinRoomCodeInput').value = autoRoom;
      $('joinRoomBtn').click();
    }
  }

  $('saveUsernameBtn').addEventListener('click', submitName);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submitName();
  });

  const editBtn = $('editUsernameBtn');
  if (editBtn) {
    editBtn.addEventListener('click', () => {
      input.value = player.name || '';
      if (err) err.classList.add('hidden');
      if (modal) modal.classList.remove('hidden');
      input.focus();
    });
  }

  if (!player.name) {
    if (modal) modal.classList.remove('hidden');
    setTimeout(() => input.focus(), 100);
  } else {
    updateDisplays();
    const autoRoom = Multiplayer.checkUrlForRoom();
    if (autoRoom) {
      openMultiplayerLobby();
      $('joinRoomCodeInput').value = autoRoom;
      $('joinRoomBtn').click();
    }
  }
}

/* ---------------------------------------------------------------------
   BUCLE PRINCIPAL (Motor por capas + FSM + ECS)
   --------------------------------------------------------------------- */
let lastFrame = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, Math.max(0, (now - lastFrame) / 1000));
  lastFrame = now;
  game.time += dt;

  Renderer.tick(dt);

  if (window.Multiplayer && Multiplayer.active) {
    Multiplayer.tick(now, dt);
  }

  if (typeof Engine !== 'undefined' && Engine.fsm) {
    Engine.fsm.update(dt);
    Engine.ecs.updateSystems(dt);
  } else {
    if (game.state === 'menu') {
      updateAttract();
    } else if (game.state === 'buy') {
      updateBuy(dt);
    } else if (game.state === 'live') {
      if (locked) updateLive(dt);
    } else if (game.state === 'roundover') {
      updateRoundOver(dt);
    }
  }

  Renderer.render();
  updateHUD();
}

initUI();
updateHUD();
requestAnimationFrame(loop);

/* API de depuración / pruebas */
window.DUST = {
  game, player, bomb,
  get bots() { return bots; },
  Engine: typeof Engine !== 'undefined' ? Engine : null,
  startMatch, nextRound, beginLive, endRound, advanceRound,
  buyItem, damageBot, damagePlayer, spawnBotsForRound,
  setSensitivity, setVolume, tryLockPointer, quitToMenu,
  benchmark(rounds = 30) {
    console.log(`%c[DUST STRIKE]%c Simulando benchmark de ${rounds} rondas...`, 'color:#e28d29;font-weight:bold', '');
    let ct = 0, t = 0;
    const start = performance.now();
    for (let i = 0; i < rounds; i++) {
      const ctWins = Math.random() < 0.52;
      if (ctWins) ct++; else t++;
    }
    const ms = (performance.now() - start).toFixed(1);
    console.table({
      'Rondas': rounds,
      'Victorias CT': `${ct} (${((ct / rounds) * 100).toFixed(1)}%)`,
      'Victorias T': `${t} (${((t / rounds) * 100).toFixed(1)}%)`,
      'Tiempo': `${ms} ms`
    });
    return { rounds, ct, t, ms };
  }
};
