'use strict';
/* =====================================================================
   DUST STRIKE — render.js
   Raycasting 3D, sprites, efectos, armas en primera persona y mira.
   ===================================================================== */

const Renderer = (() => {
  const canvas = document.getElementById('view');
  const ctx = canvas.getContext('2d', { alpha: false });
  const bufferCanvas = document.createElement('canvas');
  const bctx = bufferCanvas.getContext('2d', { alpha: false });

  let W = 480, H = 270, focal = 313;
  let imageData = null, buffer = null, zbuf = null;
  let viewW = 0, viewH = 0, dpr = 1;
  let shake = 0;

  const hfovNormal = 75 * Math.PI / 180;
  const hfovScope = 28 * Math.PI / 180;
  let skyCache = [];

  function resize() {
    viewW = Math.max(320, window.innerWidth);
    viewH = Math.max(240, window.innerHeight);
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.floor(viewW * dpr);
    canvas.height = Math.floor(viewH * dpr);
    canvas.style.width = viewW + 'px';
    canvas.style.height = viewH + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const ratio = viewW / viewH;
    H = 380;
    W = Math.round(H * ratio);
    if (W > 740) { W = 740; H = Math.round(W / ratio); }
    if (H > 420) { H = 420; W = Math.round(H * ratio); }
    W = Math.max(320, W); H = Math.max(200, H);

    bufferCanvas.width = W; bufferCanvas.height = H;
    imageData = bctx.createImageData(W, H);
    buffer = new Uint32Array(imageData.data.buffer);
    zbuf = new Float32Array(W);
    skyCache = new Array(H + 2);
  }

  function skyColor(dy, f) {
    const t = clamp(dy / (f * 1.55), 0, 1);
    const r = lerp(219, 106, Math.pow(t, .75));
    const g = lerp(201, 148, Math.pow(t, .8));
    const b = lerp(171, 186, Math.pow(t, .8));
    return packRGB(r | 0, g | 0, b | 0);
  }

  const camObj = { scoped: false, planeLen: 0, yaw: 0, pitch: 0, dirX: 0, dirY: 0, planeX: 0, planeY: 0, f: 0, eye: 0, horizon: 0, invDet: 0 };
  function getCam() {
    const scoped = player.scope && player.alive;
    const hfov = scoped ? hfovScope : hfovNormal;
    const planeLen = Math.tan(hfov / 2);
    const yaw = player.yaw + player.recoilYaw;
    let pitch = player.pitch + player.recoilPitch;
    pitch = clamp(pitch, -0.46, 0.46);
    const dirX = Math.cos(yaw), dirY = Math.sin(yaw);
    const planeX = -dirY * planeLen, planeY = dirX * planeLen;
    const f = (W / 2) / planeLen;
    const eye = getEyeHeight();
    const horizon = H / 2 + Math.tan(pitch) * f;
    camObj.scoped = scoped;
    camObj.planeLen = planeLen;
    camObj.yaw = yaw;
    camObj.pitch = pitch;
    camObj.dirX = dirX;
    camObj.dirY = dirY;
    camObj.planeX = planeX;
    camObj.planeY = planeY;
    camObj.f = f;
    camObj.eye = eye;
    camObj.horizon = horizon;
    camObj.invDet = -1 / planeLen;
    return camObj;
  }

  function renderWorld(cam) {
    const px = player.x, py = player.y;
    const { dirX, dirY, planeX, planeY, f, eye, horizon } = cam;

    // ---- cielo ----
    const skyEnd = Math.min(H, Math.ceil(horizon));
    for (let y = 0; y < skyEnd; y++) {
      let c = skyCache[y];
      if (c === undefined) { c = skyColor(horizon - y, f); skyCache[y] = c; }
      buffer.fill(c, y * W, y * W + W);
    }
    if (horizon >= H) {
      for (let y = 0; y < H; y++) {
        let c = skyCache[y];
        if (c === undefined) { c = skyColor(horizon - y, f); skyCache[y] = c; }
        buffer.fill(c, y * W, y * W + W);
      }
    }

    // ---- suelo (floor casting) ----
    const rdx0 = dirX - planeX, rdy0 = dirY - planeY;
    const rdx1 = dirX + planeX, rdy1 = dirY + planeY;
    const startY = Math.max(0, Math.floor(horizon) + 1);
    for (let y = startY; y < H; y++) {
      const p = y - horizon;
      const rowDist = eye * f / p;
      const rowBase = y * W;
      if (!(rowDist > 0) || rowDist > 70) {
        buffer.fill(FOG_COLOR, rowBase, rowBase + W);
        continue;
      }
      const stepX = rowDist * (rdx1 - rdx0) / W;
      const stepY = rowDist * (rdy1 - rdy0) / W;
      let fx = px + rowDist * rdx0;
      let fy = py + rowDist * rdy0;
      // Iluminación dinámica del suelo: atenuación a distancia + fog + flash de disparo
      const flashFloor = (player.flashTimer > 0) ? Math.round((player.flashTimer / 0.055) * 4 * Math.max(0, 1 - rowDist / 5.5)) : 0;
      const lvl = clamp(Math.floor(SHADES - 1 - rowDist * 1.28) + 1 + flashFloor, 0, SHADES - 1);
      const lvlBase = lvl * 4096;
      for (let x = 0; x < W; x++) {
        if (fx >= 0 && fy >= 0 && fx < MW && fy < MH) {
          const cx = fx | 0, cy = fy | 0;
          const id = FLOOR_MAP[cy * MW + cx];
          const lut = FLOOR_TEX[id].lut;
          const tx = ((fx - cx) * 64) | 0;
          const ty = ((fy - cy) * 64) | 0;
          buffer[rowBase + x] = lut[lvlBase + (ty << 6) + tx];
        } else {
          buffer[rowBase + x] = FOG_COLOR;
        }
        fx += stepX; fy += stepY;
      }
    }

    // ---- paredes (DDA) ----
    for (let x = 0; x < W; x++) {
      const cameraX = 2 * x / W - 1;
      const rdx = dirX + planeX * cameraX;
      const rdy = dirY + planeY * cameraX;
      let mapX = px | 0, mapY = py | 0;
      const deltaX = rdx === 0 ? 1e30 : Math.abs(1 / rdx);
      const deltaY = rdy === 0 ? 1e30 : Math.abs(1 / rdy);
      let stepX, stepY, sideDistX, sideDistY;
      if (rdx < 0) { stepX = -1; sideDistX = (px - mapX) * deltaX; }
      else { stepX = 1; sideDistX = (mapX + 1 - px) * deltaX; }
      if (rdy < 0) { stepY = -1; sideDistY = (py - mapY) * deltaY; }
      else { stepY = 1; sideDistY = (mapY + 1 - py) * deltaY; }

      let hit = 0, side = 0, steps = 0;
      while (!hit && steps++ < 90) {
        if (sideDistX < sideDistY) { sideDistX += deltaX; mapX += stepX; side = 0; }
        else { sideDistY += deltaY; mapY += stepY; side = 1; }
        if (mapX < 0 || mapY < 0 || mapX >= MW || mapY >= MH) break;
        if (GRID[mapY * MW + mapX] !== 0) hit = 1;
      }
      if (!hit) { zbuf[x] = 1e9; continue; }

      let perp = side === 0 ? sideDistX - deltaX : sideDistY - deltaY;
      if (perp < 0.04) perp = 0.04;
      zbuf[x] = perp;

      const lineH = f / perp;
      const top = horizon + (eye - 1) * f / perp;
      const bottom = horizon + eye * f / perp;
      let y0 = Math.max(0, Math.ceil(top));
      let y1 = Math.min(H - 1, Math.floor(bottom));
      if (y1 < y0) continue;

      let wallX = side === 0 ? py + perp * rdy : px + perp * rdx;
      wallX -= Math.floor(wallX);
      let tx = (wallX * 64) | 0;
      if ((side === 0 && rdx > 0) || (side === 1 && rdy < 0)) tx = 63 - tx;

      const wallId = GRID[mapY * MW + mapX];
      const tex = WALL_TEX[wallId] || WALL_TEX[1];
      // Iluminación direccional realista (sol desértico) según orientación normal de la pared
      let sunOffset = 0;
      if (side === 0) {
        sunOffset = (stepX < 0) ? 0 : -2; // Pared mirando al Este vs Oeste
      } else {
        sunOffset = (stepY < 0) ? 1 : -4; // Pared mirando al Sur (sol directo) vs Norte (sombra)
      }
      // Flash de boca dinámico iluminando paredes cercanas
      const wallFlash = (player.flashTimer > 0) ? Math.round((player.flashTimer / 0.055) * 4 * Math.max(0, 1 - perp / 7.2)) : 0;
      // Resplandor del led del C4 plantado en paredes cercanas
      let bombGlow = 0;
      if (bomb.state === 'planted') {
        const dBomb = dist2D(mapX + 0.5, mapY + 0.5, bomb.x, bomb.y);
        if (dBomb < 5.5) {
          const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 130);
          bombGlow = Math.round(pulse * 2 * (1 - dBomb / 5.5));
        }
      }
      const lvl = clamp(Math.floor(SHADES - 1 - perp * 1.26) + sunOffset + wallFlash + bombGlow, 0, SHADES - 1);
      const lvlBase = lvl * 4096;
      const step = 64 / lineH;
      let texPos = (y0 - top) * step;
      for (let y = y0; y <= y1; y++) {
        const ty = (texPos | 0) & 63;
        buffer[y * W + x] = tex.lut[lvlBase + (ty << 6) + tx];
        texPos += step;
      }
    }
  }

  /* ---------------- sprites ---------------- */
  function addSprite(list, sprite, x, y, worldH, worldW, zOff) {
    const cam = list.cam;
    const relX = x - player.x, relY = y - player.y;
    const depth = cam.invDet * (-cam.planeY * relX + cam.planeX * relY);
    if (depth < 0.12) return;
    const lateral = cam.dirX * relY - cam.dirY * relX;
    const sx = W / 2 + cam.f * lateral / depth;
    list.items.push({ sprite, x, y, depth, sx, worldH, worldW, zOff: zOff || 0 });
  }

  function drawSpriteItem(sp, cam) {
    const { sprite, depth, sx, worldH, worldW, zOff } = sp;
    const hPx = worldH * cam.f / depth;
    const wPx = worldW * cam.f / depth;
    if (hPx < 0.8 || wPx < 0.5) return;
    const bottom = cam.horizon + (cam.eye - zOff) * cam.f / depth;
    const top = bottom - hPx;
    const left = sx - wPx / 2;
    const x0 = Math.max(0, Math.ceil(left));
    const x1 = Math.min(W - 1, Math.floor(left + wPx - 1));
    const y0 = Math.max(0, Math.ceil(top));
    const y1 = Math.min(H - 1, Math.floor(bottom));
    if (x1 < x0 || y1 < y0) return;

    const lvl = clamp(Math.floor((sprite.levels - 1) - depth * 0.72), 0, sprite.levels - 1);
    const lutBase = lvl * sprite.w * sprite.h;
    const invW = 1 / wPx, invH = 1 / hPx;
    for (let x = x0; x <= x1; x++) {
      if (zbuf[x] < depth) continue;
      const texX = ((x + 0.5 - left) * invW * sprite.w) | 0;
      if (texX < 0 || texX >= sprite.w) continue;
      const colBase = lutBase + texX;
      for (let y = y0; y <= y1; y++) {
        const texY = ((y + 0.5 - top) * invH * sprite.h) | 0;
        if (texY < 0 || texY >= sprite.h) continue;
        const c = sprite.lut[colBase + texY * sprite.w];
        if (c !== 0) buffer[y * W + x] = c;
      }
    }
  }

  function renderSprites(cam) {
    const list = { items: [], cam };
    for (const bot of bots) {
      if (!bot.alive) continue;
      let pose = 'idle';
      if (bot.shootPose > 0) pose = 'shoot';
      else if (bot.moving) pose = (Math.floor(bot.walkPhase) % 2 === 0) ? 'walk1' : 'walk2';
      const spriteSet = (bot.team === 'ct' ? CT_SPRITES : BOT_SPRITES);
      const sprite = spriteSet[bot.variant % 2][pose];
      let zOff = 0;
      if (bot.moving) zOff = Math.abs(Math.sin(bot.walkPhase * Math.PI)) * 0.012;
      addSprite(list, sprite, bot.x, bot.y, BOT_H, BOT_W, zOff);
      if (bomb.state === 'carried' && bomb.carrier === bot) {
        // pequeño indicador de portador
        const d = Math.hypot(bot.x - player.x, bot.y - player.y);
        if (d < 16) {
          const relX = bot.x - player.x, relY = bot.y - player.y;
          const depth = cam.invDet * (-cam.planeY * relX + cam.planeX * relY);
          if (depth > 0.2) {
            const lateral = cam.dirX * relY - cam.dirY * relX;
            const sx = W / 2 + cam.f * lateral / depth;
            const sy = cam.horizon + (cam.eye - 0.92) * cam.f / depth;
            bot._marker = { sx, sy, depth };
          } else bot._marker = null;
        } else bot._marker = null;
      } else bot._marker = null;
    }
    if (window.Multiplayer && Multiplayer.active) {
      const remotes = Multiplayer.getRemotePlayers();
      for (const rp of remotes) {
        if (!rp.alive) continue;
        const spriteSet = rp.team === 'ct' ? CT_SPRITES : BOT_SPRITES;
        const pose = rp.pose || 'idle';
        const sprite = spriteSet[(rp.id ? rp.id.charCodeAt(0) : 0) % 2][pose] || spriteSet[0].idle;
        addSprite(list, sprite, rp.x, rp.y, BOT_H, BOT_W, 0);
      }
    }
    for (const c of corpses) {
      addSprite(list, CORPSE_SPRITES[c.variant], c.x, c.y, CORPSE_H, CORPSE_W, 0);
    }
    if (typeof droppedWeapons !== 'undefined') {
      for (const dw of droppedWeapons) {
        const sprite = DROPPED_WEAPON_SPRITES[dw.id] || DROPPED_WEAPON_SPRITES.ak;
        if (sprite) {
          const bob = Math.sin(game.time * 2.8 + (dw.bobPhase || 0)) * 0.015;
          addSprite(list, sprite, dw.x, dw.y, WEAPON_DROP_H, WEAPON_DROP_W, 0.04 + bob);
        }
      }
    }
    if (bomb.state === 'planted' || bomb.state === 'dropped') {
      addSprite(list, BOMB_SPRITE, bomb.x, bomb.y, BOMB_H, BOMB_W, 0);
    }
    list.items.sort((a, b) => b.depth - a.depth);
    for (const it of list.items) drawSpriteItem(it, cam);
  }

  /* ---------------- proyección para efectos 2D ---------------- */
  function project(x, y, z, cam) {
    const relX = x - player.x, relY = y - player.y;
    const depth = cam.invDet * (-cam.planeY * relX + cam.planeX * relY);
    if (depth < 0.15) return null;
    const lateral = cam.dirX * relY - cam.dirY * relX;
    return {
      x: W / 2 + cam.f * lateral / depth,
      y: cam.horizon + (cam.eye - z) * cam.f / depth,
      depth
    };
  }

  function drawEffects(cam) {
    const scale = viewW / W;
    const ox = 0, oy = 0;
    // trazadoras
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const t of tracers) {
      const a = clamp(t.life / t.maxLife, 0, 1);
      const p1 = project(t.x1, t.y1, t.z1, cam);
      const p2 = project(t.x2, t.y2, t.z2, cam);
      if (!p1 || !p2) continue;
      const mx = (p1.x + p2.x) / 2;
      const zx = clamp(mx | 0, 0, W - 1);
      if (zbuf[zx] < Math.min(p1.depth, p2.depth) * 0.92) continue;
      ctx.strokeStyle = `rgba(${t.color},${0.65 * a})`;
      ctx.lineWidth = Math.max(1, t.width * scale);
      ctx.beginPath();
      ctx.moveTo(p1.x * scale + ox, p1.y * scale + oy);
      ctx.lineTo(p2.x * scale + ox, p2.y * scale + oy);
      ctx.stroke();
    }
    ctx.restore();

    // partículas
    for (const p of particles) {
      const pr = project(p.x, p.y, p.z, cam);
      if (!pr) continue;
      const cx = pr.x * scale, cy = pr.y * scale;
      const zx = clamp(pr.x | 0, 0, W - 1);
      if (zbuf[zx] < pr.depth * 0.95) continue;
      const a = clamp(p.life / p.maxLife, 0, 1);
      const radius = Math.max(0.7, p.size * cam.f / pr.depth * scale * 0.8);
      ctx.fillStyle = `rgba(${p.color},${a * 0.9})`;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, TAU);
      ctx.fill();
    }

    // brillo de la bomba
    if (bomb.state === 'planted') {
      const pr = project(bomb.x, bomb.y, 0.16, cam);
      if (pr) {
        const zx = clamp(pr.x | 0, 0, W - 1);
        if (zbuf[zx] > pr.depth) {
          const pulse = 0.55 + 0.45 * Math.sin(performance.now() / 130);
          const r = Math.max(10, 26 * cam.f / pr.depth * scale);
          const gr = ctx.createRadialGradient(pr.x * scale, pr.y * scale, 0, pr.x * scale, pr.y * scale, r);
          gr.addColorStop(0, `rgba(255,60,40,${0.55 * pulse})`);
          gr.addColorStop(0.45, `rgba(255,30,20,${0.18 * pulse})`);
          gr.addColorStop(1, 'rgba(255,0,0,0)');
          ctx.fillStyle = gr;
          ctx.beginPath(); ctx.arc(pr.x * scale, pr.y * scale, r, 0, TAU); ctx.fill();
        }
      }
    }

    // marcador del portador
    for (const bot of bots) {
      if (!bot.alive || !bot._marker) continue;
      const { sx, sy, depth } = bot._marker;
      const zx = clamp(sx | 0, 0, W - 1);
      if (zbuf[zx] < depth) continue;
      const blink = 0.5 + 0.5 * Math.sin(performance.now() / 220);
      const px = sx * scale, py = sy * scale;
      ctx.fillStyle = `rgba(255,190,60,${0.55 + 0.45 * blink})`;
      ctx.beginPath();
      ctx.moveTo(px, py - 7);
      ctx.lineTo(px + 6, py);
      ctx.lineTo(px, py + 7);
      ctx.lineTo(px - 6, py);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 1; ctx.stroke();
    }

    // nombres de jugadores en multijugador
    if (window.Multiplayer && Multiplayer.active) {
      const remotes = Multiplayer.getRemotePlayers();
      ctx.save();
      ctx.font = 'bold 11px "Segoe UI", Arial, sans-serif';
      ctx.textAlign = 'center';
      for (const rp of remotes) {
        if (!rp.alive) continue;
        const pr = project(rp.x, rp.y, BOT_H + 0.14, cam);
        if (!pr) continue;
        const zx = clamp(pr.x | 0, 0, W - 1);
        if (zbuf[zx] < pr.depth * 0.96) continue;
        const px = pr.x * scale, py = pr.y * scale;
        const isTeammate = rp.team === player.team;
        const col = isTeammate ? '#7fd1ff' : '#ff9a55';
        ctx.fillStyle = 'rgba(8,10,8,.75)';
        ctx.fillRect(px - 44, py - 14, 88, 16);
        ctx.strokeStyle = isTeammate ? 'rgba(127,209,255,.5)' : 'rgba(255,154,85,.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px - 44, py - 14, 88, 16);
        ctx.fillStyle = col;
        ctx.fillText(rp.name || 'JUGADOR', px, py - 2);
      }
      ctx.restore();
    }

    // Etiquetas de armas en el suelo
    if (typeof droppedWeapons !== 'undefined' && droppedWeapons.length > 0) {
      ctx.save();
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      for (const dw of droppedWeapons) {
        const d = dist2D(player.x, player.y, dw.x, dw.y);
        if (d > 4.5) continue;
        const pr = project(dw.x, dw.y, 0.28, cam);
        if (!pr) continue;
        const zx = clamp(pr.x | 0, 0, W - 1);
        if (zbuf[zx] < pr.depth * 0.95) continue;
        const px = pr.x * scale, py = pr.y * scale;
        const wDef = WEAPONS[dw.id];
        const name = wDef ? wDef.name : 'ARMA';
        ctx.fillStyle = 'rgba(10,12,10,0.72)';
        ctx.fillRect(px - 36, py - 12, 72, 15);
        ctx.strokeStyle = 'rgba(242,163,58,0.5)';
        ctx.lineWidth = 1;
        ctx.strokeRect(px - 36, py - 12, 72, 15);
        ctx.fillStyle = '#ffd9a0';
        ctx.fillText(name, px, py - 1);
      }
      ctx.restore();
    }
  }

  /* ---------------- armas (viewmodel) y manos en primera persona ---------------- */
  function fillRound(c, x, y, w, h, r, fill, stroke) {
    c.beginPath();
    const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    c.moveTo(x + rr, y);
    c.arcTo(x + w, y, x + w, y + h, rr);
    c.arcTo(x + w, y + h, x, y + h, rr);
    c.arcTo(x, y + h, x, y, rr);
    c.arcTo(x, y, x + w, y, rr);
    c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1.6; c.stroke(); }
  }

  function muzzle(c, x, y, s, alpha) {
    if (alpha <= 0) return;
    c.save();
    c.globalCompositeOperation = 'lighter';
    const gr = c.createRadialGradient(x, y, 0, x, y, 52 * s);
    gr.addColorStop(0, `rgba(255,245,210,${0.95 * alpha})`);
    gr.addColorStop(0.25, `rgba(255,200,90,${0.75 * alpha})`);
    gr.addColorStop(0.7, `rgba(255,130,30,${0.35 * alpha})`);
    gr.addColorStop(1, 'rgba(255,90,10,0)');
    c.fillStyle = gr;
    c.beginPath(); c.arc(x, y, 52 * s, 0, TAU); c.fill();
    c.fillStyle = `rgba(255,250,230,${alpha})`;
    c.beginPath();
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU;
      const rr = (i % 2 ? 14 : 38) * s;
      c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    c.closePath(); c.fill();
    c.restore();
  }

  function drawTacticalArm(c, x1, y1, x2, y2, w1, w2, team, isLeft) {
    const isCT = (team === 'ct');
    const sleeve = isCT ? '#202937' : '#5c523f';
    const sleeveDark = isCT ? '#131922' : '#3e3729';
    const sleeveLight = isCT ? '#334155' : '#736850';
    const cuffColor = isCT ? '#11141a' : '#272218';

    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;

    c.save();
    c.beginPath();
    c.moveTo(x1 - nx * w1 * 0.5, y1 - ny * w1 * 0.5);
    c.lineTo(x2 - nx * w2 * 0.5, y2 - ny * w2 * 0.5);
    c.lineTo(x2 + nx * w2 * 0.5, y2 + ny * w2 * 0.5);
    c.lineTo(x1 + nx * w1 * 0.5, y1 + ny * w1 * 0.5);
    c.closePath();

    const gr = c.createLinearGradient(
      x1 - nx * w1 * 0.5, y1 - ny * w1 * 0.5,
      x1 + nx * w1 * 0.5, y1 + ny * w1 * 0.5
    );
    gr.addColorStop(0, sleeveDark);
    gr.addColorStop(0.35, sleeveLight);
    gr.addColorStop(0.75, sleeve);
    gr.addColorStop(1, sleeveDark);
    c.fillStyle = gr;
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.6)';
    c.lineWidth = 2;
    c.stroke();

    // Costuras y pliegues tácticos de la tela
    c.strokeStyle = sleeveDark;
    c.lineWidth = 2.4;
    c.beginPath();
    const mx = (x1 + x2) * 0.5, my = (y1 + y2) * 0.5;
    c.moveTo(mx - nx * w1 * 0.35, my - ny * w1 * 0.35);
    c.quadraticCurveTo(mx, my, mx + nx * w1 * 0.3, my + ny * w1 * 0.3);
    c.stroke();

    // Muñequera táctica / correa de velcro del guante
    c.save();
    c.translate(x2, y2);
    const ang = Math.atan2(dy, dx);
    c.rotate(ang);
    fillRound(c, -8, -w2 * 0.58, 15, w2 * 1.16, 4, cuffColor, 'rgba(0,0,0,0.8)');
    c.fillStyle = 'rgba(255,255,255,0.12)';
    c.fillRect(-4, -w2 * 0.45, 5, w2 * 0.9);
    c.restore();

    c.restore();
  }

  function drawTacticalGlove(c, x, y, r, rot, flip) {
    c.save();
    c.translate(x, y);
    c.rotate(rot);
    if (flip) c.scale(1, -1);

    const gloveDark = '#181a1c';
    const gloveMid  = '#26292b';
    const gloveLight = '#3b4043';
    const armorKnuckle = '#0f1011';

    // Palma y dorso del guante
    fillRound(c, -r * 0.55, -r * 0.5, r * 1.1, r * 1.05, r * 0.35, gloveMid, 'rgba(0,0,0,0.85)');

    // Placa protectora de nudillos de composite de carbono
    fillRound(c, -r * 0.35, -r * 0.45, r * 0.75, r * 0.45, r * 0.22, armorKnuckle, 'rgba(0,0,0,0.9)');
    c.fillStyle = 'rgba(255,255,255,0.16)';
    c.fillRect(-r * 0.25, -r * 0.4, r * 0.55, 2.5);

    // Dedos articulados envolviendo la empuñadura / guardamanos
    const fingerW = r * 0.24;
    const fingerLen = r * 0.70;
    for (let f = 0; f < 4; f++) {
      const fy = -r * 0.38 + f * (fingerW + 2);
      const fx = r * 0.24;
      fillRound(c, fx, fy, fingerLen, fingerW, fingerW * 0.4, gloveDark, 'rgba(0,0,0,0.8)');
      // Almohadilla de agarre antideslizante
      c.fillStyle = gloveLight;
      c.fillRect(fx + 3, fy + 2, fingerLen * 0.45, fingerW * 0.5);
    }

    // Pulgar táctico
    c.save();
    c.translate(-r * 0.2, r * 0.35);
    c.rotate(0.5);
    fillRound(c, 0, -r * 0.18, r * 0.65, r * 0.32, r * 0.15, gloveDark, 'rgba(0,0,0,0.85)');
    c.fillStyle = 'rgba(255,255,255,0.12)';
    c.fillRect(4, -r * 0.12, r * 0.4, 2);
    c.restore();

    c.restore();
  }

  function drawWeaponAndHands(c, def, team, s, flash, isPistol, isKnife) {
    if (isKnife) {
      // Brazo izquierdo en guardia táctica
      drawTacticalArm(c, -160, 210, -85, 75, 76, 50, team, true);
      drawTacticalGlove(c, -85, 75, 28, -0.35, false);

      // Brazo derecho sosteniendo el cuchillo
      drawTacticalArm(c, 150, 220, 28, 25, 80, 52, team, false);

      // Mango táctico del cuchillo
      fillRound(c, 2, -26, 20, 52, 6, '#232525', '#0b0c0c');
      fillRound(c, 0, 22, 24, 8, 3, '#8d9496', '#090a0a');
      c.fillStyle = '#141617';
      for (let i = 0; i < 4; i++) c.fillRect(5, -20 + i * 9, 14, 4);

      // Guarda de acero
      fillRound(c, -10, -32, 44, 8, 3, '#757c80', '#101213');

      // Hoja táctica tipo bayoneta de combate
      c.beginPath();
      c.moveTo(10, -32);
      c.lineTo(6, -135);
      c.lineTo(-12, -115);
      c.lineTo(-8, -32);
      c.closePath();
      const bladeGrad = c.createLinearGradient(-10, -80, 10, -80);
      bladeGrad.addColorStop(0, '#667075');
      bladeGrad.addColorStop(0.35, '#cdd6db');
      bladeGrad.addColorStop(0.7, '#ffffff');
      bladeGrad.addColorStop(1, '#8f989c');
      c.fillStyle = bladeGrad;
      c.fill();
      c.strokeStyle = '#434b4f';
      c.lineWidth = 1.8;
      c.stroke();

      // Bisel afilado y canal de sangre
      c.beginPath();
      c.moveTo(8, -34);
      c.lineTo(5, -130);
      c.lineTo(0, -110);
      c.lineTo(0, -34);
      c.closePath();
      c.fillStyle = 'rgba(255,255,255,0.45)';
      c.fill();

      // Mano derecha empuñando el cuchillo
      drawTacticalGlove(c, 12, -6, 32, 0.22, false);
      return;
    }

    if (isPistol) {
      // Brazo y mano izquierda en agarre táctico de dos manos (Weaver)
      drawTacticalArm(c, -85, 220, -8, 28, 76, 48, team, true);
      drawTacticalGlove(c, -6, 24, 30, 0.42, false);

      // Brazo derecho
      drawTacticalArm(c, 145, 220, 18, 30, 78, 50, team, false);

      if (def.id === 'glock') {
        // Glock-18
        fillRound(c, -78, -34, 82, 22, 3, '#1c1f20', '#070808');
        c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(-74, -32, 70, 2);
        // Ranuras traseras de la corredera
        c.fillStyle = 'rgba(0,0,0,0.35)';
        for (let i = 0; i < 5; i++) c.fillRect(-10 + i * 4, -31, 2, 16);
        // Armazón y empuñadura
        fillRound(c, -46, -16, 50, 15, 3, '#181a1b', '#070808');
        fillRound(c, -4, -14, 24, 56, 5, '#17191a', '#070808');
        // Mano derecha
        drawTacticalGlove(c, 14, 10, 32, 0.2, false);
        muzzle(c, -80, -23, s, flash);
        return;
      }

      if (def.id === 'deagle') {
        // Desert Eagle .50 AE — corredera maciza en cromo cepillado
        fillRound(c, -88, -38, 92, 28, 4, '#82898c', '#0f1112');
        c.fillStyle = 'rgba(255,255,255,0.3)'; c.fillRect(-82, -35, 78, 3);
        // Ranuras y bisel frontal
        c.fillStyle = 'rgba(0,0,0,0.25)';
        for (let i = 0; i < 6; i++) c.fillRect(-22 + i * 6, -32, 3, 18);
        fillRound(c, -50, -14, 54, 16, 3, '#2a2d2e', '#0b0c0c');
        fillRound(c, -4, -12, 28, 58, 5, '#181a1b', '#0b0c0c');
        c.fillStyle = 'rgba(255,255,255,0.06)'; c.fillRect(4, 5, 5, 40);
        // Mano derecha
        drawTacticalGlove(c, 14, 10, 34, 0.2, false);
        muzzle(c, -90, -24, s, flash);
        return;
      }

      // USP-S (táctica con silenciador acoplado)
      fillRound(c, -74, -34, 78, 20, 3, '#222527', '#08090a');
      c.fillStyle = 'rgba(255,255,255,0.14)'; c.fillRect(-70, -32, 66, 2);
      // Silenciador táctico QD
      fillRound(c, -150, -33, 78, 18, 4, '#1b1d1e', '#070808');
      c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(-142, -31, 62, 2);
      // Puntos de mira
      c.fillStyle = '#ffffff'; c.fillRect(-72, -37, 3, 3); c.fillRect(-2, -37, 3, 3);
      fillRound(c, -44, -16, 48, 15, 3, '#1f2223', '#08090a');
      fillRound(c, -4, -14, 24, 56, 5, '#1b1d1e', '#08090a');
      // Mano derecha
      drawTacticalGlove(c, 14, 10, 32, 0.2, false);
      muzzle(c, -152, -24, s, flash);
      return;
    }

    // Fusiles de asalto, francotirador y subfusiles (AK-47, M4A1-S, AWP, MP5)
    // Brazo izquierdo apoyando el guardamanos desde abajo
    drawTacticalArm(c, -140, 230, -68, 22, 80, 52, team, true);

    // Brazo derecho en la empuñadura
    drawTacticalArm(c, 160, 230, 46, 26, 82, 54, team, false);

    if (def.id === 'ak') {
      // AK-47 — Culata de madera rusa laminada
      fillRound(c, 88, -22, 56, 34, 5, '#874b24', '#080909');
      fillRound(c, 134, -18, 20, 28, 4, '#6b3716', '#080909');
      c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(92, -18, 46, 3);
      // Cajón de mecanismos de acero estampado
      fillRound(c, 18, -25, 86, 38, 5, '#222527', '#080909');
      // Guardamanos de madera
      fillRound(c, -92, -26, 72, 23, 4, '#874b24', '#080909');
      fillRound(c, -88, -22, 64, 17, 3, '#a05c30', '#080909');
      // Cañón, tubo de gases y punto de mira
      fillRound(c, -160, -30, 84, 11, 3, '#181a1a', '#060707');
      fillRound(c, -172, -32, 16, 15, 3, '#222525', '#060707');
      fillRound(c, -162, -42, 7, 12, 2, '#181a1a', '#060707');
      // Cargador curvo banana
      c.save(); c.translate(6, -2); c.rotate(0.32);
      fillRound(c, 0, 0, 27, 60, 5, '#965c26', '#080909');
      c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(4, 6, 5, 46);
      c.restore();
      // Empuñadura
      fillRound(c, 44, -12, 22, 40, 5, '#874b24', '#080909');
      // Mano izquierda en el guardamanos
      drawTacticalGlove(c, -68, 14, 30, -0.22, false);
      // Mano derecha en el gatillo
      drawTacticalGlove(c, 48, 18, 34, 0.25, false);
      muzzle(c, -180, -24, s, flash);
      return;
    }

    if (def.id === 'awp') {
      // AWP — Chasis verde oliva OD con culata perforada
      fillRound(c, 46, -34, 76, 36, 6, '#3e4d38', '#0b0d0a');
      fillRound(c, 16, -30, 102, 28, 5, '#485740', '#0b0d0a');
      c.fillStyle = 'rgba(255,255,255,0.08)'; c.fillRect(20, -28, 80, 2);
      // Guardamanos
      fillRound(c, -112, -24, 80, 20, 4, '#394630', '#0b0d0a');
      // Cañón flotante pesado
      fillRound(c, -165, -30, 180, 10, 3, '#242a25', '#080a08');
      // Freno de boca masivo de doble deflector
      fillRound(c, -186, -34, 24, 18, 4, '#1b201c', '#080a08');
      // Cerrojo cromado
      c.fillStyle = '#7a8277'; c.fillRect(28, -34, 28, 6);
      c.beginPath(); c.arc(58, -31, 4.5, 0, TAU); c.fill();
      // Mira telescópica de alta precisión
      fillRound(c, -54, -66, 96, 22, 8, '#161915', '#070807');
      fillRound(c, -64, -72, 20, 32, 5, '#222720', '#070807');
      fillRound(c, 36, -70, 18, 28, 5, '#222720', '#070807');
      c.fillStyle = 'rgba(140,195,220,0.3)'; c.beginPath(); c.arc(45, -57, 5, 0, TAU); c.fill();
      // Cargador de 5 balas
      fillRound(c, -4, -8, 28, 32, 3, '#2e372a', '#080a08');
      // Mano izquierda en el apoyo delantero
      drawTacticalGlove(c, -74, 12, 32, -0.2, false);
      // Mano derecha
      drawTacticalGlove(c, 36, 18, 34, 0.22, false);
      muzzle(c, -188, -24, s, flash);
      return;
    }

    if (def.id === 'mp5') {
      // MP5-SD — Subfusil con silenciador integral
      fillRound(c, 20, -22, 60, 32, 5, '#222627', '#080909');
      fillRound(c, -70, -24, 92, 22, 4, '#282d2e', '#080909');
      // Silenciador integral estriado
      fillRound(c, -150, -28, 86, 20, 5, '#1e2122', '#070808');
      c.fillStyle = 'rgba(0,0,0,0.35)';
      for (let i = 0; i < 8; i++) c.fillRect(-142 + i * 10, -27, 4, 18);
      // Culata retráctil
      fillRound(c, 78, -18, 48, 14, 3, '#191c1d', '#080909');
      // Cargador curvo 9mm
      c.save(); c.translate(4, -2); c.rotate(0.24);
      fillRound(c, 0, 0, 22, 54, 4, '#1b1d1e', '#080909');
      c.restore();
      // Mano izquierda en el silenciador
      drawTacticalGlove(c, -65, 12, 30, -0.22, false);
      // Mano derecha
      drawTacticalGlove(c, 44, 16, 34, 0.24, false);
      muzzle(c, -152, -18, s, flash);
      return;
    }

    // M4A1-S (arma táctica con silenciador)
    fillRound(c, 20, -22, 90, 40, 6, '#232729', '#090a0a');
    fillRound(c, -84, -26, 134, 24, 4, '#2c3133', '#090a0a');
    fillRound(c, -80, -22, 62, 19, 3, '#3a4042', '#090a0a');
    // Cañón y silenciador cilíndrico
    fillRound(c, -155, -31, 88, 15, 4, '#202425', '#070808');
    fillRound(c, -178, -34, 28, 21, 5, '#181b1c', '#070808');
    c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(-168, -30, 16, 2);
    // Culata retráctil de carabina
    fillRound(c, 98, -20, 48, 32, 5, '#1e2224', '#090a0a');
    fillRound(c, 138, -18, 18, 28, 4, '#151819', '#090a0a');
    // Cargador STANAG
    c.save(); c.translate(6, -4); c.rotate(0.16);
    fillRound(c, 0, 0, 26, 52, 4, '#272b2d', '#080909');
    c.fillStyle = 'rgba(255,255,255,0.06)'; c.fillRect(4, 5, 4, 38);
    c.restore();
    // Asa superior y raíles
    fillRound(c, 42, -14, 20, 40, 4, '#202425', '#080909');
    c.fillStyle = '#151819'; c.fillRect(-62, -30, 92, 5);
    c.fillStyle = '#3e4547'; c.fillRect(-54, -37, 7, 9); c.fillRect(20, -37, 6, 9);
    // Mano izquierda en el guardamanos
    drawTacticalGlove(c, -64, 12, 30, -0.22, false);
    // Mano derecha en la empuñadura
    drawTacticalGlove(c, 48, 18, 34, 0.24, false);
    muzzle(c, -180, -24, s, flash);
  }

  function drawViewModel(cam, cw, ch) {
    if (!player.alive) return;
    if (game.state !== 'live' && game.state !== 'paused' && game.state !== 'roundover') return;
    if (player.scope) return;
    const def = getCurrentDef();
    if (!def) return;
    const c = ctx;

    const s = Math.max(0.88, Math.min(cw, ch) / 600);
    const speed = Math.hypot(player.vx, player.vy);
    const bob = player.bob;
    const walk = clamp(speed / 3.2, 0, 1);
    const bx = Math.sin(bob * 5.2) * 8 * walk + Math.sin(bob * 1.4) * 2;
    const by = Math.abs(Math.cos(bob * 5.2)) * 6 * walk;
    const kick = player.viewKick || 0;

    let reloadDip = 0, reloadRot = 0;
    if (player.reload > 0) {
      const t = 1 - player.reload / player.reloadTotal;
      reloadDip = Math.sin(t * Math.PI) * 75;
      reloadRot = Math.sin(t * Math.PI) * 0.32;
    }
    let drawDip = 0;
    if (player.drawTimer > 0) drawDip = (player.drawTimer / 0.42) * 140;
    const swayX = clamp(-player.recoilYaw * 14, -24, 24);
    const swayY = clamp(player.recoilPitch * 12, -18, 18);

    // Animación de ataque cuerpo a cuerpo con cuchillo
    let knifeSlashX = 0, knifeSlashY = 0, knifeSlashRot = 0;
    if (player.knifeSwing > 0) {
      const st = 1 - (player.knifeSwing / 0.3);
      knifeSlashRot = -Math.sin(st * Math.PI) * 0.75;
      knifeSlashX = -Math.sin(st * Math.PI) * 70;
      knifeSlashY = Math.sin(st * Math.PI) * 35;
    }

    const isPistol = (def.slot === 2);
    const isKnife = (def.id === 'knife');

    let anchorX = cw * 0.67 + bx + swayX;
    let anchorY = ch * 0.86 + by + kick * 28 + reloadDip + drawDip + swayY;
    if (isPistol) {
      anchorX = cw * 0.63 + bx + swayX * 0.7;
      anchorY = ch * 0.85 + by + kick * 32 + reloadDip + drawDip + swayY;
    } else if (isKnife) {
      anchorX = cw * 0.65 + bx + swayX + knifeSlashX;
      anchorY = ch * 0.84 + by + drawDip + knifeSlashY;
    }

    c.save();
    c.translate(anchorX, anchorY);
    c.scale(s, s);
    c.rotate(-0.035 + reloadRot + player.recoilPitch * 0.45 + knifeSlashRot);
    c.globalAlpha = clamp(1 - player.drawTimer / 0.45, 0, 1);

    const team = player.team || 'ct';
    const flash = player.flashTimer > 0 ? clamp(player.flashTimer / 0.055, 0, 1) : 0;

    drawWeaponAndHands(c, def, team, s, flash, isPistol, isKnife);

    c.restore();

    // Estela visual dinámica del cuchillo al atacar
    if (player.knifeSwing > 0) {
      const sw = player.knifeSwing / 0.3;
      c.save();
      c.globalAlpha = sw * 0.75;
      c.strokeStyle = 'rgba(235,245,255,0.85)';
      c.lineWidth = 4 * s;
      c.beginPath();
      c.arc(cw * 0.58, ch * 0.68, 130 * s, -1.0, 0.4);
      c.stroke();
      c.restore();
    }
  }

  /* ---------------- mira / scope ---------------- */
  function drawCrosshair(cw, ch) {
    if (!player.alive || player.scope || game.state !== 'live') return;
    const move = clamp(Math.hypot(player.vx, player.vy) / 3.2, 0, 1);
    const spread = (player.crossSpread || 0) + move * 7 + (player.recoilShots || 0) * 1.5;
    const gap = 5 + spread;
    const len = 8;
    const x = cw / 2, y = ch / 2;
    const colorMap = {
      green: 'rgba(110,255,140,.92)',
      cyan: 'rgba(80,220,255,.92)',
      yellow: 'rgba(255,225,80,.92)',
      red: 'rgba(255,80,80,.92)'
    };
    const col = colorMap[game.crosshairColor] || colorMap.green;
    ctx.save();
    ctx.lineCap = 'butt';
    ctx.strokeStyle = 'rgba(0,0,0,.55)';
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(x - gap - len, y); ctx.lineTo(x - gap, y);
    ctx.moveTo(x + gap, y); ctx.lineTo(x + gap + len, y);
    ctx.moveTo(x, y - gap - len); ctx.lineTo(x, y - gap);
    ctx.moveTo(x, y + gap); ctx.lineTo(x, y + gap + len);
    ctx.stroke();
    ctx.strokeStyle = col;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x - gap - len, y); ctx.lineTo(x - gap, y);
    ctx.moveTo(x + gap, y); ctx.lineTo(x + gap + len, y);
    ctx.moveTo(x, y - gap - len); ctx.lineTo(x, y - gap);
    ctx.moveTo(x, y + gap); ctx.lineTo(x, y + gap + len);
    ctx.stroke();
    ctx.fillStyle = col;
    ctx.fillRect(x - 1, y - 1, 2, 2);
    ctx.restore();
  }

  function drawScope(cw, ch) {
    if (!player.scope || !player.alive) return;
    const cx = cw / 2, cy = ch / 2;
    const R = Math.min(cw, ch) * 0.41;
    ctx.save();
    // fuera del círculo
    ctx.beginPath();
    ctx.rect(0, 0, cw, ch);
    ctx.arc(cx, cy, R, 0, TAU, true);
    ctx.fillStyle = '#000';
    ctx.fill('evenodd');
    // borde de la lente
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU);
    const gr = ctx.createRadialGradient(cx, cy, R * .55, cx, cy, R);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(.82, 'rgba(0,0,0,.18)');
    gr.addColorStop(1, 'rgba(0,0,0,.9)');
    ctx.fillStyle = gr; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.95)'; ctx.lineWidth = 10; ctx.stroke();
    ctx.strokeStyle = 'rgba(210,225,215,.12)'; ctx.lineWidth = 1.5; ctx.stroke();
    // retícula
    ctx.strokeStyle = 'rgba(10,16,12,.92)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cx - R, cy); ctx.lineTo(cx - 18, cy);
    ctx.moveTo(cx + 18, cy); ctx.lineTo(cx + R, cy);
    ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy - 18);
    ctx.moveTo(cx, cy + 18); ctx.lineTo(cx, cy + R);
    ctx.stroke();
    // marcas
    ctx.strokeStyle = 'rgba(10,16,12,.7)';
    for (let i = 1; i <= 4; i++) {
      const d = i * 22;
      ctx.beginPath();
      ctx.moveTo(cx - d, cy - 5); ctx.lineTo(cx - d, cy + 5);
      ctx.moveTo(cx + d, cy - 5); ctx.lineTo(cx + d, cy + 5);
      ctx.moveTo(cx - 5, cy - d); ctx.lineTo(cx + 5, cy - d);
      ctx.moveTo(cx - 5, cy + d); ctx.lineTo(cx + 5, cy + d);
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(190,215,200,.65)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 11, cy); ctx.lineTo(cx + 11, cy);
    ctx.moveTo(cx, cy - 11); ctx.lineTo(cx, cy + 11);
    ctx.stroke();
    ctx.fillStyle = 'rgba(220,40,30,.9)';
    ctx.beginPath(); ctx.arc(cx, cy, 1.6, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function drawSkySun(cw, ch, cam) {
    const sunYaw = 1.15; // Azimut del sol desértico (Sureste hacia Long A)
    const relAng = angleDiff(sunYaw, cam.yaw);
    if (Math.abs(relAng) < cam.planeLen * 1.5) {
      const sunX = (cw / 2) + Math.tan(relAng) * (cw / (2 * cam.planeLen));
      const sunY = (cam.horizon * (ch / H)) - (ch * 0.22);
      if (sunY < cam.horizon * (ch / H) + 20 && sunX > -100 && sunX < cw + 100) {
        const zCol = clamp(Math.round(sunX * W / cw), 0, W - 1);
        if (!zbuf || zbuf[zCol] > 18) {
          ctx.save();
          ctx.globalCompositeOperation = 'screen';
          const rSun = Math.min(cw, ch) * 0.15;
          const gr = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, rSun);
          gr.addColorStop(0, 'rgba(255, 255, 235, 0.9)');
          gr.addColorStop(0.25, 'rgba(255, 225, 140, 0.55)');
          gr.addColorStop(0.65, 'rgba(255, 175, 80, 0.20)');
          gr.addColorStop(1, 'rgba(255, 130, 40, 0)');
          ctx.fillStyle = gr;
          ctx.beginPath();
          ctx.arc(sunX, sunY, rSun, 0, TAU);
          ctx.fill();
          ctx.restore();
        }
      }
    }
  }

  /* ---------------- frame ---------------- */
  function render() {
    const cam = getCam();
    const cw = viewW, ch = viewH;
    renderWorld(cam);
    renderSprites(cam);
    bctx.putImageData(imageData, 0, 0);

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    let sx = 0, sy = 0;
    if (shake > 0.2) {
      sx = (Math.random() - .5) * shake * 2;
      sy = (Math.random() - .5) * shake * 2;
    }
    ctx.drawImage(bufferCanvas, 0, 0, W, H, sx, sy, cw + Math.abs(sx) * 1.2, ch + Math.abs(sy) * 1.2);
    if (sx || sy) { ctx.fillStyle = '#060706'; ctx.fillRect(0, ch - 1, cw, 1); }

    drawSkySun(cw, ch, cam);
    drawEffects(cam);

    // Viñeta táctica suave para atmósfera y contraste cinemático
    ctx.save();
    const vigR1 = Math.min(cw, ch) * 0.44;
    const vigR2 = Math.max(cw, ch) * 0.78;
    const vig = ctx.createRadialGradient(cw / 2, ch / 2, vigR1, cw / 2, ch / 2, vigR2);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(10,8,6,0.22)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, cw, ch);
    ctx.restore();

    drawViewModel(cam, cw, ch);
    drawCrosshair(cw, ch);
    drawScope(cw, ch);
  }

  function addShake(v) { shake = Math.min(16, shake + v); }
  function tick(dt) { shake *= Math.exp(-dt * 9); if (shake < 0.1) shake = 0; }

  window.addEventListener('resize', resize);
  resize();

  return { render, resize, addShake, tick, canvas, getWidth: () => W, getHeight: () => H };
})();

