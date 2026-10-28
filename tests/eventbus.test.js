'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('./test_env.js');
require('../js/core/EventBus.js');

test('EventBus — registro y recepción de eventos', () => {
  const bus = window.EventBus;
  assert.ok(bus, 'EventBus debe estar disponible en el entorno');

  let received = null;
  const unsubscribe = bus.on('test:event', (payload) => {
    received = payload;
  });

  bus.emit('test:event', { message: 'Operación iniciada', code: 200 });
  assert.deepEqual(received, { message: 'Operación iniciada', code: 200 });

  unsubscribe();
  bus.emit('test:event', { message: 'No debería recibirse' });
  assert.equal(received.message, 'Operación iniciada', 'El listener desuscrito no debe recibir nuevos eventos');
});

test('EventBus — evento once() se ejecuta una única vez', () => {
  const bus = window.EventBus;
  let count = 0;

  bus.once('test:single', () => {
    count++;
  });

  bus.emit('test:single');
  bus.emit('test:single');
  bus.emit('test:single');

  assert.equal(count, 1, 'once() solo debe invocarse una vez');
});

test('EventBus — múltiples suscriptores para el mismo evento', () => {
  const bus = window.EventBus;
  const order = [];

  bus.on('multi:event', () => order.push('primer_suscriptor'));
  bus.on('multi:event', () => order.push('segundo_suscriptor'));

  bus.emit('multi:event');
  assert.deepEqual(order, ['primer_suscriptor', 'segundo_suscriptor']);
});
