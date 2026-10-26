'use strict';
/* =====================================================================
   DUST STRIKE — game.js
   Núcleo: armas, jugador, economía, flujo de rondas y sonido.
   ===================================================================== */

const WEAPONS = {
  usp: {
    id: 'usp', name: 'USP-S', slot: 2, dmg: 26, hs: 3.4, rpm: 400, mag: 12, reserve: 36,
    auto: false, spread: 0.0065, moveSpread: 0.022, kick: 0.010, reload: 2.2, sound: 'pistol'
  },
  deagle: {
    id: 'deagle', name: 'DESERT EAGLE', slot: 2, dmg: 60, hs: 3.0, rpm: 240, mag: 7, reserve: 35,
    auto: false, spread: 0.012, moveSpread: 0.032, kick: 0.028, reload: 2.4, sound: 'pistol'
  },
  mp5: {
    id: 'mp5', name: 'MP5-SD', slot: 1, dmg: 26, hs: 2.6, rpm: 750, mag: 30, reserve: 90,
    auto: true, spread: 0.012, moveSpread: 0.020, kick: 0.007, reload: 2.8, sound: 'smg'
  },
  m4: {
    id: 'm4', name: 'M4A1-S', slot: 1, dmg: 34, hs: 3.1, rpm: 600, mag: 30, reserve: 90,
    auto: true, spread: 0.011, moveSpread: 0.028, kick: 0.009, reload: 3.1, sound: 'rifle'
  },
  awp: {
    id: 'awp', name: 'AWP', slot: 1, dmg: 122, hs: 2.0, rpm: 41, mag: 10, reserve: 30,
    auto: false, spread: 0.055, scopedSpread: 0.0012, moveSpread: 0.07, kick: 0.05, reload: 3.6,
    sound: 'awp', scope: true
  },
  knife: {
    id: 'knife', name: 'CUCHILLO', slot: 3, dmg: 58, hs: 2.0, rpm: 75, mag: 0, reserve: 0,
    auto: false, spread: 0, moveSpread: 0, kick: 0, reload: 0, sound: 'knife', melee: true
  }
};

const BOT_WEAPONS = {
  mp5: { dmg: 10, interval: 0.10, burstPause: 0.9, acc: 0.95, sound: 'smg' },
  ak: { dmg: 15, interval: 0.13, burstPause: 1.0, acc: 0.9, sound: 'rifle' },
  deagle: { dmg: 24, interval: 0.42, burstPause: 0.75, acc: 1.1, sound: 'pistol' }
};

const DIFF = {
  easy: { hit: 0.27, reaction: 0.55, dmg: 0.82, label: 'RECLUTA' },
  normal: { hit: 0.39, reaction: 0.38, dmg: 1.0, label: 'SOLDADO' },
  hard: { hit: 0.54, reaction: 0.24, dmg: 1.15, label: 'VETERANO' }
};

const BUY_TIME = 25;
const ROUND_TIME = 105;
const BOMB_TIME = 40;
const TARGET_SCORE = 8;
const MAX_MONEY = 16000;

const game = {
  state: 'menu',
  difficulty: 'normal',
  round: 0,
  ctScore: 0,
  tScore: 0,
  matchOver: false,
  buyTimer: BUY_TIME,
  buyExpired: false,
  roundTime: ROUND_TIME,
  buyPhase: 0,
  time: 0,
  damageFlash: 0,
  damageDir: 0,
  damageDirTimer: 0,
  deathTimer: 0,
  roundOverDelay: 0,
  roundOverShown: false,
  lastResult: null,
  roundReward: 0,
  siteClearShown: false,
  muted: false,
  started: false
};

