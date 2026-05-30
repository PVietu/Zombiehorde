/**
 * Zombie Horde - Base Defense
 * Multiplayer Server: Node.js + Express + Socket.IO + ngrok
 * 
 * Run: node server.js
 */

'use strict';

const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');

// =================== CONFIGURATION ===================
const PORT = 3000;
const NGROK_TOKEN = '3ER3n9UuUjAf4z0flHlfDXaP6ST_7SGNJYjwX7zRSUWB5NTEK';

// =================== GAME CONSTANTS ===================
const GAME_CONFIG = {
  PLAYER_MAX_HEALTH: 100,
  AK47_DAMAGE: 35,
  AK47_MAGAZINE: 30,
  AK47_AMMO_START: 90,
  AK47_AMMO_MAX: 210,
  AK47_RELOAD_TIME: 2.0,
  AK47_FIRE_RATE: 0.1,
  AK47_RANGE: 200,
  PISTOL_DAMAGE: 20,
  PISTOL_FIRE_RATE: 0.4,
  PISTOL_RANGE: 150,
  PISTOL_MAGAZINE: 12,
  PLAYER_SPEED: 8,
  PLAYER_SPRINT_MULT: 1.6,
  PLAYER_CROUCH_MULT: 0.5,
  JUMP_FORCE: 8,
  GRAVITY: -20,
  DOWNED_DURATION: 15,
  REVIVE_TIME: 3,
  REVIVE_HEALTH: 50,
  RESPAWN_DELAY: 10,
  COMBO_SPEED_THRESHOLD: 5,
  COMBO_DAMAGE_THRESHOLD: 10,
  COMBO_CLEAR_THRESHOLD: 15,
  VENDING_AMMO_COST: 50,
  VENDING_MEDKIT_COST: 100,
  MYSTERY_BOX_COST: 200,
  TRAP_COST: 300,
  TRAP_DURATION: 20,
  TRAP_DAMAGE: 15,
  TRAP_TICK: 0.5,
  TRAP_RADIUS: 8,
  MEDKIT_HEAL: 30,
  DROP_MEDKIT_CHANCE: 0.1,
  MAX_WAVES: 10,
  WAVE_BETWEEN_DELAY: 5,
  MAP_HALF: 54,
};

const WAVE_CONFIG = [
  { normalCount: 6,  explosiveCount: 0, acidCount: 0 },
  { normalCount: 8,  explosiveCount: 2, acidCount: 0 },
  { normalCount: 10, explosiveCount: 3, acidCount: 2 },
  { normalCount: 12, explosiveCount: 4, acidCount: 3 },
  { normalCount: 15, explosiveCount: 5, acidCount: 4 },
  { normalCount: 18, explosiveCount: 6, acidCount: 5 },
  { normalCount: 20, explosiveCount: 8, acidCount: 6 },
  { normalCount: 25, explosiveCount: 10, acidCount: 8 },
  { normalCount: 30, explosiveCount: 12, acidCount: 10 },
  { normalCount: 20, explosiveCount: 8,  acidCount: 8, boss: true },
];

const ZOMBIE_HP_SCALE    = [1, 1.1, 1.2, 1.35, 1.5, 1.7, 1.9, 2.2, 2.5, 3.0];
const ZOMBIE_DMG_SCALE   = [1, 1.1, 1.15, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 2.0];
const ZOMBIE_SPD_SCALE   = [1, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3, 1.35, 1.4, 1.5];

const ZOMBIE_NORMAL   = { SPEED: 3.5, HEALTH: 100, DAMAGE: 15, ATTACK_RANGE: 1.8, ATTACK_RATE: 1.0, KILL_REWARD: 10 };
const ZOMBIE_EXPLOSIVE = { SPEED: 4.0, HEALTH: 80,  DAMAGE: 60, EXPLODE_RANGE: 5, KILL_REWARD: 20 };
const ZOMBIE_ACID     = { SPEED: 3.0, HEALTH: 120, DAMAGE: 8,  ATTACK_RANGE: 12, ATTACK_RATE: 2.5, KILL_REWARD: 25, ACID_DAMAGE: 5, ACID_DURATION: 5, POOL_RADIUS: 2.5 };
const BOSS_CONFIG     = { SPEED: 5.0, HEALTH: 3000, DAMAGE: 40, ATTACK_RANGE: 3.0, SHOCKWAVE_RANGE: 12, SHOCKWAVE_DAMAGE: 35, RUSH_DAMAGE: 50, TOXIC_DAMAGE: 20, KILL_REWARD: 200 };

// =================== GAME STATE ===================
let zombieCounter = 0;
let dropCounter = 0;
const genId = () => `z_${++zombieCounter}_${Date.now()}`;
const genDropId = () => `d_${++dropCounter}`;

const gameState = {
  phase: 'waiting', // waiting | playing | between_waves | victory | game_over
  wave: 0,
  players: new Map(),   // socketId -> PlayerState
  zombies: new Map(),   // id -> ZombieState
  acidPools: new Map(), // id -> AcidPool
  dropItems: new Map(), // id -> DropItem
  traps: [
    { id: 'trap1', x: 0,   z: 45,  type: 'electric',     active: false, timer: 0, tickTimer: 0, radius: GAME_CONFIG.TRAP_RADIUS },
    { id: 'trap2', x: -35, z: -35, type: 'flamethrower', active: false, timer: 0, tickTimer: 0, radius: GAME_CONFIG.TRAP_RADIUS },
  ],
  spawnQueue: [],
  spawnTimer: 0,
  zombiesAlive: 0,
  bossId: null,
  mysteryBoxAvailable: true,
  wavePhaseTimer: 0,
};

const ZOMBIE_SPAWN_POINTS = [];
for (let i = 0; i < 20; i++) {
  const angle = (i / 20) * Math.PI * 2;
  ZOMBIE_SPAWN_POINTS.push({ x: Math.cos(angle) * 50, z: Math.sin(angle) * 50 });
}
ZOMBIE_SPAWN_POINTS.push(
  { x: 0, z: 52 }, { x: 0, z: -52 },
  { x: 52, z: 0 }, { x: -52, z: 0 },
  { x: 36, z: 36 }, { x: -36, z: 36 }
);

