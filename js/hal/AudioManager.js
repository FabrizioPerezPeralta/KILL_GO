'use strict';
/* =====================================================================
   DUST STRIKE — js/hal/AudioManager.js
   Capa 1: HAL — Abstracción de Web Audio API y buses de ganancia
   ===================================================================== */

class AudioManagerClass {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.sfxGain = null;
    this.volume = 0.5;
    this.muted = false;
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.sfxGain = this.ctx.createGain();

    this.masterGain.connect(this.ctx.destination);
    this.sfxGain.connect(this.masterGain);

    this.setVolume(this.volume);
    this.initialized = true;

    const unlock = () => {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, parseFloat(v) !== undefined && !isNaN(parseFloat(v)) ? parseFloat(v) : 0.5));
    if (this.masterGain) {
      this.masterGain.gain.value = this.muted ? 0 : this.volume;
    }
    if (typeof EventBus !== 'undefined') {
      EventBus.emit('audio:volume', { volume: this.volume, muted: this.muted });
    }
  }

  setMuted(m) {
    this.muted = !!m;
    if (this.masterGain) {
      this.masterGain.gain.value = this.muted ? 0 : this.volume;
    }
    if (typeof EventBus !== 'undefined') {
      EventBus.emit('audio:mute', { muted: this.muted });
    }
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }
}

const AudioManager = new AudioManagerClass();

if (typeof window !== 'undefined') window.AudioManager = AudioManager;
if (typeof globalThis !== 'undefined') globalThis.AudioManager = AudioManager;

