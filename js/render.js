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
    H = 300;
    W = Math.round(H * ratio);
    if (W > 580) { W = 580; H = Math.round(W / ratio); }
    if (H > 380) { H = 380; W = Math.round(H * ratio); }
    W = Math.max(300, W); H = Math.max(180, H);

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
    return { scoped, planeLen, yaw, pitch, dirX, dirY, planeX, planeY, f, eye, horizon, invDet: -1 / planeLen };
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
      const lvl = clamp(Math.floor(SHADES - 1 - rowDist * 1.32) + 1, 0, SHADES - 1);
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
      const lvl = clamp(Math.floor(SHADES - 1 - perp * 1.32) - (side ? 3 : 0), 0, SHADES - 1);
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
  }

  /* ---------------- armas (viewmodel) ---------------- */
  function drawHand(c, x, y, r, rot, glove) {
    c.save(); c.translate(x, y); c.rotate(rot);
    fillRound(c, -r * .5, -r * .6, r, r * 1.2, r * .35, glove ? '#3b3a32' : '#a5764f', 'rgba(0,0,0,.7)');
    c.fillStyle = 'rgba(255,255,255,.06)';
    c.fillRect(-r * .3, -r * .45, r * .5, r * .15);
    c.restore();
  }
  function fillRound(c, x, y, w, h, r, fill, stroke) {
    c.beginPath();
    const rr = Math.min(r, w / 2, h / 2);
    c.moveTo(x + rr, y);
    c.arcTo(x + w, y, x + w, y + h, rr);
    c.arcTo(x + w, y + h, x, y + h, rr);
    c.arcTo(x, y + h, x, y, rr);
    c.arcTo(x, y, x + w, y, rr);
    c.closePath();
    c.fillStyle = fill; c.fill();
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1.6; c.stroke(); }
  }
  function muzzle(c, x, y, s, alpha) {
    if (alpha <= 0) return;
    c.save();
    c.globalCompositeOperation = 'lighter';
    const gr = c.createRadialGradient(x, y, 0, x, y, 46 * s);
    gr.addColorStop(0, `rgba(255,240,190,${.9 * alpha})`);
    gr.addColorStop(.25, `rgba(255,190,80,${.6 * alpha})`);
    gr.addColorStop(1, 'rgba(255,120,20,0)');
    c.fillStyle = gr;
    c.beginPath(); c.arc(x, y, 46 * s, 0, TAU); c.fill();
    c.fillStyle = `rgba(255,245,205,${alpha})`;
    c.beginPath();
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * TAU;
      const rr = (i % 2 ? 10 : 30) * s;
      c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    c.closePath(); c.fill();
    c.restore();
  }

  function drawWeaponModel(c, def, s, flash) {
    const dark = '#191b1b', mid = '#2c2f2f', light = '#414647';
    if (def.id === 'knife') {
      // mango
      fillRound(c, 6, -44, 20, 48, 6, '#2c2b26', '#0b0b09');
      c.fillStyle = '#413f35'; c.fillRect(11, -38, 4, 36);
      // hoja
      c.beginPath();
      c.moveTo(12, -40); c.lineTo(-8, -118); c.lineTo(22, -142); c.lineTo(28, -96); c.closePath();
      c.fillStyle = '#b9c2c4'; c.fill();
      c.strokeStyle = '#6f787a'; c.lineWidth = 2; c.stroke();
      c.beginPath(); c.moveTo(16, -48); c.lineTo(0, -114); c.lineTo(15, -128); c.closePath();
      c.fillStyle = 'rgba(255,255,255,.45)'; c.fill();
      drawHand(c, 18, -16, 26, 0.2, true);
      muzzle(c, -2, -130, s, flash * .6);
      return;
    }
    if (def.id === 'usp' || def.id === 'deagle') {
      const big = def.id === 'deagle';
      const silver = big ? '#6b6f70' : '#2f3333';
      // cañón
      fillRound(c, -118, -48, 96, big ? 22 : 18, 3, silver, '#0b0c0c');
      c.fillStyle = 'rgba(255,255,255,.16)'; c.fillRect(-112, -45, 82, 3);
      // corredera
      fillRound(c, -56, -44, 70, 26, 3, big ? '#8a9092' : '#3a3f3f', '#0b0c0c');
      c.fillStyle = 'rgba(0,0,0,.25)';
      for (let i = 0; i < 6; i++) c.fillRect(-48 + i * 8, -39, 4, 15);
      // armazón
      fillRound(c, -48, -20, 58, 16, 3, '#262929', '#0b0b0b');
      // empuñadura
      c.save(); c.translate(8, -14); c.rotate(1.28);
      fillRound(c, 0, 0, 24, 60, 6, '#222424', '#0b0b0b');
      c.fillStyle = 'rgba(255,255,255,.05)'; c.fillRect(4, 5, 5, 46);
      c.restore();
      // mano derecha
      drawHand(c, 22, 10, 34, 0.18, true);
      drawHand(c, 2, 2, 30, -0.1, true);
      // punto de mira
      c.fillStyle = '#d7dede'; c.fillRect(-116, -50, 4, 3);
      muzzle(c, -119, -37, s, flash);
      return;
    }
    if (def.id === 'awp') {
      // culata
      fillRound(c, 48, -34, 74, 34, 5, '#42503c', '#0b0d0a');
      fillRound(c, 18, -30, 100, 26, 4, '#4b5a43', '#0b0d0a');
      // cañón
      fillRound(c, -150, -30, 176, 9, 3, '#2b332c', '#080a08');
      fillRound(c, -166, -33, 26, 15, 4, '#222822', '#080a08');
      c.fillStyle = 'rgba(255,255,255,.1)'; c.fillRect(-144, -28, 150, 2);
      // guardamanos
      fillRound(c, -108, -22, 76, 18, 3, '#39442f', '#0b0d0a');
      // cargador
      fillRound(c, -2, -8, 26, 30, 3, '#333d30', '#080a08');
      // cerrojo
      c.fillStyle = '#6d756a'; c.fillRect(30, -34, 26, 6); c.beginPath(); c.arc(58, -31, 4, 0, TAU); c.fill();
      // mira telescópica
      fillRound(c, -52, -64, 92, 20, 8, '#181c17', '#070807');
      fillRound(c, -60, -70, 18, 30, 5, '#242a22', '#070807');
      fillRound(c, 36, -68, 16, 26, 5, '#242a22', '#070807');
      c.fillStyle = 'rgba(140,190,210,.25)'; c.beginPath(); c.arc(44, -55, 5, 0, TAU); c.fill();
      drawHand(c, -74, 2, 32, -0.15, true);
      drawHand(c, 28, 18, 34, 0.22, true);
      muzzle(c, -167, -24, s, flash);
      return;
    }
    // M4A1-S
    fillRound(c, 22, -22, 88, 40, 6, '#232727', '#090a0a');
    fillRound(c, -82, -26, 132, 24, 4, '#2b3030', '#090a0a');
    fillRound(c, -78, -22, 60, 19, 3, '#383e3e', '#090a0a');
    // cañón y supresor
    fillRound(c, -152, -31, 84, 14, 4, '#202424', '#070808');
    fillRound(c, -170, -34, 26, 20, 5, '#191d1d', '#070808');
    c.fillStyle = 'rgba(255,255,255,.10)'; c.fillRect(-162, -30, 14, 2);
    // culata
    fillRound(c, 96, -20, 48, 32, 5, '#1e2222', '#090a0a');
    fillRound(c, 136, -18, 18, 28, 4, '#151818', '#090a0a');
    // cargador
    c.save(); c.translate(6, -4); c.rotate(0.16);
    fillRound(c, 0, 0, 27, 52, 4, '#262b2b', '#080909');
    c.fillStyle = 'rgba(255,255,255,.05)'; c.fillRect(4, 5, 4, 38);
    c.restore();
    // asa
    fillRound(c, 44, -14, 20, 40, 4, '#202424', '#080909');
    // riel y mira
    c.fillStyle = '#151818'; c.fillRect(-60, -30, 90, 5);
    c.fillStyle = '#3d4444'; c.fillRect(-52, -37, 7, 9); c.fillRect(20, -37, 6, 9);
    // manos
    drawHand(c, -58, 4, 30, -0.2, true);
    drawHand(c, 52, 16, 34, 0.24, true);
    muzzle(c, -173, -24, s, flash);
  }

  function drawViewModel(cam, cw, ch) {
    if (!player.alive) return;
    if (game.state !== 'live' && game.state !== 'paused' && game.state !== 'roundover') return;
    if (player.scope) return;
    const def = getCurrentDef();
    if (!def) return;
    const c = ctx;
    const s = Math.min(cw, ch) / 880;
    const speed = Math.hypot(player.vx, player.vy);
    const bob = player.bob;
    const walk = clamp(speed / 3.2, 0, 1);
    const bx = Math.sin(bob * 5.2) * 7 * walk + Math.sin(bob * 1.4) * 2;
    const by = Math.abs(Math.cos(bob * 5.2)) * 5 * walk;
    const kick = player.viewKick || 0;
    let reloadDip = 0, reloadRot = 0;
    if (player.reload > 0) {
      const t = 1 - player.reload / player.reloadTotal;
      reloadDip = Math.sin(t * Math.PI) * 90;
      reloadRot = Math.sin(t * Math.PI) * 0.32;
    }
    let drawDip = 0;
    if (player.drawTimer > 0) drawDip = (player.drawTimer / 0.42) * 120;
    const sway = clamp(-player.recoilYaw * 12, -20, 20);

    c.save();
    c.translate(cw * 0.70 + bx + sway, ch + 58 + by + kick * 34 + reloadDip + drawDip);
    c.scale(s, s);
    c.rotate(-0.035 + reloadRot + player.recoilPitch * 0.5);
    c.globalAlpha = clamp(1 - player.drawTimer / 0.5, 0, 1);

    // sombra / brazo
    c.fillStyle = 'rgba(0,0,0,.25)';
    fillRound(c, -60, 40, 300, 80, 40, 'rgba(0,0,0,.22)');
    // brazo derecho
    fillRound(c, 60, 20, 140, 90, 30, '#4a4538', 'rgba(0,0,0,.5)');
    fillRound(c, 150, 60, 70, 50, 20, '#3b372d');

    const flash = player.flashTimer > 0 ? clamp(player.flashTimer / 0.055, 0, 1) : 0;
    drawWeaponModel(c, def, s, flash);

    c.restore();

    // arma izquierda / manos en el borde
    const t = performance.now() / 1000;
    c.save();
    c.globalAlpha = clamp(1 - player.drawTimer / 0.5, 0, 1);
    c.translate(cw * 0.28 + Math.sin(t * .8) * 2, ch + 30);
    c.scale(s, s);
    c.rotate(0.2);
    fillRound(c, -30, -40, 90, 120, 34, '#4b4639', 'rgba(0,0,0,.45)');
    drawHand(c, 6, -6, 38, 0.3, true);
    c.restore();
  }

  /* ---------------- mira / scope ---------------- */
  function drawCrosshair(cw, ch) {
    if (!player.alive || player.scope || game.state !== 'live') return;
    const move = clamp(Math.hypot(player.vx, player.vy) / 3.2, 0, 1);
    const spread = (player.crossSpread || 0) + move * 7 + (player.recoilShots || 0) * 1.5;
    const gap = 5 + spread;
    const len = 8;
    const x = cw / 2, y = ch / 2;
    const col = 'rgba(110,255,140,.92)';
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

    drawEffects(cam);
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
  if (id === 'm4') {
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
