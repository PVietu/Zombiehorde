/**
 * ZOMBIE HORDE — Game Server
 * Node.js + Express + Socket.IO + ngrok
 *
 * Запуск: node server.js
 * Требует: Node.js 18+, npm install
 */

'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const ngrok = require('ngrok');

// ============================================================
// CONFIG
// ============================================================
const PORT = 3000;
const NGROK_TOKEN = '3ER3n9UuUjAf4z0flHlfDXaP6ST_7SGNJYjwX7zRSUWB5NTEK';
const TICK_RATE = 20; // Hz
const TICK_MS = 1000 / TICK_RATE;

// ============================================================
// GAME CONSTANTS (mirror of client constants)
// ============================================================
const MAP_SIZE = 120;
const PLAYER_MAX_HP = 100;
const AK47_DAMAGE = 35;
const PISTOL_DAMAGE = 25;
const DOWN_TIMER = 15;
const RESPAWN_TIME = 10;
const REVIVE_TIME = 3;
const ACID_POOL_DURATION = 8;
const TRAP_DURATION = 20;
const TRAP_DAMAGE = 15;
const TRAP_COST = 300;
const BARRICADE_COST = 100;
const MAX_BARRICADES = 3;
const MYSTERY_BOX_COST = 200;
const GRENADE_DAMAGE = 120;
const GRENADE_RADIUS = 8;
const GRENADE_FUSE = 2.0;
const GRAVITY = -20;

const ZOMBIE_TYPES = {
  normal:   { speed: 2.5,  hp: 80,   damage: 10, reward: 10,  attackRange: 1.5, attackRate: 1.0, scale: 1.0 },
  exploder: { speed: 3.2,  hp: 60,   damage: 80, reward: 20,  attackRange: 2.5, attackRate: 0.5, scale: 1.1 },
  acid:     { speed: 2.0,  hp: 70,   damage: 15, reward: 25,  attackRange: 15,  attackRate: 2.0, scale: 0.9 },
  boss:     { speed: 4.0,  hp: 3000, damage: 40, reward: 200, attackRange: 5,   attackRate: 2.0, scale: 3.0 },
};

const WAVES = [
  { count: 6,  hpMult: 1.0,  speedMult: 1.0,  damageMult: 1.0,  hasBoss: false },
  { count: 8,  hpMult: 1.1,  speedMult: 1.05, damageMult: 1.1,  hasBoss: false },
  { count: 10, hpMult: 1.2,  speedMult: 1.1,  damageMult: 1.15, hasBoss: false },
  { count: 12, hpMult: 1.35, speedMult: 1.15, damageMult: 1.2,  hasBoss: false },
  { count: 15, hpMult: 1.5,  speedMult: 1.2,  damageMult: 1.3,  hasBoss: false },
  { count: 18, hpMult: 1.7,  speedMult: 1.25, damageMult: 1.4,  hasBoss: false },
  { count: 20, hpMult: 2.0,  speedMult: 1.3,  damageMult: 1.5,  hasBoss: false },
  { count: 22, hpMult: 2.3,  speedMult: 1.35, damageMult: 1.6,  hasBoss: false },
  { count: 25, hpMult: 2.7,  speedMult: 1.4,  damageMult: 1.7,  hasBoss: false },
  { count: 30, hpMult: 3.5,  speedMult: 1.5,  damageMult: 2.0,  hasBoss: true  },
];

// ============================================================
// UTILITY FUNCTIONS
// ============================================================
function vecDist2D(a, b) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2);
}

function clamp(v, mn, mx) { return Math.max(mn, Math.min(mx, v)); }
function randomRange(a, b) { return a + Math.random() * (b - a); }
function vec3(x = 0, y = 0, z = 0) { return { x, y, z }; }

// ============================================================
// COLLISION DETECTION (server-side, simplified AABB)
// ============================================================

/** Static world collision boxes */
const COLLISION_BOXES = [
  // Border walls
  { min: vec3(-60, 0, -60), max: vec3(60, 6, -59.25) },  // North
  { min: vec3(-60, 0, 59.25), max: vec3(-30, 6, 60) },    // South L
  { min: vec3(40, 0, 59.25), max: vec3(60, 6, 60) },      // South R
  { min: vec3(59.25, 0, -60), max: vec3(60, 6, 60) },     // East
  { min: vec3(-60, 0, -60), max: vec3(-59.25, 6, 60) },   // West
  // Main building
  { min: vec3(-25, 0, -41), max: vec3(-5, 8, -29) },
  // Side building
  { min: vec3(18, 0, -35), max: vec3(32, 6, -25) },
  // Bunker
  { min: vec3(-35, 0, 6), max: vec3(-25, 5, 14) },
  // Tower
  { min: vec3(27, 0, 17), max: vec3(33, 12, 23) },
  // Vending machine
  { min: vec3(-12.6, 0, -28.35), max: vec3(-11.4, 2.2, -27.65) },
  // Trap consoles
  { min: vec3(-45.4, 0, -0.25), max: vec3(-44.6, 1.2, 0.25) },
  { min: vec3(-0.4, 0, -0.25), max: vec3(0.4, 1.2, 0.25) },
];