const PLAYER_SPAWNS = [
  { x: 0, z: 0 }, { x: 3, z: 0 }, { x: -3, z: 0 },
  { x: 0, z: 3 }, { x: 0, z: -3 }, { x: 5, z: 5 }
];

// =================== COLLISION ===================
// Simplified collision boxes for server-side validation
const COLLISION_BOXES = [
  // Perimeter walls
  { minX: -55, maxX: 55, minY: 0, maxY: 5, minZ: -55.5, maxZ: -54.5 }, // North
  { minX: -27.5, maxX: 27.5, minY: 0, maxY: 5, minZ: 54.5, maxZ: 55.5 }, // South-left
  { minX: 27.5, maxX: 55, minY: 0, maxY: 5, minZ: 54.5, maxZ: 55.5 }, // South-right
  { minX: -55.5, maxX: -54.5, minY: 0, maxY: 5, minZ: -55, maxZ: 55 }, // West
  { minX: 54.5, maxX: 55.5, minY: 0, maxY: 5, minZ: -55, maxZ: 55 }, // East
  // Buildings
  { minX: -33, maxX: -17, minY: 0, maxY: 8, minZ: -26, maxZ: -14 }, // Barracks
  { minX: 16, maxX: 28, minY: 0, maxY: 6, minZ: -27, maxZ: -17 }, // Storage
];

function isPositionBlocked(x, z, r = 0.5) {
  for (const b of COLLISION_BOXES) {
    if (x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ) {
      return true;
    }
  }
  if (Math.abs(x) > GAME_CONFIG.MAP_HALF || Math.abs(z) > GAME_CONFIG.MAP_HALF) return true;
  return false;
}

function distance2D(ax, az, bx, bz) {
  const dx = ax - bx, dz = az - bz;
  return Math.sqrt(dx * dx + dz * dz);
}

// =================== PLAYER MANAGEMENT ===================
function createPlayer(socketId, name) {
  const spawn = PLAYER_SPAWNS[Math.floor(Math.random() * PLAYER_SPAWNS.length)];
  return {
    id: socketId,
    name: name || `Игрок_${socketId.substring(0, 4)}`,
    x: spawn.x, y: 0, z: spawn.z,
    rot: 0,
    hp: GAME_CONFIG.PLAYER_MAX_HEALTH,
    maxHp: GAME_CONFIG.PLAYER_MAX_HEALTH,
    ammoAK: GAME_CONFIG.AK47_AMMO_START,
    magazineAK: GAME_CONFIG.AK47_MAGAZINE,
    pistolMagazine: GAME_CONFIG.PISTOL_MAGAZINE,
    weapon: 'ak47',
    money: 0,
    kills: 0,
    isDowned: false,
    downedTimer: 0,
    isDead: false,
    respawnTimer: 0,
    combo: 0,
    comboTimer: 0,
    speedBoost: false,
    speedBoostTimer: 0,
    doubleDamage: false,
    doubleDamageTimer: 0,
    fireTimer: 0,
    isReloading: false,
    reloadTimer: 0,
    reloadTime: GAME_CONFIG.AK47_RELOAD_TIME,
    isSprinting: false,
    isCrouching: false,
    akDamageBonus: 0,
    akFireRateBonus: 0,
    akMagazineBonus: 0,
    pistolDamageBonus: 0,
    pistolFireRateBonus: 0,
    lastShootTime: 0,
    vendingToggle: true,
  };
}

// =================== ZOMBIE MANAGEMENT ===================
function spawnZombie(type, wave) {
  const hpScale = ZOMBIE_HP_SCALE[wave - 1] || 1;
  const dmgScale = ZOMBIE_DMG_SCALE[wave - 1] || 1;
  const spdScale = ZOMBIE_SPD_SCALE[wave - 1] || 1;

  const spawnPt = ZOMBIE_SPAWN_POINTS[Math.floor(Math.random() * ZOMBIE_SPAWN_POINTS.length)];
  const id = genId();
  let z;

  if (type === 'boss') {
    z = { id, type: 'boss', x: spawnPt.x, y: 0, z: spawnPt.z, rot: 0,
      hp: BOSS_CONFIG.HEALTH, maxHp: BOSS_CONFIG.HEALTH,
      damage: BOSS_CONFIG.DAMAGE * dmgScale, speed: BOSS_CONFIG.SPEED,
      attackRange: BOSS_CONFIG.ATTACK_RANGE, attackTimer: 0, attackRate: 1.5,
      state: 'chase', reward: BOSS_CONFIG.KILL_REWARD,
      bossAttackTimer: 5, bossPhase: 'none', bossPhaseTimer: 0,
      minionsSpawned: false, damageContrib: {}
    };
    gameState.bossId = id;
  } else if (type === 'explosive') {
    z = { id, type, x: spawnPt.x, y: 0, z: spawnPt.z, rot: 0,
      hp: ZOMBIE_EXPLOSIVE.HEALTH * hpScale, maxHp: ZOMBIE_EXPLOSIVE.HEALTH * hpScale,
      damage: ZOMBIE_EXPLOSIVE.DAMAGE * dmgScale, speed: ZOMBIE_EXPLOSIVE.SPEED * spdScale,
      attackRange: 2.5, attackTimer: 0, attackRate: 0,
      state: 'chase', reward: ZOMBIE_EXPLOSIVE.KILL_REWARD, damageContrib: {}
    };
  } else if (type === 'acid') {
    z = { id, type, x: spawnPt.x, y: 0, z: spawnPt.z, rot: 0,
      hp: ZOMBIE_ACID.HEALTH * hpScale, maxHp: ZOMBIE_ACID.HEALTH * hpScale,
      damage: ZOMBIE_ACID.DAMAGE * dmgScale, speed: ZOMBIE_ACID.SPEED * spdScale,
      attackRange: ZOMBIE_ACID.ATTACK_RANGE, attackTimer: 0, attackRate: ZOMBIE_ACID.ATTACK_RATE,
      state: 'chase', reward: ZOMBIE_ACID.KILL_REWARD, damageContrib: {},
      projectileTimer: 0
    };
  } else {
    z = { id, type: 'normal', x: spawnPt.x, y: 0, z: spawnPt.z, rot: 0,
      hp: ZOMBIE_NORMAL.HEALTH * hpScale, maxHp: ZOMBIE_NORMAL.HEALTH * hpScale,
      damage: ZOMBIE_NORMAL.DAMAGE * dmgScale, speed: ZOMBIE_NORMAL.SPEED * spdScale,
      attackRange: ZOMBIE_NORMAL.ATTACK_RANGE, attackTimer: 0, attackRate: ZOMBIE_NORMAL.ATTACK_RATE,
      state: 'chase', reward: ZOMBIE_NORMAL.KILL_REWARD, damageContrib: {}
    };
  }

  gameState.zombies.set(id, z);
  gameState.zombiesAlive++;
  return z;
}

