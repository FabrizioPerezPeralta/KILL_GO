'use strict';
/* =====================================================================
   DUST STRIKE — textures.js
   Utilidades, mapa, texturas procedurales y sprites de personajes.
   ===================================================================== */

const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const dist2D = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
const angleDiff = (a, b) => {
  let d = (a - b + Math.PI) % TAU;
  if (d < 0) d += TAU;
  return d - Math.PI;
};
const packRGB = (r, g, b) => (255 << 24) | ((b & 255) << 16) | ((g & 255) << 8) | (r & 255);
const FOG_R = 211, FOG_G = 194, FOG_B = 163;
const FOG_COLOR = packRGB(FOG_R, FOG_G, FOG_B);

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------------------------------------------------------------
   MAPA — un pequeño "dust" de 40x40 celdas
   grid: 0 = suelo, 1 = arenisca, 2 = cajas de madera, 3 = hormigón, 4 = contenedor
   --------------------------------------------------------------------- */
const MW = 40, MH = 40;
const GRID = new Uint8Array(MW * MH).fill(1);
const FLOOR_MAP = new Uint8Array(MW * MH).fill(0);

function carve(x0, y0, x1, y1, floorType = 0) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (x < 1 || y < 1 || x >= MW - 1 || y >= MH - 1) continue;
      GRID[y * MW + x] = 0;
      FLOOR_MAP[y * MW + x] = floorType;
    }
  }
}
function setWallRect(x0, y0, x1, y1, type) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (x < 1 || y < 1 || x >= MW - 1 || y >= MH - 1) continue;
      GRID[y * MW + x] = type;
    }
  }
}

/* salas y pasillos */
carve(3, 3, 15, 16, 0);        // Sitio A
carve(15, 4, 31, 8, 0);        // Long A
carve(30, 8, 34, 27, 3);       // Conector T / Long
carve(18, 8, 22, 34, 0);       // Mid
carve(28, 26, 36, 36, 0);      // Spawn T
carve(22, 26, 28, 29, 0);      // T → Mid
carve(3, 29, 11, 36, 1);       // Spawn CT
carve(6, 16, 9, 29, 1);        // Rampa CT
carve(11, 31, 18, 34, 1);      // CT → Mid
carve(15, 12, 18, 15, 0);      // Short A

/* marcador del sitio A */
for (let y = 6; y <= 12; y++) {
  for (let x = 6; x <= 12; x++) {
    if (GRID[y * MW + x] === 0) FLOOR_MAP[y * MW + x] = 2;
  }
}

/* coberturas */
setWallRect(11, 6, 12, 7, 2);      // cajas sitio A
setWallRect(4, 10, 4, 11, 2);
setWallRect(7, 13, 8, 13, 2);
setWallRect(13, 3, 14, 4, 4);      // contenedor sitio A
setWallRect(20, 6, 21, 7, 2);      // cajas long
setWallRect(26, 4, 26, 5, 2);
setWallRect(29, 4, 29, 5, 4);
setWallRect(19, 17, 20, 17, 2);    // mid
setWallRect(19, 24, 20, 25, 2);
setWallRect(33, 31, 34, 32, 2);    // spawn T
setWallRect(29, 34, 29, 35, 2);
setWallRect(4, 33, 4, 34, 2);      // spawn CT
setWallRect(9, 30, 10, 30, 2);
setWallRect(16, 13, 17, 13, 2);    // short
setWallRect(7, 22, 8, 22, 2);      // rampa CT
setWallRect(32, 19, 32, 19, 2);    // pasillo largo T
setWallRect(30, 12, 30, 13, 4);

const CT_SPAWN = { x: 7.5, y: 33.5, yaw: -Math.PI / 2 };
const CT_SPAWNS = [
  { x: 7.5, y: 33.5, yaw: -Math.PI / 2 },
  { x: 5.5, y: 33.5, yaw: -Math.PI / 2 },
  { x: 9.5, y: 33.5, yaw: -Math.PI / 2 },
  { x: 6.5, y: 35.5, yaw: -Math.PI / 2 },
  { x: 8.5, y: 35.5, yaw: -Math.PI / 2 }
];
const PLANT_SPOT = { x: 8.5, y: 9.5 };
const SITE_CENTER = { x: 9, y: 9 };
const T_SPAWNS = [
  { x: 29.5, y: 27.5 }, { x: 32.5, y: 27.5 }, { x: 35.5, y: 28.5 },
  { x: 30.5, y: 34.5 }, { x: 34.5, y: 35.5 }, { x: 31.5, y: 30.5 }
];
const DEFEND_SPOTS = [
  { x: 10.5, y: 7.5 }, { x: 6.5, y: 11.5 }, { x: 12.5, y: 11.5 },
  { x: 9.5, y: 6.5 }, { x: 12.5, y: 5.5 }, { x: 5.5, y: 7.5 }
];

function isSolidCell(cx, cy) {
  if (cx < 0 || cy < 0 || cx >= MW || cy >= MH) return true;
  return GRID[cy * MW + cx] !== 0;
}
function isSolidAt(x, y) {
  return isSolidCell(Math.floor(x), Math.floor(y));
}

