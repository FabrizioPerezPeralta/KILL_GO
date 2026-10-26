'use strict';
/* =====================================================================
   DUST STRIKE — ai.js
   Navegación A*, terroristas, C4, combate y efectos de partículas.
   ===================================================================== */

/* ---------------------------------------------------------------------
   VISIÓN / PATHFINDING
   --------------------------------------------------------------------- */
function losClear(x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const d = Math.hypot(dx, dy);
  if (d < 0.001) return true;
  const steps = Math.ceil(d / 0.11);
  for (let i = 1; i < steps; i++) {
    const x = x1 + dx * i / steps;
    const y = y1 + dy * i / steps;
    if (isSolidCell(x | 0, y | 0)) return false;
  }
  return true;
}

function findPath(sx, sy, tx, ty) {
  let startX = clamp(Math.floor(sx), 0, MW - 1);
  let startY = clamp(Math.floor(sy), 0, MH - 1);
  let goalX = clamp(Math.floor(tx), 0, MW - 1);
  let goalY = clamp(Math.floor(ty), 0, MH - 1);

  if (isSolidCell(startX, startY)) {
    let found = false;
    for (let r = 1; r <= 4 && !found; r++) {
      for (let oy = -r; oy <= r && !found; oy++) {
        for (let ox = -r; ox <= r && !found; ox++) {
          if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
          if (!isSolidCell(startX + ox, startY + oy)) {
            startX += ox; startY += oy; found = true;
          }
        }
      }
    }
    if (!found) return [];
  }
  if (isSolidCell(goalX, goalY)) {
    let found = false;
    for (let r = 1; r <= 8 && !found; r++) {
      for (let oy = -r; oy <= r && !found; oy++) {
        for (let ox = -r; ox <= r && !found; ox++) {
          if (Math.max(Math.abs(ox), Math.abs(oy)) !== r) continue;
          if (!isSolidCell(goalX + ox, goalY + oy)) {
            goalX += ox; goalY += oy; found = true;
          }
        }
      }
    }
    if (!found) return [];
  }

  const startIdx = startY * MW + startX;
  const goalIdx = goalY * MW + goalX;
  if (startIdx === goalIdx) return [];

  const n = MW * MH;
  const gScore = new Float32Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const heap = [];

  function heuristic(x, y) {
    const dx = Math.abs(x - goalX), dy = Math.abs(y - goalY);
    return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy);
  }
  function push(idx, f) {
    heap.push({ i: idx, f });
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p].f <= heap[i].f) break;
      const tmp = heap[p]; heap[p] = heap[i]; heap[i] = tmp; i = p;
    }
  }
  function pop() {
    const top = heap[0];
    const last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let s = i;
        if (l < heap.length && heap[l].f < heap[s].f) s = l;
        if (r < heap.length && heap[r].f < heap[s].f) s = r;
        if (s === i) break;
        const tmp = heap[s]; heap[s] = heap[i]; heap[i] = tmp; i = s;
      }
    }
    return top;
  }

  gScore[startIdx] = 0;
  push(startIdx, heuristic(startX, startY));

  const dirs = [
    [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
    [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2]
  ];

  while (heap.length) {
    const cur = pop();
    if (closed[cur.i]) continue;
    if (cur.i === goalIdx) {
      const rev = [];
      let c = goalIdx;
      while (c !== -1) {
        rev.push({ x: (c % MW) + 0.5, y: ((c / MW) | 0) + 0.5 });
        c = came[c];
      }
      rev.reverse();
      rev.shift();
      return rev;
    }
    closed[cur.i] = 1;
    const cx = cur.i % MW, cy = (cur.i / MW) | 0;
    for (const [dx, dy, cost] of dirs) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= MW || ny >= MH) continue;
      if (isSolidCell(nx, ny)) continue;
      if (dx && dy && (isSolidCell(cx + dx, cy) || isSolidCell(cx, cy + dy))) continue;
      const ni = ny * MW + nx;
      if (closed[ni]) continue;
      const ng = gScore[cur.i] + cost;
      if (ng < gScore[ni]) {
        gScore[ni] = ng;
        came[ni] = cur.i;
        push(ni, ng + heuristic(nx, ny));
      }
    }
  }
  return [];
}

