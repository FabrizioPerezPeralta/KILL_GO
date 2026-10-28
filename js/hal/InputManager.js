'use strict';
/* =====================================================================
   DUST STRIKE — js/hal/InputManager.js
   Capa 1: HAL — Mapeo de acciones, captura de puntero y sensibilidad
   ===================================================================== */

class InputManagerClass {
  constructor() {
    this.keys = Object.create(null);
    this.actions = Object.create(null);
    this.actionBindings = {
      forward: ['KeyW', 'ArrowUp'],
      backward: ['KeyS', 'ArrowDown'],
      strafeLeft: ['KeyA', 'ArrowLeft'],
      strafeRight: ['KeyD', 'ArrowRight'],
      jump: ['Space'],
      crouch: ['ControlLeft', 'ControlRight', 'KeyC'],
      walk: ['ShiftLeft', 'ShiftRight'],
      reload: ['KeyR'],
      drop: ['KeyG'],
      inspect: ['KeyF'],
      slot1: ['Digit1'],
      slot2: ['Digit2'],
      slot3: ['Digit3'],
      useDefuse: ['KeyE'],
      buyMenu: ['KeyB'],
      chat: ['KeyY'],
      scoreboard: ['Tab'],
      mute: ['KeyM'],
      pause: ['Escape', 'KeyP']
    };
    this.mouse = {
      dx: 0,
      dy: 0,
      left: false,
      right: false,
      locked: false
    };
    this.sensitivity = 2.2;
    this.initialized = false;
  }

  init(canvasElement) {
    if (this.initialized) return;
    this.canvas = canvasElement;

    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      this.updateActions();
      if (typeof EventBus !== 'undefined') {
        EventBus.emit('input:keydown', { code: e.code, key: e.key, originalEvent: e });
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
      this.updateActions();
      if (typeof EventBus !== 'undefined') {
        EventBus.emit('input:keyup', { code: e.code, key: e.key, originalEvent: e });
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.mouse.locked = (document.pointerLockElement !== null);
      if (typeof EventBus !== 'undefined') {
        EventBus.emit('input:pointerlockchange', { locked: this.mouse.locked });
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.mouse.locked) return;
      const dx = e.movementX || 0;
      const dy = e.movementY || 0;
      this.mouse.dx += dx;
      this.mouse.dy += dy;
      if (typeof EventBus !== 'undefined') {
        EventBus.emit('input:mousemove', { dx, dy, sensitivity: this.sensitivity });
      }
    });

    window.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouse.left = true;
      if (e.button === 2) this.mouse.right = true;
      if (typeof EventBus !== 'undefined') {
        EventBus.emit('input:mousedown', { button: e.button });
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
      if (typeof EventBus !== 'undefined') {
        EventBus.emit('input:mouseup', { button: e.button });
      }
    });

    this.initialized = true;
  }

  updateActions() {
    for (const [action, keyList] of Object.entries(this.actionBindings)) {
      this.actions[action] = keyList.some(k => !!this.keys[k]);
    }
  }

  isActionActive(action) {
    return !!this.actions[action];
  }

  setSensitivity(v) {
    this.sensitivity = Math.max(0.1, Math.min(10, parseFloat(v) || 2.2));
    if (typeof EventBus !== 'undefined') {
      EventBus.emit('input:sensitivity', { sensitivity: this.sensitivity });
    }
  }

  consumeMouseDelta() {
    const res = { dx: this.mouse.dx, dy: this.mouse.dy };
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    return res;
  }
}

const InputManager = new InputManagerClass();

if (typeof window !== 'undefined') window.InputManager = InputManager;
if (typeof globalThis !== 'undefined') globalThis.InputManager = InputManager;

