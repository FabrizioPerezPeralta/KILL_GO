'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScript } = require('./test_env.js');

loadScript('js/core/EventBus.js');
loadScript('js/hal/InputManager.js');
loadScript('js/hal/AudioManager.js');
loadScript('js/ecs/EntityManager.js');
loadScript('js/ecs/Components.js');
loadScript('js/core/GameStateManager.js');
loadScript('js/core/GameLoop.js');
loadScript('js/core/Engine.js');
loadScript('js/render/Textures.js');
loadScript('js/game/Game.js');
loadScript('js/network/Multiplayer.js');

test('Multiplayer — API y estado inicial del módulo', () => {
  assert.equal(Multiplayer.active, false);
  assert.equal(Multiplayer.inLobby, false);
  assert.equal(Multiplayer.isHost, false);
  assert.equal(typeof Multiplayer.createRoom, 'function');
  assert.equal(typeof Multiplayer.joinRoom, 'function');
  assert.equal(typeof Multiplayer.broadcastRoundLive, 'function');
  assert.equal(typeof Multiplayer.sendBotHit, 'function');
});

test('Multiplayer — Generación de enlaces compartibles', () => {
  const url = Multiplayer.getShareUrl('DUST-TEST');
  assert.ok(url.includes('room=DUST-TEST'), 'La URL debe contener el parámetro room');
});

test('Multiplayer — Sincronización bidireccional game.state y Engine.fsm', () => {
  const fsm = window.Engine.fsm;
  fsm.register('menu', { enter() {} });
  fsm.register('buy', { enter() {} });
  fsm.register('live', { enter() {} });
  fsm.register('roundover', { enter() {} });

  game.state = 'buy';
  assert.equal(fsm.getCurrentStateName(), 'buy', 'FSM debe sincronizarse automáticamente a buy');

  game.state = 'live';
  assert.equal(fsm.getCurrentStateName(), 'live', 'FSM debe sincronizarse automáticamente a live');

  game.state = 'roundover';
  assert.equal(fsm.getCurrentStateName(), 'roundover', 'FSM debe sincronizarse automáticamente a roundover');
});