/* ---------------------------------------------------------------------
   BOTS
   --------------------------------------------------------------------- */
function makeBot(x, y, index, carrier) {
  let weapon = 'mp5';
  const r = game.round;
  if (r >= 5) {
    const roll = Math.random();
    weapon = roll < 0.62 ? 'ak' : roll < 0.9 ? 'mp5' : 'deagle';
  } else if (r >= 3) {
    weapon = Math.random() < 0.5 ? 'ak' : 'mp5';
  } else {
    weapon = Math.random() < 0.22 ? 'ak' : 'mp5';
  }
  return {
    x, y, index, carrier, weapon,
    team: 't',
    name: 'TERRORISTA_' + (index + 1),
    hp: 100, alive: true, variant: index % 2,
    aim: -Math.PI / 2 + rand(-0.5, 0.5),
    moveAim: -Math.PI / 2,
    moving: false, walkPhase: rand(0, 2), reveal: 0,
    alert: 0, reaction: 0, wasSeeing: false,
    lastSeen: { x, y },
    fireCd: rand(0.1, 0.5), burstLeft: 0,
    shootPose: 0, repath: rand(0, 0.4), path: [], pathIdx: 0,
    ptx: x, pty: y,
    defendPos: null, sitePos: null,
    strafeDir: 1, strafeTimer: 0,
    planting: false, plantBeep: 0, stuck: 0,
    guardAim: Math.atan2(CT_SPAWN.y - y, CT_SPAWN.x - x),
    phase: rand(0, 6.28)
  };
}

function spawnBotsForRound() {
  const count = Math.min(6, 3 + Math.floor((game.round - 1) / 2));
  const spawns = T_SPAWNS.slice().sort(() => Math.random() - 0.5).slice(0, count);
  const carrierIdx = randi(0, count - 1);
  bots = spawns.map((sp, i) => makeBot(sp.x, sp.y, i, i === carrierIdx));
  bots[carrierIdx].carrier = true;
}

function resetBomb() {
  bomb.state = 'carried';
  bomb.timer = BOMB_TIME;
  bomb.beepTimer = 0;
  bomb.plantProgress = 0;
  bomb.defuseProgress = 0;
  const carrier = bots.find(b => b.carrier) || bots[0];
  bomb.carrier = carrier || null;
  if (carrier) {
    carrier.carrier = true;
    bomb.x = carrier.x;
    bomb.y = carrier.y;
  } else {
    bomb.x = PLANT_SPOT.x;
    bomb.y = PLANT_SPOT.y;
  }
}

function nearestBotToBomb() {
  let best = null, bd = 1e9;
  for (const b of bots) {
    if (!b.alive) continue;
    const d = dist2D(b.x, b.y, bomb.x, bomb.y);
    if (d < bd) { bd = d; best = b; }
  }
  return best;
}

function botObjective(bot) {
  if (bomb.state === 'planted') {
    if (!bot.defendPos) {
      bot.defendPos = DEFEND_SPOTS[(bot.index + 2) % DEFEND_SPOTS.length];
    }
    return bot.defendPos;
  }
  if (bomb.state === 'dropped') {
    if (nearestBotToBomb() === bot) return { x: bomb.x, y: bomb.y };
  }
  if (bomb.state === 'carried' && bomb.carrier === bot) return PLANT_SPOT;
  if (!bot.sitePos) bot.sitePos = DEFEND_SPOTS[bot.index % DEFEND_SPOTS.length];
  return bot.sitePos;
}