function checkSolidCollision(x, z, radius) {
  for (const box of COLLISION_BOXES) {
    if (x - radius < box.max.x && x + radius > box.min.x &&
        z - radius < box.max.z && z + radius > box.min.z) {
      return true;
    }
  }
  return false;
}

function rayVsAABB(ox, oy, oz, dx, dy, dz, box) {
  let tmin = (box.min.x - ox) / (dx || 0.0001);
  let tmax = (box.max.x - ox) / (dx || 0.0001);
  if (tmin > tmax) { const t = tmin; tmin = tmax; tmax = t; }

  let tymin = (box.min.y - oy) / (dy || 0.0001);
  let tymax = (box.max.y - oy) / (dy || 0.0001);
  if (tymin > tymax) { const t = tymin; tymin = tymax; tymax = t; }

  if (tmin > tymax || tymin > tmax) return null;
  tmin = Math.max(tmin, tymin);
  tmax = Math.min(tmax, tymax);

  let tzmin = (box.min.z - oz) / (dz || 0.0001);
  let tzmax = (box.max.z - oz) / (dz || 0.0001);
  if (tzmin > tzmax) { const t = tzmin; tzmin = tzmax; tzmax = t; }

  if (tmin > tzmax || tzmin > tmax) return null;
  tmin = Math.max(tmin, tzmin);

  return tmin >= 0 ? tmin : null;
}

// ============================================================
// GAME STATE
// ============================================================
let gameState = {
  phase: 'waiting',   // 'waiting' | 'combat' | 'intermission' | 'victory' | 'defeat'
  wave: 0,
  zombieIdCounter: 0,
  acidProjectileCounter: 0,
  barricadeCounter: 0,
  zombies: new Map(),
  acidPools: new Map(),
  barricades: new Map(),
  traps: [
    { id: 0, position: vec3(-45, 0, 0), active: false, timer: 0, type: 'electric', damageTimer: 0 },
    { id: 1, position: vec3(0, 0, 0),   active: false, timer: 0, type: 'flamethrower', damageTimer: 0 },
  ],
  mysteryBox: { position: vec3(20, 0, -20), active: true },
  waveTimer: 0,
  intermissionTimer: 0,
};

const players = new Map();  // socketId -> PlayerState

function resetGameState() {
  gameState.phase = 'waiting';
  gameState.wave = 0;
  gameState.zombies.clear();
  gameState.acidPools.clear();
  gameState.barricades.clear();
  gameState.waveTimer = 0;
  for (const trap of gameState.traps) {
    trap.active = false;
    trap.timer = 0;
  }
}

// ============================================================
// PATHFINDING (simplified waypoint grid for server)
// ============================================================
const NAV_GRID_SIZE = 4;
const NAV_COLS = Math.ceil(MAP_SIZE / NAV_GRID_SIZE);
const NAV_ROWS = Math.ceil(MAP_SIZE / NAV_GRID_SIZE);

let navGrid = null;

function buildNavGrid() {
  navGrid = [];
  for (let r = 0; r < NAV_ROWS; r++) {
    navGrid[r] = [];
    for (let c = 0; c < NAV_COLS; c++) {
      // Check if cell center overlaps any collision box
      const wx = c * NAV_GRID_SIZE - MAP_SIZE / 2 + NAV_GRID_SIZE / 2;
      const wz = r * NAV_GRID_SIZE - MAP_SIZE / 2 + NAV_GRID_SIZE / 2;
      let blocked = false;
      for (const box of COLLISION_BOXES) {
        if (wx > box.min.x && wx < box.max.x && wz > box.min.z && wz < box.max.z) {
          blocked = true;
          break;
        }
      }
      navGrid[r][c] = !blocked;
    }
  }
}

function worldToGrid(x, z) {
  return {
    col: clamp(Math.floor((x + MAP_SIZE / 2) / NAV_GRID_SIZE), 0, NAV_COLS - 1),
    row: clamp(Math.floor((z + MAP_SIZE / 2) / NAV_GRID_SIZE), 0, NAV_ROWS - 1),
  };
}

function gridToWorld(col, row) {
  return {
    x: col * NAV_GRID_SIZE - MAP_SIZE / 2 + NAV_GRID_SIZE / 2,
    z: row * NAV_GRID_SIZE - MAP_SIZE / 2 + NAV_GRID_SIZE / 2,
  };
}

// ============================================================
// ZOMBIE SPAWNING & AI
// ============================================================
function spawnZombie(type, hpMult = 1, speedMult = 1, damageMult = 1) {
  const id = 'z_' + (++gameState.zombieIdCounter);
  const baseStats = ZOMBIE_TYPES[type];

  const angle = Math.random() * Math.PI * 2;
  const r = 55 + Math.random() * 5;
  const sx = clamp(Math.cos(angle) * r, -MAP_SIZE / 2 + 5, MAP_SIZE / 2 - 5);
  const sz = clamp(Math.sin(angle) * r, -MAP_SIZE / 2 + 5, MAP_SIZE / 2 - 5);

  const hp = Math.floor(baseStats.hp * hpMult);
  const zombie = {
    id,
    type,
    position: vec3(sx, 0, sz),
    hp,
    maxHp: hp,
    speed: baseStats.speed * speedMult,
    damage: baseStats.damage * damageMult,
    attackRange: baseStats.attackRange,
    attackRate: baseStats.attackRate,
    reward: baseStats.reward,
    targetId: null,
    isAlive: true,
    rotation: 0,
    animState: 'walk',
    damageMap: {},
    attackTimer: 0,
    aiTimer: 0,
    attackPhase: 'move',
    attackCooldown: 3,
    chargeTarget: null,
    meleeTimer: 0,
    path: [],
    pathTimer: 0,
  };

  gameState.zombies.set(id, zombie);
  return zombie;
}