function getClosestLivingPlayer(x, z) {
  let closest = null, closestDist = Infinity;
  for (const [, p] of gameState.players) {
    if (p.isDead || p.isDowned) continue;
    const d = distance2D(x, z, p.x, p.z);
    if (d < closestDist) { closestDist = d; closest = p; }
  }
  return closest;
}

function moveZombie(zombie, targetX, targetZ, dt) {
  const dx = targetX - zombie.x;
  const dz = targetZ - zombie.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 0.01) return;

  const r = zombie.type === 'boss' ? 1.5 : 0.5;
  const nx = zombie.x + (dx / dist) * zombie.speed * dt;
  const nz = zombie.z + (dz / dist) * zombie.speed * dt;

  if (!isPositionBlocked(nx, zombie.z, r)) zombie.x = nx;
  else {
    const slideAngle = Math.atan2(dx, dz) + 0.4;
    const sx = zombie.x + Math.sin(slideAngle) * zombie.speed * dt * 0.5;
    if (!isPositionBlocked(sx, zombie.z, r)) zombie.x = sx;
  }
  if (!isPositionBlocked(zombie.x, nz, r)) zombie.z = nz;
  else {
    const slideAngle = Math.atan2(dx, dz) - 0.4;
    const sz = zombie.z + Math.cos(slideAngle) * zombie.speed * dt * 0.5;
    if (!isPositionBlocked(zombie.x, sz, r)) zombie.z = sz;
  }

  zombie.x = Math.max(-53, Math.min(53, zombie.x));
  zombie.z = Math.max(-53, Math.min(53, zombie.z));
  zombie.rot = Math.atan2(targetX - zombie.x, targetZ - zombie.z);
}

function damagePlayer(playerId, damage) {
  const p = gameState.players.get(playerId);
  if (!p || p.isDead || p.isDowned) return;
  p.hp -= damage;
  io.to(playerId).emit('playerDamaged', { damage });
  if (p.hp <= 0) {
    p.hp = 0;
    p.isDowned = true;
    p.downedTimer = GAME_CONFIG.DOWNED_DURATION;
    io.emit('playerDowned', { playerId });
  }
}

function damageZombie(zombieId, damage, attackerId) {
  const z = gameState.zombies.get(zombieId);
  if (!z || z.state === 'dead') return false;

  z.hp -= damage;
  // Track damage contribution
  z.damageContrib[attackerId] = (z.damageContrib[attackerId] || 0) + damage;

  io.emit('zombieDamaged', { id: zombieId, hp: z.hp, maxHp: z.maxHp });
  if (z.hp <= 0) {
    z.state = 'dead';
    return true;
  }
  return false;
}

function onZombieKilled(zombieId, killerId) {
  const z = gameState.zombies.get(zombieId);
  if (!z) return;

  // Find main killer (most damage)
  let mainKiller = killerId;
  let maxDmg = 0;
  for (const [pid, dmg] of Object.entries(z.damageContrib)) {
    if (dmg > maxDmg) { maxDmg = dmg; mainKiller = pid; }
  }

  const killer = gameState.players.get(mainKiller);
  if (killer) {
    killer.money += z.reward;
    killer.kills++;

    // Combo
    killer.combo++;
    killer.comboTimer = 8;

    if (killer.combo === GAME_CONFIG.COMBO_SPEED_THRESHOLD) {
      killer.speedBoost = true;
      killer.speedBoostTimer = 10;
      io.to(mainKiller).emit('notification', '⚡ КОМБО x5 — УСКОРЕНИЕ!');
    }
    if (killer.combo === GAME_CONFIG.COMBO_DAMAGE_THRESHOLD) {
      killer.doubleDamage = true;
      killer.doubleDamageTimer = 10;
      io.to(mainKiller).emit('notification', '🔥 КОМБО x10 — ДВОЙНОЙ УРОН!');
    }
    if (killer.combo === GAME_CONFIG.COMBO_CLEAR_THRESHOLD) {
      clearAllNormalZombies();
      io.emit('notification', `✨ ${killer.name}: КОМБО x15 — АПОКАЛИПСИС!`);
    }
  }

  // Drop medkit
  if (Math.random() < GAME_CONFIG.DROP_MEDKIT_CHANCE) {
    const dropId = genDropId();
    gameState.dropItems.set(dropId, { id: dropId, x: z.x, z: z.z, type: 'medkit', timer: 20 });
    io.emit('dropSpawned', { id: dropId, x: z.x, z: z.z, type: 'medkit' });
  }

  // Explosion
  if (z.type === 'explosive') {
    io.emit('explosion', { x: z.x, z: z.z });
    for (const [pid, p] of gameState.players) {
      const d = distance2D(p.x, p.z, z.x, z.z);
      if (d < ZOMBIE_EXPLOSIVE.EXPLODE_RANGE) {
        const dmg = z.damage * (1 - d / ZOMBIE_EXPLOSIVE.EXPLODE_RANGE);
        damagePlayer(pid, dmg);
      }
    }
  }

  // Kill announce
  io.emit('killfeed', {
    killer: killer ? killer.name : 'Ловушка',
    victim: z.type === 'boss' ? 'ШИРИБАЗАРОВ' : `Зомби(${z.type})`,
    weapon: killer ? killer.weapon : 'trap',
  });

  // Boss death
  if (z.type === 'boss') {
    gameState.bossId = null;
    io.emit('bossDefeated');
    setTimeout(() => triggerVictory(), 2000);
  }

  io.emit('zombieKilled', { id: zombieId, x: z.x, y: z.y, z: z.z });
  gameState.zombies.delete(zombieId);
  gameState.zombiesAlive = Math.max(0, gameState.zombiesAlive - 1);
}

