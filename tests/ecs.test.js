'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('./test_env.js');
require('../js/ecs/EntityManager.js');
require('../js/ecs/Components.js');

test('ECS — Creación y destrucción de entidades con tags', () => {
  const ecs = window.EntityManager;
  const comps = window.Components;
  assert.ok(ecs && comps, 'EntityManager y Components deben estar definidos');

  const botId = ecs.createEntity('bot');
  assert.ok(typeof botId === 'number', 'El ID de entidad debe ser numérico');

  const bots = ecs.getByTag('bot');
  assert.ok(bots.includes(botId), 'getByTag debe contener el ID creado');

  ecs.destroyEntity(botId);
  const botsAfter = ecs.getByTag('bot');
  assert.equal(botsAfter.includes(botId), false, 'La entidad destruida debe eliminarse de los tags');
});

test('ECS — Asignación y lectura de componentes', () => {
  const ecs = window.EntityManager;
  const comps = window.Components;

  const playerEntity = ecs.createEntity('player');
  ecs.addComponent(playerEntity, 'Transform', comps.Transform(7.5, 33.5, 0, -1.57, -0.02));
  ecs.addComponent(playerEntity, 'Health', comps.Health(100, 100, 50, true));

  assert.equal(ecs.hasComponent(playerEntity, 'Transform'), true);
  assert.equal(ecs.hasComponent(playerEntity, 'Health'), true);

  const t = ecs.getComponent(playerEntity, 'Transform');
  assert.equal(t.x, 7.5);
  assert.equal(t.y, 33.5);

  const h = ecs.getComponent(playerEntity, 'Health');
  assert.equal(h.hp, 100);
  assert.equal(h.armor, 50);

  ecs.destroyEntity(playerEntity);
  assert.equal(ecs.getComponent(playerEntity, 'Transform'), null);
});

test('ECS — Consulta combinatoria query(...)', () => {
  const ecs = window.EntityManager;
  const comps = window.Components;

  const e1 = ecs.createEntity();
  ecs.addComponent(e1, 'Transform', comps.Transform(1, 2));
  ecs.addComponent(e1, 'Health', comps.Health(100));

  const e2 = ecs.createEntity();
  ecs.addComponent(e2, 'Transform', comps.Transform(3, 4));

  const matches = ecs.query('Transform', 'Health');
  assert.ok(matches.includes(e1), 'e1 debe coincidir con Transform y Health');
  assert.equal(matches.includes(e2), false, 'e2 no tiene Health y no debe coincidir');

  ecs.destroyEntity(e1);
  ecs.destroyEntity(e2);
});