function getAlivePlayers() {
  return Array.from(players.values()).filter(p => !p.isDead && !p.isDown);
}

function findNearestPlayer(pos) {
  const alive = getAlivePlayers();
  if (alive.length === 0) return null;
  let nearest = null;
  let nearestDist = Infinity;
  for (const p of alive) {
    const d = vecDist2D(pos, p.position);
    if (d < nearestDist) { nearestDist = d; nearest = p; }
  }
  return { player: nearest, dist: nearestDist };
}

function moveZombie(zombie, targetPos, dt) {
  const dx = targetPos.x - zombie.position.x;
  const dz = targetPos.z - zombie.position.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 0.1) return;

  // Separation from other zombies
  let sepX = 0, sepZ = 0;
  for (const [oid, oz] of gameState.zombies) {
    if (oid === zombie.id || !oz.isAlive) continue;
    const sdx = zombie.position.x - oz.position.x;
    const sdz = zombie.position.z - oz.position.z;
    const sd = Math.sqrt(sdx * sdx + sdz * sdz);
    if (sd < 1.5 && sd > 0) {
      sepX += (sdx / sd) * 3;
      sepZ += (sdz / sd) * 3;
    }
  }

  const moveX = (dx / dist * zombie.speed + sepX * 0.4) * dt;
  const moveZ = (dz / dist * zombie.speed + sepZ * 0.4) * dt;
  const newX = zombie.position.x + moveX;
  const newZ = zombie.position.z + moveZ;

  // Collision
  const radius = ZOMBIE_TYPES[zombie.type].scale * 0.4;
  if (!checkSolidCollision(newX, zombie.position.z, radius)) zombie.position.x = newX;
  if (!checkSolidCollision(zombie.position.x, newZ, radius)) zombie.position.z = newZ;

  zombie.position.x = clamp(zombie.position.x, -MAP_SIZE / 2 + 1, MAP_SIZE / 2 - 1);
  zombie.position.z = clamp(zombie.position.z, -MAP_SIZE / 2 + 1, MAP_SIZE / 2 - 1);
  zombie.rotation = Math.atan2(dx, dz);
}

function updateZombieAI(dt) {
  for (const [id, zombie] of gameState.zombies) {
    if (!zombie.isAlive) continue;

    const result = findNearestPlayer(zombie.position);
    if (!result) continue;
    const { player, dist } = result;

    zombie.targetId = player.id;

    if (zombie.type === 'boss') {
      updateBossAI(zombie, player, dist, dt);
      continue;
    }

    // Exploder: detonate near player
    if (zombie.type === 'exploder' && dist < 2.5) {
      exploderDetonate(zombie, player);
      continue;
    }

    // Acid: ranged attack
    if (zombie.type === 'acid') {
      zombie.attackTimer -= dt;
      if (dist < zombie.attackRange) {
        if (zombie.attackTimer <= 0) {
          zombie.attackTimer = zombie.attackRate;
          spawnAcidProjectile(zombie, player);
        }
        if (dist > 8) moveZombie(zombie, player.position, dt);
        continue;
      }
    }

    // Move towards player
    if (dist > zombie.attackRange) {
      moveZombie(zombie, player.position, dt);
    } else {
      // Melee attack
      zombie.attackTimer -= dt;
      if (zombie.attackTimer <= 0) {
        zombie.attackTimer = zombie.attackRate;
        damagePlayer(player.id, zombie.damage);
      }
    }

    // Barricade interaction (damage barricades)
    for (const [bid, barc] of gameState.barricades) {
      const bDist = vecDist2D(zombie.position, barc.position);
      if (bDist < 1.5) {
        barc.hp -= zombie.damage * dt;
        if (barc.hp <= 0) {
          gameState.barricades.delete(bid);
          // Remove from collision boxes
          io.emit('barricadeDestroyed', { id: bid });
        }
      }
    }
  }
}

function updateBossAI(zombie, target, dist, dt) {
  zombie.attackCooldown -= dt;
  zombie.meleeTimer -= dt;

  if (zombie.attackCooldown <= 0) {
    const r = Math.random();
    if (r < 0.33) {
      zombie.attackPhase = 'shockwave';
      zombie.attackCooldown = 4;
      bossShockwave(zombie);
    } else if (r < 0.66) {
      zombie.attackPhase = 'charge';
      zombie.chargeTarget = { x: target.position.x, z: target.position.z };
      zombie.attackCooldown = 5;
    } else {
      zombie.attackPhase = 'spit';
      zombie.attackCooldown = 3;
      bossToxicSpit(zombie, target);
    }
  }

  if (zombie.attackPhase === 'charge' && zombie.chargeTarget) {
    moveZombie(zombie, { x: zombie.chargeTarget.x, y: 0, z: zombie.chargeTarget.z }, dt * 2.5);
    const chDist = vecDist2D(zombie.position, zombie.chargeTarget);
    if (chDist < 2) {
      zombie.attackPhase = 'move';
      zombie.chargeTarget = null;
      damagePlayer(target.id, zombie.damage * 1.5);
    }
  } else {
    moveZombie(zombie, target.position, dt);
  }

  if (dist < zombie.attackRange && zombie.meleeTimer <= 0) {
    zombie.meleeTimer = zombie.attackRate;
    damagePlayer(target.id, zombie.damage);
  }
}