function clearAllNormalZombies() {
  const toKill = [];
  for (const [id, z] of gameState.zombies) {
    if (z.type === 'normal') toKill.push(id);
  }
  toKill.forEach(id => {
    const z = gameState.zombies.get(id);
    if (z) {
      io.emit('comboKill', { x: z.x, z: z.z });
      gameState.zombies.delete(id);
      gameState.zombiesAlive = Math.max(0, gameState.zombiesAlive - 1);
    }
  });
}

// =================== WAVE MANAGEMENT ===================
function startWave(waveNum) {
  gameState.wave = waveNum;
  gameState.spawnQueue = [];
  gameState.spawnTimer = 0;

  const cfg = WAVE_CONFIG[waveNum - 1];
  if (!cfg) return;

  let delay = 0;
  for (let i = 0; i < (cfg.normalCount || 0); i++) { gameState.spawnQueue.push({ type: 'normal', delay }); delay += 0.5; }
  for (let i = 0; i < (cfg.explosiveCount || 0); i++) { gameState.spawnQueue.push({ type: 'explosive', delay }); delay += 0.8; }
  for (let i = 0; i < (cfg.acidCount || 0); i++) { gameState.spawnQueue.push({ type: 'acid', delay }); delay += 1.0; }

  // Shuffle
  for (let i = gameState.spawnQueue.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [gameState.spawnQueue[i], gameState.spawnQueue[j]] = [gameState.spawnQueue[j], gameState.spawnQueue[i]];
  }
  gameState.spawnQueue.forEach((item, i) => { item.delay = i * 0.5; });

  io.emit('waveStart', { wave: waveNum, isBoss: !!cfg.boss });
  io.emit('notification', `— ВОЛНА ${waveNum} —`);

  // Respawn dead players
  for (const [, p] of gameState.players) {
    if (p.isDead || p.isDowned) {
      respawnPlayer(p);
      io.emit('playerRespawned', { playerId: p.id, x: p.x, y: p.y, z: p.z });
    }
  }
}

function respawnPlayer(p) {
  const spawn = PLAYER_SPAWNS[Math.floor(Math.random() * PLAYER_SPAWNS.length)];
  p.x = spawn.x; p.y = 0; p.z = spawn.z;
  p.hp = GAME_CONFIG.REVIVE_HEALTH;
  p.isDead = false;
  p.isDowned = false;
  p.velY = 0;
}

function triggerVictory() {
  if (gameState.phase === 'victory') return;
  gameState.phase = 'victory';
  io.emit('victory');
}

function checkWaveComplete() {
  if (gameState.phase !== 'playing') return;
  const cfg = WAVE_CONFIG[gameState.wave - 1];
  if (!cfg) return;

  const bossWave = !!cfg.boss;
  if (gameState.zombies.size === 0 && gameState.spawnQueue.length === 0) {
    if (bossWave && gameState.bossId === null) {
      // Boss already killed = wave done
    } else if (!bossWave) {
      onWaveComplete();
    }
  }
}

function onWaveComplete() {
  if (gameState.wave >= GAME_CONFIG.MAX_WAVES) { triggerVictory(); return; }
  io.emit('notification', `🏆 ВОЛНА ${gameState.wave} ЗАВЕРШЕНА!`);
  for (const [, p] of gameState.players) {
    p.hp = Math.min(p.maxHp, p.hp + 20);
  }
  gameState.phase = 'between_waves';
  const nextWave = gameState.wave + 1;
  setTimeout(() => {
    if (gameState.phase === 'between_waves') {
      gameState.phase = 'playing';
      startWave(nextWave);
    }
  }, GAME_CONFIG.WAVE_BETWEEN_DELAY * 1000);
}

// =================== GAME LOOP ===================
const TICK_RATE = 20; // 20 Hz server tick
const DT = 1 / TICK_RATE;
let lastTick = Date.now();

