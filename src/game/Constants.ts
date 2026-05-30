// Game Constants

export const GAME_CONFIG = {
  // Map
  MAP_SIZE: 120,
  
  // Player
  PLAYER_SPEED: 8,
  PLAYER_SPRINT_MULT: 1.6,
  PLAYER_CROUCH_MULT: 0.5,
  PLAYER_HEIGHT: 1.8,
  PLAYER_CROUCH_HEIGHT: 1.1,
  PLAYER_MAX_HEALTH: 100,
  JUMP_FORCE: 8,
  GRAVITY: -20,
  
  // Weapons
  AK47: {
    DAMAGE: 35,
    FIRE_RATE: 0.1, // seconds between shots
    RANGE: 200,
    AUTOMATIC: true,
    MAGAZINE: 30,
    RELOAD_TIME: 2.0,
    SPREAD: 0.03,
    AMMO_START: 90,
    AMMO_MAX: 210,
  },
  PISTOL: {
    DAMAGE: 20,
    FIRE_RATE: 0.4,
    RANGE: 150,
    AUTOMATIC: false,
    MAGAZINE: 12,
    RELOAD_TIME: 1.2,
    SPREAD: 0.02,
  },
  
  // Zombies
  ZOMBIE_NORMAL: {
    SPEED: 3.5,
    HEALTH: 100,
    DAMAGE: 15,
    ATTACK_RANGE: 1.8,
    ATTACK_RATE: 1.0,
    KILL_REWARD: 10,
  },
  ZOMBIE_EXPLOSIVE: {
    SPEED: 4.0,
    HEALTH: 80,
    DAMAGE: 60,
    EXPLODE_RANGE: 5,
    KILL_REWARD: 20,
  },
  ZOMBIE_ACID: {
    SPEED: 3.0,
    HEALTH: 120,
    DAMAGE: 8,
    ATTACK_RANGE: 12,
    ATTACK_RATE: 2.5,
    KILL_REWARD: 25,
    ACID_DAMAGE: 5, // per tick
    ACID_DURATION: 5,
    POOL_RADIUS: 2.5,
  },
  BOSS: {
    SPEED: 5.0,
    HEALTH: 3000,
    DAMAGE: 40,
    ATTACK_RANGE: 3.0,
    SHOCKWAVE_RANGE: 12,
    SHOCKWAVE_DAMAGE: 35,
    RUSH_DAMAGE: 50,
    TOXIC_DAMAGE: 20,
    KILL_REWARD: 200,
  },
  
  // Economy
  VENDING_AMMO_COST: 50,
  VENDING_MEDKIT_COST: 100,
  MYSTERY_BOX_COST: 200,
  TRAP_COST: 300,
  MEDKIT_HEAL: 30,
  DROP_MEDKIT_CHANCE: 0.1,
  
  // Waves
  MAX_WAVES: 10,
  WAVE_BETWEEN_DELAY: 5,
  
  // Combo
  COMBO_SPEED_THRESHOLD: 5,
  COMBO_DAMAGE_THRESHOLD: 10,
  COMBO_CLEAR_THRESHOLD: 15,
  COMBO_SPEED_DURATION: 10,
  COMBO_DAMAGE_DURATION: 10,
  
  // Downed
  DOWNED_DURATION: 15,
  REVIVE_TIME: 3,
  REVIVE_HEALTH: 50,
  RESPAWN_DELAY: 10,
  
  // Trap
  TRAP_DURATION: 20,
  TRAP_DAMAGE: 15, // per tick
  TRAP_TICK: 0.5,
  TRAP_RADIUS: 8,
  
  // Network
  SYNC_RATE: 20, // Hz
  INTERP_DELAY: 100, // ms
};

export const WAVE_CONFIG = [
  // wave 1-10: { normalCount, explosiveCount, acidCount }
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

export const ZOMBIE_HP_SCALE = [1, 1.1, 1.2, 1.35, 1.5, 1.7, 1.9, 2.2, 2.5, 3.0];
export const ZOMBIE_DMG_SCALE = [1, 1.1, 1.15, 1.2, 1.3, 1.4, 1.5, 1.6, 1.8, 2.0];
export const ZOMBIE_SPD_SCALE = [1, 1.05, 1.1, 1.15, 1.2, 1.25, 1.3, 1.35, 1.4, 1.5];
