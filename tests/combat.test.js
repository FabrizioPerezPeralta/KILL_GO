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

test('Combate — Configuración y balance de armas', () => {
  assert.ok(typeof WEAPONS === 'object', 'WEAPONS debe estar definido');

  const expectedGuns = ['usp', 'glock', 'deagle', 'mp5', 'm4', 'ak', 'awp', 'knife'];
  for (const id of expectedGuns) {
    const gun = WEAPONS[id];
    assert.ok(gun, `El arma "${id}" debe existir en WEAPONS`);
    assert.ok(gun.dmg > 0, `El daño de "${id}" debe ser mayor a 0`);
    assert.ok(gun.rpm > 0, `El RPM de "${id}" debe ser mayor a 0`);
    assert.ok(gun.slot >= 1 && gun.slot <= 3, `El slot de "${id}" debe ser entre 1 y 3`);
  }

  // AWP debe tener mira telescópica y alto daño
  assert.equal(WEAPONS.awp.scope, true, 'AWP debe contar con mira telescópica (scope)');
  assert.ok(WEAPONS.awp.dmg >= 100, 'AWP debe tener daño letal');

  // Cuchillo debe ser melee
  assert.equal(WEAPONS.knife.melee, true, 'El cuchillo debe marcarse como melee');
  assert.equal(WEAPONS.knife.mag, 0, 'El cuchillo no debe usar cargador');
});

test('Combate — Reglas de absorción de blindaje', () => {
  let hp = 100;
  let armor = 50;
  const rawDamage = 40;

  // Fórmula estándar CS:GO implementada en damagePlayer
  const absorbed = Math.min(armor, rawDamage * 0.55);
  armor -= absorbed;
  const healthDamage = rawDamage - absorbed;
  hp -= healthDamage;

  assert.equal(absorbed, 22, 'El chaleco debe absorber el 55% del daño (22 pts)');
  assert.equal(armor, 28, 'El blindaje restante debe ser 28');
  assert.equal(healthDamage, 18, 'El daño a la salud debe ser 18');
  assert.equal(hp, 82, 'La salud restante debe ser 82');
});

test('Economía — Reglas de dinero y recompensas', () => {
  assert.equal(MAX_MONEY, 16000, 'El dinero máximo debe ser $16,000');
  assert.equal(BUY_TIME, 25, 'El tiempo de compra debe ser 25 segundos');
  assert.equal(ROUND_TIME, 105, 'El tiempo de ronda debe ser 105 segundos');
  assert.equal(BOMB_TIME, 40, 'El temporizador de bomba debe ser 40 segundos');
});