const player = {
  x: CT_SPAWN.x, y: CT_SPAWN.y, yaw: CT_SPAWN.yaw, pitch: -0.02,
  vx: 0, vy: 0, vz: 0, z: 0, eyeOff: 0,
  hp: 100, armor: 0, kit: false, alive: true,
  crouch: false, walking: false, onGround: true, jumpQueued: false,
  slots: {
    1: null,
    2: { id: 'usp', mag: 12, reserve: 36 },
    3: { id: 'knife', mag: 0, reserve: 0 }
  },
  slot: 2,
  money: 800,
  kills: 0, deaths: 0, headshots: 0, shots: 0, hitsShots: 0,
  fireCd: 0, reload: 0, reloadTotal: 1, drawTimer: 0,
  recoilPitch: 0, recoilYaw: 0, recoilShots: 0, heat: 0,
  scope: false, flashTimer: 0, viewKick: 0,
  bob: 0, stepDist: 0,
  defusing: false, planting: false, crossSpread: 0,
  knifeSwing: 0,
  team: 'ct',
  name: 'OPERADOR'
};

let bots = [];
let corpses = [];
let particles = [];
let tracers = [];

const bomb = {
  state: 'carried',
  x: 0, y: 0,
  carrier: null,
  timer: BOMB_TIME,
  beepTimer: 0,
  plantProgress: 0,
  defuseProgress: 0
};

/* ---------------------------------------------------------------------
   ARMAS / EQUIPAMIENTO
   --------------------------------------------------------------------- */
function gunObj(id) {
  const d = WEAPONS[id];
  return { id, mag: d.mag, reserve: d.reserve };
}
function getCurrentGun() {
  return player.slots[player.slot] || null;
}
function getCurrentDef() {
  const g = getCurrentGun();
  return g ? WEAPONS[g.id] : null;
}
function refillAmmo() {
  for (const k of [1, 2, 3]) {
    const g = player.slots[k];
    if (!g) continue;
    const d = WEAPONS[g.id];
    g.mag = d.mag;
    g.reserve = d.reserve;
  }
}
function giveWeapon(id) {
  const d = WEAPONS[id];
  if (!d || d.slot === 3) return;
  player.slots[d.slot] = gunObj(id);
  player.slot = d.slot;
  player.reload = 0;
  player.scope = false;
}
function selectSlot(n) {
  if (game.state !== 'live' || !player.alive) return;
  if (!player.slots[n] || player.slot === n) return;
  player.slot = n;
  player.reload = 0;
  player.scope = false;
  player.drawTimer = 0.42;
  player.fireCd = Math.max(player.fireCd, 0.22);
  sfxSwitch();
}

function getEyeHeight() {
  const speed = Math.hypot(player.vx, player.vy);
  const bob = Math.sin(player.bob * 5.2) * clamp(speed / 3.2, 0, 1) * 0.012;
  return 0.52 + player.eyeOff + player.z + bob;
}

/* ---------------------------------------------------------------------
   COLISIONES
   --------------------------------------------------------------------- */
function circleHits(x, y, r) {
  const x0 = Math.floor(x - r), x1 = Math.floor(x + r);
  const y0 = Math.floor(y - r), y1 = Math.floor(y + r);
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      if (!isSolidCell(cx, cy)) continue;
      const nx = clamp(x, cx, cx + 1);
      const ny = clamp(y, cy, cy + 1);
      const dx = x - nx, dy = y - ny;
      if (dx * dx + dy * dy < r * r) return true;
    }
  }
  return false;
}
function moveEntity(ent, dx, dy, r) {
  let moved = false;
  if (dx !== 0 && !circleHits(ent.x + dx, ent.y, r)) { ent.x += dx; moved = true; }
  if (dy !== 0 && !circleHits(ent.x, ent.y + dy, r)) { ent.y += dy; moved = true; }
  return moved;
}

/* ---------------------------------------------------------------------
   SONIDO PROCEDURAL (WebAudio)
   --------------------------------------------------------------------- */
let AC = null, master = null, noiseBuf = null;