function bossShockwave(zombie) {
  io.emit('bossShockwave', { position: zombie.position });

  // Damage all players in expanding wave
  let radius = 0;
  const expand = () => {
    radius += 0.5;
    for (const [, player] of players) {
      if (player.isDead || player.isDown) continue;
      const dist = vecDist2D(player.position, zombie.position);
      if (dist < radius + 1 && dist > radius - 0.5) {
        damagePlayer(player.id, 15);
      }
    }
    if (radius < 10) setTimeout(expand, 50);
  };
  expand();
}

function bossToxicSpit(zombie, target) {
  for (let i = 0; i < 3; i++) {
    setTimeout(() => {
      const id = 'bap_' + Date.now() + i;
      const dx = target.position.x - zombie.position.x;
      const dz = target.position.z - zombie.position.z;
      const dist = Math.sqrt(dx * dx + dz * dz);
      const speed = 15;
      const angle = Math.atan2(dz, dx) + (Math.random() - 0.5) * 0.5;

      gameState.acidPools.set('bproj_' + id, {
        type: 'projectile',
        position: { x: zombie.position.x, y: 2, z: zombie.position.z },
        velocity: {
          x: Math.cos(angle) * speed,
          y: 10 + randomRange(-2, 2),
          z: Math.sin(angle) * speed,
        },
        timer: 3,
      });

      io.emit('acidProjectile', {
        id,
        startPos: { x: zombie.position.x, y: 2, z: zombie.position.z },
        velocity: {
          x: Math.cos(angle) * speed / dist * speed,
          y: 10,
          z: Math.sin(angle) * speed,
        },
      });
    }, i * 300);
  }
}

function exploderDetonate(zombie, nearestPlayer) {
  zombie.isAlive = false;
  io.emit('zombieDied', { zombieId: zombie.id, killerId: null, reward: 0 });
  io.emit('explosion', { position: zombie.position, radius: 5 });

  // Damage players in range
  for (const [, player] of players) {
    const dist = vecDist2D(player.position, zombie.position);
    if (dist < 5) {
      const dmg = Math.floor(80 * (1 - dist / 5));
      damagePlayer(player.id, dmg);
    }
  }
}

function spawnAcidProjectile(zombie, target) {
  const id = 'ap_' + (++gameState.acidProjectileCounter);
  const dx = target.position.x - zombie.position.x;
  const dz = target.position.z - zombie.position.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  const speed = 12;

  io.emit('acidProjectile', {
    id,
    startPos: { x: zombie.position.x, y: 1.2, z: zombie.position.z },
    velocity: {
      x: (dx / dist) * speed,
      y: 8,
      z: (dz / dist) * speed,
    },
    zombieId: zombie.id,
  });
}

function createAcidPool(x, z) {
  const id = 'pool_' + Date.now() + Math.random();
  gameState.acidPools.set(id, {
    id,
    position: vec3(x, 0, z),
    radius: 2.5,
    timer: ACID_POOL_DURATION,
    damageTimer: 0,
  });
  io.emit('acidPool', { id, position: vec3(x, 0, z), radius: 2.5 });
}

function updateAcidPools(dt) {
  for (const [id, pool] of gameState.acidPools) {
    if (pool.type === 'projectile') {
      pool.velocity.y -= 20 * dt;
      pool.position.x += pool.velocity.x * dt;
      pool.position.y += pool.velocity.y * dt;
      pool.position.z += pool.velocity.z * dt;
      pool.timer -= dt;
      if (pool.position.y <= 0 || pool.timer <= 0) {
        gameState.acidPools.delete(id);
        createAcidPool(pool.position.x, pool.position.z);
      }
      continue;
    }

    pool.timer -= dt;
    if (pool.timer <= 0) {
      gameState.acidPools.delete(id);
      io.emit('acidPoolRemoved', { id });
      continue;
    }

    // Damage players in pool
    pool.damageTimer = (pool.damageTimer || 0) - dt;
    if (pool.damageTimer <= 0) {
      pool.damageTimer = 1;
      for (const [, player] of players) {
        if (player.isDead || player.isDown) continue;
        const dist = vecDist2D(player.position, pool.position);
        if (dist < pool.radius) {
          damagePlayer(player.id, 8);
        }
      }
    }
  }
}

function updateTraps(dt) {
  for (const trap of gameState.traps) {
    if (!trap.active) continue;
    trap.timer -= dt;
    if (trap.timer <= 0) {
      trap.active = false;
      io.emit('trapDeactivated', { id: trap.id });
      continue;
    }

    trap.damageTimer = (trap.damageTimer || 0) - dt;
    if (trap.damageTimer <= 0) {
      trap.damageTimer = 0.5;
      const trapRadius = 8;
      for (const [id, zombie] of gameState.zombies) {
        if (!zombie.isAlive) continue;
        const dist = vecDist2D(zombie.position, trap.position);
        if (dist < trapRadius) {
          damageZombie(id, TRAP_DAMAGE, null);
        }
      }
    }
  }
}

