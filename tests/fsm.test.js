'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('./test_env.js');
require('../js/core/EventBus.js');
require('../js/core/GameStateManager.js');

test('FSM — Registro y transición de estados con ciclo de vida', () => {
  const fsm = window.GameStateManager;
  assert.ok(fsm, 'GameStateManager debe estar definido');

  const trace = [];

  fsm.register('menu', {
    enter: (prev) => trace.push(`menu:enter (desde ${prev})`),
    exit: (next) => trace.push(`menu:exit (hacia ${next})`),
    update: (dt, time) => trace.push(`menu:update dt=${dt}`)
  });

  fsm.register('live', {
    enter: (prev, payload) => trace.push(`live:enter ronda=${payload?.round}`),
    exit: (next) => trace.push(`live:exit (hacia ${next})`),
    update: (dt, time) => trace.push(`live:update time=${time}`)
  });

  fsm.transitionTo('menu');
  assert.equal(fsm.getCurrentStateName(), 'menu');

  fsm.update(0.016);

  fsm.transitionTo('live', { round: 1 });
  assert.equal(fsm.getCurrentStateName(), 'live');

  fsm.update(0.016);

  assert.ok(trace.some(t => t.startsWith('menu:enter')));
  assert.ok(trace.includes('menu:exit (hacia live)'));
  assert.ok(trace.includes('live:enter ronda=1'));
  assert.ok(trace.includes('live:update time=0.016'));
});
