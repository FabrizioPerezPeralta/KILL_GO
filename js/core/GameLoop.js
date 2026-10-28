'use strict';
/* =====================================================================
   DUST STRIKE — js/core/GameLoop.js
   Capa 2: Motor Central — Bucle determinista a 60 Hz con interpolación
   ===================================================================== */

class GameLoopClass {
  constructor() {
    this.running = false;
    this.lastTime = 0;
    this.accumulator = 0;
    this.fixedStep = 1 / 60; // 60 Hz exactos de simulación física
    this.maxAccumulator = 0.25;
    this.fps = 60;
    this.fpsCount = 0;
    this.fpsTimer = 0;
    this._rafId = null;
  }

  start(updateFn, renderFn) {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.accumulator = 0;

    const frame = (now) => {
      if (!this.running) return;
      const frameTime = Math.min(this.maxAccumulator, (now - this.lastTime) / 1000);
      this.lastTime = now;
      this.accumulator += frameTime;

      // Pasos fijos de simulación física determinista
      while (this.accumulator >= this.fixedStep) {
        updateFn(this.fixedStep);
        this.accumulator -= this.fixedStep;
      }

      // Factor de interpolación α para suavizado gráfico
      const alpha = this.accumulator / this.fixedStep;
      renderFn(alpha, frameTime);

      // Métricas de FPS
      this.fpsCount++;
      this.fpsTimer += frameTime;
      if (this.fpsTimer >= 1.0) {
        this.fps = this.fpsCount;
        this.fpsCount = 0;
        this.fpsTimer = 0;
      }

      this._rafId = requestAnimationFrame(frame);
    };
    this._rafId = requestAnimationFrame(frame);
  }

  stop() {
    this.running = false;
    if (this._rafId) cancelAnimationFrame(this._rafId);
  }
}

const GameLoop = new GameLoopClass();

if (typeof window !== 'undefined') window.GameLoop = GameLoop;
if (typeof globalThis !== 'undefined') globalThis.GameLoop = GameLoop;