function botMoveTo(bot, tx, ty, dt, speed) {
  const dd = dist2D(bot.x, bot.y, tx, ty);
  if (dd < 0.3) { bot.moving = false; return; }
  if (bot.repath <= 0 || !bot.path || !bot.path.length ||
    dist2D(bot.ptx, bot.pty, tx, ty) > 1.8) {
    bot.path = findPath(bot.x, bot.y, tx, ty);
    bot.pathIdx = 0;
    bot.ptx = tx; bot.pty = ty;
    bot.repath = rand(0.9, 1.7);
  }
  if (!bot.path.length) { bot.moving = false; return; }
  while (bot.pathIdx < bot.path.length - 1 &&
    dist2D(bot.x, bot.y, bot.path[bot.pathIdx].x, bot.path[bot.pathIdx].y) < 0.34) {
    bot.pathIdx++;
  }
  const node = bot.path[Math.min(bot.pathIdx, bot.path.length - 1)];
  const ang = Math.atan2(node.y - bot.y, node.x - bot.x);
  if (!isFinite(ang)) { bot.moving = false; return; }
  const moved = moveEntity(bot, Math.cos(ang) * speed * dt, Math.sin(ang) * speed * dt, 0.26);
  bot.moveAim = ang;
  bot.moving = moved;
  if (moved) {
    bot.walkPhase += dt * 6.4;
    bot.stuck = 0;
  } else {
    bot.stuck += dt;
    if (bot.stuck > 0.8) { bot.repath = 0; bot.path = []; bot.stuck = 0; }
  }
}

function updateBot(bot, dt) {
  if (!bot.alive) return;
  bot.shootPose = Math.max(0, bot.shootPose - dt);
  bot.reveal = Math.max(0, bot.reveal - dt);
  bot.fireCd -= dt;
  bot.repath -= dt;
  bot.strafeTimer -= dt;
  bot.reaction -= dt;
  bot.alert -= dt;
  bot.planting = false;

  const px = player.x, py = player.y;
  const d = dist2D(bot.x, bot.y, px, py);
  const isEnemy = !bot.team || bot.team !== player.team;
  const los = isEnemy && player.alive && d < 28 && losClear(bot.x, bot.y, px, py);
  const toPlayer = Math.atan2(py - bot.y, px - bot.x);
  const inFront = Math.abs(angleDiff(toPlayer, bot.aim)) < 1.95;
  const sees = los && inFront && game.state === 'live';

  if (sees && !bot.wasSeeing) {
    bot.reaction = DIFF[game.difficulty].reaction + rand(0, 0.18);
  }
  bot.wasSeeing = sees;
  if (sees) {
    bot.alert = 6;
    bot.lastSeen.x = px;
    bot.lastSeen.y = py;
  }

  // hacia dónde mira
  let wantAim = bot.aim;
  if (sees) wantAim = toPlayer;
  else if (bot.alert > 0) wantAim = Math.atan2(bot.lastSeen.y - bot.y, bot.lastSeen.x - bot.x);
  else if (bot.moving) wantAim = bot.moveAim;
  else wantAim = bot.guardAim + Math.sin(game.time * 0.65 + bot.phase) * 0.5;
  const turnRate = sees ? 7.5 : 3.4;
  bot.aim += clamp(angleDiff(wantAim, bot.aim), -dt * turnRate, dt * turnRate);

  // disparo
  if (sees && bot.reaction <= 0 && game.state === 'live') {
    if (bot.burstLeft > 0) {
      if (bot.fireCd <= 0) {
        botFire(bot);
        bot.burstLeft--;
        const bw = BOT_WEAPONS[bot.weapon];
        bot.fireCd = bot.burstLeft > 0 ? bw.interval : rand(bw.burstPause * 0.8, bw.burstPause * 1.35);
      }
    } else if (bot.fireCd <= 0) {
      bot.burstLeft = randi(2, 4);
      bot.fireCd = rand(0.1, 0.28);
    }
  } else {
    bot.burstLeft = 0;
    if (bot.fireCd < 0.1) bot.fireCd = 0.1;
  }

  // plantar
  const atPlant = dist2D(bot.x, bot.y, PLANT_SPOT.x, PLANT_SPOT.y) < 1.4;
  if (bomb.state === 'carried' && bomb.carrier === bot && atPlant && !sees && game.state === 'live') {
    bot.planting = true;
    bot.moving = false;
    bot.burstLeft = 0;
    bomb.plantProgress += dt;
    bot.plantBeep -= dt;
    if (bot.plantBeep <= 0) {
      bot.plantBeep = 0.55;
      sfxBombBeep(false);
    }
    addPlantWarning();
    if (bomb.plantProgress >= 3.4) {
      plantBomb(bot);
      return;
    }
  } else {
    bot.plantBeep = 0;
    if (bomb.state === 'carried' && bomb.carrier === bot) {
      bomb.plantProgress = Math.max(0, bomb.plantProgress - dt * 0.7);
    }
  }

  // movimiento
  if (bot.planting) {
    bot.moving = false;
  } else if (sees && d < 22) {
    bot.moving = false;
    if (d > 2.8) {
      if (bot.strafeTimer <= 0) {
        bot.strafeTimer = rand(0.8, 1.8);
        bot.strafeDir = Math.random() < 0.5 ? -1 : 1;
      }
      const sa = toPlayer + Math.PI / 2 * bot.strafeDir + rand(-0.2, 0.2);
      const moved = moveEntity(bot, Math.cos(sa) * dt * 1.15, Math.sin(sa) * dt * 1.15, 0.26);
      if (moved) { bot.moving = true; bot.walkPhase += dt * 5; }
    }
  } else {
    let target = botObjective(bot);
    if (bot.alert > 0 && !los) {
      const ld = dist2D(bot.x, bot.y, bot.lastSeen.x, bot.lastSeen.y);
      if (ld < 10 && ld > 0.7) target = bot.lastSeen;
    }
    botMoveTo(bot, target.x, target.y, dt, bot.alert > 0 ? 2.35 : 2.05);
  }
}

