// ============================================================
// GAME CONSTANTS
// ============================================================

export const GAME_CONSTANTS = {
  // Map dimensions
  MAP_SIZE: 120,
  GROUND_Y: 0,

  // Player stats
  PLAYER_SPEED: 8,
  PLAYER_SPRINT_MULT: 1.6,
  PLAYER_CROUCH_MULT: 0.5,
  PLAYER_MAX_HP: 100,
  PLAYER_JUMP_FORCE: 8,
  PLAYER_HEIGHT: 1.8,
  PLAYER_RADIUS: 0.4,

  // Weapons
  AK47_DAMAGE_BASE: 35,
  AK47_FIRE_RATE: 0.1,  // seconds between shots
  AK47_MAG_SIZE: 30,
  AK47_MAX_AMMO: 210,
  AK47_RELOAD_TIME: 2.0,
  AK47_RANGE: 200,

  PISTOL_DAMAGE_BASE: 25,
  PISTOL_FIRE_RATE: 0.4,
  PISTOL_RANGE: 150,

  // Grenades
  GRENADE_DAMAGE: 120,
  GRENADE_RADIUS: 8,
  GRENADE_FUSE: 2.0,

  // Zombies
  ZOMBIE_TYPES: {
    normal: {
      speed: 2.5, hp: 80, damage: 10, reward: 10, color: 0x2a7a2a,
      attackRange: 1.5, attackRate: 1.0, scale: 1.0
    },
    exploder: {
      speed: 3.2, hp: 60, damage: 80, reward: 20, color: 0xaa4400,
      attackRange: 2.5, attackRate: 0.5, scale: 1.1
    },
    acid: {
      speed: 2.0, hp: 70, damage: 15, reward: 25, color: 0x44aa00,
      attackRange: 15, attackRate: 2.0, scale: 0.9
    },
    boss: {
      speed: 4.0, hp: 3000, damage: 40, reward: 200, color: 0x550055,
      attackRange: 5, attackRate: 2.0, scale: 3.0
    }
  },

  // Waves config [count, hpMult, speedMult, damageMult]
  WAVES: [
    { count: 6,  hpMult: 1.0, speedMult: 1.0, damageMult: 1.0 },
    { count: 8,  hpMult: 1.1, speedMult: 1.05, damageMult: 1.1 },
    { count: 10, hpMult: 1.2, speedMult: 1.1, damageMult: 1.15 },
    { count: 12, hpMult: 1.35, speedMult: 1.15, damageMult: 1.2 },
    { count: 15, hpMult: 1.5, speedMult: 1.2, damageMult: 1.3 },
    { count: 18, hpMult: 1.7, speedMult: 1.25, damageMult: 1.4 },
    { count: 20, hpMult: 2.0, speedMult: 1.3, damageMult: 1.5 },
    { count: 22, hpMult: 2.3, speedMult: 1.35, damageMult: 1.6 },
    { count: 25, hpMult: 2.7, speedMult: 1.4, damageMult: 1.7 },
    { count: 30, hpMult: 3.5, speedMult: 1.5, damageMult: 2.0, hasBoss: true },
  ],

  // Economy
  VENDING_AMMO_COST: 50,
  VENDING_HEALTH_COST: 100,
  VENDING_BOOST_COST: 150,
  VENDING_GRENADE_COST: 200,
  MYSTERY_BOX_COST: 200,
  BARRICADE_COST: 100,
  TRAP_COST: 300,
  MAX_BARRICADES: 3,

  // Physics
  GRAVITY: -20,
  ACID_POOL_DAMAGE: 8,   // per second
  ACID_POOL_DURATION: 8, // seconds
  TRAP_DURATION: 20,
  TRAP_DAMAGE: 15,       // per tick

  // Kill streak
  STREAK_SPEED_THRESHOLD: 5,
  STREAK_DAMAGE_THRESHOLD: 10,
  STREAK_CLEANSE_THRESHOLD: 15,

  // Network
  SYNC_RATE: 20, // Hz
  INTERPOLATION_DELAY: 100, // ms

  // Revive
  REVIVE_TIME: 3.0,
  DOWN_TIMER: 15,
  RESPAWN_TIME: 10,
} as const;