function gameTick() {
  const now = Date.now();
  const dt = Math.min((now - lastTick) / 1000, 0.05);
  lastTick = now;

  if (gameState.phase !== 'playing' && gameState.phase !== 'between_waves') return;

  // Update spawn queue
  if (gameState.spawnQueue.length > 0 && gameState.phase === 'playing') {
    gameState.spawnTimer += dt;
    while (gameState.spawnQueue.length > 0 && gameState.spawnQueue[0].delay <= gameState.spawnTimer) {
      const item = gameState.spawnQueue.shift();
      const z = spawnZombie(item.type, gameState.wave);
      io.emit('zombieSpawned', { zombie: zombieToNet(z) });
    }

    // Boss wave
    const cfg = WAVE_CONFIG[gameState.wave - 1];
    if (cfg && cfg.boss && !gameState.bossId && gameState.spawnQueue.length === 0 && gameState.zombiesAlive <= 5) {
      const boss = spawnZombie('boss', gameState.wave);
      io.emit('zombieSpawned', { zombie: zombieToNet(boss) });
      io.emit('bossSpawned', { id: boss.id, hp: boss.hp, maxHp: boss.maxHp });
    }
  }

  // Update zombies
  for (const [id, zombie] of gameState.zombies) {
    if (zombie.state === 'dead') continue;

    const target = getClosestLivingPlayer(zombie.x, zombie.z);
    if (!target) continue;

    const dist = distance2D(zombie.x, zombie.z, target.x, target.z);

    if (zombie.type === 'boss') {
      updateBoss(zombie, target, dist, dt);
    } else if (zombie.type === 'explosive') {
      if (dist > 2.5) {
        moveZombie(zombie, target.x, target.z, dt);
      } else {
        zombie.state = 'dead';
        onZombieKilled(id, null);
        io.emit('explosion', { x: zombie.x, z: zombie.z });
        // Damage all players in range
        for (const [pid, p] of gameState.players) {
          const d = distance2D(p.x, p.z, zombie.x, zombie.z);
          if (d < ZOMBIE_EXPLOSIVE.EXPLODE_RANGE) {
            damagePlayer(pid, zombie.damage * (1 - d / ZOMBIE_EXPLOSIVE.EXPLODE_RANGE));
          }
        }
        continue;
      }
    } else if (zombie.type === 'acid') {
      if (dist > ZOMBIE_ACID.ATTACK_RANGE) {
        moveZombie(zombie, target.x, target.z, dt);
      } else {
        zombie.projectileTimer -= dt;
        if (zombie.projectileTimer <= 0) {
          zombie.projectileTimer = ZOMBIE_ACID.ATTACK_RATE;
          // Spawn acid projectile (handled client-side visually, damage applied here)
          io.emit('acidSpit', { fromX: zombie.x, fromZ: zombie.z, toX: target.x, toZ: target.z });
          // Delayed damage
          const tx = target.x, tz = target.z, pid = target.id;
          setTimeout(() => {
            const p = gameState.players.get(pid);
            if (!p) return;
            const d2 = distance2D(p.x, p.z, tx, tz);
            if (d2 < 3) damagePlayer(pid, zombie.damage);
            // Create acid pool at landing
            const poolId = `pool_${Date.now()}`;
            gameState.acidPools.set(poolId, { id: poolId, x: tx, z: tz, timer: 5, radius: ZOMBIE_ACID.POOL_RADIUS, damage: ZOMBIE_ACID.ACID_DAMAGE, tickTimer: 0 });
            io.emit('acidPool', { id: poolId, x: tx, z: tz, radius: ZOMBIE_ACID.POOL_RADIUS });
          }, 1200);
        }
      }
    } else {
      if (dist > zombie.attackRange) {
        moveZombie(zombie, target.x, target.z, dt);
      } else {
        zombie.attackTimer -= dt;
        if (zombie.attackTimer <= 0) {
          zombie.attackTimer = zombie.attackRate;
          damagePlayer(target.id, zombie.damage);
        }
      }
    }
  }

  // Update acid pools
  for (const [id, pool] of gameState.acidPools) {
    pool.timer -= dt;
    if (pool.timer <= 0) {
      gameState.acidPools.delete(id);
      io.emit('acidPoolRemoved', { id });
      continue;
    }
    pool.tickTimer -= dt;
    if (pool.tickTimer <= 0) {
      pool.tickTimer = GAME_CONFIG.TRAP_TICK;
      for (const [pid, p] of gameState.players) {
        const d = distance2D(p.x, p.z, pool.x, pool.z);
        if (d < pool.radius) damagePlayer(pid, pool.damage);
      }
    }
  }

  // Update traps
  for (const trap of gameState.traps) {
    if (!trap.active) continue;
    trap.timer -= dt;
    if (trap.timer <= 0) {
      trap.active = false;
      io.emit('trapDeactivated', { id: trap.id });
      continue;
    }
    trap.tickTimer -= dt;
    if (trap.tickTimer <= 0) {
      trap.tickTimer = GAME_CONFIG.TRAP_TICK;
      for (const [id, zombie] of gameState.zombies) {
        const d = distance2D(zombie.x, zombie.z, trap.x, trap.z);
        if (d < trap.radius) {
          const killed = damageZombie(id, GAME_CONFIG.TRAP_DAMAGE, 'trap');
          if (killed) onZombieKilled(id, 'trap');
        }
      }
    }
  }

  // Update drop items
  for (const [id, drop] of gameState.dropItems) {
    drop.timer -= dt;
    if (drop.timer <= 0) {
      gameState.dropItems.delete(id);
      io.emit('dropRemoved', { id });
    }
  }

  // Update players
  for (const [, p] of gameState.players) {
    if (p.isDowned) {
      p.downedTimer -= dt;
      if (p.downedTimer <= 0) {
        p.isDowned = false;
        p.isDead = true;
        p.respawnTimer = GAME_CONFIG.RESPAWN_DELAY;
        io.to(p.id).emit('playerDied');
      }
    }
    if (p.isDead) {
      p.respawnTimer -= dt;
      if (p.respawnTimer <= 0) {
        respawnPlayer(p);
        io.to(p.id).emit('playerRespawned', { x: p.x, y: p.y, z: p.z });
        io.emit('otherPlayerRespawned', { playerId: p.id, x: p.x, y: p.y, z: p.z });
      }
    }
    // Combo decay
    if (p.combo > 0) {
      p.comboTimer -= dt;
      if (p.comboTimer <= 0) p.combo = 0;
    }
    if (p.speedBoost) { p.speedBoostTimer -= dt; if (p.speedBoostTimer <= 0) p.speedBoost = false; }
    if (p.doubleDamage) { p.doubleDamageTimer -= dt; if (p.doubleDamageTimer <= 0) p.doubleDamage = false; }
  }

  // Broadcast zombie positions
  const zombieUpdates = [];
  for (const [, z] of gameState.zombies) {
    zombieUpdates.push({ id: z.id, x: z.x, y: z.y, z: z.z, rot: z.rot, hp: z.hp });
  }
  io.emit('zombiePositions', zombieUpdates);

  // Broadcast player states
  const playerUpdates = [];
  for (const [, p] of gameState.players) {
    playerUpdates.push({
      id: p.id, name: p.name,
      x: p.x, y: p.y, z: p.z, rot: p.rot,
      hp: p.hp, isDowned: p.isDowned, isDead: p.isDead,
      weapon: p.weapon, kills: p.kills, money: p.money,
      isCrouching: p.isCrouching,
    });
  }
  io.emit('playerPositions', playerUpdates);

  // Check wave complete
  checkWaveComplete();
}

