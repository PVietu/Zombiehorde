// ============================================================
// GAME CONSTANTS — Zombie Horde
// ============================================================

export const GAME_CONSTANTS = {
  // Map
  MAP_SIZE: 120,
  GROUND_Y: 0,

  // Player
  PLAYER_SPEED: 8,
  PLAYER_SPRINT_MULT: 1.6,
  PLAYER_CROUCH_MULT: 0.5,
  PLAYER_MAX_HP: 100,
  PLAYER_JUMP_FORCE: 8,
  PLAYER_HEIGHT: 1.8,
  PLAYER_RADIUS: 0.4,

  // Weapons
  AK47_DAMAGE_BASE: 35,
  AK47_FIRE_RATE: 0.1,
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

  // Zombie types
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
    miniboss: {
      speed: 3.0, hp: 300, damage: 20, reward: 100, color: 0x8800aa,
      attackRange: 2.0, attackRate: 1.2, scale: 1.6
    },
    boss: {
      speed: 4.0, hp: 3000, damage: 40, reward: 200, color: 0x550055,
      attackRange: 5, attackRate: 2.0, scale: 3.0
    }
  } as Record<string, { speed: number; hp: number; damage: number; reward: number; color: number; attackRange: number; attackRate: number; scale: number }>,

  // Waves [count, hpMult, speedMult, damageMult, hasBoss]
  WAVES: [
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
  ],

  // Miniboss modifiers
  MINIBOSS_MODIFIERS: ['giant', 'fast', 'toxic', 'armored', 'regen', 'explosive', 'teleporter', 'summoner'] as const,

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
  ACID_POOL_DAMAGE: 8,
  ACID_POOL_DURATION: 8,
  TRAP_DURATION: 20,
  TRAP_DAMAGE: 15,

  // Kill streak
  STREAK_SPEED_THRESHOLD: 5,
  STREAK_DAMAGE_THRESHOLD: 10,
  STREAK_CLEANSE_THRESHOLD: 15,

  // Network
  SYNC_RATE: 20,
  INTERPOLATION_DELAY: 100,

  // Revive
  REVIVE_TIME: 3.0,
  DOWN_TIMER: 15,
  RESPAWN_TIME: 10,

  // Corpse
  CORPSE_FADE_TIME: 5.0,
} as const;
