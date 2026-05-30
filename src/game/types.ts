// ============================================================
// TYPE DEFINITIONS — Zombie Horde
// ============================================================

export interface Vec3 { x: number; y: number; z: number; }
export interface AABB { min: Vec3; max: Vec3; }

export interface WeaponUpgrade {
  damage: number;   // multiplier e.g. 1.0 = base
  fireRate: number; // multiplier
  magSize: number;  // multiplier
}

export interface PlayerState {
  id: string;
  name: string;
  color: number;
  position: Vec3;
  rotation: number;
  hp: number;
  maxHp: number;
  isDown: boolean;
  isDead: boolean;
  isSprinting: boolean;
  isCrouching: boolean;
  weapon: 'ak47' | 'pistol';
  ammoAkReserve: number;
  money: number;
  kills: number;
  streak: number;
  grenadeCount: number;
  boosted: boolean;
  boostType: string;
  boostTimer: number;
  weaponUpgrades: {
    ak47: WeaponUpgrade;
    pistol: WeaponUpgrade;
  };
  barricadeCount: number;
  downTimer: number;
  respawnTimer: number;
}

export interface ZombieState {
  id: string;
  type: string;
  position: Vec3;
  hp: number;
  maxHp: number;
  isAlive: boolean;
  modifiers?: string[];
  attackTimer?: number;
  attackCooldown?: number;
  attackPhase?: string;
  chargeTarget?: Vec3 | null;
  meleeTimer?: number;
  regenTimer?: number;
  teleportTimer?: number;
  summonTimer?: number;
  aiTimer?: number;
  damageMult?: number;
  speedMult?: number;
  armorMult?: number;
}

export interface AcidPool {
  id: string;
  position: Vec3;
  radius: number;
  timer: number;
  damageTimer?: number;
}

export interface Barricade {
  id: string;
  ownerId: string;
  position: Vec3;
  hp: number;
  maxHp: number;
}

export interface Trap {
  id: number;
  position: Vec3;
  active: boolean;
  timer: number;
  type: 'electric' | 'flamethrower';
  damageTimer: number;
}

export interface CollisionBox {
  aabb: AABB;
  isSolid: boolean;
}

export type GamePhase = 'menu' | 'waiting' | 'combat' | 'intermission' | 'victory' | 'defeat';