/* ---------------------------------------------------------------------
   TEXTURAS DE PARED Y SUELO
   --------------------------------------------------------------------- */
const SHADES = 28, TEX_SIZE = 64;

function makeTexCanvas(size, drawFn) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  drawFn(g, size);
  return c;
}
function texFromCanvas(canvas) {
  const g = canvas.getContext('2d');
  const img = g.getImageData(0, 0, canvas.width, canvas.height);
  const data = new Uint32Array(img.data.buffer.slice(0));
  return { size: canvas.width, data };
}
function buildTexLUT(tex) {
  const n = tex.data.length, size = tex.size;
  const lut = new Uint32Array(SHADES * n);
  const fr = FOG_R, fg = FOG_G, fb = FOG_B;
  for (let s = 0; s < SHADES; s++) {
    const t = s / (SHADES - 1);
    const bright = 0.20 + 0.98 * t;
    const fog = Math.pow(1 - t, 1.7) * 0.88;
    const bf = bright * (1 - fog);
    const base = s * n;
    for (let i = 0; i < n; i++) {
      const c = tex.data[i];
      const r = c & 255, gg = (c >>> 8) & 255, b = (c >>> 16) & 255;
      const rr = (r * bf + fr * fog) | 0;
      const g2 = (gg * bf + fg * fog) | 0;
      const b2 = (b * bf + fb * fog) | 0;
      lut[base + i] = packRGB(rr, g2, b2);
    }
  }
  return {
    size,
    lut,
    data: tex.data
  };
}