function damagePlayer(playerId, amount) {
  const player = players.get(playerId);
  if (!player || player.isDead) return;

  player.hp = Math.max(0, player.hp - amount);
  const socket = io.sockets.sockets.get(playerId);
  if (socket) {
    socket.emit('damage', { playerId, amount, hp: player.hp });
  }

  if (player.hp <= 0 && !player.isDown) {
    player.isDown = true;
    player.hp = 0;
    player.downTimer = DOWN_TIMER;
    io.emit('playerDown', { playerId });

    // Start down timer
    const downInterval = setInterval(() => {
      if (!players.has(playerId)) { clearInterval(downInterval); return; }
      const p = players.get(playerId);
      if (!p || p.isDead || !p.isDown) { clearInterval(downInterval); return; }

      p.downTimer -= 0.5;
      if (p.downTimer <= 0) {
        clearInterval(downInterval);
        p.isDown = false;
        p.isDead = true;
        io.emit('playerDied', { playerId });

        // Respawn after delay
        setTimeout(() => {
          if (!players.has(playerId)) return;
          const rp = players.get(playerId);
          if (!rp) return;
          rp.isDead = false;
          rp.hp = Math.floor(PLAYER_MAX_HP * 0.5);
          rp.position = vec3(0, 1.8, 5);
          io.emit('playerRespawned', { playerId, position: rp.position, hp: rp.hp });
        }, RESPAWN_TIME * 1000);
      }
    }, 500);
  }
}

function damageZombie(zombieId, amount, sourcePlayerId) {
  const zombie = gameState.zombies.get(zombieId);
  if (!zombie || !zombie.isAlive) return;

  zombie.hp -= amount;
  if (sourcePlayerId) {
    zombie.damageMap[sourcePlayerId] = (zombie.damageMap[sourcePlayerId] || 0) + amount;
  }

  io.emit('zombieHit', { zombieId, hp: zombie.hp, maxHp: zombie.maxHp });

  if (zombie.hp <= 0) {
    zombie.isAlive = false;
    zombie.hp = 0;

    // Find top damage dealer
    let maxDmg = 0;
    let topKiller = sourcePlayerId;
    for (const [pid, dmg] of Object.entries(zombie.damageMap)) {
      if (dmg > maxDmg) { maxDmg = dmg; topKiller = pid; }
    }

    const reward = zombie.reward;
    io.emit('zombieDied', { zombieId, killerId: topKiller, reward });

    // Award money to killer
    if (topKiller && players.has(topKiller)) {
      const killer = players.get(topKiller);
      killer.money += reward;
      killer.kills++;
      io.to(topKiller).emit('moneyUpdate', { playerId: topKiller, money: killer.money, reward });
    }

    // Health drop (10% chance)
    if (Math.random() < 0.1) {
      io.emit('healthDrop', { position: zombie.position });
    }

    // Death effects
    if (zombie.type === 'exploder') {
      io.emit('explosion', { position: zombie.position, radius: 5 });
      for (const [, player] of players) {
        const dist = vecDist2D(player.position, zombie.position);
        if (dist < 5) damagePlayer(player.id, Math.floor(80 * (1 - dist / 5)));
      }
    }

    // Boss death = victory
    if (zombie.type === 'boss') {
      setTimeout(() => endGame('victory'), 1000);
    }

    // Drop acid pool if acid zombie is killed
    if (zombie.type === 'acid') {
      createAcidPool(zombie.position.x, zombie.position.z);
    }
  }
}

// ============================================================
// WAVE MANAGEMENT
// ============================================================
function startWave(waveNum) {
  gameState.wave = waveNum;
  gameState.phase = 'combat';
  gameState.zombies.clear();

  const waveCfg = WAVES[waveNum - 1];
  if (!waveCfg) return;

  const { count, hpMult, speedMult, damageMult, hasBoss } = waveCfg;
  console.log(`[WAVE] Starting wave ${waveNum} - ${count} zombies, boss: ${hasBoss}`);

  io.emit('waveStart', {
    wave: waveNum,
    count,
    message: hasBoss ? '⚠ ШИРИБАЗАРОВ ИДЁТ ⚠' : `Зомби: ${count}`,
  });

  // Spawn zombies with delay
  let spawned = 0;
  const spawnNext = () => {
    if (spawned >= count) return;
    if (gameState.phase !== 'combat') return;

    let type = 'normal';
    const r = Math.random();
    if (waveNum >= 3) {
      if (r < 0.15) type = 'exploder';
      else if (r < 0.30) type = 'acid';
    } else if (waveNum >= 2) {
      if (r < 0.10) type = 'exploder';
    }

    const zombie = spawnZombie(type, hpMult, speedMult, damageMult);
    io.emit('zombieSpawned', zombie);
    spawned++;

    if (spawned < count) setTimeout(spawnNext, 800 + Math.random() * 400);
  };

  setTimeout(spawnNext, 1000);

  if (hasBoss) {
    setTimeout(() => {
      if (gameState.phase !== 'combat') return;
      const boss = spawnZombie('boss', hpMult * 1.5, speedMult, damageMult * 1.5);
      io.emit('zombieSpawned', boss);
    }, count * 900 + 3000);
  }
}

