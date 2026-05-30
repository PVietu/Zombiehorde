// Game Types and Interfaces

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface AABB {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

export interface PlayerState {
  id: string;
  name: string;
  position: Vector3;
  rotation: number;
  health: number;
  maxHealth: number;
  ammoAK: number;
  maxAmmoAK: number;
  magazineAK: number;
  maxMagazineAK: number;
  ammoPistol: number;
  currentWeapon: 'ak47' | 'pistol';
  money: number;
  kills: number;
  isDowned: number; // 0 = alive, >0 = timestamp when downed
  isDead: boolean;
  combo: number;
  comboTimer: number;
  speedBoost: boolean;
  speedBoostTimer: number;
  doubleDamage: boolean;
  doubleDamageTimer: number;
  isReloading: boolean;
  reloadTimer: number;
  isSprinting: boolean;
  isCrouching: boolean;
  isAiming: boolean;
  akDamageBonus: number;
  akFireRateBonus: number;
  akMagazineBonus: number;
  pistolDamageBonus: number;
  pistolFireRateBonus: number;
}

export interface ZombieState {
  id: string;
  type: 'normal' | 'explosive' | 'acid' | 'boss';
  position: Vector3;
  rotation: number;
  health: number;
  maxHealth: number;
  targetId: string | null;
  state: 'idle' | 'chase' | 'attack' | 'dead' | 'exploding';
  damageContrib: Record<string, number>;
  wave: number;
  // Boss specific
  bossAttackState?: 'shockwave' | 'rush' | 'toxic' | 'none';
  bossAttackTimer?: number;
  rushTarget?: Vector3;
}

export interface AcidPool {
  id: string;
  position: Vector3;
  timer: number;
  radius: number;
}

export interface TrapState {
  id: string;
  position: Vector3;
  active: boolean;
  timer: number;
  type: 'electric' | 'flamethrower';
}

export interface VendingMachine {
  id: string;
  position: Vector3;
}

export interface MysteryBox {
  position: Vector3;
  available: boolean;
}

export interface GameState {
  phase: 'menu' | 'playing' | 'wave_complete' | 'game_over' | 'victory';
  wave: number;
  maxWaves: number;
  players: Record<string, PlayerState>;
  zombies: Record<string, ZombieState>;
  acidPools: AcidPool[];
  traps: TrapState[];
  waveTimer: number;
  bossSpawned: boolean;
}

export interface NetworkPlayer {
  id: string;
  name: string;
  position: Vector3;
  rotation: number;
  health: number;
  isDowned: number;
  isDead: boolean;
  currentWeapon: 'ak47' | 'pistol';
  isCrouching: boolean;
  kills: number;
  money: number;
}

export interface BulletHit {
  zombieId: string;
  damage: number;
  shooterId: string;
}

export interface WeaponConfig {
  damage: number;
  fireRate: number;
  range: number;
  automatic: boolean;
  magazineSize: number;
  reloadTime: number;
  spread: number;
}