function paintSandWall(g, S) {
  const R = mulberry32(9182);
  g.fillStyle = '#b49a70'; g.fillRect(0, 0, S, S);
  // ruido
  for (let i = 0; i < 2600; i++) {
    const x = R() * S, y = R() * S, a = R();
    g.fillStyle = a > 0.5 ? `rgba(255,238,200,${0.04 + R() * 0.06})` : `rgba(56,42,26,${0.04 + R() * 0.08})`;
    g.fillRect(x | 0, y | 0, 1 + (R() * 3 | 0), 1 + (R() * 2 | 0));
  }
  // ladrillos
  const rows = 4, bh = S / rows;
  for (let r = 0; r < rows; r++) {
    const y = r * bh;
    g.fillStyle = 'rgba(96,77,50,.55)';
    g.fillRect(0, y, S, 2);
    g.fillStyle = 'rgba(255,240,206,.16)';
    g.fillRect(0, y + 2, S, 1);
    const off = (r % 2) * (S / 4);
    for (let k = 0; k < 2; k++) {
      const x = (off + k * S / 2) % S;
      g.fillStyle = 'rgba(96,77,50,.42)';
      g.fillRect(x, y, 2, bh);
    }
  }
  // manchas
  for (let i = 0; i < 9; i++) {
    const x = R() * S, y = R() * S, rr = 4 + R() * 12;
    const gr = g.createRadialGradient(x, y, 0, x, y, rr);
    gr.addColorStop(0, 'rgba(70,52,30,.2)');
    gr.addColorStop(1, 'rgba(70,52,30,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill();
  }
  // borde superior
  g.fillStyle = 'rgba(255,244,214,.12)'; g.fillRect(0, 0, S, 1);
}

function paintCrate(g, S) {
  const R = mulberry32(441);
  g.fillStyle = '#7b5428'; g.fillRect(0, 0, S, S);
  // vetas
  for (let i = 0; i < 26; i++) {
    g.strokeStyle = `rgba(${30 + R() * 30 | 0},${18 + R() * 20 | 0},${8 + R() * 10 | 0},${0.18 + R() * 0.25})`;
    g.lineWidth = 0.8 + R() * 1.4;
    g.beginPath();
    const y = R() * S;
    g.moveTo(0, y);
    g.bezierCurveTo(S * .3, y + (R() - .5) * 7, S * .7, y + (R() - .5) * 7, S, y + (R() - .5) * 5);
    g.stroke();
  }
  // tablones verticales
  for (let x = 0; x < S; x += 16) {
    g.fillStyle = 'rgba(0,0,0,.28)'; g.fillRect(x, 0, 2, S);
    g.fillStyle = 'rgba(255,220,150,.10)'; g.fillRect(x + 2, 0, 1, S);
  }
  // marco metálico
  g.strokeStyle = '#4b473d'; g.lineWidth = 5; g.strokeRect(2.5, 2.5, S - 5, S - 5);
  g.strokeStyle = 'rgba(220,220,200,.25)'; g.lineWidth = 1; g.strokeRect(5.5, 5.5, S - 11, S - 11);
  // esquinas + tornillos
  g.fillStyle = '#33352f';
  [[5, 5], [S - 12, 5], [5, S - 12], [S - 12, S - 12]].forEach(([x, y]) => {
    g.fillRect(x, y, 7, 7);
  });
  g.fillStyle = '#a9a58c';
  [[8, 8], [S - 9, 8], [8, S - 9], [S - 9, S - 9]].forEach(([x, y]) => {
    g.beginPath(); g.arc(x, y, 1.4, 0, TAU); g.fill();
  });
  // aspa diagonal
  g.strokeStyle = 'rgba(60,42,20,.5)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(7, 7); g.lineTo(S - 7, S - 7); g.stroke();
  g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(0, S - 5, S, 5);
}

function paintConcrete(g, S) {
  const R = mulberry32(7712);
  g.fillStyle = '#8b887b'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 3200; i++) {
    const a = R();
    g.fillStyle = a > .5 ? `rgba(235,235,220,${.03 + R() * .06})` : `rgba(30,30,26,${.03 + R() * .09})`;
    g.fillRect(R() * S | 0, R() * S | 0, 1 + (R() * 2 | 0), 1 + (R() * 2 | 0));
  }
  g.strokeStyle = 'rgba(48,48,42,.35)'; g.lineWidth = 1.2;
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    let x = R() * S, y = R() * S;
    g.moveTo(x, y);
    for (let k = 0; k < 4; k++) {
      x += (R() - .5) * 18; y += (R() - .5) * 18;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  for (let i = 0; i < 4; i++) {
    const x = R() * S, y = R() * S, rr = 8 + R() * 16;
    const gr = g.createRadialGradient(x, y, 0, x, y, rr);
    gr.addColorStop(0, 'rgba(40,40,34,.18)'); gr.addColorStop(1, 'rgba(40,40,34,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill();
  }
  g.fillStyle = 'rgba(255,255,240,.12)'; g.fillRect(0, 0, S, 2);
}

function paintContainer(g, S) {
  const R = mulberry32(2144);
  g.fillStyle = '#2f5568'; g.fillRect(0, 0, S, S);
  // corrugado vertical
  for (let x = 0; x < S; x += 8) {
    g.fillStyle = 'rgba(255,255,255,.09)'; g.fillRect(x, 0, 3, S);
    g.fillStyle = 'rgba(0,0,0,.20)'; g.fillRect(x + 4, 0, 2, S);
  }
  // óxido
  for (let i = 0; i < 120; i++) {
    g.fillStyle = `rgba(${120 + R() * 50 | 0},${55 + R() * 30 | 0},${24 + R() * 15 | 0},${.1 + R() * .3})`;
    g.fillRect(R() * S | 0, R() * S | 0, 1 + R() * 4 | 0, 1 + R() * 5 | 0);
  }
  // refuerzos horizontales
  g.fillStyle = '#243c48'; g.fillRect(0, 4, S, 6); g.fillRect(0, S - 12, S, 6);
  g.fillStyle = 'rgba(190,205,210,.18)'; g.fillRect(0, 4, S, 1); g.fillRect(0, S - 12, S, 1);
  // marca blanca
  g.strokeStyle = 'rgba(230,235,225,.28)'; g.lineWidth = 2;
  g.beginPath(); g.arc(38, 34, 9, 0.3, 5.4); g.stroke();
  g.beginPath(); g.moveTo(38, 31); g.lineTo(38, 45); g.stroke();
  g.font = 'bold 9px monospace'; g.fillStyle = 'rgba(230,235,225,.35)'; g.fillText('A-12', 44, 50);
}

function paintSandFloor(g, S) {
  const R = mulberry32(861);
  g.fillStyle = '#a68c60'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 4200; i++) {
    const a = R();
    g.fillStyle = a > .5 ? `rgba(245,224,178,${.03 + R() * .07})` : `rgba(60,45,26,${.04 + R() * .1})`;
    g.fillRect(R() * S | 0, R() * S | 0, 1 + (R() * 2 | 0), 1 + (R() * 2 | 0));
  }
  // piedras
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(${110 + R() * 40 | 0},${95 + R() * 30 | 0},${70 + R() * 25 | 0},.65)`;
    g.beginPath(); g.arc(R() * S, R() * S, .6 + R() * 1.6, 0, TAU); g.fill();
  }
  for (let i = 0; i < 8; i++) {
    const x = R() * S, y = R() * S, rr = 5 + R() * 14;
    const gr = g.createRadialGradient(x, y, 0, x, y, rr);
    gr.addColorStop(0, 'rgba(86,64,36,.15)'); gr.addColorStop(1, 'rgba(86,64,36,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, rr, 0, TAU); g.fill();
  }
}

function paintConcreteFloor(g, S) {
  const R = mulberry32(9933);
  g.fillStyle = '#7e7b6f'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 3600; i++) {
    g.fillStyle = R() > .5 ? `rgba(220,220,205,${.02 + R() * .05})` : `rgba(25,25,20,${.03 + R() * .08})`;
    g.fillRect(R() * S | 0, R() * S | 0, 1 + (R() * 2 | 0), 1 + (R() * 2 | 0));
  }
  g.strokeStyle = 'rgba(45,45,38,.42)'; g.lineWidth = 1.5;
  g.strokeRect(0.5, 0.5, S - 1, S - 1);
  g.beginPath(); g.moveTo(S / 2, 0); g.lineTo(S / 2, S); g.moveTo(0, S / 2); g.lineTo(S, S / 2); g.stroke();
  g.strokeStyle = 'rgba(255,255,235,.06)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(S / 2 + 1, 0); g.lineTo(S / 2 + 1, S); g.moveTo(0, S / 2 + 1); g.lineTo(S, S / 2 + 1); g.stroke();
  for (let i = 0; i < 4; i++) {
    g.strokeStyle = 'rgba(30,30,24,.28)'; g.lineWidth = 1;
    g.beginPath();
    let x = R() * S, y = R() * S; g.moveTo(x, y);
    for (let k = 0; k < 3; k++) { x += (R() - .5) * 20; y += (R() - .5) * 20; g.lineTo(x, y); }
    g.stroke();
  }
}

function paintHazardFloor(g, S) {
  const R = mulberry32(6612);
  g.fillStyle = '#7c7970'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = R() > .5 ? `rgba(230,225,205,${.02 + R() * .05})` : `rgba(20,20,16,${.03 + R() * .08})`;
    g.fillRect(R() * S | 0, R() * S | 0, 1 + (R() * 2 | 0), 1 + (R() * 2 | 0));
  }
  // franjas de peligro
  g.save();
  g.beginPath(); g.rect(4, 4, S - 8, S - 8); g.clip();
  g.fillStyle = 'rgba(203,158,49,.85)';
  for (let i = -S; i < S * 2; i += 24) {
    g.beginPath();
    g.moveTo(i, 0); g.lineTo(i + 12, 0); g.lineTo(i + 12 + S, S); g.lineTo(i + S, S);
    g.closePath(); g.fill();
  }
  g.restore();
  // borde pintado
  g.strokeStyle = 'rgba(220,200,150,.4)'; g.lineWidth = 3; g.strokeRect(3, 3, S - 6, S - 6);
  // desgaste
  for (let i = 0; i < 700; i++) {
    g.fillStyle = `rgba(70,62,44,${.05 + R() * .15})`;
    g.fillRect(R() * S | 0, R() * S | 0, 1 + (R() * 3 | 0), 1 + (R() * 3 | 0));
  }
}

function paintMetalFloor(g, S) {
  const R = mulberry32(1331);
  g.fillStyle = '#5a5b55'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 2400; i++) {
    g.fillStyle = R() > .5 ? `rgba(220,225,215,${.02 + R() * .05})` : `rgba(15,15,12,${.03 + R() * .09})`;
    g.fillRect(R() * S | 0, R() * S | 0, 1 + R() * 2 | 0, 1 + R() * 2 | 0);
  }
  g.strokeStyle = 'rgba(20,20,18,.5)'; g.lineWidth = 2;
  for (let p = 0; p <= S; p += 16) {
    g.beginPath(); g.moveTo(p, 0); g.lineTo(p, S); g.moveTo(0, p); g.lineTo(S, p); g.stroke();
  }
  g.fillStyle = 'rgba(210,215,200,.3)';
  for (let y = 8; y < S; y += 16) {
    for (let x = 8; x < S; x += 16) { g.beginPath(); g.arc(x, y, 1.2, 0, TAU); g.fill(); }
  }
}

const WALL_TEX = [];
WALL_TEX[1] = buildTexLUT(texFromCanvas(makeTexCanvas(TEX_SIZE, paintSandWall)));
WALL_TEX[2] = buildTexLUT(texFromCanvas(makeTexCanvas(TEX_SIZE, paintCrate)));
WALL_TEX[3] = buildTexLUT(texFromCanvas(makeTexCanvas(TEX_SIZE, paintConcrete)));
WALL_TEX[4] = buildTexLUT(texFromCanvas(makeTexCanvas(TEX_SIZE, paintContainer)));
WALL_TEX[0] = null;

const FLOOR_TEX = [
  buildTexLUT(texFromCanvas(makeTexCanvas(TEX_SIZE, paintSandFloor))),
  buildTexLUT(texFromCanvas(makeTexCanvas(TEX_SIZE, paintConcreteFloor))),
  buildTexLUT(texFromCanvas(makeTexCanvas(TEX_SIZE, paintHazardFloor))),
  buildTexLUT(texFromCanvas(makeTexCanvas(TEX_SIZE, paintMetalFloor)))
];

/* ---------------------------------------------------------------------
   SPRITES DE TERRORISTAS
   --------------------------------------------------------------------- */
function rrect(g, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
function fillRR(g, x, y, w, h, r, fill, stroke) {
  rrect(g, x, y, w, h, r);
  g.fillStyle = fill; g.fill();
  if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1.4; g.stroke(); }
}
function star(g, x, y, r, color) {
  g.save();
  g.translate(x, y);
  g.fillStyle = color;
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU;
    const rr = i % 2 ? r * .32 : r;
    g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  g.closePath(); g.fill();
  g.restore();
}

const PALETTES = [
  { shirt: '#6d6348', shirtDark: '#514b38', pants: '#3b332a', boots: '#191613', mask: '#241f1c', band: '#b53a30', vest: '#43412f' },
  { shirt: '#4d5148', shirtDark: '#393d36', pants: '#2b2f31', boots: '#141516', mask: '#1d1d1c', band: '#8f6a2c', vest: '#333a33' }
];

const PALETTES_CT = [
  { shirt: '#283848', shirtDark: '#1c2834', pants: '#1b222a', boots: '#0e1115', helmet: '#18222b', visor: '#3b86c4', vest: '#161e26' },
  { shirt: '#334250', shirtDark: '#242f3a', pants: '#1e242c', boots: '#101317', helmet: '#202a33', visor: '#4fa3e0', vest: '#1c252e' }
];

function drawBot(g, pose, variant) {
  const p = PALETTES[variant & 1];
  const S = 96;
  g.clearRect(0, 0, 64, S);
  g.lineJoin = 'round';

  // sombra
  g.fillStyle = 'rgba(0,0,0,.28)';
  g.beginPath(); g.ellipse(32, 92, 15, 3, 0, 0, TAU); g.fill();

  const walk = pose === 'walk1' ? -1 : pose === 'walk2' ? 1 : 0;
  const lx1 = 23 + (walk < 0 ? -3 : walk > 0 ? 3 : 0);
  const lx2 = 34 + (walk > 0 ? -2 : walk < 0 ? 2 : 0);
  const lift1 = walk < 0 ? 2 : 0, lift2 = walk > 0 ? 2 : 0;

  // piernas
  fillRR(g, lx1, 57, 9, 28 - lift1, 4, p.pants, 'rgba(10,9,8,.7)');
  fillRR(g, lx2, 57, 9, 28 - lift2, 4, p.pants, 'rgba(10,9,8,.7)');
  fillRR(g, lx1 - 1, 82 - lift1, 11, 8, 2, p.boots, 'rgba(0,0,0,.8)');
  fillRR(g, lx2 - 1, 82 - lift2, 11, 8, 2, p.boots, 'rgba(0,0,0,.8)');
  // rodilleras
  g.fillStyle = 'rgba(20,18,15,.55)';
  g.fillRect(lx1 + 1, 68, 7, 5); g.fillRect(lx2 + 1, 68, 7, 5);

  // torso
  fillRR(g, 20, 31, 24, 32, 5, p.shirt, 'rgba(10,9,8,.75)');
  fillRR(g, 21, 37, 22, 19, 3, p.vest, 'rgba(10,9,8,.6)');
  // placas / cargadores
  g.fillStyle = p.shirtDark;
  g.fillRect(24, 43, 6, 8); g.fillRect(31, 43, 6, 8); g.fillRect(38, 44, 4, 7);
  g.fillStyle = 'rgba(255,230,190,.16)';
  g.fillRect(24, 43, 6, 1); g.fillRect(31, 43, 6, 1);
  // cinturón
  g.fillStyle = '#22201b'; g.fillRect(20, 57, 24, 4);
  g.fillStyle = '#8a7a4d'; g.fillRect(30, 57, 4, 4);
  // hombros
  g.fillStyle = p.shirtDark;
  g.beginPath(); g.ellipse(20, 36, 5, 6, -0.2, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(44, 36, 5, 6, 0.2, 0, TAU); g.fill();

  // mochila
  fillRR(g, 18, 38, 5, 16, 2, '#3a3527', 'rgba(10,9,8,.6)');

  // arma y brazos
  const shoot = pose === 'shoot';
  if (shoot) {
    // culata y cuerpo del rifle
    g.save();
    g.translate(16, 49);
    g.rotate(-0.02);
    g.fillStyle = '#1f2020'; g.fillRect(0, 0, 34, 5);
    g.fillStyle = '#343636'; g.fillRect(6, -2, 18, 3);
    g.fillStyle = '#171818'; g.fillRect(26, 1, 12, 2.5);
    g.fillStyle = '#111'; g.fillRect(12, 4, 8, 6); // cargador
    g.fillStyle = '#45432f'; g.fillRect(0, 1, 7, 5); // culata
    g.fillStyle = '#0c0c0c'; g.fillRect(32, -0.5, 6, 2);
    g.restore();
    // brazos
    fillRR(g, 21, 40, 7, 15, 3, p.shirtDark);
    g.save(); g.translate(24, 42); g.rotate(1.25); fillRR(g, 0, 0, 6, 17, 3, p.shirt); g.restore();
    fillRR(g, 37, 40, 6, 14, 3, p.shirtDark);
    g.save(); g.translate(40, 43); g.rotate(1.15); fillRR(g, 0, 0, 6, 12, 3, p.shirt); g.restore();
    // manos
    g.fillStyle = '#b98a63';
    g.beginPath(); g.arc(25, 51, 3, 0, TAU); g.fill();
    g.beginPath(); g.arc(41, 50, 3, 0, TAU); g.fill();
    // fogonazo
    star(g, 57, 50.5, 8, 'rgba(255,220,120,.95)');
    star(g, 57, 50.5, 4.5, 'rgba(255,255,230,1)');
    g.fillStyle = 'rgba(255,180,60,.25)';
    g.beginPath(); g.arc(56, 50, 11, 0, TAU); g.fill();
  } else {
    // rifle cruzado hacia abajo
    g.save();
    g.translate(14, 58);
    g.rotate(-0.48);
    g.fillStyle = '#1e1f1f'; g.fillRect(0, 0, 33, 5);
    g.fillStyle = '#343636'; g.fillRect(6, -1.5, 16, 2.5);
    g.fillStyle = '#111'; g.fillRect(13, 4, 7, 7);
    g.fillStyle = '#3f3d2c'; g.fillRect(0, 1, 7, 5);
    g.fillStyle = '#0b0b0b'; g.fillRect(31, 0.5, 5, 2);
    g.restore();
    // brazos
    fillRR(g, 21, 39, 7, 13, 3, p.shirtDark);
    g.save(); g.translate(24, 41); g.rotate(1.1); fillRR(g, 0, 0, 6, 16, 3, p.shirt); g.restore();
    fillRR(g, 37, 40, 6, 12, 3, p.shirtDark);
    g.save(); g.translate(39, 43); g.rotate(0.4); fillRR(g, 0, 0, 6, 14, 3, p.shirt); g.restore();
    g.fillStyle = '#b98a63';
    g.beginPath(); g.arc(26, 53, 3, 0, TAU); g.fill();
    g.beginPath(); g.arc(35, 54, 3, 0, TAU); g.fill();
  }

  // cabeza: capucha, ojos, cinta
  fillRR(g, 25, 10, 15, 20, 6, p.mask, 'rgba(0,0,0,.8)');
  g.fillStyle = 'rgba(255,255,255,.05)';
  g.fillRect(26, 12, 13, 1.5);
  g.fillStyle = '#c0936c'; g.fillRect(27, 18, 11, 5);
  g.fillStyle = '#171310';
  g.fillRect(29, 19, 2, 2.4); g.fillRect(35, 19, 2, 2.4);
  g.fillStyle = p.band;
  g.fillRect(25, 14.5, 15, 3);
  g.fillStyle = 'rgba(0,0,0,.28)';
  g.fillRect(25, 17, 15, 1);
  // cuello
  g.fillStyle = '#1b1713'; g.fillRect(30, 29, 6, 4);
}

function drawCTBot(g, pose, variant) {
  const p = PALETTES_CT[variant & 1];
  const S = 96;
  g.clearRect(0, 0, 64, S);
  g.lineJoin = 'round';

  // sombra
  g.fillStyle = 'rgba(0,0,0,.28)';
  g.beginPath(); g.ellipse(32, 92, 15, 3, 0, 0, TAU); g.fill();

  const walk = pose === 'walk1' ? -1 : pose === 'walk2' ? 1 : 0;
  const lx1 = 23 + (walk < 0 ? -3 : walk > 0 ? 3 : 0);
  const lx2 = 34 + (walk > 0 ? -2 : walk < 0 ? 2 : 0);
  const lift1 = walk < 0 ? 2 : 0, lift2 = walk > 0 ? 2 : 0;

  // piernas tácticas
  fillRR(g, lx1, 57, 9, 28 - lift1, 4, p.pants, 'rgba(10,12,15,.7)');
  fillRR(g, lx2, 57, 9, 28 - lift2, 4, p.pants, 'rgba(10,12,15,.7)');
  fillRR(g, lx1 - 1, 82 - lift1, 11, 8, 2, p.boots, 'rgba(0,0,0,.85)');
  fillRR(g, lx2 - 1, 82 - lift2, 11, 8, 2, p.boots, 'rgba(0,0,0,.85)');
  g.fillStyle = 'rgba(10,15,20,.6)';
  g.fillRect(lx1 + 1, 68, 7, 5); g.fillRect(lx2 + 1, 68, 7, 5);

  // torso y chaleco kevlar CT
  fillRR(g, 20, 31, 24, 32, 5, p.shirt, 'rgba(10,15,20,.75)');
  fillRR(g, 21, 36, 22, 20, 3, p.vest, 'rgba(10,15,20,.6)');
  g.fillStyle = p.shirtDark;
  g.fillRect(24, 43, 6, 8); g.fillRect(31, 43, 6, 8); g.fillRect(38, 44, 4, 7);
  g.fillStyle = 'rgba(100,180,255,.3)';
  g.fillRect(25, 40, 14, 2); // franja táctica CT
  g.fillStyle = '#16191c'; g.fillRect(20, 57, 24, 4);

  // hombros
  g.fillStyle = p.shirtDark;
  g.beginPath(); g.ellipse(20, 36, 5, 6, -0.2, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(44, 36, 5, 6, 0.2, 0, TAU); g.fill();

  // arma y brazos
  const shoot = pose === 'shoot';
  if (shoot) {
    g.save();
    g.translate(16, 49);
    g.rotate(-0.02);
    g.fillStyle = '#1b1d1e'; g.fillRect(0, 0, 34, 5);
    g.fillStyle = '#2d3336'; g.fillRect(6, -2, 18, 3);
    g.fillStyle = '#141617'; g.fillRect(26, 1, 12, 2.5);
    g.fillStyle = '#0f1112'; g.fillRect(12, 4, 8, 6);
    g.fillStyle = '#242a2e'; g.fillRect(0, 1, 7, 5);
    g.restore();

    fillRR(g, 21, 40, 7, 15, 3, p.shirtDark);
    g.save(); g.translate(24, 42); g.rotate(1.25); fillRR(g, 0, 0, 6, 17, 3, p.shirt); g.restore();
    fillRR(g, 37, 40, 6, 14, 3, p.shirtDark);
    g.save(); g.translate(40, 43); g.rotate(1.15); fillRR(g, 0, 0, 6, 12, 3, p.shirt); g.restore();
    g.fillStyle = '#9fb0bc';
    g.beginPath(); g.arc(25, 51, 3, 0, TAU); g.fill();
    g.beginPath(); g.arc(41, 50, 3, 0, TAU); g.fill();
    star(g, 57, 50.5, 8, 'rgba(210,235,255,.95)');
    star(g, 57, 50.5, 4.5, 'rgba(255,255,255,1)');
  } else {
    g.save();
    g.translate(14, 58);
    g.rotate(-0.48);
    g.fillStyle = '#1b1d1e'; g.fillRect(0, 0, 33, 5);
    g.fillStyle = '#2d3336'; g.fillRect(6, -1.5, 16, 2.5);
    g.fillStyle = '#0f1112'; g.fillRect(13, 4, 7, 7);
    g.fillStyle = '#242a2e'; g.fillRect(0, 1, 7, 5);
    g.restore();

    fillRR(g, 21, 39, 7, 13, 3, p.shirtDark);
    g.save(); g.translate(24, 41); g.rotate(1.1); fillRR(g, 0, 0, 6, 16, 3, p.shirt); g.restore();
    fillRR(g, 37, 40, 6, 12, 3, p.shirtDark);
    g.save(); g.translate(39, 43); g.rotate(0.4); fillRR(g, 0, 0, 6, 14, 3, p.shirt); g.restore();
    g.fillStyle = '#9fb0bc';
    g.beginPath(); g.arc(26, 53, 3, 0, TAU); g.fill();
    g.beginPath(); g.arc(35, 54, 3, 0, TAU); g.fill();
  }

  // cabeza CT: Casco táctico y visor
  fillRR(g, 24, 8, 17, 22, 6, p.helmet, 'rgba(0,0,0,.85)');
  g.fillStyle = 'rgba(255,255,255,.1)';
  g.fillRect(26, 10, 13, 2);
  // visor reflectante azul
  fillRR(g, 26, 17, 13, 7, 2, p.visor, 'rgba(0,0,0,.9)');
  g.fillStyle = 'rgba(255,255,255,.45)';
  g.fillRect(28, 18, 9, 2);
  // barbilla / máscara
  g.fillStyle = '#1a1f24'; g.fillRect(26, 25, 13, 5);
  // cuello
  g.fillStyle = '#12161a'; g.fillRect(29, 29, 7, 4);
}

function drawCorpse(g, variant) {
  const p = PALETTES[variant & 1];
  g.clearRect(0, 0, 96, 32);
  // sangre
  g.fillStyle = 'rgba(96,12,10,.5)';
  g.beginPath(); g.ellipse(46, 25, 39, 5.5, 0, 0, TAU); g.fill();
  g.fillStyle = 'rgba(128,16,12,.35)';
  g.beginPath(); g.ellipse(28, 24, 13, 4, 0.2, 0, TAU); g.fill();
  // piernas
  fillRR(g, 58, 13, 28, 9, 4, p.pants, 'rgba(0,0,0,.6)');
  fillRR(g, 82, 14, 9, 7, 2, p.boots, 'rgba(0,0,0,.7)');
  // torso
  fillRR(g, 33, 11, 28, 13, 4, p.shirt, 'rgba(0,0,0,.65)');
  fillRR(g, 37, 12, 17, 9, 2, p.vest, 'rgba(0,0,0,.45)');
  // brazo
  g.save(); g.translate(38, 20); g.rotate(0.5); fillRR(g, 0, 0, 20, 6, 3, p.shirtDark); g.restore();
  g.fillStyle = '#a67d58';
  g.beginPath(); g.arc(58, 28, 3, 0, TAU); g.fill();
  // cabeza
  g.fillStyle = p.mask;
  g.beginPath(); g.arc(27, 17, 8, 0, TAU); g.fill();
  g.fillStyle = '#a67d58'; g.fillRect(24, 17, 7, 3);
  g.fillStyle = p.band; g.fillRect(20, 12, 14, 2.5);
  // arma caída
  g.save(); g.translate(62, 27); g.rotate(-0.18);
  g.fillStyle = '#1b1c1c'; g.fillRect(0, 0, 24, 3);
  g.fillStyle = '#111'; g.fillRect(8, 3, 5, 4);
  g.restore();
  // salpicaduras
  for (let i = 0; i < 18; i++) {
    const x = 12 + (i * 37 % 74), y = 24 + (i * 13 % 6);
    g.fillStyle = 'rgba(110,12,10,.5)';
    g.beginPath(); g.arc(x, y, 0.6 + (i % 3) * .5, 0, TAU); g.fill();
  }
}

function drawBomb(g) {
  g.clearRect(0, 0, 40, 40);
  g.fillStyle = 'rgba(0,0,0,.35)';
  g.beginPath(); g.ellipse(20, 33, 12, 3, 0, 0, TAU); g.fill();
  fillRR(g, 7, 12, 26, 18, 3, '#3c4136', 'rgba(0,0,0,.8)');
  g.fillStyle = '#2a2e27'; g.fillRect(9, 14, 22, 3);
  // pantalla
  fillRR(g, 10, 19, 9, 6, 1, '#15221c', 'rgba(0,0,0,.6)');
  g.fillStyle = 'rgba(120,255,160,.65)'; g.fillRect(12, 21, 5, 1); g.fillRect(12, 23, 3, 1);
  // LED
  g.fillStyle = '#6b1a13'; g.beginPath(); g.arc(30, 21, 2.2, 0, TAU); g.fill();
  g.fillStyle = '#ff4a34'; g.beginPath(); g.arc(30, 21, 1.2, 0, TAU); g.fill();
  // cables
  g.strokeStyle = '#b8352a'; g.lineWidth = 1.2;
  g.beginPath(); g.moveTo(13, 12); g.bezierCurveTo(18, 8, 23, 12, 26, 11); g.stroke();
  g.strokeStyle = '#2f6a9c';
  g.beginPath(); g.moveTo(17, 12); g.bezierCurveTo(20, 15, 24, 8, 31, 10); g.stroke();
  g.strokeStyle = '#c9a33a';
  g.beginPath(); g.moveTo(21, 12); g.bezierCurveTo(22, 9, 27, 13, 30, 11); g.stroke();
  // asa
  g.strokeStyle = '#20241f'; g.lineWidth = 2.4;
  g.beginPath(); g.moveTo(12, 30); g.lineTo(12, 34); g.lineTo(28, 34); g.lineTo(28, 30); g.stroke();
  g.fillStyle = 'rgba(220,230,210,.55)';
  g.font = 'bold 6px monospace'; g.fillText('C4', 22, 27);
}

function spriteFromCanvas(w, h, drawFn) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  drawFn(g);
  return c;
}

function buildSpriteLUT(canvas, levels = 16) {
  const w = canvas.width, h = canvas.height;
  const g = canvas.getContext('2d');
  const img = g.getImageData(0, 0, w, h);
  const data = img.data;
  const n = w * h;
  const lut = new Uint32Array(levels * n);
  for (let l = 0; l < levels; l++) {
    const t = l / (levels - 1);
    const bright = 0.28 + 0.92 * t;
    const fog = Math.pow(1 - t, 1.8) * 0.82;
    const bf = bright * (1 - fog);
    const base = l * n;
    for (let i = 0; i < n; i++) {
      const a = data[i * 4 + 3];
      if (a < 24) continue;
      const r = data[i * 4], gg = data[i * 4 + 1], b = data[i * 4 + 2];
      const rr = (r * bf + FOG_R * fog) | 0;
      const g2 = (gg * bf + FOG_G * fog) | 0;
      const b2 = (b * bf + FOG_B * fog) | 0;
      lut[base + i] = packRGB(rr, g2, b2);
    }
  }
  return { w, h, levels, lut };
}

const BOT_POSES = ['idle', 'walk1', 'walk2', 'shoot'];
const BOT_SPRITES = [0, 1].map(v => {
  const set = {};
  for (const pose of BOT_POSES) {
    set[pose] = buildSpriteLUT(spriteFromCanvas(64, 96, g => drawBot(g, pose, v)));
  }
  return set;
});
const CT_SPRITES = [0, 1].map(v => {
  const set = {};
  for (const pose of BOT_POSES) {
    set[pose] = buildSpriteLUT(spriteFromCanvas(64, 96, g => drawCTBot(g, pose, v)));
  }
  return set;
});
const CORPSE_SPRITES = [0, 1].map(v =>
  buildSpriteLUT(spriteFromCanvas(96, 32, g => drawCorpse(g, v)))
);
const BOMB_SPRITE = buildSpriteLUT(spriteFromCanvas(40, 40, drawBomb));

/* Tamaños en unidades del mundo */
const BOT_H = 0.82;
const BOT_W = BOT_H * 64 / 96;
const CORPSE_H = 0.26;
const CORPSE_W = CORPSE_H * 96 / 32;
const BOMB_H = 0.24;
const BOMB_W = 0.24;
