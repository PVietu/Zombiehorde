// LocalGame - Complete single-player / local multiplayer game logic

import { Physics } from './Physics';
import { EntityManager } from './EntityManager';
import { UIManager } from './UIManager';
import { InputManager } from './InputManager';
import { MapBuilder } from './MapBuilder';
import { GAME_CONFIG, WAVE_CONFIG, ZOMBIE_HP_SCALE, ZOMBIE_DMG_SCALE, ZOMBIE_SPD_SCALE } from './Constants';

declare const THREE: any;

let zombieCounter = 0;
let dropCounter = 0;

function genId() { return `z_${++zombieCounter}_${Date.now()}`; }
function genDropId() { return `d_${++dropCounter}`; }

interface Zombie {
  id: string;
  type: 'normal' | 'explosive' | 'acid' | 'boss';
  x: number;
  y: number;
  z: number;
  rot: number;
  hp: number;
  maxHp: number;
  damage: number;
  speed: number;
  attackRange: number;
  attackTimer: number;
  attackRate: number;
  state: 'chase' | 'attack' | 'dead' | 'exploding';
  reward: number;
  // Acid
  projectileTimer?: number;
  // Boss
  bossAttackTimer?: number;
  bossPhase?: 'none' | 'shockwave' | 'rush' | 'toxic';
  bossPhaseTimer?: number;
  rushTarget?: { x: number; z: number };
  minionsSpawned?: boolean;
}

interface Player {
  id: string;
  x: number;
  y: number;
  z: number;
  velY: number;
  onGround: boolean;
  hp: number;
  maxHp: number;
  ammoAK: number;
  magazineAK: number;
  maxMagazineAK: number;
  maxAmmoAK: number;
  weapon: 'ak47' | 'pistol';
  money: number;
  kills: number;
  isReloading: boolean;
  reloadTimer: number;
  reloadTotalTime: number;
  fireTimer: number;
  isDowned: boolean;
  downedTimer: number;
  isDead: boolean;
  respawnTimer: number;
  combo: number;
  comboTimer: number;
  speedBoost: boolean;
  speedBoostTimer: number;
  doubleDamage: boolean;
  doubleDamageTimer: number;
  akDamageBonus: number;
  akFireRateBonus: number;
  akMagazineBonus: number;
  pistolDamageBonus: number;
  pistolFireRateBonus: number;
  pistolMagazinePistol: number;
  pistolMagazineMax: number;
  pistolMagazine: number;
  isSprinting: boolean;
  isCrouching: boolean;
}

interface AcidProjectile {
  id: string;
  x: number;
  y: number;
  z: number;
  velX: number;
  velY: number;
  velZ: number;
  damage: number;
}

interface AcidPool {
  id: string;
  x: number;
  z: number;
  timer: number;
  radius: number;
  damage: number;
  tickTimer: number;
}

interface DropItem {
  id: string;
  x: number;
  z: number;
  type: 'medkit';
  timer: number;
}

interface TrapState {
  id: string;
  x: number;
  z: number;
  type: 'electric' | 'flamethrower';
  active: boolean;
  timer: number;
  tickTimer: number;
  radius: number;
}

export class LocalGame {
  private scene: any;
  private camera: any;
  private renderer: any;
  private physics: Physics;
  private entities: EntityManager;
  private ui: UIManager;
  private input: InputManager;
  private mapBuilder: MapBuilder;

  // Game state
  private player: Player;
  private zombies: Map<string, Zombie> = new Map();
  private acidProjectiles: AcidProjectile[] = [];
  private acidPools: AcidPool[] = [];
  private dropItems: Map<string, DropItem> = new Map();
  private traps: TrapState[] = [];

  private wave = 0;
  private gamePhase: 'menu' | 'playing' | 'between_waves' | 'game_over' | 'victory' = 'menu';
  private zombiesAlive = 0;
  private zombiesToSpawn = 0;
  private spawnQueue: Array<{ type: Zombie['type']; delay: number }> = [];
  private spawnTimer = 0;
  private bossId: string | null = null;

  // Camera
  private camYaw = 0;
  private camPitch = 0;
  private camPitchMax = Math.PI / 2.2;
  private headBob = 0;
  private headBobVel = 0;
  private weaponBob = 0;

  // Weapon models (first person)
  private weaponGroup: any;
  private ak47Mesh: any;
  private pistolMesh: any;

  private animFrameId = 0;
  private lastTime = 0;
  private destroyed = false;

  // Interaction
  private interactTarget: string | null = null;

  // Mystery box
  private mysteryBoxAvailable = true;

  // Spawns
  private playerSpawns: Array<{ x: number; z: number }> = [];
  private zombieSpawnPoints: Array<{ x: number; z: number }> = [];

  // Tab leaderboard
  private tabDown = false;

  constructor(ui: UIManager) {
    this.ui = ui;
    this.physics = new Physics();
    this.setupRenderer();
    this.setupScene();
    this.setupCamera();
    const container = document.getElementById('game-root') || document.body;
    this.entities = new EntityManager(this.scene);
    this.input = new InputManager(container);
    this.mapBuilder = new MapBuilder(this.scene);

    this.player = this.createPlayer();
  }

  private createPlayer(): Player {
    return {
      id: 'local',
      x: 0, y: 0, z: 0,
      velY: 0, onGround: true,
      hp: GAME_CONFIG.PLAYER_MAX_HEALTH,
      maxHp: GAME_CONFIG.PLAYER_MAX_HEALTH,
      ammoAK: GAME_CONFIG.AK47.AMMO_START,
      magazineAK: GAME_CONFIG.AK47.MAGAZINE,
      maxMagazineAK: GAME_CONFIG.AK47.MAGAZINE,
      maxAmmoAK: GAME_CONFIG.AK47.AMMO_MAX,
      weapon: 'ak47' as const,
      money: 0,
      kills: 0,
      isReloading: false,
      reloadTimer: 0,
      reloadTotalTime: GAME_CONFIG.AK47.RELOAD_TIME,
      fireTimer: 0,
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
      akDamageBonus: 0,
      akFireRateBonus: 0,
      akMagazineBonus: 0,
      pistolDamageBonus: 0,
      pistolFireRateBonus: 0,
      pistolMagazinePistol: 12,
      pistolMagazineMax: 12,
      pistolMagazine: 12,
      isSprinting: false,
      isCrouching: false,
    };
  }

  private setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputEncoding = THREE.sRGBEncoding;

