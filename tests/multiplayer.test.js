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
  assert.ok(window.Multiplayer, 'window.Multiplayer debe estar definido globalmente');
  assert.equal(Multiplayer.active, false);
  assert.equal(Multiplayer.inLobby, false);
  assert.equal(Multiplayer.isHost, false);
  assert.equal(typeof Multiplayer.createRoom, 'function');
  assert.equal(typeof Multiplayer.joinRoom, 'function');
  assert.equal(typeof Multiplayer.broadcastRoundLive, 'function');
  assert.equal(typeof Multiplayer.sendBotHit, 'function');
});

test('Multiplayer — Cliente en equipo T no finaliza la ronda erróneamente', () => {
  game.state = 'live';
  player.alive = true;
  player.team = 't';
  bots = [];

  // Simular que somos un cliente multijugador activo (no host)
  const origIsHost = Multiplayer.isHost;
  Object.defineProperty(Multiplayer, 'active', { value: true, configurable: true });
  Object.defineProperty(Multiplayer, 'isHost', { value: false, configurable: true });

  checkRoundState();

  // La ronda NO debe haber terminado (debe seguir en 'live')
  assert.equal(game.state, 'live', 'El cliente nunca debe finalizar la ronda localmente');

  // Restaurar
  Object.defineProperty(Multiplayer, 'active', { value: false, configurable: true });
  Object.defineProperty(Multiplayer, 'isHost', { value: origIsHost, configurable: true });
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

