// ============================================================
// GAME TYPES
// ============================================================

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface AABB {
  min: Vec3;
  max: Vec3;
}

export interface PlayerState {
  id: string;
  name: string;
  position: Vec3;
  rotation: number;  // Y rotation
  hp: number;
  maxHp: number;
  ammoAk: number;
  ammoAkReserve: number;
  money: number;
  kills: number;
  weapon: 'ak47' | 'pistol';
  isDown: boolean;
  isDead: boolean;
  downTimer: number;
  isSprinting: boolean;
  isCrouching: boolean;
  streak: number;
  boosted: boolean;
  boostType: string;
  boostTimer: number;
  weaponUpgrades: WeaponUpgrades;
  barricadeCount: number;
  grenadeCount: number;
  color: number;
}

export interface WeaponUpgrades {
  ak47: { damage: number; fireRate: number; magSize: number };
  pistol: { damage: number; fireRate: number; magSize: number };
}

export interface ZombieState {
  id: string;
  type: 'normal' | 'exploder' | 'acid' | 'boss';
  position: Vec3;
  hp: number;
  maxHp: number;
  targetId: string | null;
  isAlive: boolean;
  rotation: number;
  animState: string;
  damageMap: Record<string, number>; // playerId -> total damage dealt
}

export interface BulletData {
  shooterId: string;
  origin: Vec3;
  direction: Vec3;
  weapon: 'ak47' | 'pistol';
  damage: number;
}

export interface AcidProjectile {
  id: string;
  position: Vec3;
  velocity: Vec3;
  zombieId: string;
}

export interface AcidPool {
  id: string;
  position: Vec3;
  radius: number;
  timer: number;
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
}

export interface MysteryBox {
  position: Vec3;
  active: boolean;
}

export interface GameStateData {
  wave: number;
  phase: 'waiting' | 'combat' | 'intermission' | 'victory' | 'defeat';
  zombies: ZombieState[];
  players: PlayerState[];
  acidPools: AcidPool[];
  barricades: Barricade[];
  traps: Trap[];
  mysteryBox: MysteryBox;
  timer: number;
  waveCountdown: number;
}

export interface HitResult {
  hit: boolean;
  zombieId?: string;
  damage?: number;
}

export type ZombieType = 'normal' | 'exploder' | 'acid' | 'boss';