function separateBots(dt) {
  for (let i = 0; i < bots.length; i++) {
    const a = bots[i];
    if (!a.alive) continue;
    for (let j = i + 1; j < bots.length; j++) {
      const b = bots[j];
      if (!b.alive) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.62 && d > 0.0001) {
        const push = (0.62 - d) * 0.5;
        const nx = dx / d * push, ny = dy / d * push;
        if (!circleHits(a.x - nx, a.y - ny, 0.24)) { a.x -= nx; a.y -= ny; }
        if (!circleHits(b.x + nx, b.y + ny, 0.24)) { b.x += nx; b.y += ny; }
      }
    }
    // no atravesar al jugador
    if (player.alive) {
      const dx = a.x - player.x, dy = a.y - player.y;
      const d = Math.hypot(dx, dy);
      if (d < 0.62 && d > 0.0001) {
        const push = (0.62 - d);
        const nx = dx / d * push, ny = dy / d * push;
        if (!circleHits(a.x + nx, a.y + ny, 0.24)) { a.x += nx; a.y += ny; }
      }
    }
  }
}

function updateBots(dt) {
  for (const b of bots) updateBot(b, dt);
  separateBots(dt);
}

/* ---------------------------------------------------------------------
   COMBATE
   --------------------------------------------------------------------- */
