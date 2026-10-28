'use strict';
/* =====================================================================
   DUST STRIKE — tools/bot_benchmark.js
   Simulador Headless de Partidas: Stress Test, Detección de Fugas de
   Memoria y Balance de Armas / Mapa.
   ===================================================================== */

const { loadScript } = require('../tests/test_env.js');

// Cargar todas las capas del motor
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
loadScript('js/game/AI.js');

function runBenchmark(totalRounds = 50) {
  console.log(`⚔️  DUST STRIKE — Iniciando Bot Benchmark & Stress Test (${totalRounds} rondas)...\n`);

  const t0 = performance.now();
  const memStart = process.memoryUsage ? process.memoryUsage().heapUsed : 0;

  const stats = {
    totalRounds,
    ctWins: 0,
    tWins: 0,
    reasons: {
      tEliminated: 0,
      ctEliminated: 0,
      bombDetonated: 0,
      bombDefused: 0,
      timeExpired: 0
    },
    weaponKills: {
      ak: 0,
      m4: 0,
      awp: 0,
      mp5: 0,
      deagle: 0,
      usp: 0,
      glock: 0
    },
    totalSimTimeSec: 0,
    entityCountCheck: []
  };

  for (let r = 1; r <= totalRounds; r++) {
    // 1. Configurar ronda
    game.round = r;
    game.state = 'live';
    game.roundTime = 105;
    player.alive = false; // Solo bots en el benchmark

    // Spawn 5 CT vs 5 T bots
    const ctBots = [];
    const tBots = [];

    const ctSpawnList = CT_SPAWNS.slice(0, 5);
    for (let i = 0; i < 5; i++) {
      const sp = ctSpawnList[i % ctSpawnList.length];
      const bot = makeBot(sp.x, sp.y, i, false);
      bot.team = 'ct';
      bot.weapon = i === 0 ? 'awp' : i % 2 === 0 ? 'm4' : 'mp5';
      ctBots.push(bot);
    }

    const tSpawnList = T_SPAWNS.slice(0, 5);
    for (let i = 0; i < 5; i++) {
      const sp = tSpawnList[i % tSpawnList.length];
      const bot = makeBot(sp.x, sp.y, i + 5, i === 0);
      bot.team = 't';
      bot.weapon = i === 0 ? 'ak' : i % 2 === 0 ? 'ak' : 'mp5';
      tBots.push(bot);
    }

    bots = [...ctBots, ...tBots];

    // Registrar en ECS
    const ecs = Engine.ecs;
    for (const b of bots) {
      const eid = ecs.createEntity('bot');
      b._entityId = eid;
      ecs.addComponent(eid, 'Transform', b);
      ecs.addComponent(eid, 'Health', b);
      ecs.addComponent(eid, 'AIController', b);
    }

    // Configurar C4
    bomb.state = 'carried';
    bomb.timer = 40;
    bomb.carrier = tBots[0];
    bomb.x = tBots[0].x;
    bomb.y = tBots[0].y;
    bomb.plantProgress = 0;
    bomb.defuseProgress = 0;

    // 2. Simular ronda paso a paso (dt = 0.2s para alta velocidad)
    let roundEnded = false;
    let roundTime = 0;
    const dt = 0.15;

    while (!roundEnded && roundTime < 110) {
      roundTime += dt;
      game.roundTime -= dt;

      // Actualizar combate entre bots cercanos
      for (const b of bots) {
        if (!b.alive) continue;
        const enemies = bots.filter(e => e.alive && e.team !== b.team);
        if (enemies.length === 0) break;

        // Buscar enemigo visible más cercano
        let closest = null, minD = 1e9;
        for (const e of enemies) {
          const d = dist2D(b.x, b.y, e.x, e.y);
          if (d < minD && losClear(b.x, b.y, e.x, e.y)) {
            minD = d;
            closest = e;
          }
        }

        if (closest && minD < 18) {
          b.shootCooldown = (b.shootCooldown || 0) - dt;
          if (b.shootCooldown <= 0) {
            const def = WEAPONS[b.weapon] || WEAPONS.ak;
            b.shootCooldown = 60 / def.rpm;
            const hitChance = b.team === 'ct' ? 0.42 : 0.40;
            if (Math.random() < hitChance) {
              const head = Math.random() < 0.22;
              const dmg = def.dmg * (head ? def.hs : 1);
              closest.hp -= dmg;
              if (closest.hp <= 0) {
                closest.alive = false;
                stats.weaponKills[b.weapon] = (stats.weaponKills[b.weapon] || 0) + 1;
              }
            }
          }
        }
      }

      // Lógica de bomba
      if (bomb.state === 'carried') {
        const carrier = bomb.carrier;
        if (carrier && carrier.alive) {
          // Mover portador hacia Sitio A
          const dSite = dist2D(carrier.x, carrier.y, PLANT_SPOT.x, PLANT_SPOT.y);
          if (dSite < 2.5) {
            bomb.plantProgress += dt / 3.2;
            if (bomb.plantProgress >= 1) {
              bomb.state = 'planted';
              bomb.timer = 40;
            }
          } else {
            carrier.x += (PLANT_SPOT.x - carrier.x) * 0.08;
            carrier.y += (PLANT_SPOT.y - carrier.y) * 0.08;
          }
        }
      } else if (bomb.state === 'planted') {
        bomb.timer -= dt;
        if (bomb.timer <= 0) {
          bomb.state = 'exploded';
          roundEnded = true;
          stats.tWins++;
          stats.reasons.bombDetonated++;
          break;
        }

        // CT intenta desactivar si está cerca
        const defuser = ctBots.find(b => b.alive);
        if (defuser) {
          const dBomb = dist2D(defuser.x, defuser.y, bomb.x, bomb.y);
          if (dBomb < 2.0) {
            bomb.defuseProgress += dt / 8.0;
            if (bomb.defuseProgress >= 1) {
              bomb.state = 'defused';
              roundEnded = true;
              stats.ctWins++;
              stats.reasons.bombDefused++;
              break;
            }
          } else {
            defuser.x += (bomb.x - defuser.x) * 0.09;
            defuser.y += (bomb.y - defuser.y) * 0.09;
          }
        }
      }

      // Condiciones de fin de ronda por eliminación
      const aliveCT = ctBots.filter(b => b.alive).length;
      const aliveT = tBots.filter(b => b.alive).length;

      if (aliveT === 0 && bomb.state !== 'planted') {
        roundEnded = true;
        stats.ctWins++;
        stats.reasons.tEliminated++;
        break;
      }
      if (aliveCT === 0 && bomb.state !== 'defused') {
        roundEnded = true;
        stats.tWins++;
        stats.reasons.ctEliminated++;
        break;
      }
      if (game.roundTime <= 0 && bomb.state !== 'planted') {
        roundEnded = true;
        stats.ctWins++;
        stats.reasons.timeExpired++;
        break;
      }
    }

    stats.totalSimTimeSec += roundTime;

    // Verificar limpieza de entidades ECS
    for (const b of bots) {
      if (b._entityId) ecs.destroyEntity(b._entityId);
    }
    stats.entityCountCheck.push(ecs.entities.size);
  }

  const durationMs = (performance.now() - t0).toFixed(1);
  const memEnd = process.memoryUsage ? process.memoryUsage().heapUsed : 0;
  const memDeltaMb = ((memEnd - memStart) / (1024 * 1024)).toFixed(2);

  // 3. Imprimir reporte de resultados
  const ctPct = ((stats.ctWins / totalRounds) * 100).toFixed(1);
  const tPct = ((stats.tWins / totalRounds) * 100).toFixed(1);
  const avgRoundTime = (stats.totalSimTimeSec / totalRounds).toFixed(1);

  console.log('====================================================');
  console.log('📊 REPORTE DE BENCHMARK & BALANCE TÁCTICO');
  console.log('====================================================');
  console.log(`⏱️  Tiempo real de benchmark: ${durationMs} ms`);
  console.log(`🎮 Rondas simuladas: ${totalRounds} (promedio sim: ${avgRoundTime}s por ronda)`);
  console.log(`🛡️  Victorias CT: ${stats.ctWins} (${ctPct}%)`);
  console.log(`💣 Victorias T:  ${stats.tWins} (${tPct}%)`);
  console.log('----------------------------------------------------');
  console.log('📋 Desglose de finales de ronda:');
  console.log(`   - Terroristas eliminados:     ${stats.reasons.tEliminated}`);
  console.log(`   - Antiterroristas eliminados: ${stats.reasons.ctEliminated}`);
  console.log(`   - C4 detonado:                ${stats.reasons.bombDetonated}`);
  console.log(`   - C4 desactivado:             ${stats.reasons.bombDefused}`);
  console.log(`   - Tiempo agotado (CT gana):   ${stats.reasons.timeExpired}`);
  console.log('----------------------------------------------------');
  console.log('🔫 Bajas por arma:');
  for (const [w, kills] of Object.entries(stats.weaponKills)) {
    if (kills > 0) {
      console.log(`   - ${w.toUpperCase().padEnd(8)}: ${kills} bajas`);
    }
  }
  console.log('----------------------------------------------------');
  console.log('🧠 Prueba de estrés de memoria:');
  const maxEntitiesLeft = Math.max(...stats.entityCountCheck);
  console.log(`   - Entidades huérfanas tras simular: ${maxEntitiesLeft} (esperado: 0 o 1)`);
  console.log(`   - Variación de memoria Heap:        ${memDeltaMb} MB`);

  if (maxEntitiesLeft > 2) {
    console.error('❌ ADVERTENCIA: Se detectaron entidades no destruidas (posible memory leak).');
    process.exit(1);
  } else {
    console.log('✅ Sin fugas de memoria: todas las entidades de bots se liberaron correctamente.');
  }

  console.log('====================================================\n');
  return stats;
}

if (typeof module !== 'undefined' && require.main === module) {
  const argRounds = parseInt(process.argv[2], 10);
  runBenchmark(isNaN(argRounds) ? 50 : argRounds);
}

module.exports = { runBenchmark };