function checkWaveComplete() {
  if (gameState.phase !== 'combat') return;
  const alive = Array.from(gameState.zombies.values()).filter(z => z.isAlive);
  if (alive.length === 0 && gameState.zombies.size > 0) {
    if (gameState.wave >= WAVES.length) {
      endGame('victory');
    } else {
      gameState.phase = 'intermission';
      io.emit('waveComplete', { wave: gameState.wave });
      console.log(`[WAVE] Wave ${gameState.wave} complete, next in 10s`);
      gameState.intermissionTimer = 10;
    }
  }
}

function endGame(result) {
  gameState.phase = result;
  if (result === 'victory') {
    io.emit('victory');
    console.log('[GAME] Victory!');
  } else {
    io.emit('defeat');
    console.log('[GAME] Defeat!');
  }
  setTimeout(resetGameState, 30000);
}

// ============================================================
// RAYCAST VALIDATION (server-authoritative hit detection)
// ============================================================
function validateShot(origin, direction, weaponType, sourcePlayerId) {
  const range = weaponType === 'ak47' ? 200 : 150;

  // Check walls first
  let wallDist = range;
  for (const box of COLLISION_BOXES) {
    const d = rayVsAABB(origin.x, origin.y, origin.z, direction.x, direction.y, direction.z, box);
    if (d !== null && d < wallDist) wallDist = d;
  }

  let nearestDist = Infinity;
  let hitZombieId = null;

  for (const [id, zombie] of gameState.zombies) {
    if (!zombie.isAlive) continue;
    const zombieBox = {
      min: { x: zombie.position.x - 0.5, y: 0, z: zombie.position.z - 0.5 },
      max: { x: zombie.position.x + 0.5, y: zombie.type === 'boss' ? 4.5 : 2.2, z: zombie.position.z + 0.5 },
    };
    const d = rayVsAABB(origin.x, origin.y, origin.z, direction.x, direction.y, direction.z, zombieBox);
    if (d !== null && d < nearestDist && d < wallDist) {
      nearestDist = d;
      hitZombieId = id;
    }
  }

  if (hitZombieId) {
    const hitPos = {
      x: origin.x + direction.x * nearestDist,
      y: origin.y + direction.y * nearestDist,
      z: origin.z + direction.z * nearestDist,
    };

    const baseDmg = weaponType === 'ak47' ? AK47_DAMAGE : PISTOL_DAMAGE;
    const player = players.get(sourcePlayerId);
    const upgrades = player?.weaponUpgrades?.[weaponType] || { damage: 1 };
    const boostMult = (player?.boosted && player?.boostType === 'damage') ? 2 : 1;
    const damage = Math.floor(baseDmg * upgrades.damage * boostMult);

    damageZombie(hitZombieId, damage, sourcePlayerId);

    const zombie = gameState.zombies.get(hitZombieId);
    io.emit('hitConfirmed', {
      zombieId: hitZombieId,
      damage,
      position: hitPos,
      killed: zombie ? !zombie.isAlive : false,
      reward: zombie ? zombie.reward : 0,
    });

    return { hit: true, zombieId: hitZombieId };
  }

  return { hit: false };
}

// ============================================================
// EXPRESS + SOCKET.IO SETUP
// ============================================================
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  path: '/ws/',
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
  pingInterval: 10000,
  pingTimeout: 5000,
});

// Serve static files from public/
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    players: players.size,
    wave: gameState.wave,
    phase: gameState.phase,
    zombies: gameState.zombies.size,
  });
});