function botFire(bot) {
  const bw = BOT_WEAPONS[bot.weapon];
  const d = dist2D(bot.x, bot.y, player.x, player.y);
  const diff = DIFF[game.difficulty];
  let chance = diff.hit * bw.acc * clamp(1 - (d - 4) / 27, 0.22, 1);
  const speed = Math.hypot(player.vx, player.vy);
  chance *= 1 - clamp(speed / 7, 0, 0.32);
  if (player.crouch) chance *= 0.88;
  chance = clamp(chance, 0.04, 0.85);
  const hit = Math.random() < chance;

  bot.shootPose = 0.13;
  bot.reveal = 2;
  let ex, ey, ez;
  if (hit) {
    ex = player.x; ey = player.y; ez = getEyeHeight() - 0.1;
  } else {
    const a = Math.atan2(player.y - bot.y, player.x - bot.x) + rand(-0.075, 0.075);
    const dd = d + rand(-1.5, 2.5);
    ex = bot.x + Math.cos(a) * dd;
    ey = bot.y + Math.sin(a) * dd;
    ez = rand(0.25, 1.35);
  }
  tracers.push({
    x1: bot.x, y1: bot.y, z1: 0.56,
    x2: ex, y2: ey, z2: ez,
    life: 0.09, maxLife: 0.09, color: '255,185,90', width: 1.15
  });
  const rel = Math.atan2(player.y - bot.y, player.x - bot.x) - player.yaw;
  sfxShot(bw.sound, clamp(Math.sin(rel), -1, 1), clamp(1 - d / 36, 0.15, 1) * 0.7);
  if (hit) {
    damagePlayer(bw.dmg * diff.dmg * rand(0.85, 1.15), bot);
  } else {
    spawnImpact(ex, ey, ez, 1, true);
  }
}

function damagePlayer(amount, source) {
  if (!player.alive || game.state !== 'live') return;
  let dmg = amount;
  if (player.armor > 0) {
    const absorbed = Math.min(player.armor, dmg * 0.55);
    player.armor -= absorbed;
    dmg -= absorbed;
  }
  player.hp -= dmg;
  game.damageFlash = Math.min(1.45, game.damageFlash + 0.75);
  game.damageDir = Math.atan2(source.y - player.y, source.x - player.x) - player.yaw;
  game.damageDirTimer = 1.1;
  Renderer.addShake(3);
  sfxHurt();
  if (player.hp <= 0) killPlayer();
}

function killPlayer() {
  if (!player.alive) return;
  player.alive = false;
  player.hp = 0;
  player.deaths++;
  player.scope = false;
  player.reload = 0;
  player.defusing = false;
  game.deathTimer = 2.3;
  mouseDown = false;
  banner('ELIMINADO', 'Los terroristas controlan el sitio', 'lose', 2.2);
  addKillfeed('☠ <b>TÚ</b> has caído en combate');
}

function rayWallDist(x, y, dx, dy) {
  let mapX = Math.floor(x), mapY = Math.floor(y);
  const ddx = dx === 0 ? 1e30 : Math.abs(1 / dx);
  const ddy = dy === 0 ? 1e30 : Math.abs(1 / dy);
  let stepX, stepY, sideX, sideY;
  if (dx < 0) { stepX = -1; sideX = (x - mapX) * ddx; } else { stepX = 1; sideX = (mapX + 1 - x) * ddx; }
  if (dy < 0) { stepY = -1; sideY = (y - mapY) * ddy; } else { stepY = 1; sideY = (mapY + 1 - y) * ddy; }
  let side = 0;
  for (let i = 0; i < 100; i++) {
    if (sideX < sideY) { sideX += ddx; mapX += stepX; side = 0; }
    else { sideY += ddy; mapY += stepY; side = 1; }
    if (isSolidCell(mapX, mapY)) {
      const d = side === 0 ? sideX - ddx : sideY - ddy;
      return Math.max(0.05, d);
    }
  }
  return 60;
}