function updateBoss(zombie, target, dist, dt) {
  zombie.bossAttackTimer -= dt;

  if (!zombie.minionsSpawned && zombie.hp < zombie.maxHp * 0.5) {
    zombie.minionsSpawned = true;
    for (let i = 0; i < 5; i++) {
      const m = spawnZombie('normal', gameState.wave);
      io.emit('zombieSpawned', { zombie: zombieToNet(m) });
    }
    io.emit('notification', '⚠ ШИРИБАЗАРОВ ПРИЗВАЛ МИНЬОНОВ!');
  }

  if (zombie.bossPhase === 'rush' && zombie.rushTarget) {
    const dx = zombie.rushTarget.x - zombie.x;
    const dz = zombie.rushTarget.z - zombie.z;
    const d = Math.sqrt(dx * dx + dz * dz);
    if (d > 0.5) {
      const spd = BOSS_CONFIG.SPEED * 3;
      zombie.x += (dx / d) * spd * dt;
      zombie.z += (dz / d) * spd * dt;
      // Check all players
      for (const [pid, p] of gameState.players) {
        if (distance2D(zombie.x, zombie.z, p.x, p.z) < 2) {
          damagePlayer(pid, BOSS_CONFIG.RUSH_DAMAGE);
        }
      }
      if (d < 1) zombie.bossPhase = 'none';
    } else {
      zombie.bossPhase = 'none';
    }
  } else if (zombie.bossPhase === 'shockwave' || zombie.bossPhase === 'toxic') {
    zombie.bossPhaseTimer -= dt;
    if (zombie.bossPhaseTimer <= 0) zombie.bossPhase = 'none';
  } else {
    if (dist > BOSS_CONFIG.ATTACK_RANGE) {
      moveZombie(zombie, target.x, target.z, dt);
    } else {
      zombie.attackTimer -= dt;
      if (zombie.attackTimer <= 0) {
        zombie.attackTimer = zombie.attackRate;
        damagePlayer(target.id, zombie.damage);
      }
    }
    if (zombie.bossAttackTimer <= 0) {
      zombie.bossAttackTimer = 6 + Math.random() * 4;
      const roll = Math.random();
      if (roll < 0.33) {
        // Shockwave
        zombie.bossPhase = 'shockwave';
        zombie.bossPhaseTimer = 2;
        io.emit('bossShockwave', { x: zombie.x, z: zombie.z, range: BOSS_CONFIG.SHOCKWAVE_RANGE });
        for (const [pid, p] of gameState.players) {
          if (distance2D(zombie.x, zombie.z, p.x, p.z) < BOSS_CONFIG.SHOCKWAVE_RANGE) {
            damagePlayer(pid, BOSS_CONFIG.SHOCKWAVE_DAMAGE);
          }
        }
      } else if (roll < 0.66) {
        // Rush
        zombie.bossPhase = 'rush';
        zombie.rushTarget = { x: target.x, z: target.z };
        io.emit('bossRush', { from: { x: zombie.x, z: zombie.z }, to: { x: target.x, z: target.z } });
      } else {
        // Toxic
        zombie.bossPhase = 'toxic';
        zombie.bossPhaseTimer = 2;
        io.emit('bossToxic', { x: target.x, z: target.z });
        for (let i = 0; i < 3; i++) {
          const angle = (i / 3) * Math.PI * 2;
          const px = target.x + Math.cos(angle) * 3;
          const pz = target.z + Math.sin(angle) * 3;
          const poolId = `boss_pool_${Date.now()}_${i}`;
          gameState.acidPools.set(poolId, { id: poolId, x: px, z: pz, timer: 5, radius: 3, damage: BOSS_CONFIG.TOXIC_DAMAGE, tickTimer: 0 });
          io.emit('acidPool', { id: poolId, x: px, z: pz, radius: 3 });
        }
      }
    }
  }
}

function zombieToNet(z) {
  return { id: z.id, type: z.type, x: z.x, y: z.y, z: z.z, rot: z.rot, hp: z.hp, maxHp: z.maxHp };
}

// =================== SERVER SETUP ===================
const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// Serve static files from dist
app.use(express.static(path.join(__dirname, '../dist')));
app.use(express.static(path.join(__dirname, '../public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../dist/index.html'));
});

