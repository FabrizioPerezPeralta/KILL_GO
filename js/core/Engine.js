'use strict';
/* =====================================================================
   DUST STRIKE — js/core/Engine.js
   Agregador del Motor: unifica todas las capas arquitectónicas en window.Engine
   ===================================================================== */

const Engine = {
  get events() { return typeof EventBus !== 'undefined' ? EventBus : null; },
  get input() { return typeof InputManager !== 'undefined' ? InputManager : null; },
  get audio() { return typeof AudioManager !== 'undefined' ? AudioManager : null; },
  get ecs() { return typeof EntityManager !== 'undefined' ? EntityManager : null; },
  get Components() { return typeof Components !== 'undefined' ? Components : null; },
  get fsm() { return typeof GameStateManager !== 'undefined' ? GameStateManager : null; },
  get loop() { return typeof GameLoop !== 'undefined' ? GameLoop : null; }
};

if (typeof window !== 'undefined') window.Engine = Engine;
if (typeof globalThis !== 'undefined') globalThis.Engine = Engine;

