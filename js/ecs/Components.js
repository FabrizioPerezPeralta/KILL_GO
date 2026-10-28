'use strict';
/* =====================================================================
   DUST STRIKE — js/ecs/Components.js
   Capa 3: ECS — Fábrica de componentes de datos puros
   ===================================================================== */

const Components = {
  Transform: (x = 0, y = 0, z = 0, yaw = 0, pitch = 0) => ({
    x, y, z, yaw, pitch
  }),

  Velocity: (vx = 0, vy = 0, vz = 0, onGround = true) => ({
    vx, vy, vz, onGround
  }),

  Health: (hp = 100, maxHp = 100, armor = 0, helmet = false) => ({
    hp, maxHp, armor, helmet, alive: true
  }),

  Inventory: (team = 'ct') => ({
    slot: 2,
    slots: { 1: null, 2: null, 3: { id: 'knife', mag: 0, reserve: 0 } },
    money: 800,
    kit: false,
    team
  }),

  Viewmodel: () => ({
    bob: 0,
    swayX: 0,
    swayY: 0,
    kick: 0,
    reloadDip: 0,
    reloadRot: 0,
    drawTimer: 0,
    knifeSwing: 0
  }),

  AIController: (difficulty = 'normal', team = 't') => ({
    state: 'seek',
    target: null,
    path: null,
    reactionTimer: 0,
    difficulty,
    team,
    burstCount: 0
  }),

  NetworkIdentity: (peerId = null, isRemote = false) => ({
    peerId,
    isRemote,
    lastSync: 0
  })
};

if (typeof window !== 'undefined') window.Components = Components;
if (typeof globalThis !== 'undefined') globalThis.Components = Components;