// ============================================================
// SOCKET.IO EVENT HANDLERS
// ============================================================
io.on('connection', (socket) => {
  console.log(`[CONNECT] Player connected: ${socket.id}`);

  // If game is waiting for players, possibly start
  if (gameState.phase === 'waiting' && players.size === 0) {
    // Will start when this player joins
  }

  socket.on('join', (data) => {
    const player = {
      id: socket.id,
      name: data.name || `Player_${socket.id.substr(0, 6)}`,
      color: data.color || 0x44ff44,
      position: vec3(randomRange(-5, 5), 1.8, randomRange(-5, 5)),
      rotation: 0,
      hp: PLAYER_MAX_HP,
      maxHp: PLAYER_MAX_HP,
      money: 0,
      kills: 0,
      weapon: 'ak47',
      ammoAk: 30,
      ammoAkReserve: 90,
      isDown: false,
      isDead: false,
      downTimer: DOWN_TIMER,
      boosted: false,
      boostType: '',
      boostTimer: 0,
      weaponUpgrades: {
        ak47:   { damage: 1, fireRate: 1, magSize: 1 },
        pistol: { damage: 1, fireRate: 1, magSize: 1 },
      },
      barricadeCount: 0,
      grenadeCount: 0,
      streak: 0,
    };

    players.set(socket.id, player);
    console.log(`[JOIN] ${player.name} joined. Total players: ${players.size}`);

    // Send current game state to new player
    socket.emit('gameState', {
      wave: gameState.wave,
      phase: gameState.phase,
      zombies: Object.fromEntries(gameState.zombies),
      players: Object.fromEntries(players),
      traps: gameState.traps,
      acidPools: Object.fromEntries(
        Array.from(gameState.acidPools.entries()).filter(([, p]) => p.type !== 'projectile')
      ),
    });

    // Notify other players
    socket.broadcast.emit('playerJoined', player);

    // Start game if waiting
    if (gameState.phase === 'waiting') {
      setTimeout(() => {
        if (gameState.phase === 'waiting' && players.size > 0) {
          startWave(1);
        }
      }, 5000);
    }
  });

  socket.on('playerUpdate', (data) => {
    const player = players.get(socket.id);
    if (!player) return;

    // Update position (with basic anti-cheat: clamp speed)
    const maxMovePerTick = 15 * (1 / TICK_RATE) * 2;
    if (data.position) {
      const dx = Math.abs(data.position.x - player.position.x);
      const dz = Math.abs(data.position.z - player.position.z);
      if (dx < maxMovePerTick * 60 && dz < maxMovePerTick * 60) {
        player.position = data.position;
      }
    }

    if (data.rotation !== undefined) player.rotation = data.rotation;
    if (data.weapon) player.weapon = data.weapon;
    if (data.weaponUpgrades) player.weaponUpgrades = data.weaponUpgrades;

    // Broadcast to others (throttled)
    socket.broadcast.emit('playerUpdate', {
      id: socket.id,
      position: player.position,
      rotation: player.rotation,
      hp: player.hp,
      isDown: player.isDown,
      isDead: player.isDead,
      money: player.money,
      kills: player.kills,
      weapon: player.weapon,
    });
  });

  socket.on('shoot', (data) => {
    const player = players.get(socket.id);
    if (!player || player.isDead || player.isDown) return;

    validateShot(data.origin, data.direction, data.weapon, socket.id);
  });

  socket.on('revivePlayer', (data) => {
    const target = players.get(data.targetId);
    if (!target || !target.isDown) return;

    target.isDown = false;
    target.hp = Math.floor(PLAYER_MAX_HP * 0.5);
    io.emit('playerRevived', {
      playerId: data.targetId,
      hp: target.hp,
      revivedBy: socket.id,
    });
  });

  socket.on('activateTrap', (data) => {
    const player = players.get(socket.id);
    if (!player) return;
    if (player.money < TRAP_COST) {
      socket.emit('error', { message: 'Not enough money' });
      return;
    }
    const trap = gameState.traps[data.trapId];
    if (!trap || trap.active) return;

    player.money -= TRAP_COST;
    trap.active = true;
    trap.timer = TRAP_DURATION;
    trap.damageTimer = 0;

    io.emit('trapActivated', { trapId: data.trapId });
    socket.emit('moneyUpdate', { playerId: socket.id, money: player.money });
  });

  socket.on('buildBarricade', (data) => {
    const player = players.get(socket.id);
    if (!player) return;
    if (player.money < BARRICADE_COST) {
      socket.emit('error', { message: 'Not enough money' });
      return;
    }
    if (player.barricadeCount >= MAX_BARRICADES) {
      socket.emit('error', { message: 'Max barricades reached' });
      return;
    }

    player.money -= BARRICADE_COST;
    player.barricadeCount++;

    const barricadeId = 'barc_' + (++gameState.barricadeCounter);
    const barricade = {
      id: barricadeId,
      ownerId: socket.id,
      position: data.position,
      hp: 150,
      maxHp: 150,
    };
    gameState.barricades.set(barricadeId, barricade);

    io.emit('barricadePlaced', barricade);
    socket.emit('moneyUpdate', { playerId: socket.id, money: player.money });
  });

  socket.on('throwGrenade', (data) => {
    // Simulate grenade explosion
    setTimeout(() => {
      io.emit('grenadeExplosion', {
        position: data.landingPos,
        radius: GRENADE_RADIUS,
        damage: GRENADE_DAMAGE,
        ownerId: socket.id,
      });

      for (const [id, zombie] of gameState.zombies) {
        if (!zombie.isAlive) continue;
        const dist = vecDist2D(zombie.position, data.landingPos);
        if (dist < GRENADE_RADIUS) {
          const dmg = Math.floor(GRENADE_DAMAGE * (1 - dist / GRENADE_RADIUS));
          damageZombie(id, dmg, socket.id);
        }
      }

      for (const [, player] of players) {
        const dist = vecDist2D(player.position, data.landingPos);
        if (dist < GRENADE_RADIUS) {
          const dmg = Math.floor(GRENADE_DAMAGE * 0.5 * (1 - dist / GRENADE_RADIUS));
          if (dmg > 0) damagePlayer(player.id, dmg);
        }
      }
    }, GRENADE_FUSE * 1000);
  });

  socket.on('vendingBuy', (data) => {
    const player = players.get(socket.id);
    if (!player) return;

    const costs = { ammo: 50, health: 100, boost: 150, grenade: 200 };
    const cost = costs[data.item];
    if (!cost || player.money < cost) {
      socket.emit('vendingError', { message: 'Not enough money' });
      return;
    }

    player.money -= cost;

    if (data.item === 'ammo') {
      const ammo = Math.floor(Math.random() * 11);
      player.ammoAkReserve = Math.min(210, player.ammoAkReserve + ammo);
      socket.emit('vendingSuccess', { item: 'ammo', amount: ammo });
    } else if (data.item === 'health') {
      player.hp = Math.min(PLAYER_MAX_HP, player.hp + 30);
      socket.emit('vendingSuccess', { item: 'health', amount: 30, hp: player.hp });
    } else if (data.item === 'boost') {
      const boosts = ['speed', 'damage', 'regen'];
      const boost = boosts[Math.floor(Math.random() * boosts.length)];
      player.boosted = true;
      player.boostType = boost;
      player.boostTimer = 15;
      socket.emit('vendingSuccess', { item: 'boost', boost });
    } else if (data.item === 'grenade') {
      player.grenadeCount++;
      socket.emit('vendingSuccess', { item: 'grenade' });
    }

    socket.emit('moneyUpdate', { playerId: socket.id, money: player.money });
  });

  socket.on('mysteryBox', () => {
    const player = players.get(socket.id);
    if (!player) return;
    if (player.money < MYSTERY_BOX_COST) {
      socket.emit('error', { message: 'Not enough money' });
      return;
    }

    player.money -= MYSTERY_BOX_COST;
    const upgrades = ['damage', 'fireRate', 'magSize'];
    const upgrade = upgrades[Math.floor(Math.random() * upgrades.length)];
    const weapon = player.weapon;

    if (upgrade === 'damage') player.weaponUpgrades[weapon].damage += 0.2;
    else if (upgrade === 'fireRate') player.weaponUpgrades[weapon].fireRate -= 0.15;
    else if (upgrade === 'magSize') player.weaponUpgrades[weapon].magSize += 10;

    socket.emit('mysteryBoxResult', {
      upgrade,
      weapon,
      upgrades: player.weaponUpgrades,
    });
    socket.emit('moneyUpdate', { playerId: socket.id, money: player.money });
    io.emit('mysteryBoxUsed', { playerId: socket.id });
  });

  socket.on('disconnect', () => {
    const player = players.get(socket.id);
    if (player) {
      console.log(`[DISCONNECT] ${player.name} left. Players remaining: ${players.size - 1}`);
      players.delete(socket.id);
      io.emit('playerLeft', socket.id);
    }

    // End game if no players left
    if (players.size === 0 && gameState.phase === 'combat') {
      console.log('[GAME] All players disconnected, resetting game');
      resetGameState();
    }
  });
});