function ensureAudio() {
  if (!AC) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    AC = new Ctx();
    master = AC.createGain();
    master.gain.value = game.muted ? 0 : 0.5;
    master.connect(AC.destination);
    noiseBuf = AC.createBuffer(1, Math.floor(AC.sampleRate * 1.6), AC.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (AC.state === 'suspended') AC.resume();
}
function panNode(pan) {
  if (!AC) return null;
  let p;
  if (AC.createStereoPanner) {
    p = AC.createStereoPanner();
    p.pan.value = clamp(pan || 0, -1, 1);
  } else {
    p = AC.createGain();
  }
  p.connect(master);
  return p;
}
function tone(freq, dur, type, vol, pan, slideTo, delay) {
  if (!AC || game.muted) return;
  const t0 = AC.currentTime + (delay || 0);
  const o = AC.createOscillator();
  const g = AC.createGain();
  const p = panNode(pan || 0);
  o.type = type || 'sine';
  o.frequency.setValueAtTime(Math.max(20, freq), t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(p);
  o.start(t0); o.stop(t0 + dur + 0.03);
}
function noiseHit(vol, dur, freq, pan, type, delay) {
  if (!AC || game.muted) return;
  const t0 = AC.currentTime + (delay || 0);
  const src = AC.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = rand(0.85, 1.15);
  const f = AC.createBiquadFilter();
  f.type = type || 'lowpass';
  f.frequency.setValueAtTime(freq, t0);
  const g = AC.createGain();
  const p = panNode(pan || 0);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f); f.connect(g); g.connect(p);
  src.start(t0); src.stop(t0 + dur + 0.04);
}

function sfxShot(kind, pan, vol) {
  ensureAudio();
  if (!AC || game.muted) return;
  pan = pan || 0; vol = vol === undefined ? 1 : vol;
  if (kind === 'awp') {
    noiseHit(0.55 * vol, 0.34, 1700, pan);
    noiseHit(0.18 * vol, 0.7, 420, pan);
    tone(78, 0.28, 'sine', 0.3 * vol, pan, 30);
    tone(1600, 0.05, 'square', 0.06 * vol, pan, 600);
  } else if (kind === 'pistol') {
    noiseHit(0.34 * vol, 0.17, 2500, pan);
    tone(120, 0.12, 'sine', 0.2 * vol, pan, 45);
  } else if (kind === 'smg') {
    noiseHit(0.26 * vol, 0.10, 3000, pan);
    tone(145, 0.08, 'sine', 0.15 * vol, pan, 60);
  } else {
    noiseHit(0.32 * vol, 0.15, 2600, pan);
    tone(110, 0.11, 'sine', 0.19 * vol, pan, 42);
  }
}
function sfxHit(head) {
  if (!AC || game.muted) return;
  if (head) {
    tone(1900, 0.055, 'square', 0.10, 0, 2500);
    tone(2700, 0.07, 'sine', 0.07, 0, 3300, 0.02);
  } else {
    tone(1250, 0.05, 'square', 0.08, 0, 1450);
  }
}
function sfxKill(head) {
  if (!AC || game.muted) return;
  tone(430, 0.1, 'square', 0.09, 0, 320);
  tone(720, 0.16, 'sine', 0.08, 0, 980, 0.04);
  if (head) tone(2100, 0.2, 'sine', 0.07, 0, 2600, 0.08);
}
function sfxEmpty() { ensureAudio(); noiseHit(0.14, 0.035, 1900, 0, 'highpass'); }
function sfxSwitch() { ensureAudio(); noiseHit(0.1, 0.04, 1300, 0, 'highpass'); tone(420, 0.05, 'square', 0.05, 0, 300); }
function sfxReload() {
  ensureAudio();
  if (!AC || game.muted) return;
  noiseHit(0.09, 0.04, 1500, 0, 'highpass', 0.05);
  noiseHit(0.12, 0.05, 900, 0, 'bandpass', 0.5);
  noiseHit(0.10, 0.05, 1200, 0, 'bandpass', 1.15);
}
function sfxFootstep(vol) {
  ensureAudio();
  if (!AC || game.muted) return;
  noiseHit(0.035 * vol, 0.07, 520, rand(-0.15, 0.15), 'highpass');
}
function sfxHurt() {
  ensureAudio();
  if (!AC || game.muted) return;
  noiseHit(0.25, 0.18, 380, 0, 'lowpass');
  tone(170, 0.22, 'sawtooth', 0.1, 0, 60);
}
function sfxBombBeep(fast) {
  ensureAudio();
  if (!AC || game.muted) return;
  tone(fast ? 1500 : 1100, fast ? 0.07 : 0.1, 'square', 0.10, 0, fast ? 1500 : 1100);
}
function sfxDefuseTick() {
  ensureAudio();
  if (!AC || game.muted) return;
  noiseHit(0.08, 0.03, 1800, 0, 'highpass');
  tone(880, 0.04, 'square', 0.035, 0, 880);
}
function sfxBoom() {
  ensureAudio();
  if (!AC || game.muted) return;
  noiseHit(0.9, 1.3, 600, 0, 'lowpass');
  tone(60, 1.1, 'sine', 0.55, 0, 24);
  noiseHit(0.4, 0.4, 2400, 0, 'highpass', 0.02);
}
function sfxBuy() {
  ensureAudio();
  if (!AC || game.muted) return;
  tone(900, 0.06, 'square', 0.06, 0, 1200);
  tone(1350, 0.09, 'sine', 0.05, 0, 1600, 0.06);
}
function sfxDeny() {
  ensureAudio();
  if (!AC || game.muted) return;
  tone(220, 0.12, 'square', 0.07, 0, 160);
}
function sfxRoundStart() {
  ensureAudio();
  if (!AC || game.muted) return;
  tone(340, 0.12, 'sawtooth', 0.06, 0, 340);
  tone(510, 0.2, 'sawtooth', 0.06, 0, 520, 0.12);
}
function sfxRoundEnd(win) {
  ensureAudio();
  if (!AC || game.muted) return;
  if (win) {
    tone(520, 0.16, 'triangle', 0.08, 0, 660);
    tone(780, 0.28, 'triangle', 0.07, 0, 900, 0.15);
  } else {
    tone(300, 0.2, 'triangle', 0.08, 0, 220);
    tone(200, 0.35, 'triangle', 0.07, 0, 120, 0.18);
  }
}
function sfxPlant() {
  ensureAudio();
  if (!AC || game.muted) return;
  tone(700, 0.1, 'square', 0.08);
  tone(560, 0.16, 'square', 0.08, 0, 400, 0.14);
  tone(380, 0.3, 'sawtooth', 0.08, 0, 200, 0.3);
}
function sfxPickup() {
  ensureAudio();
  if (!AC || game.muted) return;
  noiseHit(0.12, 0.08, 1500, 0, 'bandpass');
  tone(600, 0.08, 'square', 0.05, 0, 900);
}
function sfxSwing() {
  ensureAudio();
  noiseHit(0.12, 0.12, 1200, 0, 'bandpass');
}
function sfxScope() { ensureAudio(); noiseHit(0.08, 0.05, 900, 0, 'bandpass'); }
function toggleMute() {
  game.muted = !game.muted;
  if (master) master.gain.value = game.muted ? 0 : 0.5;
  banner(game.muted ? 'SONIDO SILENCIADO' : 'SONIDO ACTIVADO', 'Pulsa M para cambiar', '', 1.4);
}

/* ---------------------------------------------------------------------
   DISPARO DEL JUGADOR
   --------------------------------------------------------------------- */
function startReload() {
  if (game.state !== 'live' || !player.alive) return;
  const gun = getCurrentGun();
  const def = getCurrentDef();
  if (!gun || !def || def.melee) return;
  if (player.reload > 0 || gun.mag >= def.mag || gun.reserve <= 0) return;
  player.reload = def.reload;
  player.reloadTotal = def.reload;
  player.scope = false;
  sfxReload();
}
function tryShoot() {
  if (game.state !== 'live' || !player.alive) return;
  if (!document.pointerLockElement) return;
  const gun = getCurrentGun();
  const def = getCurrentDef();
  if (!gun || !def) return;
  if (player.fireCd > 0 || player.reload > 0 || player.drawTimer > 0) return;

  if (def.melee) {
    player.fireCd = 0.55;
    player.knifeSwing = 0.3;
    sfxSwing();
    let hit = null;
    for (const b of bots) {
      if (!b.alive) continue;
      const d = dist2D(player.x, player.y, b.x, b.y);
      if (d > 2.0) continue;
      const ang = Math.atan2(b.y - player.y, b.x - player.x);
      if (Math.abs(angleDiff(ang, player.yaw)) < 0.8 && losClear(player.x, player.y, b.x, b.y)) { hit = b; break; }
    }
    if (hit) damageBot(hit, def.dmg, false, hit.x, hit.y, 0.55);
    return;
  }

  if (gun.mag <= 0) {
    if (player.fireCd <= 0) {
      sfxEmpty();
      player.fireCd = 0.25;
      if (gun.reserve > 0) startReload();
    }
    return;
  }

  gun.mag--;
  player.fireCd = 60 / def.rpm;
  player.shots++;
  player.recoilShots = Math.min(7, player.recoilShots + 1);
  player.heat = Math.min(1, player.heat + 0.22);
  player.recoilPitch += def.kick * rand(0.8, 1.3);
  player.recoilYaw += rand(-1, 1) * def.kick * 0.6;
  player.flashTimer = 0.055;
  player.viewKick = Math.min(1.5, player.viewKick + (def.id === 'awp' ? 1.2 : 0.55));
  Renderer.addShake(def.id === 'awp' ? 4 : 1.1);
  sfxShot(def.sound, 0, 1);

  let spread = def.spread + def.moveSpread * clamp(Math.hypot(player.vx, player.vy) / 3.2, 0, 1);
  if (!player.onGround) spread += 0.05;
  if (player.crouch) spread *= 0.72;
  if (player.scope && def.scopedSpread !== undefined) spread = def.scopedSpread;
  spread += player.heat * def.spread * 1.5;
  player.crossSpread = clamp(spread * 520, 0, 12);

  const yaw = player.yaw + player.recoilYaw + rand(-spread, spread);
  const pitch = clamp(player.pitch + player.recoilPitch + rand(-spread, spread) * 0.65, -0.5, 0.5);
  shootHitscan(yaw, pitch, def);

  if (window.Multiplayer && Multiplayer.active) {
    const eyeH = getEyeHeight() - 0.09;
    Multiplayer.sendShoot(
      player.x, player.y, eyeH,
      player.x + Math.cos(yaw) * 40, player.y + Math.sin(yaw) * 40, eyeH + Math.tan(pitch) * 40,
      def.id, def.sound
    );
  }

  for (const b of bots) {
    if (!b.alive) continue;
    if (dist2D(player.x, player.y, b.x, b.y) < 22) {
      b.alert = Math.max(b.alert, 4);
      b.lastSeen.x = player.x; b.lastSeen.y = player.y;
    }
  }
}
function toggleScope() {
  if (game.state !== 'live' || !player.alive) return;
  const def = getCurrentDef();
  if (!def || !def.scope) return;
  if (player.reload > 0) return;
  player.scope = !player.scope;
  player.crossSpread = 0;
  sfxScope();
}

/* ---------------------------------------------------------------------
   RONDAS / ECONOMÍA
   --------------------------------------------------------------------- */
function startMatch() {
  ensureAudio();
  game.round = 0;
  game.ctScore = 0;
  game.tScore = 0;
  game.matchOver = false;
  game.started = true;
  game.lastResult = null;
  game.damageFlash = 0;
  player.money = 800;
  player.kills = 0; player.deaths = 0; player.headshots = 0;
  player.shots = 0; player.hitsShots = 0;
  player.kit = false;
  player.slots = { 1: null, 2: gunObj('usp'), 3: { id: 'knife', mag: 0, reserve: 0 } };
  player.slot = 2;
  hideAllScreens();
  ui.hud.classList.remove('hidden');
  ui.menu.classList.add('hidden');
  nextRound();
}

function nextRound() {
  game.round++;
  hideAllScreens();
  ui.hud.classList.remove('hidden');

  game.state = 'buy';
  game.buyTimer = BUY_TIME;
  game.buyExpired = false;
  game.roundTime = ROUND_TIME;
  game.damageFlash = 0;
  game.damageDirTimer = 0;
  game.deathTimer = 0;
  game.roundOverDelay = 0;
  game.roundOverShown = false;
  game.siteClearShown = false;

  player.alive = true;
  player.hp = 100;
  player.armor = 0;
  const spawn = player.team === 't' ? T_SPAWNS[0] : CT_SPAWN;
  player.x = spawn.x;
  player.y = spawn.y;
  player.yaw = player.team === 't' ? -Math.PI / 2 : CT_SPAWN.yaw;
  player.pitch = -0.02;
  player.vx = 0; player.vy = 0; player.vz = 0; player.z = 0;
  player.eyeOff = 0;
  player.onGround = true;
  player.crouch = false;
  player.walking = false;
  player.scope = false;
  player.reload = 0;
  player.fireCd = 0;
  player.drawTimer = 0;
  player.recoilPitch = 0; player.recoilYaw = 0; player.recoilShots = 0; player.heat = 0;
  player.flashTimer = 0; player.viewKick = 0;
  player.bob = 0; player.stepDist = 0;
  player.defusing = false;
  player.slot = player.slots[1] ? 1 : 2;
  refillAmmo();

  bots = [];
  corpses = [];
  particles = [];
  tracers = [];
  ui.killfeed.innerHTML = '';
  spawnBotsForRound();
  resetBomb();

  if (document.pointerLockElement) document.exitPointerLock();
  openBuyMenu();
  updateHUD();
}

function beginLive() {
  if (game.state !== 'buy') return;
  game.state = 'live';
  game.buyExpired = true;
  ui.buy.classList.add('hidden');
  ui.hud.classList.remove('hidden');
  banner('¡ADELANTE!', 'Protege el sitio A', '', 1.6);
  sfxRoundStart();
  tryLockPointer();
  updateHUD();
}

function endRound(ctWin, reason) {
  if (game.state !== 'live') return;
  game.state = 'roundover';
  game.lastResult = { ctWin, reason };
  if (ctWin) game.ctScore++; else game.tScore++;
  const reward = ctWin ? 3000 : 1900;
  game.roundReward = reward;
  player.money = Math.min(MAX_MONEY, player.money + reward);
  player.defusing = false;
  player.scope = false;
  mouseDown = false;
  if (game.ctScore >= TARGET_SCORE || game.tScore >= TARGET_SCORE) game.matchOver = true;
  game.roundOverDelay = 1.0;
  game.roundOverShown = false;
  if (document.pointerLockElement) document.exitPointerLock();
  ui.lockHint.classList.add('hidden');
  sfxRoundEnd(ctWin);
  updateHUD();
}

function advanceRound() {
  if (game.state !== 'roundover' || !game.roundOverShown) return;
  if (game.matchOver) {
    showGameOver();
  } else {
    nextRound();
  }
}

function checkRoundState() {
  if (game.state !== 'live') return;
  const allDead = bots.length > 0 && bots.every(b => !b.alive);
  if (allDead && bomb.state !== 'planted') {
    endRound(true, 'Todos los terroristas eliminados');
    return;
  }
  if (allDead && bomb.state === 'planted' && !game.siteClearShown) {
    game.siteClearShown = true;
    banner('SITIO DESPEJADO', 'Desactiva el C4 o explotará', 'warn', 2.2);
  }
}