function shootHitscan(yaw, pitch, def) {
  const px = player.x, py = player.y, eye = getEyeHeight();
  const dx = Math.cos(yaw), dy = Math.sin(yaw);
  const tanP = Math.tan(pitch);
  let maxD = rayWallDist(px, py, dx, dy);
  let floorHit = false;
  if (tanP < -0.0005) {
    const fd = eye / (-tanP);
    if (fd < maxD) { maxD = fd; floorHit = true; }
  }

  let bestBot = null, bestT = maxD, head = false, hitZ = 0;
  for (const b of bots) {
    if (!b.alive) continue;
    if (b.team && b.team === player.team) continue;
    const rx = b.x - px, ry = b.y - py;
    const proj = rx * dx + ry * dy;
    if (proj <= 0) continue;
    const perp2 = rx * rx + ry * ry - proj * proj;
    const rad = 0.30;
    if (perp2 > rad * rad) continue;
    const t = proj - Math.sqrt(rad * rad - perp2);
    if (t <= 0 || t >= bestT) continue;
    const z = eye + tanP * t;
    if (z < 0 || z > BOT_H) continue;
    bestBot = b; bestT = t; hitZ = z; head = z > BOT_H * 0.70;
  }

  let hitRemote = null;
  if (window.Multiplayer && Multiplayer.active) {
    for (const rp of Multiplayer.getRemotePlayers()) {
      if (!rp.alive || rp.team === player.team) continue;
      const rx = rp.x - px, ry = rp.y - py;
      const proj = rx * dx + ry * dy;
      if (proj <= 0) continue;
      const perp2 = rx * rx + ry * ry - proj * proj;
      const rad = 0.30;
      if (perp2 > rad * rad) continue;
      const t = proj - Math.sqrt(rad * rad - perp2);
      if (t <= 0 || t >= bestT) continue;
      const z = eye + tanP * t;
      if (z < 0 || z > BOT_H) continue;
      bestT = t; hitZ = z; head = z > BOT_H * 0.70;
      hitRemote = rp;
      bestBot = null;
    }
  }

  const endX = px + dx * bestT;
  const endY = py + dy * bestT;
  const endZ = eye + tanP * bestT;
  tracers.push({
    x1: px + dx * 0.55, y1: py + dy * 0.55, z1: eye - 0.09,
    x2: endX, y2: endY, z2: endZ,
    life: 0.07, maxLife: 0.07, color: '255,228,160', width: 1.2
  });

  if (bestBot) {
    const falloff = clamp(1 - Math.max(0, bestT - 9) / 55, 0.55, 1);
    let dmg = def.dmg * falloff * (head ? def.hs : 1);
    damageBot(bestBot, dmg, head, endX, endY, hitZ);
  } else if (hitRemote) {
    const falloff = clamp(1 - Math.max(0, bestT - 9) / 55, 0.55, 1);
    let dmg = def.dmg * falloff * (head ? def.hs : 1);
    Multiplayer.sendHit(hitRemote.id, dmg, head);
    spawnBlood(endX, endY, hitZ, head);
  } else {
    spawnImpact(endX, endY, endZ, floorHit ? 0 : 1);
  }
}

function damageBot(bot, dmg, head, hx, hy, hz) {
  if (!bot.alive) return;
  bot.hp -= dmg;
  bot.alert = 6;
  bot.reveal = 2;
  bot.lastSeen.x = player.x;
  bot.lastSeen.y = player.y;
  player.hitsShots++;
  spawnBlood(hx, hy, hz, head);
  showHitmarker(head);
  sfxHit(head);
  if (bot.hp <= 0) killBot(bot, head);
}

function killBot(bot, head) {
  if (!bot.alive) return;
  bot.alive = false;
  bot.hp = 0;
  corpses.push({ x: bot.x, y: bot.y, variant: bot.variant });
  player.kills++;
  if (head) player.headshots++;
  const reward = head ? 400 : 300;
  player.money = Math.min(MAX_MONEY, player.money + reward);
  addKillfeed(`<b>TÚ</b> ▸ TERRORISTA${head ? ' <span class="hs">HEADSHOT</span>' : ''} <em>+$${reward}</em>`);
  sfxKill(head);

  if (bomb.state === 'carried' && bomb.carrier === bot) dropBomb(bot);

  for (const b of bots) {
    if (!b.alive) continue;
    b.alert = Math.max(b.alert, 5);
    b.lastSeen.x = player.x;
    b.lastSeen.y = player.y;
  }
  if (bomb.state === 'carried' && !bots.some(b => b.alive && b.carrier)) {
    // si el portador murió y no quedan portadores
    const alive = bots.filter(b => b.alive);
    if (alive.length) { bomb.carrier = alive[0]; alive[0].carrier = true; }
  }
  checkRoundState();
}

