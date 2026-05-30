/**
 * ZOMBIE HORDE — Multiplayer Game Server v2.0
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

// ============================================================
// CONFIG
// ============================================================
const PORT = 3000;
const NGROK_TOKEN = '3ER3n9UuUjAf4z0flHlfDXaP6ST_7SGNJYjwX7zRSUWB5NTEK';
const TICK_RATE = 20; // Hz
const TICK_MS = 1000 / TICK_RATE;

// ============================================================
// GAME CONSTANTS (mirror of client)
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
const GRAVITY = -20;

const ZOMBIE_TYPES = {
  normal:   { speed: 2.5,  hp: 80,   damage: 10, reward: 10,  attackRange: 1.5, attackRate: 1.0, scale: 1.0 },
  exploder: { speed: 3.2,  hp: 60,   damage: 80, reward: 20,  attackRange: 2.5, attackRate: 0.5, scale: 1.1 },
  acid:     { speed: 2.0,  hp: 70,   damage: 15, reward: 25,  attackRange: 15,  attackRate: 2.0, scale: 0.9 },
  miniboss: { speed: 3.0,  hp: 300,  damage: 20, reward: 100, attackRange: 2.0, attackRate: 1.2, scale: 1.6 },
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
// SERVER-SIDE COLLISION BOXES
// ============================================================
const COLLISION_BOXES = [
  { min: vec3(-60, 0, -60), max: vec3(60, 6, -59) },
  { min: vec3(-60, 0, 59),  max: vec3(-30, 6, 60) },
  { min: vec3(30, 0, 59),   max: vec3(60, 6, 60)  },
  { min: vec3(59, 0, -60),  max: vec3(60, 6, 60)  },
  { min: vec3(-60, 0, -60), max: vec3(-59, 6, 60) },
  { min: vec3(-25, 0, -42), max: vec3(-5, 8, -28)  },
  { min: vec3(18, 0, -36),  max: vec3(32, 6, -24)  },
  { min: vec3(-36, 0, 6),   max: vec3(-24, 5, 16)  },
  { min: vec3(27, 0, 17),   max: vec3(33, 12, 23)  },
  { min: vec3(-10, 0, -10), max: vec3(-6, 1.5, -6) },
  { min: vec3(5, 0, -8),    max: vec3(10, 1.5, -4) },
  { min: vec3(-18, 0, 20),  max: vec3(-12, 1.5, 24)},
  { min: vec3(15, 0, 25),   max: vec3(22, 1.5, 30) },
  { min: vec3(-12.6, 0, -28.6), max: vec3(-11.4, 2.2, -27.4) },
  { min: vec3(-45.5, 0, -0.5), max: vec3(-44.5, 1.2, 0.5) },
  { min: vec3(-0.5, 0, -0.5), max: vec3(0.5, 1.2, 0.5) },
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
  const eps = 0.0001;
  let tmin = (box.min.x - ox) / (dx || eps);
  let tmax = (box.max.x - ox) / (dx || eps);
  if (tmin > tmax) { [tmin, tmax] = [tmax, tmin]; }

  let tymin = (box.min.y - oy) / (dy || eps);
  let tymax = (box.max.y - oy) / (dy || eps);
  if (tymin > tymax) { [tymin, tymax] = [tymax, tymin]; }

  if (tmin > tymax || tymin > tmax) return null;
  tmin = Math.max(tmin, tymin);
  tmax = Math.min(tmax, tymax);

  let tzmin = (box.min.z - oz) / (dz || eps);
  let tzmax = (box.max.z - oz) / (dz || eps);
  if (tzmin > tzmax) { [tzmin, tzmax] = [tzmax, tzmin]; }

  if (tmin > tzmax || tzmin > tmax) return null;
  tmin = Math.max(tmin, tzmin);
  return tmin >= 0 ? tmin : null;
}

// ============================================================
// GAME STATE
// ============================================================
const gameState = {
  phase: 'waiting',
  wave: 0,
  zombieIdCounter: 0,
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

const players = new Map(); // socketId -> PlayerState

function getSerializableState() {
  const zombiesObj = {};
  for (const [id, z] of gameState.zombies) {
    zombiesObj[id] = { id: z.id, type: z.type, position: z.position, hp: z.hp, maxHp: z.maxHp, isAlive: z.isAlive, modifiers: z.modifiers || [] };
  }
  const playersObj = {};
  for (const [id, p] of players) {
    playersObj[id] = { id: p.id, name: p.name, color: p.color, position: p.position, rotation: p.rotation, hp: p.hp, isDown: p.isDown, isDead: p.isDead, money: p.money, kills: p.kills, weapon: p.weapon };
  }
  return {
    phase: gameState.phase,
    wave: gameState.wave,
    zombies: zombiesObj,
    players: playersObj,
  };
}

// ============================================================
// ZOMBIE AI (server-side)
// ============================================================
function spawnZombie(type, hpMult = 1, speedMult = 1, damageMult = 1, modifiers = []) {
  const id = 'z_' + (++gameState.zombieIdCounter) + '_' + Date.now();
  const baseStats = ZOMBIE_TYPES[type] || ZOMBIE_TYPES.normal;

  const angle = Math.random() * Math.PI * 2;
  const r = 52 + Math.random() * 5;
  const sx = clamp(Math.cos(angle) * r, -55, 55);
  const sz = clamp(Math.sin(angle) * r, -55, 55);

  let actualHp = Math.floor(baseStats.hp * hpMult);
  let actualSpeedMult = speedMult;
  let armorMult = 1.0;

  // Apply miniboss modifiers
  for (const mod of modifiers) {
    if (mod === 'giant') actualHp *= 2;
    if (mod === 'fast') actualSpeedMult *= 1.4;
    if (mod === 'armored') armorMult = 0.7;
  }

  const zombie = {
    id, type,
    position: vec3(sx, 0, sz),
    hp: actualHp,
    maxHp: actualHp,
    isAlive: true,
    modifiers,
    speedMult: actualSpeedMult,
    damageMult,
    armorMult,
    attackTimer: 0,
    attackCooldown: type === 'boss' ? 3 : 0,
    attackPhase: 'move',
    chargeTarget: null,
    meleeTimer: 0,
    regenTimer: type === 'miniboss' && modifiers.includes('regen') ? 3 : 0,
    teleportTimer: type === 'miniboss' && modifiers.includes('teleporter') ? 8 : 0,
    summonTimer: type === 'miniboss' && modifiers.includes('summoner') ? 12 : 0,
    damageDealt: new Map(), // playerId -> damage
  };

  gameState.zombies.set(id, zombie);
  return zombie;
}

function pickMinibossModifiers(count) {
  const all = ['giant', 'fast', 'toxic', 'armored', 'regen', 'explosive', 'teleporter', 'summoner'];
  const picked = [];
  for (let i = 0; i < count; i++) {
    if (all.length === 0) break;
    const idx = Math.floor(Math.random() * all.length);
    picked.push(all.splice(idx, 1)[0]);
  }
  return picked;
}

function updateZombieAI(zombie, dt) {
  if (!zombie.isAlive) return;

  // Find nearest alive player
  let nearestDist = Infinity;
  let nearestPlayer = null;
  for (const [, p] of players) {
    if (p.isDead || p.isDown) continue;
    const d = vecDist2D(zombie.position, p.position);
    if (d < nearestDist) { nearestDist = d; nearestPlayer = p; }
  }
  if (!nearestPlayer) return;

  const stats = ZOMBIE_TYPES[zombie.type] || ZOMBIE_TYPES.normal;
  const speed = stats.speed * zombie.speedMult;

  // Boss AI
  if (zombie.type === 'boss') {
    updateBossAI(zombie, nearestPlayer, dt, speed, stats);
    return;
  }

  // Exploder: detonate near player
  if (zombie.type === 'exploder' && nearestDist < 2.5) {
    exploderDetonate(zombie);
    return;
  }

  // Acid: ranged attack
  if (zombie.type === 'acid' && nearestDist < stats.attackRange) {
    zombie.attackTimer -= dt;
    if (zombie.attackTimer <= 0) {
      zombie.attackTimer = stats.attackRate;
      createAcidProjectile(zombie, nearestPlayer);
    }
    if (nearestDist > 8) {
      moveZombieTowards(zombie, nearestPlayer.position, speed * 0.5, dt);
    }
    return;
  }

  // Miniboss special behaviors
  if (zombie.type === 'miniboss') {
    updateMinibossAI(zombie, nearestPlayer, dt, stats, speed);
    return;
  }

  // Normal movement
  if (nearestDist > stats.attackRange) {
    moveZombieTowards(zombie, nearestPlayer.position, speed, dt);
  } else {
    zombie.attackTimer -= dt;
    if (zombie.attackTimer <= 0) {
      zombie.attackTimer = stats.attackRate;
      const dmg = Math.floor(stats.damage * zombie.damageMult);
      dealDamageToPlayer(nearestPlayer, zombie, dmg);
    }
    // Face target
    const dx = nearestPlayer.position.x - zombie.position.x;
    const dz = nearestPlayer.position.z - zombie.position.z;
    zombie.rotation = Math.atan2(dx, dz);
  }
}

function updateBossAI(zombie, target, dt, speed, stats) {
  zombie.attackCooldown -= dt;

  if (zombie.attackCooldown <= 0) {
    const r = Math.random();
    if (r < 0.33) {
      zombie.attackCooldown = 4;
      bossShockwave(zombie);
    } else if (r < 0.66) {
      zombie.attackCooldown = 5;
      zombie.attackPhase = 'charge';
      zombie.chargeTarget = { x: target.position.x, y: 0, z: target.position.z };
    } else {
      zombie.attackCooldown = 3;
      bossToxicSpit(zombie, target);
    }
  }

  if (zombie.attackPhase === 'charge' && zombie.chargeTarget) {
    moveZombieTowards(zombie, zombie.chargeTarget, speed * 2.5, dt);
    if (vecDist2D(zombie.position, zombie.chargeTarget) < 2) {
      zombie.attackPhase = 'move';
      zombie.chargeTarget = null;
      const dmg = Math.floor(stats.damage * 1.5 * zombie.damageMult);
      dealDamageToPlayer(target, zombie, dmg);
    }
  } else {
    moveZombieTowards(zombie, target.position, speed, dt);
  }

  // Melee
  const dist = vecDist2D(zombie.position, target.position);
  if (dist < stats.attackRange) {
    zombie.meleeTimer -= dt;
    if (zombie.meleeTimer <= 0) {
      zombie.meleeTimer = stats.attackRate;
      dealDamageToPlayer(target, zombie, Math.floor(stats.damage * zombie.damageMult));
    }
  }
}

function updateMinibossAI(zombie, target, dt, stats, speed) {
  const mods = zombie.modifiers || [];
  const dist = vecDist2D(zombie.position, target.position);

  // Move
  if (dist > stats.attackRange) {
    moveZombieTowards(zombie, target.position, speed, dt);
  } else {
    zombie.attackTimer -= dt;
    if (zombie.attackTimer <= 0) {
      zombie.attackTimer = stats.attackRate;
      const dmg = Math.floor(stats.damage * zombie.damageMult);
      dealDamageToPlayer(target, zombie, dmg);
      if (mods.includes('toxic')) {
        // Poison effect - extra damage over time
        for (let tick = 1; tick <= 5; tick++) {
          setTimeout(() => {
            if (!zombie.isAlive) return;
            dealDamageToPlayer(target, zombie, Math.floor(dmg * 0.1));
          }, tick * 1000);
        }
      }
    }
  }

  // Regen
  if (mods.includes('regen')) {
    zombie.regenTimer = (zombie.regenTimer || 3) - dt;
    if (zombie.regenTimer <= 0) {
      zombie.regenTimer = 3;
      zombie.hp = Math.min(zombie.maxHp, zombie.hp + 15);
    }
  }

  // Teleport
  if (mods.includes('teleporter')) {
    zombie.teleportTimer = (zombie.teleportTimer || 8) - dt;
    if (zombie.teleportTimer <= 0) {
      zombie.teleportTimer = 8;
      const angle = Math.random() * Math.PI * 2;
      const r = 4 + Math.random() * 4;
      zombie.position.x = clamp(target.position.x + Math.cos(angle) * r, -55, 55);
      zombie.position.z = clamp(target.position.z + Math.sin(angle) * r, -55, 55);
      io.emit('teleportEffect', { position: zombie.position });
    }
  }

  // Summoner
  if (mods.includes('summoner')) {
    zombie.summonTimer = (zombie.summonTimer || 12) - dt;
    if (zombie.summonTimer <= 0) {
      zombie.summonTimer = 12;
      for (let i = 0; i < 2; i++) {
        const nz = spawnZombie('normal', 1, zombie.speedMult, zombie.damageMult);
        nz.position.x = zombie.position.x + (Math.random() - 0.5) * 4;
        nz.position.z = zombie.position.z + (Math.random() - 0.5) * 4;
        io.emit('zombieSpawned', serializeZombie(nz));
      }
      io.emit('minibossSummoned');
    }
  }
}

function moveZombieTowards(zombie, target, speed, dt) {
  const dx = target.x - zombie.position.x;
  const dz = target.z - zombie.position.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 0.1) return;

  // Separation
  let sepX = 0, sepZ = 0;
  for (const [, oz] of gameState.zombies) {
    if (oz.id === zombie.id || !oz.isAlive) continue;
    const sdx = zombie.position.x - oz.position.x;
    const sdz = zombie.position.z - oz.position.z;
    const sd = Math.sqrt(sdx * sdx + sdz * sdz);
    if (sd < 1.5 && sd > 0.01) {
      sepX += (sdx / sd) * 1.5;
      sepZ += (sdz / sd) * 1.5;
    }
  }

  const moveX = (dx / dist * speed + sepX * 0.4) * dt;
  const moveZ = (dz / dist * speed + sepZ * 0.4) * dt;

  const newX = zombie.position.x + moveX;
  const newZ = zombie.position.z + moveZ;
  const radius = zombie.type === 'boss' ? 1.5 : zombie.type === 'miniboss' ? 0.8 : 0.45;

  if (!checkSolidCollision(newX, zombie.position.z, radius)) zombie.position.x = newX;
  if (!checkSolidCollision(zombie.position.x, newZ, radius)) zombie.position.z = newZ;

  zombie.position.x = clamp(zombie.position.x, -MAP_SIZE / 2 + 1, MAP_SIZE / 2 - 1);
  zombie.position.z = clamp(zombie.position.z, -MAP_SIZE / 2 + 1, MAP_SIZE / 2 - 1);

  zombie.rotation = Math.atan2(dx, dz);
}

function dealDamageToPlayer(player, zombie, amount) {
  if (!player || player.isDead || player.isDown) return;

  // Track damage dealt by zombie to player
  if (!zombie.damageDealt) zombie.damageDealt = new Map();
  zombie.damageDealt.set(player.id, (zombie.damageDealt.get(player.id) || 0) + amount);

  player.hp = Math.max(0, player.hp - amount);

  const socket = getSocketById(player.id);
  if (socket) {
    socket.emit('takeDamage', { amount, zombieId: zombie.id });
  }

  if (player.hp <= 0 && !player.isDown) {
    player.isDown = true;
    player.downTimer = DOWN_TIMER;
    if (socket) socket.emit('playerDown');
  }
}

function getSocketById(playerId) {
  for (const [socketId, p] of players) {
    if (p.id === playerId) {
      return io.sockets.sockets.get(socketId);
    }
  }
  return null;
}

// Acid projectile (server-side tracking)
const acidProjectiles = [];

function createAcidProjectile(zombie, target) {
  const startPos = { x: zombie.position.x, y: 1.4, z: zombie.position.z };
  const dx = target.position.x - startPos.x;
  const dz = target.position.z - startPos.z;
  const dist = Math.sqrt(dx * dx + dz * dz) || 1;
  const speed = 12;
  const travelTime = dist / speed;
  const velY = (0.5 * 20 * travelTime) + 1.4 / travelTime;

  acidProjectiles.push({
    position: { ...startPos },
    velocity: { x: (dx / dist) * speed, y: velY, z: (dz / dist) * speed },
    zombieId: zombie.id,
  });

  // Notify clients to spawn visual
  io.emit('acidProjectile', { start: startPos, target: { x: target.position.x, z: target.position.z } });
}

function updateAcidProjectiles(dt) {
  for (let i = acidProjectiles.length - 1; i >= 0; i--) {
    const proj = acidProjectiles[i];
    proj.velocity.y -= 20 * dt;
    proj.position.x += proj.velocity.x * dt;
    proj.position.y += proj.velocity.y * dt;
    proj.position.z += proj.velocity.z * dt;

    if (proj.position.y <= 0) {
      acidProjectiles.splice(i, 1);
      createAcidPool(proj.position.x, proj.position.z);
      io.emit('acidPool', { x: proj.position.x, z: proj.position.z });
    }
  }
}

const acidPools = new Map();
let acidPoolCounter = 0;

function createAcidPool(x, z) {
  const id = 'pool_' + (++acidPoolCounter);
  acidPools.set(id, { id, position: vec3(x, 0, z), radius: 2.5, timer: ACID_POOL_DURATION, damageTimer: 0 });
}

function updateAcidPools(dt) {
  for (const [id, pool] of acidPools) {
    pool.timer -= dt;
    if (pool.timer <= 0) { acidPools.delete(id); continue; }

    pool.damageTimer -= dt;
    if (pool.damageTimer <= 0) {
      pool.damageTimer = 1.0;
      for (const [, p] of players) {
        if (p.isDead || p.isDown) continue;
        const d = vecDist2D(p.position, pool.position);
        if (d < pool.radius) {
          dealDamageToPlayer(p, { id: 'acid_pool', damageDealt: new Map() }, 8);
        }
      }
    }
  }
}

function bossShockwave(zombie) {
  io.emit('bossShockwave', { position: zombie.position });

  // Delayed damage check (ring expands over 1s)
  setTimeout(() => {
    for (const [, p] of players) {
      if (p.isDead || p.isDown) continue;
      const d = vecDist2D(p.position, zombie.position);
      if (d < 12) {
        dealDamageToPlayer(p, zombie, 15);
      }
    }
  }, 800);
}

function bossToxicSpit(zombie, target) {
  io.emit('bossToxicSpit', { from: zombie.position, to: target.position });
  setTimeout(() => {
    if (!zombie.isAlive) return;
    createAcidPool(target.position.x + (Math.random() - 0.5) * 3, target.position.z + (Math.random() - 0.5) * 3);
    io.emit('acidPool', { x: target.position.x, z: target.position.z });
  }, 1000);
}

function exploderDetonate(zombie) {
  if (!zombie.isAlive) return;
  zombie.isAlive = false;

  io.emit('explosion', { position: zombie.position, radius: 5 });

  // Damage players in radius
  for (const [, p] of players) {
    if (p.isDead || p.isDown) continue;
    const d = vecDist2D(zombie.position, p.position);
    if (d < 5) {
      dealDamageToPlayer(p, zombie, Math.floor(80 * (1 - d / 5)));
    }
  }

  // Damage other zombies
  for (const [, z] of gameState.zombies) {
    if (!z.isAlive || z.id === zombie.id) continue;
    const d = vecDist2D(zombie.position, z.position);
    if (d < 4) {
      z.hp = Math.max(0, z.hp - Math.floor(30 * (1 - d / 4)));
      if (z.hp <= 0) killZombie(z, null);
    }
  }

  killZombie(zombie, null);
}

// ============================================================
// ZOMBIE KILL
// ============================================================
function killZombie(zombie, killerId) {
  if (!zombie.isAlive) return;
  zombie.isAlive = false;

  // Distribute rewards
  const reward = ZOMBIE_TYPES[zombie.type]?.reward || 10;
  const damageMap = zombie.damageDealt || new Map();
  let totalDamage = 0;
  for (const [, dmg] of damageMap) totalDamage += dmg;

  for (const [pid, dmg] of damageMap) {
    const proportion = totalDamage > 0 ? dmg / totalDamage : 0;
    const moneyReward = Math.floor(reward * proportion);
    const player = [...players.values()].find(p => p.id === pid);
    if (player) {
      player.money = (player.money || 0) + moneyReward;
      const socket = getSocketById(pid);
      if (socket) socket.emit('moneyEarned', { amount: moneyReward, zombieId: zombie.id });
    }
  }

  // Bonus for last hit killer
  if (killerId) {
    const killerPlayer = [...players.values()].find(p => p.id === killerId);
    if (killerPlayer) {
      killerPlayer.kills = (killerPlayer.kills || 0) + 1;
      const socket = getSocketById(killerId);
      if (socket) socket.emit('killConfirmed', { zombieId: zombie.id, reward });
    }
  }

  // Miniboss explosion
  if (zombie.type === 'miniboss' && zombie.modifiers?.includes('explosive')) {
    setTimeout(() => {
      io.emit('explosion', { position: zombie.position, radius: 6 });
      for (const [, p] of players) {
        if (p.isDead || p.isDown) continue;
        const d = vecDist2D(zombie.position, p.position);
        if (d < 6) dealDamageToPlayer(p, zombie, Math.floor(100 * (1 - d / 6)));
      }
    }, 200);
  }

  // Boss kill = victory
  if (zombie.type === 'boss') {
    gameState.phase = 'victory';
    io.emit('victory');
  }

  io.emit('zombieKilled', { zombieId: zombie.id, killerId });
}

// ============================================================
// WAVE MANAGEMENT
// ============================================================
let waveTimeout = null;

function startWave(waveNum) {
  if (waveNum > WAVES.length) {
    gameState.phase = 'victory';
    io.emit('victory');
    return;
  }

  gameState.wave = waveNum;
  gameState.phase = 'combat';
  gameState.zombies.clear();

  const waveData = WAVES[waveNum - 1];
  const { count, hpMult, speedMult, damageMult, hasBoss } = waveData;

  io.emit('waveStart', {
    wave: waveNum,
    message: hasBoss ? '⚠️ ШИРИБАЗАРОВ ПРОБУЖДАЕТСЯ!' : `${count} зомби наступают!`
  });

  // Zombie types for this wave
  const types = waveNum <= 2 ? ['normal'] :
                waveNum <= 4 ? ['normal', 'normal', 'exploder'] :
                waveNum <= 7 ? ['normal', 'exploder', 'acid'] :
                               ['normal', 'exploder', 'acid', 'acid'];

  for (let i = 0; i < count; i++) {
    const delay = i * 500;
    setTimeout(() => {
      if (gameState.phase !== 'combat') return;
      const type = types[Math.floor(Math.random() * types.length)];
      const z = spawnZombie(type, hpMult, speedMult, damageMult);
      io.emit('zombieSpawned', serializeZombie(z));
    }, delay);
  }

  // Miniboss (waves 1-9)
  if (!hasBoss) {
    const modCount = Math.min(2, Math.floor(waveNum / 3) + 1);
    const mods = pickMinibossModifiers(modCount);
    setTimeout(() => {
      if (gameState.phase !== 'combat') return;
      const mb = spawnZombie('miniboss', hpMult, speedMult, damageMult, mods);
      io.emit('zombieSpawned', serializeZombie(mb));
      io.emit('minibossSpawned', { modifiers: mods });
    }, count * 500 + 1500);
  }

  // Boss (wave 10)
  if (hasBoss) {
    setTimeout(() => {
      if (gameState.phase !== 'combat') return;
      const boss = spawnZombie('boss', hpMult, speedMult, damageMult);
      boss.position = vec3(0, 0, 54);
      io.emit('zombieSpawned', serializeZombie(boss));
      io.emit('bossSpawned');
    }, count * 500 + 2000);
  }
}

function checkWaveComplete() {
  if (gameState.phase !== 'combat') return;
  const alive = [...gameState.zombies.values()].filter(z => z.isAlive);
  if (alive.length === 0 && gameState.zombies.size > 0) {
    gameState.zombies.clear();

    if (gameState.wave >= WAVES.length) {
      gameState.phase = 'victory';
      io.emit('victory');
      return;
    }

    gameState.phase = 'intermission';
    io.emit('waveComplete', { nextWave: gameState.wave + 1 });

    if (waveTimeout) clearTimeout(waveTimeout);
    waveTimeout = setTimeout(() => {
      startWave(gameState.wave + 1);
    }, 10000);
  }
}

function serializeZombie(z) {
  return {
    id: z.id,
    type: z.type,
    position: z.position,
    hp: z.hp,
    maxHp: z.maxHp,
    isAlive: z.isAlive,
    modifiers: z.modifiers || [],
    speedMult: z.speedMult,
    damageMult: z.damageMult,
    armorMult: z.armorMult || 1,
  };
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
  pingTimeout: 30000,
  pingInterval: 10000,
});

// Serve static files (built client)
const clientBuildPath = path.join(__dirname, '..', 'dist');
app.use(express.static(clientBuildPath));

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    players: players.size,
    wave: gameState.wave,
    phase: gameState.phase,
  });
});

// Serve index.html for SPA
app.get('*', (req, res) => {
  const indexPath = path.join(clientBuildPath, 'index.html');
  res.sendFile(indexPath, err => {
    if (err) res.status(200).send('Zombie Horde Server Running. Build client first.');
  });
});

// ============================================================
// SOCKET.IO EVENT HANDLERS
// ============================================================
io.on('connection', (socket) => {
  console.log(`[+] Player connected: ${socket.id}`);

  socket.on('playerJoin', (data) => {
    const player = {
      id: data.id || socket.id,
      socketId: socket.id,
      name: data.name || `Player_${socket.id.slice(0, 4)}`,
      color: data.color || 0x44ff44,
      position: data.position || { x: 0, y: 1.8, z: 5 },
      rotation: 0,
      hp: PLAYER_MAX_HP,
      maxHp: PLAYER_MAX_HP,
      isDown: false,
      isDead: false,
      isSprinting: false,
      isCrouching: false,
      weapon: 'ak47',
      ammoAkReserve: 180,
      money: 0,
      kills: 0,
      streak: 0,
      grenadeCount: 0,
      barricadeCount: 0,
      downTimer: 0,
      respawnTimer: 0,
      boosted: false,
      boostType: '',
      boostTimer: 0,
      weaponUpgrades: { ak47: { damage: 1, fireRate: 1, magSize: 1 }, pistol: { damage: 1, fireRate: 1, magSize: 1 } },
    };

    players.set(socket.id, player);

    // Send current game state to new player
    socket.emit('gameState', getSerializableState());

    // Notify others
    socket.broadcast.emit('playerJoined', {
      id: player.id, name: player.name, color: player.color,
      position: player.position, rotation: player.rotation,
      hp: player.hp, isDown: false, isDead: false,
    });

    console.log(`[*] ${player.name} joined. Total players: ${players.size}`);

    // Auto-start first wave if first player
    if (players.size === 1 && gameState.phase === 'waiting') {
      setTimeout(() => {
        if (players.size > 0) startWave(1);
      }, 5000);
    }
  });

  socket.on('playerUpdate', (data) => {
    const player = players.get(socket.id);
    if (!player) return;

    // Update player state (sanitize)
    if (data.position) {
      player.position.x = clamp(data.position.x || 0, -MAP_SIZE / 2, MAP_SIZE / 2);
      player.position.y = data.position.y || 1.8;
      player.position.z = clamp(data.position.z || 0, -MAP_SIZE / 2, MAP_SIZE / 2);
    }
    if (data.rotation !== undefined) player.rotation = data.rotation;
    if (data.weapon) player.weapon = data.weapon;
    if (data.kills !== undefined) player.kills = data.kills;
    if (data.streak !== undefined) player.streak = data.streak;
    if (data.money !== undefined) player.money = data.money;

    // Broadcast to others (not self)
    socket.broadcast.emit('playerUpdated', {
      id: player.id,
      position: player.position,
      rotation: player.rotation,
      hp: player.hp,
      isDown: player.isDown,
      isDead: player.isDead,
      weapon: player.weapon,
      kills: player.kills,
      money: player.money,
    });
  });

  socket.on('shoot', (data) => {
    const player = players.get(socket.id);
    if (!player || player.isDead) return;

    const { origin, direction, damage } = data;
    if (!origin || !direction) return;

    // Server-side raycast validation
    const maxDamage = 100;
    const validDamage = Math.min(Math.max(damage || 35, 0), maxDamage);

    // Check wall blocking
    let hitDist = 300;
    for (const box of COLLISION_BOXES) {
      const t = rayVsAABB(origin.x, origin.y, origin.z, direction.x, direction.y, direction.z, box);
      if (t !== null && t < hitDist) hitDist = t;
    }

    // Check zombie hits
    for (const [, zombie] of gameState.zombies) {
      if (!zombie.isAlive) continue;
      const zPos = { x: zombie.position.x, y: 1.0, z: zombie.position.z };
      const toZ = {
        x: zPos.x - origin.x,
        y: zPos.y - origin.y,
        z: zPos.z - origin.z,
      };
      const dot = toZ.x * direction.x + toZ.y * direction.y + toZ.z * direction.z;
      if (dot < 0) continue;
      const closest = {
        x: origin.x + direction.x * dot,
        y: origin.y + direction.y * dot,
        z: origin.z + direction.z * dot,
      };
      const distToLine = Math.sqrt(
        (closest.x - zPos.x) ** 2 +
        (closest.y - zPos.y) ** 2 +
        (closest.z - zPos.z) ** 2
      );
      const hitRadius = zombie.type === 'boss' ? 2.5 : zombie.type === 'miniboss' ? 1.2 : 0.8;

      if (distToLine < hitRadius && dot < hitDist) {
        // HIT!
        const actualDmg = Math.floor(validDamage * (zombie.armorMult || 1));
        zombie.hp -= actualDmg;

        // Track damage
        if (!zombie.damageDealt) zombie.damageDealt = new Map();
        zombie.damageDealt.set(player.id, (zombie.damageDealt.get(player.id) || 0) + actualDmg);

        if (zombie.hp <= 0) {
          killZombie(zombie, player.id);
        } else {
          io.emit('zombieDamaged', { zombieId: zombie.id, hp: zombie.hp, maxHp: zombie.maxHp });
        }
        break;
      }
    }
  });

  socket.on('zombieHit', (data) => {
    // Client-side hit confirmation (backup)
    const zombie = gameState.zombies.get(data.zombieId);
    const player = players.get(socket.id);
    if (!zombie || !zombie.isAlive || !player) return;

    const actualDmg = Math.floor((data.damage || 0) * (zombie.armorMult || 1));
    zombie.hp -= actualDmg;

    if (!zombie.damageDealt) zombie.damageDealt = new Map();
    zombie.damageDealt.set(player.id, (zombie.damageDealt.get(player.id) || 0) + actualDmg);

    if (zombie.hp <= 0) {
      killZombie(zombie, player.id);
    }
  });

  socket.on('activateTrap', (data) => {
    const player = players.get(socket.id);
    if (!player || player.money < TRAP_COST) return;

    const trap = gameState.traps[data.trapId];
    if (!trap || trap.active) return;

    player.money -= TRAP_COST;
    trap.active = true;
    trap.timer = TRAP_DURATION;
    trap.damageTimer = 0;

    io.emit('trapActivated', { trapId: data.trapId, type: trap.type });
    socket.emit('moneyUpdate', { money: player.money });
  });

  socket.on('placeBarricade', (data) => {
    const player = players.get(socket.id);
    if (!player) return;

    if (!gameState.barricades) gameState.barricades = new Map();
    gameState.barricades.set(data.id, {
      id: data.id,
      ownerId: player.id,
      position: data.position,
      hp: 150,
      maxHp: 150,
    });

    // Notify all players
    io.emit('barricadePlaced', data);
  });

  socket.on('revivePlayer', (data) => {
    const reviver = players.get(socket.id);
    if (!reviver) return;

    // Find target by player ID
    for (const [sid, p] of players) {
      if (p.id === data.targetId && p.isDown) {
        p.isDown = false;
        p.hp = 50;
        io.emit('playerRevived', { targetId: p.id, reviverId: reviver.id });
        break;
      }
    }
  });

  socket.on('grenadeLanded', (data) => {
    // Broadcast explosion effect
    io.emit('explosion', { position: data.position, radius: 8 });

    // Damage zombies
    for (const [, zombie] of gameState.zombies) {
      if (!zombie.isAlive) continue;
      const d = vecDist2D(zombie.position, data.position);
      if (d < 8) {
        const dmg = Math.floor(120 * (1 - d / 8));
        zombie.hp -= dmg;
        if (!zombie.damageDealt) zombie.damageDealt = new Map();
        const player = players.get(socket.id);
        if (player) zombie.damageDealt.set(player.id, (zombie.damageDealt.get(player.id) || 0) + dmg);
        if (zombie.hp <= 0) {
          const p = players.get(socket.id);
          killZombie(zombie, p?.id || null);
        }
      }
    }
  });

  socket.on('disconnect', () => {
    const player = players.get(socket.id);
    if (player) {
      console.log(`[-] ${player.name} disconnected`);
      io.emit('playerLeft', player.id);
      players.delete(socket.id);
    }

    // If no players remain, reset game
    if (players.size === 0) {
      resetGame();
    }
  });
});

function resetGame() {
  gameState.phase = 'waiting';
  gameState.wave = 0;
  gameState.zombies.clear();
  for (const trap of gameState.traps) { trap.active = false; trap.timer = 0; }
  if (waveTimeout) { clearTimeout(waveTimeout); waveTimeout = null; }
  console.log('[*] Game reset (no players)');
}

// ============================================================
// SERVER GAME LOOP
// ============================================================
let lastTick = Date.now();

setInterval(() => {
  const now = Date.now();
  const dt = Math.min((now - lastTick) / 1000, 0.05);
  lastTick = now;

  if (players.size === 0) return;
  if (gameState.phase !== 'combat') return;

  // Update zombie AI
  for (const [, zombie] of gameState.zombies) {
    if (zombie.isAlive) updateZombieAI(zombie, dt);
  }

  // Update acid projectiles
  updateAcidProjectiles(dt);
  updateAcidPools(dt);

  // Update traps
  for (const trap of gameState.traps) {
    if (!trap.active) continue;
    trap.timer -= dt;
    if (trap.timer <= 0) { trap.active = false; io.emit('trapDeactivated', { trapId: trap.id }); continue; }
    trap.damageTimer -= dt;
    if (trap.damageTimer <= 0) {
      trap.damageTimer = 0.5;
      const radius = 12;
      for (const [, zombie] of gameState.zombies) {
        if (!zombie.isAlive) continue;
        const d = vecDist2D(zombie.position, trap.position);
        if (d < radius) {
          zombie.hp -= TRAP_DAMAGE;
          if (!zombie.damageDealt) zombie.damageDealt = new Map();
          if (zombie.hp <= 0) killZombie(zombie, null);
        }
      }
    }
  }

  // Check wave complete
  checkWaveComplete();

  // Broadcast zombie positions (throttled)
  if ((now % 100) < TICK_MS) {
    const zombiesData = {};
    for (const [id, z] of gameState.zombies) {
      if (z.isAlive) {
        zombiesData[id] = { id: z.id, position: z.position, hp: z.hp, type: z.type };
      }
    }
    if (Object.keys(zombiesData).length > 0) {
      io.emit('zombiePositions', zombiesData);
    }
  }

}, TICK_MS);

// ============================================================
// START SERVER + NGROK
// ============================================================
server.listen(PORT, async () => {
  console.log(`\n🧟 ZOMBIE HORDE SERVER`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✅ Server running on http://localhost:${PORT}`);
  console.log(`✅ Socket.IO path: /ws/`);

  // Try to start ngrok
  try {
    const ngrok = require('ngrok');

    // Connect ngrok with auth token
    await ngrok.authtoken(NGROK_TOKEN);
    const url = await ngrok.connect({
      proto: 'http',
      addr: PORT,
    });

    const wsUrl = url.replace('http://', 'wss://').replace('https://', 'wss://');

    console.log(`\n🌐 ПУБЛИЧНЫЙ ДОСТУП ЧЕРЕЗ NGROK:`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📡 HTTP URL: ${url}`);
    console.log(`🔌 WebSocket URL: ${wsUrl}`);
    console.log(`\n📋 Скопируйте этот URL для игроков:`);
    console.log(`   ${wsUrl}`);
    console.log(`\n💡 Вставьте URL в поле "Подключиться к серверу" в игре`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

  } catch (err) {
    console.log(`\n⚠️  ngrok не запущен: ${err.message}`);
    console.log(`💡 Игроки могут подключаться локально: ws://localhost:${PORT}`);
    console.log(`💡 Для внешнего доступа настройте ngrok вручную:\n   ngrok http ${PORT}\n`);
  }
});

process.on('SIGINT', async () => {
  console.log('\n⏹ Shutting down...');
  try {
    const ngrok = require('ngrok');
    await ngrok.kill();
  } catch {}
  process.exit(0);
});