// =================== SOCKET.IO EVENTS ===================
io.on('connection', (socket) => {
  console.log(`[+] Player connected: ${socket.id}`);

  socket.on('joinGame', (data) => {
    const player = createPlayer(socket.id, data.name || `Player_${socket.id.substring(0,4)}`);
    gameState.players.set(socket.id, player);

    // Send current game state
    socket.emit('gameState', {
      phase: gameState.phase,
      wave: gameState.wave,
      players: [...gameState.players.values()].map(p => ({
        id: p.id, name: p.name, x: p.x, y: p.y, z: p.z,
        hp: p.hp, isDowned: p.isDowned, isDead: p.isDead, weapon: p.weapon,
      })),
      zombies: [...gameState.zombies.values()].map(z => zombieToNet(z)),
      traps: gameState.traps,
    });

    socket.emit('playerInit', {
      playerId: socket.id,
      player: player,
    });

    // Notify others
    socket.broadcast.emit('playerJoined', {
      id: socket.id, name: player.name,
      x: player.x, y: player.y, z: player.z,
    });

    // Start game if first player joins during waiting
    if (gameState.phase === 'waiting' && gameState.players.size >= 1) {
      gameState.phase = 'playing';
      startWave(1);
    }

    console.log(`Game state: ${gameState.players.size} players, wave ${gameState.wave}, phase: ${gameState.phase}`);
  });

  socket.on('playerMove', (data) => {
    const p = gameState.players.get(socket.id);
    if (!p || p.isDead) return;
    // Validate position (anti-cheat: check for teleportation)
    const maxMoveDist = (GAME_CONFIG.PLAYER_SPEED * GAME_CONFIG.PLAYER_SPRINT_MULT + 1) * 0.1 * 3;
    const moveDist = distance2D(p.x, p.z, data.x, data.z);
    if (moveDist > maxMoveDist * 3) return; // Too far, reject
    p.x = data.x; p.y = data.y; p.z = data.z;
    p.rot = data.rot;
    p.isSprinting = data.isSprinting;
    p.isCrouching = data.isCrouching;
    p.weapon = data.weapon;
  });

  socket.on('shoot', (data) => {
    const p = gameState.players.get(socket.id);
    if (!p || p.isDead || p.isDowned) return;

    const now = Date.now();
    const minFireRate = data.weapon === 'ak47' ? 
      (GAME_CONFIG.AK47_FIRE_RATE * (1 - (p.akFireRateBonus || 0) * 0.25)) * 1000 :
      GAME_CONFIG.PISTOL_FIRE_RATE * 1000;
    
    // Rate limit
    if (now - p.lastShootTime < minFireRate - 20) return;
    p.lastShootTime = now;

    // Validate ammo
    if (data.weapon === 'ak47') {
      if (p.magazineAK <= 0) return;
      p.magazineAK--;
    } else {
      if (p.pistolMagazine <= 0) return;
      p.pistolMagazine--;
    }

    // Process hit
    if (data.hit && data.zombieId) {
      const zombie = gameState.zombies.get(data.zombieId);
      if (zombie && zombie.state !== 'dead') {
        // Validate hit (check distance from origin to zombie)
        const range = data.weapon === 'ak47' ? GAME_CONFIG.AK47_RANGE : GAME_CONFIG.PISTOL_RANGE;
        const hitDist = distance2D(data.fromX, data.fromZ, zombie.x, zombie.z);
        
        if (hitDist <= range) {
          let damage = data.weapon === 'ak47' ?
            GAME_CONFIG.AK47_DAMAGE * (1 + (p.akDamageBonus || 0) * 0.2) :
            GAME_CONFIG.PISTOL_DAMAGE * (1 + (p.pistolDamageBonus || 0) * 0.2);
          if (p.doubleDamage) damage *= 2;
          
          const killed = damageZombie(data.zombieId, damage, socket.id);
          if (killed) {
            onZombieKilled(data.zombieId, socket.id);
          }
          
          socket.emit('hitConfirmed', { zombieId: data.zombieId });
        }
      }
    }

    // Broadcast muzzle flash to others
    socket.broadcast.emit('playerShot', {
      playerId: socket.id,
      fromX: data.fromX, fromY: data.fromY, fromZ: data.fromZ,
      toX: data.toX, toY: data.toY, toZ: data.toZ,
      weapon: data.weapon,
    });

    // Send state back
    socket.emit('ammoUpdate', {
      magazineAK: p.magazineAK,
      ammoAK: p.ammoAK,
      pistolMagazine: p.pistolMagazine,
    });
  });

  socket.on('reload', () => {
    const p = gameState.players.get(socket.id);
    if (!p || p.isReloading) return;
    if (p.weapon === 'ak47') {
      if (p.ammoAK <= 0 || p.magazineAK >= GAME_CONFIG.AK47_MAGAZINE) return;
      p.isReloading = true;
      setTimeout(() => {
        if (!gameState.players.has(socket.id)) return;
        const maxMag = GAME_CONFIG.AK47_MAGAZINE + Math.floor((p.akMagazineBonus || 0) * 10);
        const needed = maxMag - p.magazineAK;
        const amt = Math.min(needed, p.ammoAK);
        p.magazineAK += amt;
        p.ammoAK -= amt;
        p.isReloading = false;
        socket.emit('ammoUpdate', { magazineAK: p.magazineAK, ammoAK: p.ammoAK, pistolMagazine: p.pistolMagazine });
      }, GAME_CONFIG.AK47_RELOAD_TIME * 1000);
    }
  });

  socket.on('interact', (data) => {
    const p = gameState.players.get(socket.id);
    if (!p || p.isDead || p.isDowned) return;

    if (data.type === 'vending_ammo') {
      if (p.money < GAME_CONFIG.VENDING_AMMO_COST) {
        socket.emit('notification', `❌ Мало денег ($${GAME_CONFIG.VENDING_AMMO_COST})`);
        return;
      }
      p.money -= GAME_CONFIG.VENDING_AMMO_COST;
      const ammo = Math.floor(Math.random() * 11);
      p.ammoAK = Math.min(GAME_CONFIG.AK47_AMMO_MAX, p.ammoAK + ammo);
      socket.emit('notification', `🔫 Получено ${ammo} патронов`);
      socket.emit('playerUpdate', { money: p.money, ammoAK: p.ammoAK });
    } else if (data.type === 'vending_medkit') {
      if (p.money < GAME_CONFIG.VENDING_MEDKIT_COST) {
        socket.emit('notification', `❌ Мало денег ($${GAME_CONFIG.VENDING_MEDKIT_COST})`);
        return;
      }
      if (p.hp >= p.maxHp) { socket.emit('notification', '❌ HP полное!'); return; }
      p.money -= GAME_CONFIG.VENDING_MEDKIT_COST;
      p.hp = Math.min(p.maxHp, p.hp + GAME_CONFIG.MEDKIT_HEAL);
      socket.emit('notification', `💊 +${GAME_CONFIG.MEDKIT_HEAL} HP`);
      socket.emit('playerUpdate', { money: p.money, hp: p.hp });
    } else if (data.type === 'mystery_box') {
      if (!gameState.mysteryBoxAvailable) { socket.emit('notification', 'Коробка перезаряжается...'); return; }
      if (p.money < GAME_CONFIG.MYSTERY_BOX_COST) {
        socket.emit('notification', `❌ Мало денег ($${GAME_CONFIG.MYSTERY_BOX_COST})`);
        return;
      }
      p.money -= GAME_CONFIG.MYSTERY_BOX_COST;
      gameState.mysteryBoxAvailable = false;
      const roll = Math.random();
      let upgrade = '';
      if (roll < 0.33) {
        if (p.weapon === 'ak47') { p.akDamageBonus = (p.akDamageBonus || 0) + 1; upgrade = 'AK-47: Урон +20%'; }
        else { p.pistolDamageBonus = (p.pistolDamageBonus || 0) + 1; upgrade = 'Пистолет: Урон +20%'; }
      } else if (roll < 0.66) {
        if (p.weapon === 'ak47') { p.akFireRateBonus = (p.akFireRateBonus || 0) + 1; upgrade = 'AK-47: Скорострельность +25%'; }
        else { p.pistolFireRateBonus = (p.pistolFireRateBonus || 0) + 1; upgrade = 'Пистолет: Скорость +25%'; }
      } else {
        if (p.weapon === 'ak47') { p.akMagazineBonus = (p.akMagazineBonus || 0) + 1; upgrade = 'AK-47: Магазин +10'; }
        else { upgrade = 'Пистолет: Магазин +4'; }
      }
      socket.emit('notification', `✨ УЛУЧШЕНИЕ: ${upgrade}`);
      socket.emit('playerUpdate', { money: p.money, akDamageBonus: p.akDamageBonus, akFireRateBonus: p.akFireRateBonus });
      setTimeout(() => { gameState.mysteryBoxAvailable = true; io.emit('mysteryBoxReady'); }, 30000);
    } else if (data.type && data.type.startsWith('trap_')) {
      const trapId = data.type.replace('trap_', '');
      const trap = gameState.traps.find(t => t.id === trapId);
      if (!trap) return;
      if (trap.active) { socket.emit('notification', `Ловушка активна (${trap.timer.toFixed(0)}с)`); return; }
      if (p.money < GAME_CONFIG.TRAP_COST) {
        socket.emit('notification', `❌ Нужно $${GAME_CONFIG.TRAP_COST}`);
        return;
      }
      p.money -= GAME_CONFIG.TRAP_COST;
      trap.active = true;
      trap.timer = GAME_CONFIG.TRAP_DURATION;
      trap.tickTimer = 0;
      io.emit('trapActivated', { id: trap.id, type: trap.type, x: trap.x, z: trap.z });
      socket.emit('notification', `⚡ Ловушка активирована на ${GAME_CONFIG.TRAP_DURATION}с!`);
      socket.emit('playerUpdate', { money: p.money });
    } else if (data.type === 'revive') {
      const target = gameState.players.get(data.targetId);
      if (!target || !target.isDowned) return;
      target.isDowned = false;
      target.hp = GAME_CONFIG.REVIVE_HEALTH;
      io.to(data.targetId).emit('playerRevived', { hp: GAME_CONFIG.REVIVE_HEALTH });
      io.emit('playerRevivedBroadcast', { playerId: data.targetId });
      socket.emit('notification', `✅ Вы реанимировали ${target.name}`);
    } else if (data.type === 'pickup') {
      const drop = gameState.dropItems.get(data.itemId);
      if (!drop) return;
      if (drop.type === 'medkit') {
        p.hp = Math.min(p.maxHp, p.hp + GAME_CONFIG.MEDKIT_HEAL);
        socket.emit('notification', `+${GAME_CONFIG.MEDKIT_HEAL} HP`);
        socket.emit('playerUpdate', { hp: p.hp });
      }
      gameState.dropItems.delete(data.itemId);
      io.emit('dropRemoved', { id: data.itemId });
    }
  });

  socket.on('disconnect', () => {
    console.log(`[-] Player disconnected: ${socket.id}`);
    gameState.players.delete(socket.id);
    io.emit('playerLeft', { playerId: socket.id });

    // If no players left, reset game
    if (gameState.players.size === 0) {
      console.log('[!] No players left. Resetting game...');
      gameState.phase = 'waiting';
      gameState.wave = 0;
      gameState.zombies.clear();
      gameState.acidPools.clear();
      gameState.dropItems.clear();
      gameState.spawnQueue = [];
      gameState.zombiesAlive = 0;
      gameState.bossId = null;
      gameState.traps.forEach(t => { t.active = false; t.timer = 0; });
    }
  });
});