function updateBomb(dt) {
  if (game.state !== 'live') return;

  const anyPlanting = bots.some(b => b.alive && b.planting);
  if (!anyPlanting) {
    const warn = document.querySelector('.plant-warning');
    if (warn) warn.remove();
  }

  if (bomb.state === 'carried') {
    if (bomb.carrier && bomb.carrier.alive) {
      bomb.x = bomb.carrier.x;
      bomb.y = bomb.carrier.y;
    } else {
      bomb.state = 'dropped';
      bomb.carrier = null;
    }
  }

  if (bomb.state === 'dropped') {
    let picker = null, pd = 1.0;
    for (const b of bots) {
      if (!b.alive) continue;
      const d = dist2D(b.x, b.y, bomb.x, bomb.y);
      if (d < pd) { pd = d; picker = b; }
    }
    if (picker) {
      bomb.state = 'carried';
      bomb.carrier = picker;
      for (const b of bots) b.carrier = false;
      picker.carrier = true;
      bomb.plantProgress = 0;
      sfxPickup();
      addKillfeed('C4 RECUPERADO POR LOS TERRORISTAS');
    }
  }

  if (bomb.state === 'planted') {
    bomb.timer -= dt;
    bomb.beepTimer -= dt;
    if (bomb.beepTimer <= 0) {
      bomb.beepTimer = bomb.timer < 10 ? 0.32 : 0.95;
      sfxBombBeep(bomb.timer < 10);
    }

    const near = dist2D(player.x, player.y, bomb.x, bomb.y) < 1.75;
    const still = Math.hypot(player.vx, player.vy) < 0.7;
    if (player.alive && keys.KeyE && near && still) {
      player.defusing = true;
      const before = bomb.defuseProgress;
      bomb.defuseProgress += dt / (player.kit ? 5 : 10);
      if (Math.floor(before * 20) !== Math.floor(bomb.defuseProgress * 20)) sfxDefuseTick();
      if (bomb.defuseProgress >= 1) {
        bomb.state = 'defused';
        player.defusing = false;
        player.money = Math.min(MAX_MONEY, player.money + 300);
        addKillfeed('<b>TÚ</b> desactivaste el C4 <em>+$300</em>');
        endRound(true, 'C4 desactivado a tiempo');
        return;
      }
    } else {
      bomb.defuseProgress = 0;
      player.defusing = false;
    }

    if (bomb.timer <= 0) {
      explodeBomb();
      return;
    }
  } else {
    player.defusing = false;
  }
}

function plantBomb(bot) {
  bomb.state = 'planted';
  bomb.x = bot.x;
  bomb.y = bot.y;
  bomb.timer = BOMB_TIME;
  bomb.beepTimer = 0;
  bomb.plantProgress = 0;
  bomb.defuseProgress = 0;
  bomb.carrier = null;
  for (const b of bots) {
    b.carrier = false;
    b.defendPos = null;
    b.planting = false;
  }
  banner('BOMBA PLANTADA', 'Sitio A · desactívala o explotará', 'warn', 2.6);
  addKillfeed('💣 <b>C4 ARMADO</b> EN EL SITIO A');
  sfxPlant();
  Array.from(document.querySelectorAll('.plant-warning')).forEach(el => el.remove());
}