// ============================================================
// SERVER GAME LOOP
// ============================================================
let lastTick = Date.now();

setInterval(() => {
  const now = Date.now();
  const dt = (now - lastTick) / 1000;
  lastTick = now;

  if (gameState.phase === 'combat') {
    updateZombieAI(dt);
    updateAcidPools(dt);
    updateTraps(dt);
    checkWaveComplete();

    // Broadcast zombie positions (throttled to every other tick)
    if (Math.random() < 0.5) {
      const zombieData = {};
      for (const [id, z] of gameState.zombies) {
        if (z.isAlive) {
          zombieData[id] = {
            id: z.id,
            position: z.position,
            rotation: z.rotation,
            hp: z.hp,
            maxHp: z.maxHp,
            type: z.type,
            isAlive: z.isAlive,
          };
        }
      }
      if (Object.keys(zombieData).length > 0) {
        io.emit('zombiePositions', zombieData);
      }
    }
  } else if (gameState.phase === 'intermission') {
    gameState.intermissionTimer -= dt;
    if (gameState.intermissionTimer <= 0) {
      startWave(gameState.wave + 1);
    }
  }
}, TICK_MS);

// ============================================================
// START SERVER + NGROK
// ============================================================
buildNavGrid();
console.log('[NAV] Navigation grid built');

server.listen(PORT, '0.0.0.0', async () => {
  console.log(`\n🧟 ZOMBIE HORDE SERVER`);
  console.log(`📡 Running on http://localhost:${PORT}`);
  console.log(`📁 Serving static files from: ${path.join(__dirname, 'public')}`);

  // Start ngrok tunnel
  try {
    await ngrok.authtoken(NGROK_TOKEN);
    const url = await ngrok.connect({
      proto: 'http',
      addr: PORT,
    });
    const wsUrl = url.replace('https://', 'wss://').replace('http://', 'ws://');
    console.log(`\n✅ NGROK TUNNEL ACTIVE`);
    console.log(`🌐 Public URL: ${url}`);
    console.log(`🔌 WebSocket URL: ${wsUrl}/ws/`);
    console.log(`\n📋 Share this WebSocket URL with players:`);
    console.log(`   ${wsUrl}/ws/`);
    console.log(`\n🎮 Players can connect at: ${url}`);
    console.log(`\n[GAME] Waiting for players to join...`);

    // Save URL to file for reference
    const fs = require('fs');
    fs.writeFileSync('ngrok-url.txt', `URL: ${url}\nWS: ${wsUrl}/ws/\n`);
    console.log(`💾 URL saved to ngrok-url.txt`);
  } catch (err) {
    console.error(`⚠️  ngrok failed: ${err.message}`);
    console.log(`📡 Server still available at http://localhost:${PORT}`);
    console.log(`   Use a reverse proxy (nginx, cloudflare tunnel) for public access`);
  }
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n[SHUTDOWN] Closing server...');
  try { await ngrok.kill(); } catch (e) { /* ignore */ }
  process.exit(0);
});

module.exports = { app, server, io };
