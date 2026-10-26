'use strict';
/* =====================================================================
   DUST STRIKE — multiplayer.js
   Módulo multijugador P2P WebRTC (PeerJS) para salas 5 vs 5 con
   selección de bando (CT / T), enlaces compartibles y sincronización.
   ===================================================================== */

const Multiplayer = (() => {
  const MAX_PER_TEAM = 5;
  const PEER_PREFIX = 'dust_strike_room_';

  let peer = null;
  let isHost = false;
  let roomCode = null;
  let connections = new Map(); // peerId -> connection (solo Host)
  let hostConn = null;         // connection con el Host (solo Clientes)
  let active = false;          // true si la partida multijugador está en curso
  let inLobby = false;         // true si estamos en el lobby de la sala
  let fillBots = true;         // rellenar con bots hasta 5v5 si faltan jugadores

  // Lista local de participantes en la sala
  // Cada elemento: { id, name, team: 'ct'|'t', isHost: bool, ping: number }
  let roomPlayers = [];

  // Estado de jugadores remotos durante la partida
  // peerId -> { id, name, team, x, y, z, yaw, pitch, hp, alive, weapon, pose, ... }
  let remotePlayers = new Map();

  let lastSendTime = 0;
  const TICK_INTERVAL = 1000 / 22; // ~22 updates/segundo

  /* ---------------------------------------------------------------------
     GENERACIÓN DE SALAS Y ENLACES
     --------------------------------------------------------------------- */
  function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'D';
    for (let i = 0; i < 4; i++) code += chars[(Math.random() * chars.length) | 0];
    return 'DUST-' + code;
  }

  function getShareUrl(code) {
    const url = new URL(window.location.href);
    url.searchParams.set('room', code || roomCode || '');
    return url.toString();
  }

  /* ---------------------------------------------------------------------
     CREAR SALA (HOST)
     --------------------------------------------------------------------- */
  function createRoom() {
    cleanup();
    roomCode = generateRoomCode();
    const myName = player.name || 'OPERADOR';
    isHost = true;
    inLobby = true;

    const hostPeerId = PEER_PREFIX + roomCode;
    try {
      peer = new Peer(hostPeerId, {
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
          ]
        }
      });
    } catch (e) {
      console.warn('Error inicializando PeerJS:', e);
      uiToast('Error al inicializar red multijugador');
      return;
    }

    peer.on('open', (id) => {
      console.log('Sala creada con éxito. Peer ID:', id);
      player.team = 'ct'; // Host por defecto en CT
      roomPlayers = [{
        id: 'host',
        name: myName,
        team: player.team,
        isHost: true,
        ping: 0
      }];
      updateLobbyUI();
      uiToast('Sala ' + roomCode + ' creada. Comparte el enlace.');
    });

    peer.on('connection', (conn) => {
      handleIncomingConnection(conn);
    });

    peer.on('error', (err) => {
      console.warn('Error en PeerJS Host:', err);
      if (err.type === 'unavailable-id') {
        // En caso raro de colisión, reintentar con otro código
        roomCode = generateRoomCode();
        createRoom();
      } else {
        uiToast('Error de conexión P2P: ' + (err.message || err.type));
      }
    });
  }

  /* ---------------------------------------------------------------------
     UNIRSE A SALA (CLIENTE)
     --------------------------------------------------------------------- */
  function joinRoom(code) {
    if (!code) return;
    cleanup();
    code = code.trim().toUpperCase();
    if (!code.startsWith('DUST-') && !code.startsWith('dust-')) {
      code = 'DUST-' + code.replace(/[^A-Z0-9]/gi, '');
    }
    roomCode = code;
    isHost = false;
    inLobby = true;

    const myName = player.name || 'OPERADOR';
    try {
      peer = new Peer({
        debug: 1,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
          ]
        }
      });
    } catch (e) {
      console.warn('Error iniciando Peer cliente:', e);
      uiToast('Error al conectar con red P2P');
      return;
    }

    peer.on('open', (myId) => {
      const targetHostId = PEER_PREFIX + roomCode;
      console.log('Conectando como cliente al Host:', targetHostId);
      const conn = peer.connect(targetHostId, { reliable: true });
      hostConn = conn;

      conn.on('open', () => {
        console.log('Conectado con el Host de la sala.');
        conn.send({
          type: 'JOIN_REQUEST',
          name: myName,
          preferredTeam: player.team || 't'
        });
      });

      conn.on('data', (data) => {
        handleClientMessage(data);
      });

      conn.on('close', () => {
        uiToast('Conexión con el anfitrión cerrada.');
        leaveRoom();
      });

      conn.on('error', (err) => {
        console.warn('Error en conexión con host:', err);
        uiToast('No se pudo conectar a la sala ' + roomCode);
        leaveRoom();
      });
    });

    peer.on('error', (err) => {
      console.warn('Error en PeerJS cliente:', err);
      uiToast('Error P2P: ' + (err.message || err.type));
    });
  }

  /* ---------------------------------------------------------------------
     MANEJO DE CONEXIONES ENTRANTES (HOST)
     --------------------------------------------------------------------- */
  function handleIncomingConnection(conn) {
    conn.on('open', () => {
      // Esperar JOIN_REQUEST
    });

    conn.on('data', (msg) => {
      if (!msg || !msg.type) return;

      if (msg.type === 'JOIN_REQUEST') {
        if (roomPlayers.length >= MAX_PER_TEAM * 2) {
          conn.send({ type: 'JOIN_REJECT', reason: 'La sala está completa (máx 10 jugadores).' });
          conn.close();
          return;
        }

        // Asignar bando balanceado respetando preferencia si hay cupo
        let chosenTeam = msg.preferredTeam === 't' ? 't' : 'ct';
        const ctCount = countTeam('ct');
        const tCount = countTeam('t');

        if (chosenTeam === 'ct' && ctCount >= MAX_PER_TEAM) chosenTeam = 't';
        else if (chosenTeam === 't' && tCount >= MAX_PER_TEAM) chosenTeam = 'ct';

        if (countTeam(chosenTeam) >= MAX_PER_TEAM) {
          conn.send({ type: 'JOIN_REJECT', reason: 'Ambos equipos están llenos (5 vs 5).' });
          conn.close();
          return;
        }

        const newPlayer = {
          id: conn.peer,
          name: (msg.name || 'OPERADOR').slice(0, 14),
          team: chosenTeam,
          isHost: false,
          ping: 0
        };

        connections.set(conn.peer, conn);
        roomPlayers.push(newPlayer);

        conn.send({
          type: 'JOIN_ACCEPT',
          roomCode,
          assignedTeam: chosenTeam,
          isHost: false,
          fillBots
        });

        broadcastLobbyState();
        updateLobbyUI();
        uiToast(newPlayer.name + ' se unió al equipo ' + chosenTeam.toUpperCase());
      } else if (msg.type === 'TEAM_CHANGE') {
        const p = roomPlayers.find(x => x.id === conn.peer);
        if (p && !active) {
          const target = msg.team === 't' ? 't' : 'ct';
          if (countTeam(target) < MAX_PER_TEAM) {
            p.team = target;
            broadcastLobbyState();
            updateLobbyUI();
          } else {
            conn.send({ type: 'TEAM_REJECT', reason: 'El equipo ' + target.toUpperCase() + ' está lleno (5/5).' });
          }
        }
      } else if (msg.type === 'CLIENT_TICK') {
        handleClientTick(conn.peer, msg);
      } else if (msg.type === 'CLIENT_SHOOT') {
        handleClientShoot(conn.peer, msg);
      } else if (msg.type === 'CLIENT_DEFUSE') {
        handleClientDefuse(conn.peer, msg);
      } else if (msg.type === 'CLIENT_PLANT') {
        handleClientPlant(conn.peer, msg);
      }
    });

    conn.on('close', () => {
      const pIdx = roomPlayers.findIndex(x => x.id === conn.peer);
      if (pIdx !== -1) {
        const left = roomPlayers.splice(pIdx, 1)[0];
        connections.delete(conn.peer);
        remotePlayers.delete(conn.peer);
        broadcastLobbyState();
        updateLobbyUI();
        uiToast(left.name + ' ha salido de la sala.');
      }
    });
  }

  /* ---------------------------------------------------------------------
     MANEJO DE MENSAJES RECIBIDOS (CLIENTE)
     --------------------------------------------------------------------- */
  function handleClientMessage(msg) {
    if (!msg || !msg.type) return;

    if (msg.type === 'JOIN_ACCEPT') {
      roomCode = msg.roomCode;
      player.team = msg.assignedTeam;
      fillBots = msg.fillBots;
      updateLobbyUI();
      uiToast('¡Conectado a la sala ' + roomCode + '!');
    } else if (msg.type === 'JOIN_REJECT') {
      uiToast('No se pudo entrar: ' + msg.reason);
      leaveRoom();
    } else if (msg.type === 'LOBBY_UPDATE') {
      roomPlayers = msg.players || [];
      fillBots = !!msg.fillBots;
      const me = roomPlayers.find(p => p.id === (peer ? peer.id : ''));
      if (me) player.team = me.team;
      updateLobbyUI();
    } else if (msg.type === 'MATCH_START') {
      active = true;
      inLobby = false;
      game.mode = 'multi';
      game.started = true;
      player.team = msg.yourTeam || player.team;
      startMultiplayerMatchAsClient(msg);
    } else if (msg.type === 'SERVER_SNAPSHOT') {
      applyServerSnapshot(msg);
    } else if (msg.type === 'REMOTE_SHOOT') {
      // Dibujar trazadora y reproducir sonido de disparo de otro jugador
      if (msg.shooterId !== (peer ? peer.id : 'host')) {
        tracers.push({
          x1: msg.x1, y1: msg.y1, z1: msg.z1,
          x2: msg.x2, y2: msg.y2, z2: msg.z2,
          life: 0.08, maxLife: 0.08, color: msg.color || '255,200,120', width: 1.2
        });
        sfxShot(msg.sound || 'rifle', msg.pan || 0, 0.85);
      }
    } else if (msg.type === 'HIT_CONFIRM') {
      showHitmarker(msg.head);
      sfxHit(msg.head);
    } else if (msg.type === 'ROUND_EVENT') {
      if (msg.event === 'planted') {
        bomb.state = 'planted';
        bomb.x = msg.x; bomb.y = msg.y;
        bomb.timer = msg.timer || BOMB_TIME;
        banner('BOMBA PLANTADA', 'Sitio A · ' + (player.team === 'ct' ? 'Desactívala' : 'Defiéndela'), 'warn', 2.5);
        sfxPlant();
      } else if (msg.event === 'defused') {
        bomb.state = 'defused';
        banner('C4 DESACTIVADO', msg.text || '', 'win', 2.5);
      } else if (msg.event === 'exploded') {
        explodeBomb();
      }
    } else if (msg.type === 'ROUND_OVER') {
      endRound(msg.ctWin, msg.reason);
    } else if (msg.type === 'KILL_EVENT') {
      addKillfeed(msg.html);
      if (msg.killerName === player.name) {
        player.kills++;
        if (msg.head) player.headshots++;
        player.money = Math.min(MAX_MONEY, player.money + msg.reward);
        sfxKill(msg.head);
      }
    }
  }

  /* ---------------------------------------------------------------------
     CAMBIO DE EQUIPO
     --------------------------------------------------------------------- */
  function selectTeam(targetTeam) {
    if (targetTeam !== 'ct' && targetTeam !== 't') return;
    if (active) return; // No cambiar de bando en partida en curso

    if (countTeam(targetTeam) >= MAX_PER_TEAM) {
      uiToast('El equipo ' + targetTeam.toUpperCase() + ' ya tiene 5 jugadores.');
      return;
    }

    player.team = targetTeam;

    if (isHost) {
      const hostP = roomPlayers.find(p => p.isHost);
      if (hostP) hostP.team = targetTeam;
      broadcastLobbyState();
      updateLobbyUI();
    } else if (hostConn && hostConn.open) {
      hostConn.send({ type: 'TEAM_CHANGE', team: targetTeam });
    }
  }

  function countTeam(team) {
    return roomPlayers.filter(p => p.team === team).length;
  }

  /* ---------------------------------------------------------------------
     TRANSMISIÓN DE ESTADO (HOST)
     --------------------------------------------------------------------- */
  function broadcastLobbyState() {
    if (!isHost) return;
    const msg = {
      type: 'LOBBY_UPDATE',
      players: roomPlayers,
      fillBots
    };
    for (const [id, conn] of connections) {
      if (conn.open) conn.send(msg);
    }
  }

  function startMatch() {
    if (!isHost) return;
    if (roomPlayers.length === 0) return;

    active = true;
    inLobby = false;
    game.mode = 'multi';
    game.started = true;

    // Enviar a todos los clientes que arranque la partida
    for (const [id, conn] of connections) {
      const p = roomPlayers.find(x => x.id === id);
      if (conn.open) {
        conn.send({
          type: 'MATCH_START',
          yourTeam: p ? p.team : 't',
          round: 1,
          fillBots
        });
      }
    }

    // Iniciar la partida local en el Host
    hideAllScreens();
    ui.hud.classList.remove('hidden');
    ui.menu.classList.add('hidden');
    startMatchAsHost();
  }

  /* ---------------------------------------------------------------------
     INICIALIZACIÓN DE PARTIDA HOST VS CLIENTE
     --------------------------------------------------------------------- */
  function startMatchAsHost() {
    game.round = 0;
    game.ctScore = 0;
    game.tScore = 0;
    game.matchOver = false;
    setupMultiplayerRound();
  }

  function startMultiplayerMatchAsClient(msg) {
    hideAllScreens();
    ui.hud.classList.remove('hidden');
    ui.menu.classList.add('hidden');
    game.round = msg.round || 1;
    game.state = 'buy';
    setupLocalPlayerForMultiplayer();
    openBuyMenu();
    updateHUD();
  }

  function setupMultiplayerRound() {
    game.round++;
    hideAllScreens();
    ui.hud.classList.remove('hidden');
    game.state = 'buy';
    game.buyTimer = BUY_TIME;
    game.buyExpired = false;
    game.roundTime = ROUND_TIME;

    setupLocalPlayerForMultiplayer();

    // Rellenar con Bots si está activado para completar 5 vs 5
    bots = [];
    if (fillBots) {
      spawnMultiplayerBots();
    }
    resetBomb();

    openBuyMenu();
    updateHUD();
  }

  function setupLocalPlayerForMultiplayer() {
    player.alive = true;
    player.hp = 100;
    player.armor = 0;
    player.defusing = false;
    player.planting = false;
    player.money = player.money || 800;

    // Asignar punto de reaparición según bando
    if (player.team === 'ct') {
      const spIdx = (roomPlayers.filter(p => p.team === 'ct').findIndex(p => p.name === player.name) || 0) % CT_SPAWNS.length;
      const sp = CT_SPAWNS[spIdx] || CT_SPAWN;
      player.x = sp.x; player.y = sp.y; player.yaw = sp.yaw;
    } else {
      const spIdx = (roomPlayers.filter(p => p.team === 't').findIndex(p => p.name === player.name) || 0) % T_SPAWNS.length;
      const sp = T_SPAWNS[spIdx] || T_SPAWNS[0];
      player.x = sp.x; player.y = sp.y; player.yaw = -Math.PI / 2;
    }

    player.vx = 0; player.vy = 0; player.vz = 0; player.z = 0;
    player.eyeOff = 0;
    player.onGround = true;
    player.scope = false;
    player.reload = 0;
    player.fireCd = 0;

    // Armas por bando
    if (player.team === 't') {
      player.slots = { 1: null, 2: gunObj('usp'), 3: { id: 'knife', mag: 0, reserve: 0 } };
    } else {
      player.slots = { 1: null, 2: gunObj('usp'), 3: { id: 'knife', mag: 0, reserve: 0 } };
    }
    player.slot = 2;
    refillAmmo();
  }

  function spawnMultiplayerBots() {
    const humanCT = roomPlayers.filter(p => p.team === 'ct').length;
    const humanT = roomPlayers.filter(p => p.team === 't').length;
    const botsNeededCT = Math.max(0, MAX_PER_TEAM - humanCT);
    const botsNeededT = Math.max(0, MAX_PER_TEAM - humanT);

    let botIndex = 0;
    // Bots CT
    for (let i = 0; i < botsNeededCT; i++) {
      const sp = CT_SPAWNS[(humanCT + i) % CT_SPAWNS.length];
      const b = makeBot(sp.x, sp.y, botIndex++, false);
      b.team = 'ct';
      b.name = 'BOT_CT_' + (i + 1);
      bots.push(b);
    }
    // Bots T
    for (let i = 0; i < botsNeededT; i++) {
      const sp = T_SPAWNS[(humanT + i) % T_SPAWNS.length];
      const b = makeBot(sp.x, sp.y, botIndex++, i === 0 && humanT === 0);
      b.team = 't';
      b.name = 'BOT_T_' + (i + 1);
      bots.push(b);
    }
  }

  /* ---------------------------------------------------------------------
     CICLO DE RED (TICK)
     --------------------------------------------------------------------- */
  function tick(now) {
    if (!active || game.state === 'menu') return;
    if (now - lastSendTime < TICK_INTERVAL) return;
    lastSendTime = now;

    const myDef = getCurrentDef();
    const myGun = getCurrentGun();
    const myPose = player.fireCd > 0 ? 'shoot' : Math.hypot(player.vx, player.vy) > 0.4 ? 'walk1' : 'idle';

    const localState = {
      x: player.x,
      y: player.y,
      z: player.z,
      yaw: player.yaw,
      pitch: player.pitch,
      hp: player.hp,
      alive: player.alive,
      team: player.team,
      name: player.name,
      weapon: myDef ? myDef.id : 'usp',
      pose: myPose,
      defusing: player.defusing,
      planting: player.planting
    };

    if (isHost) {
      // El Host actualiza a todos los clientes con el Snapshot global
      const playerStates = [];
      playerStates.push({ id: 'host', ...localState });

      for (const [id, rp] of remotePlayers) {
        playerStates.push({ id, ...rp });
      }

      const snapshot = {
        type: 'SERVER_SNAPSHOT',
        players: playerStates,
        bots: bots.map(b => ({
          x: b.x, y: b.y, team: b.team || 't', hp: b.hp, alive: b.alive,
          aim: b.aim, shootPose: b.shootPose, weapon: b.weapon, name: b.name
        })),
        bomb: {
          x: bomb.x, y: bomb.y, state: bomb.state,
          timer: bomb.timer, defuseProgress: bomb.defuseProgress
        },
        roundTime: game.roundTime,
        ctScore: game.ctScore,
        tScore: game.tScore,
        state: game.state
      };

      for (const [id, conn] of connections) {
        if (conn.open) conn.send(snapshot);
      }
    } else if (hostConn && hostConn.open) {
      // El cliente envía su estado al Host
      hostConn.send({
        type: 'CLIENT_TICK',
        state: localState
      });
    }
  }

  function handleClientTick(peerId, msg) {
    if (!msg || !msg.state) return;
    remotePlayers.set(peerId, { id: peerId, ...msg.state });
  }

  function applyServerSnapshot(snap) {
    if (!snap) return;

    // Actualizar jugadores remotos
    if (snap.players) {
      for (const p of snap.players) {
        if (p.id !== (peer ? peer.id : '')) {
          remotePlayers.set(p.id, p);
        }
      }
    }

    // Actualizar bots simulados por el host
    if (snap.bots && snap.bots.length > 0) {
      bots = snap.bots.map((b, i) => {
        const exist = bots[i] || makeBot(b.x, b.y, i, false);
        exist.x = b.x; exist.y = b.y;
        exist.team = b.team;
        exist.hp = b.hp;
        exist.alive = b.alive;
        exist.aim = b.aim;
        exist.shootPose = b.shootPose;
        exist.weapon = b.weapon;
        exist.name = b.name;
        return exist;
      });
    }

    // Sincronizar bomba y puntuación
    if (snap.bomb) {
      bomb.state = snap.bomb.state;
      bomb.x = snap.bomb.x;
      bomb.y = snap.bomb.y;
      bomb.timer = snap.bomb.timer;
      bomb.defuseProgress = snap.bomb.defuseProgress;
    }
    if (snap.roundTime !== undefined) game.roundTime = snap.roundTime;
    if (snap.ctScore !== undefined) game.ctScore = snap.ctScore;
    if (snap.tScore !== undefined) game.tScore = snap.tScore;
  }

  /* ---------------------------------------------------------------------
     DISPAROS Y DAÑO EN MULTIJUGADOR
     --------------------------------------------------------------------- */
  function sendShoot(x1, y1, z1, x2, y2, z2, weaponId, sound) {
    if (!active) return;
    const msg = {
      type: 'REMOTE_SHOOT',
      shooterId: peer ? peer.id : 'host',
      x1, y1, z1, x2, y2, z2,
      sound: sound || 'rifle'
    };

    if (isHost) {
      for (const [id, conn] of connections) {
        if (conn.open) conn.send(msg);
      }
    } else if (hostConn && hostConn.open) {
      hostConn.send(msg);
    }
  }

  function sendHit(targetId, dmg, head) {
    if (!active) return;
    showHitmarker(head);
    sfxHit(head);

    if (isHost) {
      applyDamageToPlayer(targetId, dmg, head, player.name);
    } else if (hostConn && hostConn.open) {
      hostConn.send({
        type: 'CLIENT_HIT',
        targetId,
        dmg,
        head,
        shooterName: player.name
      });
    }
  }

  function applyDamageToPlayer(targetId, dmg, head, shooterName) {
    if (targetId === 'host') {
      damagePlayer(dmg, { x: 0, y: 0 });
      if (!player.alive) {
        const reward = head ? 400 : 300;
        broadcastKill(shooterName, player.name, head, reward);
      }
    } else {
      const rp = remotePlayers.get(targetId);
      if (rp && rp.alive) {
        rp.hp -= dmg;
        if (rp.hp <= 0) {
          rp.alive = false;
          rp.hp = 0;
          const reward = head ? 400 : 300;
          broadcastKill(shooterName, rp.name, head, reward);
        }
      }
    }
  }

  function broadcastKill(killerName, victimName, head, reward) {
    const html = `<b>${killerName}</b> ▸ ${victimName}${head ? ' <span class="hs">HEADSHOT</span>' : ''} <em>+$${reward}</em>`;
    addKillfeed(html);
    const msg = { type: 'KILL_EVENT', html, killerName, victimName, head, reward };
    if (isHost) {
      for (const [id, conn] of connections) {
        if (conn.open) conn.send(msg);
      }
    }
  }

  /* ---------------------------------------------------------------------
     LIMPIEZA / SALIR DE SALA
     --------------------------------------------------------------------- */
  function cleanup() {
    active = false;
    inLobby = false;
    isHost = false;
    connections.clear();
    remotePlayers.clear();
    roomPlayers = [];
    if (hostConn) {
      try { hostConn.close(); } catch (e) {}
      hostConn = null;
    }
    if (peer) {
      try { peer.destroy(); } catch (e) {}
      peer = null;
    }
  }

  function leaveRoom() {
    cleanup();
    game.mode = 'single';
    if (window.history && window.history.replaceState) {
      const url = new URL(window.location.href);
      url.searchParams.delete('room');
      window.history.replaceState({}, '', url.toString());
    }
    hideAllScreens();
    ui.menu.classList.remove('hidden');
  }

  /* ---------------------------------------------------------------------
     ACTUALIZACIÓN VISUAL DEL LOBBY
     --------------------------------------------------------------------- */
  function updateLobbyUI() {
    const codeEl = $('displayRoomCode');
    if (codeEl) codeEl.textContent = roomCode || '—';

    const ctListEl = $('ctList');
    const tListEl = $('tList');
    const ctCountEl = $('ctCount');
    const tCountEl = $('tCount');
    const hostControls = $('hostControls');
    const joinCtBtn = $('joinCtBtn');
    const joinTBtn = $('joinTBtn');

    const ctPlayers = roomPlayers.filter(p => p.team === 'ct');
    const tPlayers = roomPlayers.filter(p => p.team === 't');

    if (ctCountEl) ctCountEl.textContent = `${ctPlayers.length} / ${MAX_PER_TEAM}`;
    if (tCountEl) tCountEl.textContent = `${tPlayers.length} / ${MAX_PER_TEAM}`;

    if (ctListEl) {
      ctListEl.innerHTML = ctPlayers.map(p =>
        `<div class="roster-item ct"><span>🛡️ ${escapeHTML(p.name)}</span> ${p.isHost ? '<small class="host-tag">ANFITRIÓN</small>' : ''}</div>`
      ).join('') || '<div class="roster-empty">Sin agentes asignados</div>';
    }

    if (tListEl) {
      tListEl.innerHTML = tPlayers.map(p =>
        `<div class="roster-item t"><span>💣 ${escapeHTML(p.name)}</span> ${p.isHost ? '<small class="host-tag">ANFITRIÓN</small>' : ''}</div>`
      ).join('') || '<div class="roster-empty">Sin terroristas asignados</div>';
    }

    if (joinCtBtn) {
      const isMyTeam = player.team === 'ct';
      const isFull = ctPlayers.length >= MAX_PER_TEAM && !isMyTeam;
      joinCtBtn.disabled = isFull;
      joinCtBtn.textContent = isMyTeam ? 'TU EQUIPO (CT) ✓' : isFull ? 'LLENO (5/5)' : 'UNIRSE A CT';
      joinCtBtn.classList.toggle('selected-team', isMyTeam);
    }

    if (joinTBtn) {
      const isMyTeam = player.team === 't';
      const isFull = tPlayers.length >= MAX_PER_TEAM && !isMyTeam;
      joinTBtn.disabled = isFull;
      joinTBtn.textContent = isMyTeam ? 'TU EQUIPO (T) ✓' : isFull ? 'LLENO (5/5)' : 'UNIRSE A T';
      joinTBtn.classList.toggle('selected-team', isMyTeam);
    }

    if (hostControls) {
      hostControls.classList.toggle('hidden', !isHost);
    }
  }

  function escapeHTML(str) {
    return (str || '').replace(/[&<>'"]/g, tag => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag] || tag));
  }

  function uiToast(text) {
    if (window.toast) toast(text);
  }

  /* ---------------------------------------------------------------------
     INICIALIZACIÓN AL ABRIR PÁGINA
     --------------------------------------------------------------------- */
  function checkUrlForRoom() {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      console.log('Parámetro de sala detectado en URL:', roomParam);
      return roomParam.toUpperCase();
    }
    return null;
  }

  return {
    get active() { return active; },
    get inLobby() { return inLobby; },
    get isHost() { return isHost; },
    get roomCode() { return roomCode; },
    get fillBots() { return fillBots; },
    set fillBots(v) { fillBots = !!v; },
    createRoom,
    joinRoom,
    leaveRoom,
    selectTeam,
    startMatch,
    tick,
    sendShoot,
    sendHit,
    getRemotePlayers: () => Array.from(remotePlayers.values()),
    getShareUrl,
    checkUrlForRoom,
    updateLobbyUI
  };
})();
