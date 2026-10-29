'use strict';
/* =====================================================================
   DUST STRIKE — tests/run_tests.js
   Ejecutor unificado de pruebas unitarias
   ===================================================================== */

const { spawnSync } = require('child_process');
const path = require('path');

const testFiles = [
  'tests/eventbus.test.js',
  'tests/ecs.test.js',
  'tests/fsm.test.js',
  'tests/combat.test.js',
  'tests/multiplayer.test.js'
];

console.log('🔫 DUST STRIKE — Ejecutando suite de pruebas unitarias...\n');

const res = spawnSync(process.execPath, ['--test', ...testFiles], {
  stdio: 'inherit',
  cwd: path.resolve(__dirname, '..')
});

if (res.status !== 0) {
  console.error('\n❌ Error: Una o más pruebas fallaron.');
  process.exit(res.status || 1);
} else {
  console.log('\n✅ Todas las pruebas unitarias pasaron exitosamente.');
}