// Start game tick
setInterval(gameTick, 1000 / TICK_RATE);

// =================== NGROK ===================
async function startNgrok() {
  try {
    const ngrok = require('ngrok');
    await ngrok.authtoken(NGROK_TOKEN);
    const url = await ngrok.connect({
      addr: PORT,
      proto: 'http',
    });
    console.log('\n╔════════════════════════════════════════╗');
    console.log('║    ZOMBIE HORDE — MULTIPLAYER SERVER   ║');
    console.log('╠════════════════════════════════════════╣');
    console.log(`║ Local:  http://localhost:${PORT}          ║`);
    console.log(`║ Public: ${url.padEnd(32)} ║`);
    console.log('╚════════════════════════════════════════╝');
    console.log('\nShare the PUBLIC URL with friends!\n');
  } catch (err) {
    console.warn('\n[ngrok] Failed to create tunnel:', err.message);
    console.log(`\n✓ Server running at http://localhost:${PORT}\n`);
  }
}

// =================== START ===================
httpServer.listen(PORT, '0.0.0.0', async () => {
  console.log(`\n🧟 Zombie Horde Server starting on port ${PORT}...`);
  await startNgrok();
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n[!] Shutting down server...');
  try { require('ngrok').kill(); } catch (e) { /* ignore */ }
  process.exit(0);
});