function dropBomb(bot) {
  bomb.state = 'dropped';
  bomb.carrier = null;
  bomb.x = bot.x;
  bomb.y = bot.y;
  bomb.plantProgress = 0;
  bot.carrier = false;
  banner('C4 EN EL SUELO', 'Los terroristas intentarán recuperarlo', 'warn', 2);
  addKillfeed('💣 <b>C4 CAÍDO</b>');
}

function explodeBomb() {
  if (bomb.state === 'exploded') return;
  bomb.state = 'exploded';
  bomb.timer = 0;
  game.damageFlash = 1.5;
  Renderer.addShake(15);
  sfxBoom();
  for (let i = 0; i < 60; i++) {
    particles.push({
      x: bomb.x + rand(-1, 1), y: bomb.y + rand(-1, 1), z: rand(0, 1.2),
      vx: rand(-4, 4), vy: rand(-4, 4), vz: rand(2, 7),
      life: rand(0.4, 1.3), maxLife: 1.3,
      size: rand(0.03, 0.09),
      color: i % 3 === 0 ? '255,210,120' : i % 3 === 1 ? '255,120,40' : '90,80,70',
      grav: 5
    });
  }
  if (player.alive) {
    player.hp = 0;
    player.alive = false;
    player.deaths++;
    player.scope = false;
    player.defusing = false;
  }
  banner('EL C4 HA EXPLOTADO', 'Sitio A destruido', 'lose', 3);
  endRound(false, 'El C4 ha explotado');
}

function spawnBlood(x, y, z, head) {
  const n = head ? 20 : 11;
  for (let i = 0; i < n; i++) {
    particles.push({
      x, y, z: z + rand(-0.05, 0.05),
      vx: rand(-2.2, 2.2), vy: rand(-2.2, 2.2), vz: rand(0.3, 2.8),
      life: rand(0.25, 0.7), maxLife: 0.7,
      size: rand(0.012, 0.036),
      color: i % 5 === 0 ? '160,20,16' : '120,12,10',
      grav: 7
    });
  }
  for (let i = 0; i < 6; i++) {
    particles.push({
      x, y, z,
      vx: rand(-0.7, 0.7), vy: rand(-0.7, 0.7), vz: rand(0.2, 1),
      life: rand(0.15, 0.35), maxLife: 0.35,
      size: rand(0.02, 0.05), color: '255,120,100', grav: 2
    });
  }
}

function spawnImpact(x, y, z, wallType, sparkOnly) {
  const color = wallType === 2 ? '150,105,55' : wallType === 4 ? '120,150,160' : '210,190,150';
  for (let i = 0; i < 8; i++) {
    particles.push({
      x, y, z,
      vx: rand(-1.5, 1.5), vy: rand(-1.5, 1.5), vz: rand(0.3, 2.2),
      life: rand(0.18, 0.5), maxLife: 0.5,
      size: rand(0.01, 0.03),
      color: i < 2 ? '255,225,150' : color,
      grav: 5
    });
  }
  if (!sparkOnly) {
    particles.push({
      x, y, z,
      vx: 0, vy: 0, vz: 0.2,
      life: 0.25, maxLife: 0.25,
      size: 0.045, color: color, grav: 0
    });
  }
}

function updateEffects(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
    p.vz -= p.grav * dt;
    if (p.z < 0) { p.z = 0; p.vz *= -0.25; }
  }
  for (let i = tracers.length - 1; i >= 0; i--) {
    tracers[i].life -= dt;
    if (tracers[i].life <= 0) tracers.splice(i, 1);
  }
}

function updateBombWarning() {
  addPlantWarning();
}
function addPlantWarning() {
  // aviso reutilizable en el HUD; se elimina al plantar
  if (!document.querySelector('.plant-warning')) {
    const el = document.createElement('div');
    el.className = 'plant-warning';
    el.textContent = '⚠ EL TERRORISTA ESTÁ PLANTANDO EL C4';
    const hud = document.getElementById('hud');
    if (hud) hud.appendChild(el);
  }
}
