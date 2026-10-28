'use strict';
/* =====================================================================
   DUST STRIKE — tests/test_env.js
   Entorno de pruebas headless simulando las APIs del navegador
   ===================================================================== */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ctxProxy = new Proxy({}, {
  get: (target, prop) => {
    if (prop === 'getImageData') return (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) });
    if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return () => ({ addColorStop: () => {} });
    return () => {};
  },
  set: () => true
});

const mockCanvas = {
  getContext: () => ctxProxy,
  width: 64,
  height: 64,
  style: {}
};

global.window = global;
global.document = {
  getElementById: () => mockCanvas,
  createElement: () => mockCanvas,
  addEventListener: () => {},
  removeEventListener: () => {},
  pointerLockElement: null
};

function loadScript(relPath) {
  const fullPath = path.resolve(__dirname, '..', relPath);
  const code = fs.readFileSync(fullPath, 'utf8');
  vm.runInThisContext(code, { filename: fullPath });
}

module.exports = {
  loadScript,
  mockCanvas
};