    const container = document.getElementById('game-root') || document.body;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.position = 'absolute';
    this.renderer.domElement.style.top = '0';
    this.renderer.domElement.style.left = '0';
    this.renderer.domElement.style.zIndex = '1';

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }

  private setupScene() {
    this.scene = new THREE.Scene();
  }

  private setupCamera() {
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500);
    this.camera.position.set(0, 1.6, 0);
  }

  private buildMap() {
    const result = this.mapBuilder.build();
    this.physics.setCollisionObjects(result.collisionObjects);
    this.zombieSpawnPoints = result.spawnPoints;
    this.playerSpawns = result.playerSpawns;
  }

  private buildWeaponModels() {
    this.weaponGroup = new THREE.Group();
    this.camera.add(this.weaponGroup);
    this.scene.add(this.camera);

    // AK-47 model
    this.ak47Mesh = new THREE.Group();
    // Body
    const bodyGeo = new THREE.BoxGeometry(0.06, 0.08, 0.5);
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x2a2a2a });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    this.ak47Mesh.add(body);
    // Stock
    const stockGeo = new THREE.BoxGeometry(0.05, 0.06, 0.2);
    const stockMat = new THREE.MeshLambertMaterial({ color: 0x5a3a1a });
    const stock = new THREE.Mesh(stockGeo, stockMat);
    stock.position.set(0, -0.01, -0.3);
    this.ak47Mesh.add(stock);
    // Barrel
    const barrelGeo = new THREE.BoxGeometry(0.03, 0.03, 0.25);
    const barrel = new THREE.Mesh(barrelGeo, bodyMat);
    barrel.position.set(0, 0.01, 0.37);
    this.ak47Mesh.add(barrel);
    // Magazine
    const magGeo = new THREE.BoxGeometry(0.04, 0.14, 0.06);
    const magMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
    const mag = new THREE.Mesh(magGeo, magMat);
    mag.position.set(0, -0.1, 0.05);
    mag.rotation.x = 0.15;
    this.ak47Mesh.add(mag);
    // Iron sights
    const sightFGeo = new THREE.BoxGeometry(0.03, 0.04, 0.02);
    const sightF = new THREE.Mesh(sightFGeo, new THREE.MeshLambertMaterial({ color: 0x111111 }));
    sightF.position.set(0, 0.055, 0.33);
    this.ak47Mesh.add(sightF);

    this.ak47Mesh.position.set(0.18, -0.18, -0.35);
    this.ak47Mesh.rotation.y = 0.05;
    this.weaponGroup.add(this.ak47Mesh);

    // Pistol model
    this.pistolMesh = new THREE.Group();
    const pgBody = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, 0.12, 0.2),
      new THREE.MeshLambertMaterial({ color: 0x3a3a3a })
    );
    this.pistolMesh.add(pgBody);
    const pgGrip = new THREE.Mesh(
      new THREE.BoxGeometry(0.04, 0.12, 0.08),
      new THREE.MeshLambertMaterial({ color: 0x1a1a1a })
    );
    pgGrip.position.set(0, -0.12, -0.05);
    pgGrip.rotation.x = 0.2;
    this.pistolMesh.add(pgGrip);
    const pgBarrel = new THREE.Mesh(
      new THREE.BoxGeometry(0.03, 0.03, 0.12),
      new THREE.MeshLambertMaterial({ color: 0x222222 })
    );
    pgBarrel.position.set(0, 0.01, 0.16);
    this.pistolMesh.add(pgBarrel);

    this.pistolMesh.position.set(0.15, -0.2, -0.32);
    this.pistolMesh.visible = false;
    this.weaponGroup.add(this.pistolMesh);
  }

  start() {
    this.ui.createHUD();
    this.buildMap();
    this.buildWeaponModels();
    this.setupInteractions();

    // Spawn player
    const spawn = this.playerSpawns[0] || { x: 0, z: 0 };
    this.player.x = spawn.x;
    this.player.z = spawn.z;
    this.player.y = 0;

    this.gamePhase = 'playing';
    this.startWave(1);

    this.input.setOnLockChange((_locked) => {
      // Show/hide cursor
    });
    this.input.requestPointerLock();

    this.lastTime = performance.now();
    this.animate();
  }

  private setupInteractions() {
    // Play again buttons
    document.getElementById('btn-play-again')?.addEventListener('click', () => this.restartGame());
    document.getElementById('btn-play-again-go')?.addEventListener('click', () => this.restartGame());
  }

  private restartGame() {
    // Remove old zombies
    this.zombies.forEach((_, id) => {
      this.entities.removeZombie(id);
    });
    this.zombies.clear();
    this.dropItems.forEach((_, id) => this.entities.removeDropItem(id));
    this.dropItems.clear();
    this.acidPools.forEach(p => this.entities.removeAcidPool(p.id));
    this.acidPools = [];
    this.traps.forEach(t => this.entities.removeTrapEffect(t.id));

    // Reset player
    const p = this.player;
    p.hp = p.maxHp;
    p.ammoAK = GAME_CONFIG.AK47.AMMO_START;
    p.magazineAK = GAME_CONFIG.AK47.MAGAZINE;
    p.money = 0;
    p.kills = 0;
    p.isDead = false;
    p.isDowned = false;
    p.weapon = 'ak47';
    p.combo = 0;
    p.speedBoost = false;
    p.doubleDamage = false;
    p.x = 0; p.y = 0; p.z = 0;

    this.mysteryBoxAvailable = true;
    this.bossId = null;
    this.wave = 0;

    // Hide end screens
    const vs = document.getElementById('victory-screen');
    const gs = document.getElementById('gameover-screen');
    if (vs) vs.classList.remove('active');
    if (gs) gs.classList.remove('active');

    this.ui.updateBossBar(0, 1, false);

    this.gamePhase = 'playing';
    this.startWave(1);
    this.input.requestPointerLock();
  }

  private startWave(waveNum: number) {
    this.wave = waveNum;
    const cfg = WAVE_CONFIG[waveNum - 1];
    if (!cfg) return;

    const hpScale = ZOMBIE_HP_SCALE[waveNum - 1];
    const dmgScale = ZOMBIE_DMG_SCALE[waveNum - 1];
    const spdScale = ZOMBIE_SPD_SCALE[waveNum - 1];

    this.spawnQueue = [];
    let delay = 0;

    // Build spawn queue
    for (let i = 0; i < (cfg.normalCount || 0); i++) {
      this.spawnQueue.push({ type: 'normal', delay });
      delay += 0.5;
    }
    for (let i = 0; i < (cfg.explosiveCount || 0); i++) {
      this.spawnQueue.push({ type: 'explosive', delay });
      delay += 0.8;
    }
    for (let i = 0; i < (cfg.acidCount || 0); i++) {
      this.spawnQueue.push({ type: 'acid', delay });
      delay += 1.0;
    }

    // Shuffle
    for (let i = this.spawnQueue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.spawnQueue[i], this.spawnQueue[j]] = [this.spawnQueue[j], this.spawnQueue[i]];
    }
    // Fix delays sequentially
    this.spawnQueue.forEach((item, i) => { item.delay = i * 0.5; });

    this.zombiesToSpawn = this.spawnQueue.length;
    if ((cfg as any).boss) this.zombiesToSpawn += 1;
    this.zombiesAlive = 0;
    this.spawnTimer = 0;

    this.ui.showWaveAnnounce(waveNum, !!(cfg as any).boss);

    // Setup traps for this wave
    this.setupTraps(hpScale, dmgScale, spdScale);

    // Respawn dead player
    if (this.player.isDead) {
      this.respawnPlayer();
    }
  }

  private setupTraps(hpScale: number, dmgScale: number, spdScale: number) {
    // Store scale for later use - the traps reference current wave config
    void hpScale; void dmgScale; void spdScale;
    // Initialize traps if not already
    if (this.traps.length === 0) {
      this.traps = [
        { id: 'trap1', x: 0, z: 45, type: 'electric', active: false, timer: 0, tickTimer: 0, radius: GAME_CONFIG.TRAP_RADIUS },
        { id: 'trap2', x: -35, z: -35, type: 'flamethrower', active: false, timer: 0, tickTimer: 0, radius: GAME_CONFIG.TRAP_RADIUS },
      ];
    }
  }

  private spawnZombie(type: Zombie['type'], hpScale: number, dmgScale: number, spdScale: number) {
    const spawnPt = this.zombieSpawnPoints[Math.floor(Math.random() * this.zombieSpawnPoints.length)];
    const id = genId();

    let z: Zombie;
    if (type === 'boss') {
      z = {
        id, type: 'boss',
        x: spawnPt.x, y: 0, z: spawnPt.z,
        rot: 0,
        hp: GAME_CONFIG.BOSS.HEALTH,
        maxHp: GAME_CONFIG.BOSS.HEALTH,
        damage: GAME_CONFIG.BOSS.DAMAGE * dmgScale,
        speed: GAME_CONFIG.BOSS.SPEED,
        attackRange: GAME_CONFIG.BOSS.ATTACK_RANGE,
        attackTimer: 0,
        attackRate: 1.5,
        state: 'chase',
        reward: GAME_CONFIG.BOSS.KILL_REWARD,
        bossAttackTimer: 5,
        bossPhase: 'none',
        bossPhaseTimer: 0,
        minionsSpawned: false,
      };
    } else if (type === 'explosive') {
      z = {
        id, type,
        x: spawnPt.x, y: 0, z: spawnPt.z,
        rot: 0,
        hp: GAME_CONFIG.ZOMBIE_EXPLOSIVE.HEALTH * hpScale,
        maxHp: GAME_CONFIG.ZOMBIE_EXPLOSIVE.HEALTH * hpScale,
        damage: GAME_CONFIG.ZOMBIE_EXPLOSIVE.DAMAGE * dmgScale,
        speed: GAME_CONFIG.ZOMBIE_EXPLOSIVE.SPEED * spdScale,
        attackRange: 2.0,
        attackTimer: 0,
        attackRate: 0,
        state: 'chase',
        reward: GAME_CONFIG.ZOMBIE_EXPLOSIVE.KILL_REWARD,
      };
    } else if (type === 'acid') {
      z = {
        id, type,
        x: spawnPt.x, y: 0, z: spawnPt.z,
        rot: 0,
        hp: GAME_CONFIG.ZOMBIE_ACID.HEALTH * hpScale,
        maxHp: GAME_CONFIG.ZOMBIE_ACID.HEALTH * hpScale,
        damage: GAME_CONFIG.ZOMBIE_ACID.DAMAGE * dmgScale,
        speed: GAME_CONFIG.ZOMBIE_ACID.SPEED * spdScale,
        attackRange: GAME_CONFIG.ZOMBIE_ACID.ATTACK_RANGE,
        attackTimer: 0,
        attackRate: GAME_CONFIG.ZOMBIE_ACID.ATTACK_RATE,
        state: 'chase',
        reward: GAME_CONFIG.ZOMBIE_ACID.KILL_REWARD,
        projectileTimer: 0,
      };
    } else {
      z = {
        id, type: 'normal',
        x: spawnPt.x, y: 0, z: spawnPt.z,
        rot: 0,
        hp: GAME_CONFIG.ZOMBIE_NORMAL.HEALTH * hpScale,
        maxHp: GAME_CONFIG.ZOMBIE_NORMAL.HEALTH * hpScale,
        damage: GAME_CONFIG.ZOMBIE_NORMAL.DAMAGE * dmgScale,
        speed: GAME_CONFIG.ZOMBIE_NORMAL.SPEED * spdScale,
        attackRange: GAME_CONFIG.ZOMBIE_NORMAL.ATTACK_RANGE,
        attackTimer: 0,
        attackRate: GAME_CONFIG.ZOMBIE_NORMAL.ATTACK_RATE,
        state: 'chase',
        reward: GAME_CONFIG.ZOMBIE_NORMAL.KILL_REWARD,
      };
    }

    this.zombies.set(id, z);
    this.entities.createZombie(id, type);
    this.entities.updateZombieHealth(id, z.hp, z.maxHp);
    this.zombiesAlive++;

    if (type === 'boss') {
      this.bossId = id;
      this.ui.updateBossBar(z.hp, z.maxHp, true);
    }
  }

  private animate() {
    if (this.destroyed) return;
    this.animFrameId = requestAnimationFrame(() => this.animate());

    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;

    if (this.gamePhase === 'playing') {
      this.update(dt);
    }

    this.entities.update(dt);
    this.ui.update(dt);
    this.renderer.render(this.scene, this.camera);
    this.input.clearJustPressed();
  }

  private update(dt: number) {
    const waveIdx = this.wave - 1;
    const hpScale = ZOMBIE_HP_SCALE[waveIdx] || 1;
    const dmgScale = ZOMBIE_DMG_SCALE[waveIdx] || 1;
    const spdScale = ZOMBIE_SPD_SCALE[waveIdx] || 1;

    this.updateSpawnQueue(dt, hpScale, dmgScale, spdScale);
    this.updatePlayer(dt);
    this.updateZombies(dt, dmgScale);
    this.updateAcidProjectiles(dt);
    this.updateAcidPools(dt);
    this.updateTraps(dt);
    this.updateDropItems(dt);
    this.checkWaveComplete();
    this.updateCamera();
    this.updateHUD();
    this.updateInteractPrompt();
    this.handleInteract();
    this.updateLeaderboard();
  }

  private updateSpawnQueue(dt: number, hpScale: number, dmgScale: number, spdScale: number) {
    if (this.spawnQueue.length === 0) return;
    this.spawnTimer += dt;
    while (this.spawnQueue.length > 0 && this.spawnQueue[0].delay <= this.spawnTimer) {
      const item = this.spawnQueue.shift()!;
      this.spawnZombie(item.type, hpScale, dmgScale, spdScale);
    }

    // Boss wave - spawn boss when most minions are dead
    const cfg = WAVE_CONFIG[this.wave - 1];
    if ((cfg as any)?.boss && this.bossId === null && !this.spawnQueue.length && this.zombiesAlive <= 5) {
      this.spawnZombie('boss', hpScale, dmgScale, spdScale);
    }
  }

  private updatePlayer(dt: number) {
    const p = this.player;
    if (p.isDead) {
      p.respawnTimer -= dt;
      this.ui.showDeathScreen(true, Math.max(0, p.respawnTimer));
      if (p.respawnTimer <= 0) {
        this.respawnPlayer();
      }
      return;
    }

    if (p.isDowned) {
      p.downedTimer -= dt;
      this.ui.showDownedScreen(true, p.downedTimer);
      if (p.downedTimer <= 0) {
        // Die
        p.isDowned = false;
        p.isDead = true;
        p.respawnTimer = GAME_CONFIG.RESPAWN_DELAY;
        this.ui.showDownedScreen(false);
        this.ui.showDeathScreen(true, GAME_CONFIG.RESPAWN_DELAY);
      }
      // Can still crawl slowly while downed
      this.movePlayer(dt, true);
      return;
    }

    this.ui.showDeathScreen(false);
    this.ui.showDownedScreen(false);

    // Weapon switch
    const input = this.input.getState();
    if (this.input.isJustPressed('Digit1')) {
      p.weapon = 'ak47';
      this.ak47Mesh.visible = true;
      this.pistolMesh.visible = false;
    }
    if (this.input.isJustPressed('Digit2')) {
      p.weapon = 'pistol';
      this.ak47Mesh.visible = false;
      this.pistolMesh.visible = true;
    }

    // Reload
    if (this.input.isJustPressed('KeyR') && !p.isReloading) {
      this.startReload();
    }

    if (p.isReloading) {
      p.reloadTimer += dt;
      if (p.reloadTimer >= p.reloadTotalTime) {
        this.finishReload();
      }
    } else {
      // Decrement fire cooldown
      if (p.fireTimer > 0) p.fireTimer -= dt;
      const canFire = p.fireTimer <= 0;

      if (p.weapon === 'ak47') {
        // AK: automatic fire while holding LMB
        if (input.fire && canFire) {
          if (p.magazineAK > 0) {
            this.fireWeapon('ak47');
          } else if (p.ammoAK > 0) {
            this.startReload();
          }
        }
      } else {
        // Pistol: semi-auto, only fire on mouse press (justPressed)
        if (this.input.isJustPressed('MouseBtn0') && canFire) {
          this.fireWeapon('pistol');
        }
      }
    }

    // Movement
    this.movePlayer(dt, false);

    // Combo timers
    if (p.combo > 0) {
      p.comboTimer -= dt;
      if (p.comboTimer <= 0) {
        p.combo = 0;
      }
    }
    if (p.speedBoost) {
      p.speedBoostTimer -= dt;
      if (p.speedBoostTimer <= 0) {
        p.speedBoost = false;
        this.ui.showNotification('Ускорение закончилось');
      }
    }
    if (p.doubleDamage) {
      p.doubleDamageTimer -= dt;
      if (p.doubleDamageTimer <= 0) {
        p.doubleDamage = false;
        this.ui.showNotification('Двойной урон закончился');
      }
    }
  }

  private movePlayer(dt: number, downed: boolean) {
    const p = this.player;
    const input = this.input.getState();

    let speed = GAME_CONFIG.PLAYER_SPEED;
    if (downed) speed *= 0.25;
    else if (input.sprint && !input.crouch) speed *= GAME_CONFIG.PLAYER_SPRINT_MULT;
    else if (input.crouch) speed *= GAME_CONFIG.PLAYER_CROUCH_MULT;
    if (p.speedBoost && !downed) speed *= 1.5;

    // Camera direction
    const forward = {
      x: -Math.sin(this.camYaw),
      z: -Math.cos(this.camYaw),
    };
    const right = {
      x: Math.cos(this.camYaw),
      z: -Math.sin(this.camYaw),
    };

    let moveX = 0, moveZ = 0;
    if (input.forward) { moveX += forward.x; moveZ += forward.z; }
    if (input.backward) { moveX -= forward.x; moveZ -= forward.z; }
    if (input.right) { moveX += right.x; moveZ += right.z; }
    if (input.left) { moveX -= right.x; moveZ -= right.z; }

    // Normalize
    const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (len > 0.01) { moveX /= len; moveZ /= len; }

    // Gravity
    if (!p.onGround) {
      p.velY += GAME_CONFIG.GRAVITY * dt;
    }

    // Jump
    if (input.jump && p.onGround && !downed) {
      p.velY = GAME_CONFIG.JUMP_FORCE;
      p.onGround = false;
    }

    const newX = p.x + moveX * speed * dt;
    const newZ = p.z + moveZ * speed * dt;
    const newY = p.y + p.velY * dt;

    const height = input.crouch ? GAME_CONFIG.PLAYER_CROUCH_HEIGHT : GAME_CONFIG.PLAYER_HEIGHT;
    const result = this.physics.resolveMovement(p.x, p.y, p.z, newX, newY, newZ, 0.4, height);

    p.x = result.x;
    p.y = result.y;
    p.z = result.z;
    p.onGround = result.onGround;
    if (p.onGround) p.velY = 0;

    // Head bob
    const moving = len > 0.01;
    if (moving && p.onGround) {
      this.headBobVel += dt * 8;
      this.headBob = Math.sin(this.headBobVel) * 0.04;
      this.weaponBob = Math.sin(this.headBobVel * 0.5) * 0.02;
    } else {
      this.headBob *= 0.9;
      this.weaponBob *= 0.9;
    }

    // Mouse look
    const sensitivity = input.aim ? 0.001 : 0.002;
    this.camYaw -= input.mouseDX * sensitivity;
    this.camPitch -= input.mouseDY * sensitivity;
    this.camPitch = Math.max(-this.camPitchMax, Math.min(this.camPitchMax, this.camPitch));

    // Revive logic (handled in handleInteract)
    p.isSprinting = input.sprint;
    p.isCrouching = input.crouch;
  }

  private fireWeapon(weapon: 'ak47' | 'pistol') {
    const p = this.player;

    if (weapon === 'ak47') {
      if (p.magazineAK <= 0) return;
      p.magazineAK--;
      const fireRate = GAME_CONFIG.AK47.FIRE_RATE * (1 - p.akFireRateBonus * 0.25);
      p.fireTimer = fireRate;
    } else {
      if (p.pistolMagazine <= 0) {
        // Auto reload pistol
        this.startReload();
        return;
      }
      p.pistolMagazine--;
      const fireRate = GAME_CONFIG.PISTOL.FIRE_RATE * (1 - p.pistolFireRateBonus * 0.25);
      p.fireTimer = fireRate;
    }

    // Muzzle flash
    const muzzlePos = {
      x: this.camera.position.x - Math.sin(this.camYaw) * 0.5,
      y: this.camera.position.y,
      z: this.camera.position.z - Math.cos(this.camYaw) * 0.5,
    };
    this.entities.spawnMuzzleFlash(muzzlePos.x, muzzlePos.y, muzzlePos.z);

    // Weapon kick animation
    const currentMesh = weapon === 'ak47' ? this.ak47Mesh : this.pistolMesh;
    currentMesh.position.z += 0.05;
    setTimeout(() => { currentMesh.position.z -= 0.05; }, 80);

    // Raycast
    const spread = weapon === 'ak47' ? 
      GAME_CONFIG.AK47.SPREAD * (1 + (p.isCrouching ? -0.5 : 0) + (p.isSprinting ? 0.5 : 0)) :
      GAME_CONFIG.PISTOL.SPREAD;
    
    const dir = {
      x: -Math.sin(this.camYaw) * Math.cos(this.camPitch) + (Math.random() - 0.5) * spread,
      y: Math.sin(this.camPitch) + (Math.random() - 0.5) * spread * 0.5,
      z: -Math.cos(this.camYaw) * Math.cos(this.camPitch) + (Math.random() - 0.5) * spread,
    };
    const dlen = Math.sqrt(dir.x * dir.x + dir.y * dir.y + dir.z * dir.z);
    dir.x /= dlen; dir.y /= dlen; dir.z /= dlen;

    const origin = {
      x: this.camera.position.x,
      y: this.camera.position.y,
      z: this.camera.position.z,
    };
    const range = weapon === 'ak47' ? GAME_CONFIG.AK47.RANGE : GAME_CONFIG.PISTOL.RANGE;

    // Check wall collision first
    const wallResult = this.physics.raycast(origin, dir, range);

    let hitZombie = false;
    let closestZombieId: string | null = null;
    let closestZombieDist = wallResult.dist;

    // Check zombie hits
    this.zombies.forEach((zombie, id) => {
      if (zombie.state === 'dead' || zombie.state === 'exploding') return;
      const zombieHeight = zombie.type === 'boss' ? 5.0 : 2.0;
      const zombieRadius = zombie.type === 'boss' ? 2.0 : 0.6;
      const zombieCenter = { x: zombie.x, y: zombie.y + zombieHeight / 2, z: zombie.z };
      const dist = this.physics.raySphere(origin, dir, zombieCenter, zombieRadius, closestZombieDist);
      if (dist !== null && dist < closestZombieDist) {
        closestZombieDist = dist;
        closestZombieId = id;
        hitZombie = true;
      }
    });

    const hitPoint = {
      x: origin.x + dir.x * closestZombieDist,
      y: origin.y + dir.y * closestZombieDist,
      z: origin.z + dir.z * closestZombieDist,
    };

    // Bullet trail
    this.entities.spawnBulletTrail(muzzlePos, hitPoint);

    if (hitZombie && closestZombieId) {
      let damage = weapon === 'ak47' ? 
        GAME_CONFIG.AK47.DAMAGE * (1 + p.akDamageBonus * 0.2) :
        GAME_CONFIG.PISTOL.DAMAGE * (1 + p.pistolDamageBonus * 0.2);
      if (p.doubleDamage) damage *= 2;

      this.entities.spawnBlood(hitPoint.x, hitPoint.y, hitPoint.z);
      this.ui.showHitMarker();

      const killed = this.damageZombie(closestZombieId, damage, 'local');
      if (killed) {
        this.onZombieKilled(closestZombieId, 'local');
      }
    }

    // Auto reload when magazine empty
    if (weapon === 'ak47' && p.magazineAK === 0 && p.ammoAK > 0) {
      setTimeout(() => this.startReload(), 200);
    }
  }

  private startReload() {
    const p = this.player;
    if (p.isReloading) return;

    if (p.weapon === 'ak47') {
      if (p.ammoAK <= 0 || p.magazineAK >= GAME_CONFIG.AK47.MAGAZINE + Math.floor(p.akMagazineBonus * 10)) return;
      p.isReloading = true;
      p.reloadTimer = 0;
      p.reloadTotalTime = GAME_CONFIG.AK47.RELOAD_TIME;
    } else {
      if (p.pistolMagazine >= p.pistolMagazineMax) return;
      p.isReloading = true;
      p.reloadTimer = 0;
      p.reloadTotalTime = GAME_CONFIG.PISTOL.RELOAD_TIME;
    }
  }

  private finishReload() {
    const p = this.player;
    p.isReloading = false;
    p.reloadTimer = 0;

    if (p.weapon === 'ak47') {
      const maxMag = GAME_CONFIG.AK47.MAGAZINE + Math.floor(p.akMagazineBonus * 10);
      const needed = maxMag - p.magazineAK;
      const reload = Math.min(needed, p.ammoAK);
      p.magazineAK += reload;
      p.ammoAK -= reload;
    } else {
      const needed = p.pistolMagazineMax - p.pistolMagazine;
      p.pistolMagazine += needed;
    }
  }

  private damageZombie(id: string, damage: number, _attackerId: string): boolean {
    const zombie = this.zombies.get(id);
    if (!zombie || zombie.state === 'dead') return false;

    zombie.hp -= damage;
    this.entities.updateZombieHealth(id, zombie.hp, zombie.maxHp);

    if (zombie.type === 'boss') {
      this.ui.updateBossBar(zombie.hp, zombie.maxHp, true);
    }

    if (zombie.hp <= 0) {
      zombie.state = 'dead';
      return true;
    }
    return false;
  }

  private onZombieKilled(id: string, _killerId: string) {
    const zombie = this.zombies.get(id);
    if (!zombie) return;

    const p = this.player;
    p.money += zombie.reward;
    p.kills++;

    // Combo
    p.combo++;
    p.comboTimer = 8; // reset combo timer

    // Combo rewards
    if (p.combo === GAME_CONFIG.COMBO_SPEED_THRESHOLD) {
      p.speedBoost = true;
      p.speedBoostTimer = GAME_CONFIG.COMBO_SPEED_DURATION;
      this.ui.showNotification('🔥 КОМБО x5 — УСКОРЕНИЕ!');
    }
    if (p.combo === GAME_CONFIG.COMBO_DAMAGE_THRESHOLD) {
      p.doubleDamage = true;
      p.doubleDamageTimer = GAME_CONFIG.COMBO_DAMAGE_DURATION;
      this.ui.showNotification('💀 КОМБО x10 — ДВОЙНОЙ УРОН!');
    }
    if (p.combo === GAME_CONFIG.COMBO_CLEAR_THRESHOLD) {
      this.ui.showNotification('✨ КОМБО x15 — АПОКАЛИПСИС!');
      this.clearAllNormalZombies();
    }

    // Drop
    if (Math.random() < GAME_CONFIG.DROP_MEDKIT_CHANCE) {
      const dropId = genDropId();
      const drop: DropItem = { id: dropId, x: zombie.x, z: zombie.z, type: 'medkit', timer: 20 };
      this.dropItems.set(dropId, drop);
      this.entities.spawnDropItem(dropId, zombie.x, zombie.z, 'medkit');
    }

    // Death effects
    if (zombie.type === 'explosive') {
      this.triggerExplosion(zombie.x, zombie.z, zombie.damage);
    }

    // Kill announcement
    this.ui.addKillfeed('Ты', zombie.type === 'boss' ? 'ШИРИБАЗАРОВ' : `Зомби(${zombie.type})`, p.weapon === 'ak47' ? 'AK-47' : 'Pistol');

    // Boss kill
    if (zombie.type === 'boss') {
      this.ui.updateBossBar(0, 1, false);
      this.entities.spawnExplosion(zombie.x, zombie.y + 2, zombie.z);
      this.entities.spawnVictoryFireworks(0, 0);
      setTimeout(() => this.triggerVictory(), 2000);
    }

    // Visual death effect
    this.entities.spawnBlood(zombie.x, zombie.y + 1, zombie.z, 15);

    // Remove model
    this.entities.removeZombie(id);
    this.zombies.delete(id);
    this.zombiesAlive = Math.max(0, this.zombiesAlive - 1);

    if (id === this.bossId) this.bossId = null;
  }

  private triggerExplosion(x: number, z: number, damage: number) {
    this.entities.spawnExplosion(x, 0.5, z);

    const p = this.player;
    const dist = this.physics.distance2D(p.x, p.z, x, z);
    if (dist < GAME_CONFIG.ZOMBIE_EXPLOSIVE.EXPLODE_RANGE) {
      const dmg = damage * (1 - dist / GAME_CONFIG.ZOMBIE_EXPLOSIVE.EXPLODE_RANGE);
      this.damagePlayer(dmg);
    }

    // Damage nearby zombies (chain explosions)
    this.zombies.forEach((z2, id) => {
      const zDist = this.physics.distance2D(z2.x, z2.z, x, z);
      if (zDist < GAME_CONFIG.ZOMBIE_EXPLOSIVE.EXPLODE_RANGE * 0.7) {
        const killed = this.damageZombie(id, damage * 0.5, 'local');
        if (killed) this.onZombieKilled(id, 'local');
      }
    });
  }

  private clearAllNormalZombies() {
    const toKill: string[] = [];
    this.zombies.forEach((zombie, id) => {
      if (zombie.type === 'normal') toKill.push(id);
    });
    toKill.forEach(id => {
      const z = this.zombies.get(id);
      if (z) {
        this.entities.spawnExplosion(z.x, z.y + 1, z.z);
        this.entities.removeZombie(id);
        this.zombies.delete(id);
        this.zombiesAlive = Math.max(0, this.zombiesAlive - 1);
      }
    });
    this.ui.showNotification(`${toKill.length} зомби уничтожено!`, 4000);
  }

  private updateZombies(dt: number, _dmgScale: number) {
    const p = this.player;

    this.zombies.forEach((zombie, id) => {
      if (zombie.state === 'dead') return;

      const target = { x: p.x, y: p.y, z: p.z };
      const dist2D = this.physics.distance2D(zombie.x, zombie.z, target.x, target.z);

      // Face target
      zombie.rot = Math.atan2(target.x - zombie.x, target.z - zombie.z);

      if (zombie.type === 'boss') {
        this.updateBoss(zombie, dt, target, dist2D);
      } else if (zombie.type === 'explosive') {
        this.updateExplosiveZombie(zombie, dt, target, dist2D, id);
      } else if (zombie.type === 'acid') {
        this.updateAcidZombie(zombie, dt, target, dist2D);
      } else {
        this.updateNormalZombie(zombie, dt, target, dist2D, id);
      }

      // Update model
      const moving = dist2D > zombie.attackRange;
      this.entities.updateZombiePosition(id, zombie.x, zombie.y, zombie.z, zombie.rot, dt, moving);
    });
  }

  private updateNormalZombie(zombie: Zombie, dt: number, target: { x: number; y: number; z: number }, dist2D: number, _id: string) {
    if (dist2D > zombie.attackRange) {
      // Chase
      this.moveZombie(zombie, target.x, target.z, dt);
    } else {
      // Attack
      zombie.attackTimer -= dt;
      if (zombie.attackTimer <= 0) {
        zombie.attackTimer = zombie.attackRate;
        if (!this.player.isDead && !this.player.isDowned) {
          this.damagePlayer(zombie.damage);
        }
      }
    }
  }

  private updateExplosiveZombie(zombie: Zombie, dt: number, target: { x: number; y: number; z: number }, dist2D: number, id: string) {
    if (zombie.state === 'exploding') return;

    if (dist2D > 2.5) {
      this.moveZombie(zombie, target.x, target.z, dt);
    } else {
      // Explode!
      zombie.state = 'exploding';
      zombie.hp = 0;
      const killed = true;
      if (killed) {
        this.onZombieKilled(id, 'explosion');
      }
    }
  }

  private updateAcidZombie(zombie: Zombie, dt: number, target: { x: number; y: number; z: number }, dist2D: number) {
    if (dist2D > GAME_CONFIG.ZOMBIE_ACID.ATTACK_RANGE) {
      this.moveZombie(zombie, target.x, target.z, dt);
    } else {
      // Spit acid
      zombie.projectileTimer = (zombie.projectileTimer || 0) - dt;
      if (zombie.projectileTimer! <= 0) {
        zombie.projectileTimer = GAME_CONFIG.ZOMBIE_ACID.ATTACK_RATE;
        this.spawnAcidProjectile(zombie, target);
      }
    }
  }

  private updateBoss(zombie: Zombie, dt: number, target: { x: number; y: number; z: number }, dist2D: number) {
    zombie.bossAttackTimer = (zombie.bossAttackTimer || 5) - dt;

    // Spawn minions at half health
    if (!zombie.minionsSpawned && zombie.hp < zombie.maxHp * 0.5) {
      zombie.minionsSpawned = true;
      const hpScale = ZOMBIE_HP_SCALE[this.wave - 1];
      const dmgScale = ZOMBIE_DMG_SCALE[this.wave - 1];
      const spdScale = ZOMBIE_SPD_SCALE[this.wave - 1];
      for (let i = 0; i < 5; i++) {
        this.spawnZombie('normal', hpScale, dmgScale, spdScale);
      }
      this.ui.showNotification('⚠ ШИРИБАЗАРОВ ПРИЗВАЛ МИНЬОНОВ!', 4000);
    }

    if (zombie.bossPhase === 'rush' && zombie.rushTarget) {
      // Rush to target
      const dx = zombie.rushTarget.x - zombie.x;
      const dz = zombie.rushTarget.z - zombie.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d > 0.5) {
        const spd = GAME_CONFIG.BOSS.SPEED * 3;
        zombie.x += (dx / d) * spd * dt;
        zombie.z += (dz / d) * spd * dt;

        // Damage if close to player
        if (this.physics.distance2D(zombie.x, zombie.z, target.x, target.z) < 2) {
          this.damagePlayer(GAME_CONFIG.BOSS.RUSH_DAMAGE);
          zombie.bossPhase = 'none';
          zombie.bossPhaseTimer = 0;
        }
      } else {
        zombie.bossPhase = 'none';
      }
    } else if (zombie.bossPhase === 'shockwave') {
      // Already triggered, wait
      zombie.bossPhaseTimer = (zombie.bossPhaseTimer || 0) - dt;
      if (zombie.bossPhaseTimer! <= 0) zombie.bossPhase = 'none';
    } else if (zombie.bossPhase === 'toxic') {
      zombie.bossPhaseTimer = (zombie.bossPhaseTimer || 0) - dt;
      if (zombie.bossPhaseTimer! <= 0) zombie.bossPhase = 'none';
    } else {
      // Normal chase
      if (dist2D > GAME_CONFIG.BOSS.ATTACK_RANGE) {
        this.moveZombie(zombie, target.x, target.z, dt);
      } else {
        // Melee
        zombie.attackTimer -= dt;
        if (zombie.attackTimer <= 0) {
          zombie.attackTimer = zombie.attackRate;
          this.damagePlayer(zombie.damage);
        }
      }

      // Trigger special attack
      if (zombie.bossAttackTimer! <= 0) {
        zombie.bossAttackTimer = 6 + Math.random() * 4;
        const roll = Math.random();
        if (roll < 0.33) {
          this.bossTriggerShockwave(zombie, target);
        } else if (roll < 0.66) {
          this.bossTriggerRush(zombie, target);
        } else {
          this.bossTriggerToxic(zombie, target);
        }
      }
    }
  }

  private bossTriggerShockwave(zombie: Zombie, target: { x: number; y: number; z: number }) {
    zombie.bossPhase = 'shockwave';
    zombie.bossPhaseTimer = 2;
    this.entities.spawnShockwave(zombie.x, 0, zombie.z, 0xff0000, GAME_CONFIG.BOSS.SHOCKWAVE_RANGE);
    const dist = this.physics.distance2D(zombie.x, zombie.z, target.x, target.z);
    if (dist < GAME_CONFIG.BOSS.SHOCKWAVE_RANGE) {
      this.damagePlayer(GAME_CONFIG.BOSS.SHOCKWAVE_DAMAGE);
    }
    this.ui.showNotification('⚠ ШИРИБАЗАРОВ: УДАРНАЯ ВОЛНА!', 2000);
  }

  private bossTriggerRush(zombie: Zombie, target: { x: number; y: number; z: number }) {
    zombie.bossPhase = 'rush';
    zombie.rushTarget = { x: target.x, z: target.z };
    this.ui.showNotification('⚠ ШИРИБАЗАРОВ: РЫВОК!', 2000);
  }

  private bossTriggerToxic(zombie: Zombie, target: { x: number; y: number; z: number }) {
    zombie.bossPhase = 'toxic';
    zombie.bossPhaseTimer = 2;
    // Spawn 3 acid pools around player
    for (let i = 0; i < 3; i++) {
      const angle = (i / 3) * Math.PI * 2;
      const px = target.x + Math.cos(angle) * 3;
      const pz = target.z + Math.sin(angle) * 3;
      const poolId = `boss_toxic_${Date.now()}_${i}`;
      const pool: AcidPool = {
        id: poolId,
        x: px, z: pz,
        timer: 5,
        radius: 3,
        damage: GAME_CONFIG.BOSS.TOXIC_DAMAGE,
        tickTimer: 0,
      };
      this.acidPools.push(pool);
      this.entities.createAcidPool(poolId, px, pz, 3);
    }
    this.ui.showNotification('⚠ ШИРИБАЗАРОВ: ТОКСИЧНАЯ АТАКА!', 2000);
  }

  private moveZombie(zombie: Zombie, targetX: number, targetZ: number, dt: number) {
    const dx = targetX - zombie.x;
    const dz = targetZ - zombie.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 0.01) return;

    const moveX = (dx / dist) * zombie.speed * dt;
    const moveZ = (dz / dist) * zombie.speed * dt;

    // Simple collision with map objects
    const nx = zombie.x + moveX;
    const nz = zombie.z + moveZ;

    // Check if new position is valid (don't phase through walls)
    const r = zombie.type === 'boss' ? 1.5 : 0.5;
    if (!this.isPositionBlockedForZombie(nx, zombie.z, r)) {
      zombie.x = nx;
    } else {
      // Try to slide
      const slideAngle = Math.atan2(dx, dz) + 0.4;
      zombie.x += Math.sin(slideAngle) * zombie.speed * dt * 0.5;
    }
    if (!this.isPositionBlockedForZombie(zombie.x, nz, r)) {
      zombie.z = nz;
    } else {
      const slideAngle = Math.atan2(dx, dz) - 0.4;
      zombie.z += Math.cos(slideAngle) * zombie.speed * dt * 0.5;
    }

    // Keep in bounds
    zombie.x = Math.max(-53, Math.min(53, zombie.x));
    zombie.z = Math.max(-53, Math.min(53, zombie.z));
  }

  private isPositionBlockedForZombie(x: number, z: number, r: number): boolean {
    for (const obj of this.physics['collisionObjects']) {
      const b = obj.aabb;
      if (x + r > b.minX && x - r < b.maxX && z + r > b.minZ && z - r < b.maxZ) {
        // Only block on wall-like objects
        if (obj.isWall) return true;
      }
    }
    return false;
  }

  private spawnAcidProjectile(zombie: Zombie, target: { x: number; y: number; z: number }) {
    const dx = target.x - zombie.x;
    const dy = 2 - zombie.y;
    const dz = target.z - zombie.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const speed = 8;
    const id = `ap_${Date.now()}_${Math.random()}`;
    this.acidProjectiles.push({
      id,
      x: zombie.x,
      y: zombie.y + 1.5,
      z: zombie.z,
      velX: (dx / dist) * speed,
      velY: (dy / dist) * speed * 0.8 + 3,
      velZ: (dz / dist) * speed,
      damage: GAME_CONFIG.ZOMBIE_ACID.DAMAGE,
    });
  }

  private updateAcidProjectiles(dt: number) {
    for (let i = this.acidProjectiles.length - 1; i >= 0; i--) {
      const ap = this.acidProjectiles[i];
      ap.velY += GAME_CONFIG.GRAVITY * dt * 0.5;
      ap.x += ap.velX * dt;
      ap.y += ap.velY * dt;
      ap.z += ap.velZ * dt;

      // Hit ground
      if (ap.y <= 0) {
        ap.y = 0;
        const poolId = `pool_${ap.id}`;
        const pool: AcidPool = {
          id: poolId,
          x: ap.x, z: ap.z,
          timer: GAME_CONFIG.ZOMBIE_ACID.ACID_DURATION,
          radius: GAME_CONFIG.ZOMBIE_ACID.POOL_RADIUS,
          damage: GAME_CONFIG.ZOMBIE_ACID.ACID_DAMAGE,
          tickTimer: 0,
        };
        this.acidPools.push(pool);
        this.entities.createAcidPool(poolId, ap.x, ap.z, pool.radius);
        this.acidProjectiles.splice(i, 1);
        continue;
      }

      // Hit player
      const p = this.player;
      const dist = this.physics.distance3D({ x: ap.x, y: ap.y, z: ap.z }, { x: p.x, y: p.y + 1, z: p.z });
      if (dist < 0.8) {
        this.damagePlayer(ap.damage * 2);
        this.acidProjectiles.splice(i, 1);
        // Small pool at hit point
        const poolId = `pool_${ap.id}`;
        const pool: AcidPool = {
          id: poolId,
          x: ap.x, z: ap.z,
          timer: 2,
          radius: 1,
          damage: GAME_CONFIG.ZOMBIE_ACID.ACID_DAMAGE,
          tickTimer: 0,
        };
        this.acidPools.push(pool);
        this.entities.createAcidPool(poolId, ap.x, ap.z, 1);
        continue;
      }

      // Out of bounds
      if (Math.abs(ap.x) > 60 || Math.abs(ap.z) > 60) {
        this.acidProjectiles.splice(i, 1);
      }
    }
  }

  private updateAcidPools(dt: number) {
    const p = this.player;
    for (let i = this.acidPools.length - 1; i >= 0; i--) {
      const pool = this.acidPools[i];
      pool.timer -= dt;
      pool.tickTimer -= dt;

      if (pool.timer <= 0) {
        this.entities.removeAcidPool(pool.id);
        this.acidPools.splice(i, 1);
        continue;
      }

      // Damage player in pool
      if (pool.tickTimer <= 0) {
        pool.tickTimer = GAME_CONFIG.TRAP_TICK;
        const dist = this.physics.distance2D(p.x, p.z, pool.x, pool.z);
        if (dist < pool.radius) {
          this.damagePlayer(pool.damage);
        }
      }
    }
  }

  private updateTraps(dt: number) {
    this.traps.forEach(trap => {
      if (!trap.active) return;
      trap.timer -= dt;
      trap.tickTimer -= dt;

      if (trap.timer <= 0) {
        trap.active = false;
        this.entities.removeTrapEffect(trap.id);
        return;
      }

      if (trap.tickTimer <= 0) {
        trap.tickTimer = GAME_CONFIG.TRAP_TICK;
        // Damage zombies in radius
        this.zombies.forEach((zombie, id) => {
          const dist = this.physics.distance2D(zombie.x, zombie.z, trap.x, trap.z);
          if (dist < trap.radius) {
            const killed = this.damageZombie(id, GAME_CONFIG.TRAP_DAMAGE, 'trap');
            if (killed) this.onZombieKilled(id, 'trap');
          }
        });
      }
    });
  }

  private updateDropItems(dt: number) {
    const p = this.player;
    this.dropItems.forEach((drop, id) => {
      drop.timer -= dt;
      if (drop.timer <= 0) {
        this.entities.removeDropItem(id);
        this.dropItems.delete(id);
        return;
      }

      // Auto-pickup if close
      const dist = this.physics.distance2D(p.x, p.z, drop.x, drop.z);
      if (dist < 1.5) {
        if (drop.type === 'medkit') {
          p.hp = Math.min(p.maxHp, p.hp + GAME_CONFIG.MEDKIT_HEAL);
          this.ui.showNotification(`+${GAME_CONFIG.MEDKIT_HEAL} HP от аптечки`);
        }
        this.entities.removeDropItem(id);
        this.dropItems.delete(id);
      }
    });
  }

  private damagePlayer(damage: number) {
    const p = this.player;
    if (p.isDead || p.isDowned) return;

    p.hp -= damage;
    this.ui.showDamageFlash();

    if (p.hp <= 0) {
      p.hp = 0;
      p.isDowned = true;
      p.downedTimer = GAME_CONFIG.DOWNED_DURATION;
      this.ui.showNotification('☠ ВЫ ПРИ СМЕРТИ! Нажмите E для реанимации (другой игрок)');
    }
  }

  private respawnPlayer() {
    const p = this.player;
    const spawn = this.playerSpawns[Math.floor(Math.random() * this.playerSpawns.length)];
    p.x = spawn.x;
    p.y = 0;
    p.z = spawn.z;
    p.hp = GAME_CONFIG.REVIVE_HEALTH;
    p.isDead = false;
    p.isDowned = false;
    p.velY = 0;
    this.ui.showDeathScreen(false);
    this.ui.showDownedScreen(false);
  }

  private checkWaveComplete() {
    if (this.gamePhase !== 'playing') return;
    if (this.zombiesAlive === 0 && this.spawnQueue.length === 0 && this.bossId === null) {
      // Check if this was the last zombie to spawn
      const cfg = WAVE_CONFIG[this.wave - 1];
      if (!(cfg as any)?.boss || this.bossId === null) {
        if (this.wave >= GAME_CONFIG.MAX_WAVES && !(cfg as any)?.boss) {
          // All waves done without boss
        } else if (this.zombies.size === 0) {
          this.onWaveComplete();
        }
      }
    }
  }

  private onWaveComplete() {
    if (this.wave >= GAME_CONFIG.MAX_WAVES) {
      this.triggerVictory();
      return;
    }
    this.ui.showNotification(`🏆 ВОЛНА ${this.wave} ЗАВЕРШЕНА!`, 3000);

    // Heal player between waves
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + 20);

    this.gamePhase = 'between_waves';
    void GAME_CONFIG.WAVE_BETWEEN_DELAY; // used by setTimeout below

    const nextWave = this.wave + 1;
    setTimeout(() => {
      if (this.gamePhase === 'between_waves') {
        this.gamePhase = 'playing';
        this.startWave(nextWave);
      }
    }, GAME_CONFIG.WAVE_BETWEEN_DELAY * 1000);
  }

  private triggerVictory() {
    if (this.gamePhase === 'victory') return;
    this.gamePhase = 'victory';
    this.entities.spawnVictoryFireworks(this.player.x, this.player.z);
    setTimeout(() => {
      this.ui.showVictory(this.player.kills, this.player.money);
      this.input.exitPointerLock();
    }, 2000);
  }

  private updateCamera() {
    const p = this.player;
    const crouchHeight = p.isCrouching ? GAME_CONFIG.PLAYER_CROUCH_HEIGHT * 0.9 : GAME_CONFIG.PLAYER_HEIGHT * 0.9;
    this.camera.position.set(p.x, p.y + crouchHeight + this.headBob, p.z);

    // Apply rotation
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.camYaw;
    this.camera.rotation.x = this.camPitch;

    // Weapon bob
    if (this.weaponGroup) {
      this.weaponGroup.position.y = this.weaponBob;
      const input = this.input.getState();
      if (input.aim) {
        // ADS: bring weapon up and in
        this.weaponGroup.position.set(-0.01, -0.01 + this.weaponBob, -0.02);
        this.weaponGroup.scale.set(0.85, 0.85, 0.85);
      } else {
        this.weaponGroup.position.set(0, this.weaponBob, 0);
        this.weaponGroup.scale.set(1, 1, 1);
      }
    }
  }

  private updateHUD() {
    const p = this.player;
    this.ui.updateHUD({
      health: p.hp,
      maxHealth: p.maxHp,
      ammoMag: p.weapon === 'ak47' ? p.magazineAK : p.pistolMagazine,
      ammoRes: p.weapon === 'ak47' ? p.ammoAK : 999,
      weapon: p.weapon,
      money: p.money,
      wave: this.wave,
      kills: p.kills,
      isReloading: p.isReloading,
      reloadProgress: p.isReloading ? p.reloadTimer / p.reloadTotalTime : 0,
      speedBoost: p.speedBoost,
      doubleDamage: p.doubleDamage,
      combo: p.combo,
    });
  }

  private updateInteractPrompt() {
    const p = this.player;
    this.interactTarget = null;

    // Vending machine
    const vmPos = { x: -12, z: -3 };
    const vmDist = this.physics.distance2D(p.x, p.z, vmPos.x, vmPos.z);
    if (vmDist < 3) {
      this.interactTarget = 'vending';
      const next = this.vendingToggle ? 'патроны $50' : 'аптечка $100';
      this.ui.setInteractPrompt(true, `🏪 АВТОМАТ: E = купить ${next}`);
      return;
    }

    // Mystery box
    const mbPos = { x: 30, z: -30 };
    const mbDist = this.physics.distance2D(p.x, p.z, mbPos.x, mbPos.z);
    if (mbDist < 3 && this.mysteryBoxAvailable) {
      this.interactTarget = 'mystery';
      this.ui.setInteractPrompt(true, `❓ МИСТИЧЕСКАЯ КОРОБКА [200$]`);
      return;
    }

    // Traps
    for (const trap of this.traps) {
      const tDist = this.physics.distance2D(p.x, p.z, trap.x, trap.z);
      if (tDist < 3) {
        this.interactTarget = `trap_${trap.id}`;
        const status = trap.active ? `(АКТИВНА: ${trap.timer.toFixed(0)}с)` : `[300$]`;
        this.ui.setInteractPrompt(true, `⚡ ЛОВУШКА ${status}`);
        return;
      }
    }

    this.ui.setInteractPrompt(false);
    this.ui.showReviveBar(0);
  }

  private handleInteract() {
    const justE = this.input.isJustPressed('KeyE');
    if (!justE || !this.interactTarget) return;

    const p = this.player;
    if (p.isDead || p.isDowned) return;

    if (this.interactTarget === 'vending') {
      this.handleVending();
    } else if (this.interactTarget === 'mystery') {
      this.handleMysteryBox();
    } else if (this.interactTarget?.startsWith('trap_')) {
      const trapId = this.interactTarget.replace('trap_', '');
      this.handleTrap(trapId);
    }
  }

  private handleVending() {
    const p = this.player;

    // Toggle between ammo/medkit purchase
    this.vendingToggle = !this.vendingToggle;
    if (this.vendingToggle) {
      // Buy ammo
      if (p.money < GAME_CONFIG.VENDING_AMMO_COST) {
        this.ui.showNotification(`❌ Мало денег! (нужно $${GAME_CONFIG.VENDING_AMMO_COST} для патронов)`);
        return;
      }
      p.money -= GAME_CONFIG.VENDING_AMMO_COST;
      const ammo = Math.floor(Math.random() * 11); // 0-10
      p.ammoAK = Math.min(p.maxAmmoAK, p.ammoAK + ammo);
      this.ui.showNotification(`🔫 Получено ${ammo} патронов 7.62 | Снова E = аптечка`);
    } else {
      // Buy medkit
      if (p.money < GAME_CONFIG.VENDING_MEDKIT_COST) {
        this.ui.showNotification(`❌ Мало денег! (нужно $${GAME_CONFIG.VENDING_MEDKIT_COST} для аптечки)`);
        this.vendingToggle = true; // reset toggle
        return;
      }
      if (p.hp >= p.maxHp) {
        this.ui.showNotification('❌ Здоровье полное! | Снова E = патроны');
        return;
      }
      p.money -= GAME_CONFIG.VENDING_MEDKIT_COST;
      p.hp = Math.min(p.maxHp, p.hp + GAME_CONFIG.MEDKIT_HEAL);
      this.ui.showNotification(`💊 +${GAME_CONFIG.MEDKIT_HEAL} HP от аптечки | Снова E = патроны`);
    }
  }
  private vendingToggle = true;

  private handleMysteryBox() {
    const p = this.player;
    if (p.money < GAME_CONFIG.MYSTERY_BOX_COST) {
      this.ui.showNotification(`❌ Недостаточно денег (нужно $${GAME_CONFIG.MYSTERY_BOX_COST})`);
      return;
    }
    p.money -= GAME_CONFIG.MYSTERY_BOX_COST;
    this.mysteryBoxAvailable = false;

    const roll = Math.random();
    let upgrade = '';
    if (roll < 0.33) {
      if (p.weapon === 'ak47') { p.akDamageBonus++; upgrade = '⚔ AK-47: Урон +20%'; }
      else { p.pistolDamageBonus++; upgrade = '⚔ Пистолет: Урон +20%'; }
    } else if (roll < 0.66) {
      if (p.weapon === 'ak47') { p.akFireRateBonus++; upgrade = '⚡ AK-47: Скорострельность +25%'; }
      else { p.pistolFireRateBonus++; upgrade = '⚡ Пистолет: Скорострельность +25%'; }
    } else {
      if (p.weapon === 'ak47') { p.akMagazineBonus++; upgrade = '📦 AK-47: Магазин +10'; }
      else { p.pistolMagazineMax += 4; upgrade = '📦 Пистолет: Магазин +4'; }
    }

    this.ui.showNotification(`✨ УЛУЧШЕНИЕ: ${upgrade}`, 5000);

    // Respawn box after 30s
    setTimeout(() => {
      this.mysteryBoxAvailable = true;
    }, 30000);
  }

  private handleTrap(trapId: string) {
    const p = this.player;
    const trap = this.traps.find(t => t.id === trapId);
    if (!trap) return;

    if (trap.active) {
      this.ui.showNotification(`Ловушка уже активна (${trap.timer.toFixed(0)}с)`);
      return;
    }

    if (p.money < GAME_CONFIG.TRAP_COST) {
      this.ui.showNotification(`❌ Недостаточно денег (нужно $${GAME_CONFIG.TRAP_COST})`);
      return;
    }

    p.money -= GAME_CONFIG.TRAP_COST;
    trap.active = true;
    trap.timer = GAME_CONFIG.TRAP_DURATION;
    trap.tickTimer = 0;
    this.entities.createTrapEffect(trap.id, trap.x, trap.z, trap.type);
    this.ui.showNotification(`⚡ ЛОВУШКА АКТИВИРОВАНА на ${GAME_CONFIG.TRAP_DURATION}с!`);
  }

  private updateLeaderboard() {
    const input = this.input.getState();
    if (input.tab && !this.tabDown) {
      this.tabDown = true;
      this.ui.showLeaderboard(true);
      this.ui.updateLeaderboard([{
        name: 'Ты (Локально)',
        kills: this.player.kills,
        money: this.player.money,
        health: this.player.hp,
      }]);
    } else if (!input.tab && this.tabDown) {
      this.tabDown = false;
      this.ui.showLeaderboard(false);
    }
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.animFrameId);
    this.entities.dispose();
    if (this.renderer) {
      this.renderer.dispose();
      this.renderer.domElement.remove();
    }
    this.input.exitPointerLock();
  }
}

// Add missing declare
declare module './LocalGame' {
  interface LocalGame {
    isSprinting: boolean;
    isCrouching: boolean;
  }
}