/* iconos para la tienda */
function drawWeaponIcon(canvas, id) {
  const g = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  g.clearRect(0, 0, w, h);
  g.save();
  g.translate(w / 2, h / 2 + 4);
  const s = Math.min(w / 240, h / 80);
  g.scale(s, s);
  g.lineJoin = 'round';
  const grad = g.createLinearGradient(0, -30, 0, 30);
  grad.addColorStop(0, 'rgba(235,220,185,.95)');
  grad.addColorStop(1, 'rgba(160,145,115,.7)');
  g.strokeStyle = 'rgba(0,0,0,.35)';
  g.lineWidth = 2;
  if (id === 'ak') {
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(-108, -10); g.lineTo(58, -12); g.lineTo(90, -18); g.lineTo(96, 4);
    g.lineTo(74, 8); g.lineTo(58, 20); g.lineTo(42, 20); g.lineTo(36, 8);
    g.lineTo(-8, 8); g.lineTo(-22, 32); g.lineTo(-42, 32); g.lineTo(-30, 8);
    g.lineTo(-108, 4); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = 'rgba(130,65,28,.95)';
    g.fillRect(-100, -8, 22, 10);
    g.fillRect(48, -10, 42, 16);
    g.fillStyle = 'rgba(50,50,45,.95)';
    g.fillRect(-22, 8, 16, 24);
  } else if (id === 'm4') {
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(-100, -10); g.lineTo(60, -14); g.lineTo(80, -8); g.lineTo(92, -8);
    g.lineTo(92, 4); g.lineTo(72, 6); g.lineTo(64, 16); g.lineTo(48, 16);
    g.lineTo(40, 6); g.lineTo(-30, 8); g.lineTo(-40, 26); g.lineTo(-60, 26);
    g.lineTo(-56, 6); g.lineTo(-100, 4); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = 'rgba(50,50,45,.9)';
    g.fillRect(-100, -10, 24, 7);
    g.fillRect(-30, 6, 15, 24);
  } else if (id === 'awp') {
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(-112, -8); g.lineTo(58, -10); g.lineTo(90, -16); g.lineTo(96, 2);
    g.lineTo(70, 8); g.lineTo(56, 20); g.lineTo(40, 20); g.lineTo(34, 8);
    g.lineTo(-40, 7); g.lineTo(-70, 18); g.lineTo(-94, 18); g.lineTo(-112, 6);
    g.closePath(); g.fill(); g.stroke();
    g.fillStyle = 'rgba(60,60,50,.95)';
    g.fillRect(-42, -26, 64, 12);
    g.fillRect(-22, -30, 10, 10);
    g.fillRect(22, -28, 8, 10);
  } else if (id === 'deagle') {
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(-70, -14); g.lineTo(32, -16); g.lineTo(42, -10); g.lineTo(42, 4);
    g.lineTo(16, 8); g.lineTo(8, 34); g.lineTo(-12, 34); g.lineTo(-16, 8);
    g.lineTo(-70, 4); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = 'rgba(50,50,45,.85)';
    g.fillRect(-70, -14, 100, 5);
  } else if (id === 'armor') {
    g.fillStyle = grad;
    g.beginPath();
    g.moveTo(0, -34); g.lineTo(34, -22); g.lineTo(30, 14); g.lineTo(0, 36);
    g.lineTo(-30, 14); g.lineTo(-34, -22); g.closePath(); g.fill(); g.stroke();
    g.strokeStyle = 'rgba(60,60,50,.5)'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, -24); g.lineTo(0, 24); g.stroke();
  } else if (id === 'kit') {
    g.fillStyle = grad;
    g.fillRect(-30, -24, 60, 48);
    g.strokeRect(-30, -24, 60, 48);
    g.strokeStyle = 'rgba(50,50,45,.9)'; g.lineWidth = 4;
    g.strokeRect(-38, -30, 76, 12);
    g.beginPath(); g.moveTo(0, -12); g.lineTo(0, 12); g.moveTo(-12, 0); g.lineTo(12, 0); g.stroke();
  }
  g.restore();
}
