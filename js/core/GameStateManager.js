'use strict';
/* =====================================================================
   DUST STRIKE — js/core/GameStateManager.js
   Capa 4: Máquina de Estados Finita (FSM) para ciclo de vida de rondas
   ===================================================================== */

class GameStateManagerClass {
  constructor() {
    this.states = new Map();
    this.currentState = null;
    this.currentName = 'menu';
    this.stateTime = 0;
  }

  register(name, stateObj) {
    this.states.set(name, stateObj);
  }

  transitionTo(name, payload) {
    if (!this.states.has(name)) {
      console.warn(`[FSM] Estado desconocido: ${name}`);
      return;
    }
    const prevName = this.currentName;
    if (this.currentState && this.currentState.exit) {
      try { this.currentState.exit(name); } catch (e) { console.error(e); }
    }
    this.currentName = name;
    this.currentState = this.states.get(name);
    this.stateTime = 0;
    if (this.currentState && this.currentState.enter) {
      try { this.currentState.enter(prevName, payload); } catch (e) { console.error(e); }
    }
    if (typeof EventBus !== 'undefined') {
      EventBus.emit('gamestate:change', { from: prevName, to: name, payload });
    }
  }

  update(dt) {
    this.stateTime += dt;
    if (this.currentState && this.currentState.update) {
      this.currentState.update(dt, this.stateTime);
    }
  }

  getCurrentStateName() {
    return this.currentName;
  }
}

const GameStateManager = new GameStateManagerClass();

if (typeof window !== 'undefined') window.GameStateManager = GameStateManager;
if (typeof globalThis !== 'undefined') globalThis.GameStateManager = GameStateManager;

