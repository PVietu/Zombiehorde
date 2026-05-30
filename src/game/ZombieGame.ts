// ============================================================
// ZOMBIE HORDE — Main Game Engine
// Three.js r128 via CDN
// ============================================================

import { GAME_CONSTANTS as C } from './constants';
import type {
  Vec3, AABB, PlayerState, ZombieState,
  AcidPool, Barricade, Trap, CollisionBox, GamePhase, WeaponUpgrade
} from './types';
// GameConfig type (inline to avoid circular dependency)
interface GameConfig { mode: 'menu' | 'solo' | 'multiplayer'; serverUrl?: string; }

// Utility functions
function vec3(x = 0, y = 0, z = 0): Vec3 { return { x, y, z }; }
function vecDist2D(a: Vec3, b: Vec3): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2);
}
function clamp(v: number, mn: number, mx: number): number {
  return Math.max(mn, Math.min(mx, v));
}
function randomRange(a: number, b: number): number {
  return a + Math.random() * (b - a);
}
function aabbOverlap(a: AABB, b: AABB): boolean {
  return a.min.x < b.max.x && a.max.x > b.min.x &&
         a.min.z < b.max.z && a.max.z > b.min.z;
}
function makeDefaultUpgrade(): WeaponUpgrade {
  return { damage: 1.0, fireRate: 1.0, magSize: 1.0 };
}

// Three.js is loaded via CDN, referenced as window.THREE
declare const THREE: any;

// ============================================================
// COLLISION BOXES (world geometry)
// ============================================================
const WORLD_COLLISION_BOXES: Array<{ min: Vec3; max: Vec3 }> = [
  // Border walls
  { min: vec3(-60, 0, -60), max: vec3(60, 6, -59) },    // North
  { min: vec3(-60, 0, 59), max: vec3(-30, 6, 60) },     // South-L (gate gap)
  { min: vec3(30, 0, 59), max: vec3(60, 6, 60) },       // South-R
  { min: vec3(59, 0, -60), max: vec3(60, 6, 60) },      // East
  { min: vec3(-60, 0, -60), max: vec3(-59, 6, 60) },    // West
  // Main building (shelter)
  { min: vec3(-25, 0, -42), max: vec3(-5, 8, -28) },
  // Side building (warehouse)
  { min: vec3(18, 0, -36), max: vec3(32, 6, -24) },
  // Bunker
  { min: vec3(-36, 0, 6), max: vec3(-24, 5, 16) },
  // Tower base
  { min: vec3(27, 0, 17), max: vec3(33, 12, 23) },
  // Concrete blocks cluster 1
  { min: vec3(-10, 0, -10), max: vec3(-6, 1.5, -6) },
  { min: vec3(5, 0, -8), max: vec3(10, 1.5, -4) },
  { min: vec3(-18, 0, 20), max: vec3(-12, 1.5, 24) },
  { min: vec3(15, 0, 25), max: vec3(22, 1.5, 30) },
  // Crates
  { min: vec3(2, 0, 15), max: vec3(5, 1.0, 18) },
  { min: vec3(-5, 0, 28), max: vec3(-2, 1.0, 31) },
  { min: vec3(30, 0, -10), max: vec3(35, 1.2, -5) },
  // Sandbag walls
  { min: vec3(-8, 0, -2), max: vec3(-4, 0.8, 2) },
  { min: vec3(4, 0, -2), max: vec3(8, 0.8, 2) },
  // Vending machine
  { min: vec3(-12.6, 0, -28.6), max: vec3(-11.4, 2.2, -27.4) },
  // Mystery box spawn area (no collision)
  // Trap consoles
  { min: vec3(-45.5, 0, -0.5), max: vec3(-44.5, 1.2, 0.5) },
  { min: vec3(-0.5, 0, -0.5), max: vec3(0.5, 1.2, 0.5) },
];

// ============================================================
// PLAYER NAMES (random for solo)
// ============================================================
const PLAYER_NAMES = ['Wolf', 'Raven', 'Ghost', 'Snake', 'Viper', 'Storm', 'Blaze', 'Frost'];
const PLAYER_COLORS = [0x44ff88, 0x4488ff, 0xff8844, 0xff44ff, 0xffdd44, 0x44ffff, 0xff4444, 0x88ff44];

// ============================================================
// MAIN GAME CLASS
// ============================================================
export class ZombieGame {
  container: HTMLElement;
  config: GameConfig;
  isDestroyed = false;

  // Three.js
  scene: any;
  camera: any;
  renderer: any;
  clock: any;

  // Player state
  localPlayer!: PlayerState;

  // Controls
  keys = new Set<string>();
  mouseDX = 0;
  mouseDY = 0;
  yaw = 0;
  pitch = 0;
  rightMouseDown = false;
  pointerLocked = false;
  leftMouseDown = false;
  fireTimer = 0;
  reloading = false;
  reloadTimer = 0;
  currentMagAmmo = 30;
  bobTimer = 0;

  // Weapon mesh (first-person)
  weaponMesh: any = null;
  weaponGroup: any = null;
  muzzleFlashMesh: any = null;

  // Game state
  phase: GamePhase = 'waiting';
  wave = 0;
  showLeaderboard = false;
  showMinimap = true;
  zombieIdCounter = 0;
  acidProjectileCounter = 0;

  // Collections
  zombies = new Map<string, ZombieState>();
  zombieMeshes = new Map<string, any>();
  acidProjectiles: any[] = [];
  acidPools = new Map<string, AcidPool>();
  acidPoolMeshes = new Map<string, any>();
  barricades = new Map<string, Barricade>();
  barricadeMeshes = new Map<string, any>();
  traps: Trap[] = [
    { id: 0, position: vec3(-45, 0, 0), active: false, timer: 0, type: 'electric', damageTimer: 0 },
    { id: 1, position: vec3(0, 0, 0),   active: false, timer: 0, type: 'flamethrower', damageTimer: 0 },
  ];
  trapMeshes: any[] = [];
  healthDrops: any[] = [];

  // Multiplayer
  socket: any = null;
  remotePlayers = new Map<string, PlayerState>();
  remotePlayerMeshes = new Map<string, any>();

  // World meshes
  colBoxes: CollisionBox[] = [];
  vendingMachineMesh: any = null;
  vendingScreen: any = null;
  mysteryBoxMesh: any = null;
  mysteryBoxPos: Vec3 = vec3(20, 0, -20);

  // Minimap
  minimapCanvas: HTMLCanvasElement | null = null;
  minimapCtx: CanvasRenderingContext2D | null = null;

  // Interaction
  reviveTarget: string | null = null;
  reviveTimer = 0;
  interactCooldown = 0;

  // Down timer
  downTimerInterval: any = null;

  // Revive interaction
  eKeyHeld = false;
  eHoldTimer = 0;

  // Grenade
  activeGrenades: any[] = [];

  // Effects
  particles: any[] = [];

  constructor(container: HTMLElement, config: GameConfig) {
    this.container = container;
    this.config = config;
    this.init();
  }

  // ============================================================
  // INIT
  // ============================================================
  async init() {
    // Wait for THREE to be available
    await this.waitForThree();
    this.setupPlayer();
    this.setupScene();
    this.buildWorld();
    this.setupUI();
    this.setupControls();

    if (this.config.mode === 'multiplayer' && this.config.serverUrl) {
      this.connectToServer(this.config.serverUrl);
    }

    // Auto-start for solo
    if (this.config.mode === 'solo') {
      setTimeout(() => this.startWave(1), 3000);
      this.showWaveAnnounce('ZOMBIE HORDE', 'Первая волна начинается через 3 секунды!', 3000);
    }

    this.animate();
  }

  waitForThree(): Promise<void> {
    return new Promise(resolve => {
      if (typeof THREE !== 'undefined') { resolve(); return; }
      const check = setInterval(() => {
        if (typeof THREE !== 'undefined') { clearInterval(check); resolve(); }
      }, 100);
    });
  }

  // ============================================================
  // PLAYER SETUP
  // ============================================================
  setupPlayer() {
    const idx = Math.floor(Math.random() * PLAYER_NAMES.length);
    this.localPlayer = {
      id: 'local_' + Math.random().toString(36).slice(2, 8),
      name: PLAYER_NAMES[idx],
      color: PLAYER_COLORS[idx],
      position: vec3(0, C.PLAYER_HEIGHT, 5),
      rotation: 0,
      hp: C.PLAYER_MAX_HP,
      maxHp: C.PLAYER_MAX_HP,
      isDown: false,
      isDead: false,
      isSprinting: false,
      isCrouching: false,
      weapon: 'ak47',
      ammoAkReserve: C.AK47_MAX_AMMO - C.AK47_MAG_SIZE,
      money: 0,
      kills: 0,
      streak: 0,
      grenadeCount: 0,
      boosted: false,
      boostType: '',
      boostTimer: 0,
      weaponUpgrades: {
        ak47: makeDefaultUpgrade(),
        pistol: makeDefaultUpgrade(),
      },
      barricadeCount: 0,
      downTimer: 0,
      respawnTimer: 0,
    } as any;
    this.currentMagAmmo = C.AK47_MAG_SIZE;
  }

  // ============================================================
  // SCENE SETUP
  // ============================================================
  setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87ceeb);
    this.scene.fog = new THREE.FogExp2(0x87ceeb, 0.008);

    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 500);
    this.camera.position.set(0, C.PLAYER_HEIGHT, 5);
    this.camera.rotation.order = 'YXZ';

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    // Lighting
    const ambient = new THREE.AmbientLight(0xffeedd, 0.5);
    this.scene.add(ambient);

    const sun = new THREE.DirectionalLight(0xfff5e0, 1.2);
    sun.position.set(40, 60, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 200;
    sun.shadow.camera.left = -80;
    sun.shadow.camera.right = 80;
    sun.shadow.camera.top = 80;
    sun.shadow.camera.bottom = -80;
    sun.shadow.bias = -0.001;
    this.scene.add(sun);

    const hemi = new THREE.HemisphereLight(0x87ceeb, 0x4a4a4a, 0.4);
    this.scene.add(hemi);

    this.clock = new THREE.Clock();

    // Resize
    window.addEventListener('resize', () => {
      if (this.isDestroyed) return;
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });

    // First-person weapon
    this.setupWeaponMesh();
  }

  setupWeaponMesh() {
    this.weaponGroup = new THREE.Group();
    this.camera.add(this.weaponGroup);
    this.scene.add(this.camera);

    // AK-47 model (simplified)
    const akGroup = new THREE.Group();

    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x3a2a1a });
    const metalMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
    const woodMat = new THREE.MeshLambertMaterial({ color: 0x5a3010 });

    // Main body
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.45), bodyMat);
    body.position.z = -0.2;
    akGroup.add(body);

    // Stock
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.18), woodMat);
    stock.position.set(0, -0.01, 0.12);
    akGroup.add(stock);

    // Barrel
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.25, 8), metalMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.01, -0.45);
    akGroup.add(barrel);

    // Magazine
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.05), bodyMat);
    mag.position.set(0, -0.07, -0.15);
    akGroup.add(mag);

    // Grip
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.04), woodMat);
    grip.position.set(0, -0.07, 0.02);
    akGroup.add(grip);

    // Muzzle flash
    const flashGeo = new THREE.SphereGeometry(0.06, 6, 6);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffaa22, transparent: true, opacity: 0 });
    this.muzzleFlashMesh = new THREE.Mesh(flashGeo, flashMat);
    this.muzzleFlashMesh.position.set(0, 0.01, -0.58);
    akGroup.add(this.muzzleFlashMesh);

    akGroup.position.set(0.2, -0.18, -0.35);
    this.weaponMesh = akGroup;
    this.weaponGroup.add(akGroup);

    // Pistol model (hidden by default)
    const pistolGroup = new THREE.Group();
    const pb = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.09, 0.15), metalMat);
    pb.position.z = -0.07;
    pistolGroup.add(pb);
    const pb2 = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.1, 0.04), metalMat);
    pb2.position.set(0, -0.06, 0);
    pistolGroup.add(pb2);
    const pBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.12, 6), metalMat);
    pBarrel.rotation.x = Math.PI / 2;
    pBarrel.position.set(0, 0.01, -0.16);
    pistolGroup.add(pBarrel);
    pistolGroup.position.set(0.15, -0.18, -0.3);
    pistolGroup.visible = false;
    (pistolGroup as any).isPistol = true;
    this.weaponGroup.add(pistolGroup);
    (this.weaponGroup as any).pistolMesh = pistolGroup;
  }

  // ============================================================
  // WORLD BUILDING
  // ============================================================
  buildWorld() {
    // Ground
    const groundGeo = new THREE.PlaneGeometry(120, 120, 20, 20);
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x4a6040 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Ground pattern (darker patches)
    for (let i = 0; i < 30; i++) {
      const patchGeo = new THREE.PlaneGeometry(randomRange(3, 8), randomRange(3, 8));
      const patchMat = new THREE.MeshLambertMaterial({ color: 0x3a5030, transparent: true, opacity: 0.5 });
      const patch = new THREE.Mesh(patchGeo, patchMat);
      patch.rotation.x = -Math.PI / 2;
      patch.position.set(randomRange(-55, 55), 0.01, randomRange(-55, 55));
      this.scene.add(patch);
    }

    // Setup collision boxes
    this.colBoxes = [];
    for (const cb of WORLD_COLLISION_BOXES) {
      this.colBoxes.push({ aabb: { min: cb.min, max: cb.max }, isSolid: true });
    }

    // Build visual geometry
    this.buildBorderWalls();
    this.buildMainBuilding();
    this.buildWarehouse();
    this.buildBunker();
    this.buildTower();
    this.buildConcreteBlocks();
    this.buildCrates();
    this.buildLightPoles();
    this.buildBarrels();
    this.buildVendingMachine();
    this.buildMysteryBox();
    this.buildTrapConsoles();
    this.buildGate();
  }

  buildBorderWalls() {
    const wallMat = new THREE.MeshLambertMaterial({ color: 0x8a8a7a });
    const wallH = 5;

    const makeWall = (w: number, h: number, d: number, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    };

    // N, E, W full walls
    makeWall(120, wallH, 1, 0, wallH / 2, -59.5);
    makeWall(1, wallH, 120, 59.5, wallH / 2, 0);
    makeWall(1, wallH, 120, -59.5, wallH / 2, 0);
    // S-L, S-R (gate gap -30..30)
    makeWall(30, wallH, 1, -45, wallH / 2, 59.5);
    makeWall(30, wallH, 1, 45, wallH / 2, 59.5);

    // Wall decorations (battlements)
    const battMat = new THREE.MeshLambertMaterial({ color: 0x9a9a8a });
    for (let i = -55; i <= 55; i += 10) {
      const batt = new THREE.Mesh(new THREE.BoxGeometry(3, 1.5, 1.5), battMat);
      batt.position.set(i, wallH + 0.75, -59.5);
      batt.castShadow = true;
      this.scene.add(batt);
    }
  }

  buildMainBuilding() {
    const wallMat = new THREE.MeshLambertMaterial({ color: 0x8a7a6a });
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x6a5a4a });
    const doorMat = new THREE.MeshLambertMaterial({ color: 0x332211 });

    // Building body (-25..–5, z:-42..–28)
    const w = 20, d = 14, h = 8;
    const cx = -15, cz = -35;

    // Walls (hollow by making 4 wall segments)
    const wallT = 0.8;
    // North wall
    const nw = new THREE.Mesh(new THREE.BoxGeometry(w, h, wallT), wallMat);
    nw.position.set(cx, h / 2, -42); nw.castShadow = true; nw.receiveShadow = true; this.scene.add(nw);
    // South wall (with door gap)
    const sw1 = new THREE.Mesh(new THREE.BoxGeometry(6, h, wallT), wallMat);
    sw1.position.set(cx - 7, h / 2, -28); sw1.castShadow = true; sw1.receiveShadow = true; this.scene.add(sw1);
    const sw2 = new THREE.Mesh(new THREE.BoxGeometry(6, h, wallT), wallMat);
    sw2.position.set(cx + 7, h / 2, -28); sw2.castShadow = true; sw2.receiveShadow = true; this.scene.add(sw2);
    const sw3 = new THREE.Mesh(new THREE.BoxGeometry(4, h - 2.5, wallT), wallMat); // above door
    sw3.position.set(cx, h / 2 + 1.25, -28); sw3.castShadow = true; this.scene.add(sw3);
    // Door
    const door = new THREE.Mesh(new THREE.BoxGeometry(4, 2.5, 0.2), doorMat);
    door.position.set(cx, 1.25, -28.1); this.scene.add(door);
    // E wall
    const ew = new THREE.Mesh(new THREE.BoxGeometry(wallT, h, d), wallMat);
    ew.position.set(-5, h / 2, cz); ew.castShadow = true; ew.receiveShadow = true; this.scene.add(ew);
    // W wall
    const ww = new THREE.Mesh(new THREE.BoxGeometry(wallT, h, d), wallMat);
    ww.position.set(-25, h / 2, cz); ww.castShadow = true; ww.receiveShadow = true; this.scene.add(ww);
    // Roof
    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 1, 0.5, d + 1), roofMat);
    roof.position.set(cx, h + 0.25, cz); roof.castShadow = true; roof.receiveShadow = true; this.scene.add(roof);

    // Windows
    const winMat = new THREE.MeshBasicMaterial({ color: 0x4488aa, transparent: true, opacity: 0.6 });
    for (const wz of [-42, -36, -30]) {
      const win = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 0.1), winMat);
      win.position.set(cx - 5, 4, wz === -42 ? wz + 0.5 : wz); this.scene.add(win);
      const win2 = win.clone();
      win2.position.set(cx + 5, 4, wz === -42 ? wz + 0.5 : wz); this.scene.add(win2);
    }
  }

  buildWarehouse() {
    const wallMat = new THREE.MeshLambertMaterial({ color: 0x7a7060 });
    const roofMat = new THREE.MeshLambertMaterial({ color: 0x884422 }); // red roof

    const w = 14, d = 12, h = 6, cx = 25, cz = -30;
    const wallT = 0.6;

    const addWall = (ww: number, wh: number, wd: number, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(ww, wh, wd), wallMat);
      m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; this.scene.add(m);
    };
    addWall(w, h, wallT, cx, h / 2, cz - 6);
    addWall(w, h, wallT, cx, h / 2, cz + 6);
    addWall(wallT, h, d, cx - 7, h / 2, cz);
    addWall(wallT, h, d, cx + 7, h / 2, cz);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.4, d + 0.5), roofMat);
    roof.position.set(cx, h + 0.2, cz); roof.castShadow = true; this.scene.add(roof);
  }

  buildBunker() {
    const mat = new THREE.MeshLambertMaterial({ color: 0x6a6a5a });
    // Body (-36..–24, z:6..16)
    const body = new THREE.Mesh(new THREE.BoxGeometry(12, 4, 10), mat);
    body.position.set(-30, 2, 11); body.castShadow = true; body.receiveShadow = true; this.scene.add(body);
    // Entrance ramp
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(3, 0.4, 4), mat);
    ramp.position.set(-30, 0, 5.5); ramp.castShadow = true; this.scene.add(ramp);
    // Roof sandbags
    const sbMat = new THREE.MeshLambertMaterial({ color: 0x8a7a50 });
    for (let i = -4; i <= 4; i += 2) {
      const sb = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 1, 8), sbMat);
      sb.rotation.z = Math.PI / 2;
      sb.position.set(-30 + i, 4.5, 11); this.scene.add(sb);
    }
  }

  buildTower() {
    const mat = new THREE.MeshLambertMaterial({ color: 0x8a8a7a });
    const metalMat = new THREE.MeshLambertMaterial({ color: 0x555544 });

    // Tower body 27..33, z:17..23, h:12
    const body = new THREE.Mesh(new THREE.BoxGeometry(6, 10, 6), mat);
    body.position.set(30, 5, 20); body.castShadow = true; body.receiveShadow = true; this.scene.add(body);

    // Platform
    const plat = new THREE.Mesh(new THREE.BoxGeometry(8, 0.5, 8), mat);
    plat.position.set(30, 10.25, 20); plat.castShadow = true; this.scene.add(plat);

    // Railing
    const railMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
    for (let i = -3; i <= 3; i += 1.5) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1, 0.1), railMat);
      post.position.set(30 + i, 11, 24); this.scene.add(post);
      const post2 = post.clone();
      post2.position.set(30 + i, 11, 16); this.scene.add(post2);
    }

    // Ladder
    const ladderMat = new THREE.MeshLambertMaterial({ color: 0x333322 });
    const ladder = new THREE.Mesh(new THREE.BoxGeometry(0.4, 10, 0.1), ladderMat);
    ladder.position.set(33, 5, 20); this.scene.add(ladder);
  }

  buildConcreteBlocks() {
    const mat = new THREE.MeshLambertMaterial({ color: 0x8a8a8a });
    const positions = [
      [-8, 0, -8, 4, 1.5, 4],
      [7.5, 0, -6, 5, 1.5, 4],
      [-15, 0, 22, 6, 1.5, 4],
      [18.5, 0, 27.5, 7, 1.5, 5],
      [-8, 0, 0, 4, 0.8, 4],   // sandbag wall L
      [6, 0, 0, 4, 0.8, 4],    // sandbag wall R
    ];
    for (const [x, y, z, w, h, d] of positions) {
      const block = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      block.position.set(x, h / 2, z); block.castShadow = true; block.receiveShadow = true;
      this.scene.add(block);
    }
  }

  buildCrates() {
    const crateMat = new THREE.MeshLambertMaterial({ color: 0x7a6040 });
    const cratePositions = [
      [3.5, 15], [-3.5, 29.5], [32.5, -7.5]
    ];
    for (const [x, z] of cratePositions) {
      const crate = new THREE.Mesh(new THREE.BoxGeometry(3, 1, 3), crateMat);
      crate.position.set(x, 0.5, z); crate.castShadow = true; this.scene.add(crate);
      // Crate lines
      const lineGeo = new THREE.EdgesGeometry(crate.geometry);
      const lineMat = new THREE.LineBasicMaterial({ color: 0x5a4020 });
      const lines = new THREE.LineSegments(lineGeo, lineMat);
      crate.add(lines);
    }
  }

  buildLightPoles() {
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x555555 });
    const polePositions = [[-20, -20], [20, -20], [-20, 20], [20, 20], [0, -40], [40, 0]];
    for (const [x, z] of polePositions) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 8, 8), poleMat);
      pole.position.set(x, 4, z); pole.castShadow = true; this.scene.add(pole);
      const arm = new THREE.Mesh(new THREE.BoxGeometry(2, 0.1, 0.1), poleMat);
      arm.position.set(x + 1, 8, z); this.scene.add(arm);
      const light = new THREE.PointLight(0xffffcc, 0.8, 15);
      light.position.set(x + 2, 8, z);
      this.scene.add(light);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.15, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffffcc }));
      bulb.position.set(x + 2, 7.8, z); this.scene.add(bulb);
    }
  }

  buildBarrels() {
    const barrelMat = new THREE.MeshLambertMaterial({ color: 0x553322 });
    const barrelPositions = [
      [-8, -15], [10, 5], [-20, 5], [35, 5], [15, 40], [-30, -5]
    ];
    for (const [x, z] of barrelPositions) {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.9, 12), barrelMat);
      barrel.position.set(x, 0.45, z); barrel.castShadow = true; this.scene.add(barrel);
      // Barrel ring
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.04, 6, 12), new THREE.MeshLambertMaterial({ color: 0x333333 }));
      ring.position.set(x, 0.65, z); ring.rotation.x = Math.PI / 2; this.scene.add(ring);
    }
  }

  buildVendingMachine() {
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x1144aa });
    const screenMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
    const trimMat = new THREE.MeshLambertMaterial({ color: 0x888888 });

    // Position: x=-12, z=-28
    const vmGroup = new THREE.Group();
    vmGroup.position.set(-12, 0, -28);

    // Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2.2, 0.7), bodyMat);
    body.position.y = 1.1; body.castShadow = true; vmGroup.add(body);

    // Screen
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.5), screenMat);
    screen.position.set(0, 1.6, 0.36); vmGroup.add(screen);
    this.vendingScreen = screen;

    // Screen glow
    const ptLight = new THREE.PointLight(0x00ff88, 0.6, 3);
    ptLight.position.set(0, 1.6, 0.5); vmGroup.add(ptLight);
    (vmGroup as any).screenLight = ptLight;

    // Slots panel
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.6), new THREE.MeshLambertMaterial({ color: 0x223388 }));
    panel.position.set(0, 0.9, 0.36); vmGroup.add(panel);

    // Label
    const labelMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.2), labelMat);
    label.position.set(0, 2.1, 0.36); vmGroup.add(label);

    // Trim
    const trim = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.05, 0.72), trimMat);
    trim.position.y = 2.2; vmGroup.add(trim);

    this.scene.add(vmGroup);
    this.vendingMachineMesh = vmGroup;
  }

  buildMysteryBox() {
    const boxMat = new THREE.MeshLambertMaterial({ color: 0x330066 });
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xaa00ff, transparent: true, opacity: 0.6 });

    const boxGroup = new THREE.Group();
    boxGroup.position.set(this.mysteryBoxPos.x, 0, this.mysteryBoxPos.z);

    const box = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), boxMat);
    box.position.y = 0.4; box.castShadow = true; boxGroup.add(box);

    // Glowing edges
    const edgeGeo = new THREE.EdgesGeometry(box.geometry);
    const edgeLines = new THREE.LineSegments(edgeGeo, new THREE.LineBasicMaterial({ color: 0xaa00ff }));
    edgeLines.position.y = 0.4; boxGroup.add(edgeLines);

    // Question mark (simplified plane)
    const qMat = new THREE.MeshBasicMaterial({ color: 0xffdd00 });
    const qMark = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.4), qMat);
    qMark.position.set(0, 0.4, 0.42); boxGroup.add(qMark);

    const ptLight = new THREE.PointLight(0xaa00ff, 1, 5);
    ptLight.position.set(0, 1, 0); boxGroup.add(ptLight);

    this.scene.add(boxGroup);
    this.mysteryBoxMesh = boxGroup;
  }

  buildTrapConsoles() {
    const consoleMat = new THREE.MeshLambertMaterial({ color: 0x334433 });
    const screenMat = new THREE.MeshBasicMaterial({ color: 0x44ff44 });

    for (const trap of this.traps) {
      const g = new THREE.Group();
      g.position.set(trap.position.x, 0, trap.position.z);

      const body = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.2, 0.4), consoleMat);
      body.position.y = 0.6; body.castShadow = true; g.add(body);

      const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.3), screenMat);
      scr.position.set(0, 0.9, 0.21); g.add(scr);

      const btn = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff4444 }));
      btn.position.set(0, 0.55, 0.21); g.add(btn);

      const ptLight = new THREE.PointLight(0x44ff44, 0.4, 3);
      ptLight.position.set(0, 0.9, 0.3); g.add(ptLight);
      (g as any).statusLight = ptLight;

      this.scene.add(g);
      this.trapMeshes.push(g);
    }
  }

  buildGate() {
    const gateMat = new THREE.MeshLambertMaterial({ color: 0x554433 });
    const gateMetal = new THREE.MeshLambertMaterial({ color: 0x666655 });

    // Gate posts
    const post1 = new THREE.Mesh(new THREE.BoxGeometry(1.5, 6, 1.5), gateMetal);
    post1.position.set(-30.75, 3, 59.5); post1.castShadow = true; this.scene.add(post1);
    const post2 = post1.clone();
    post2.position.set(30.75, 3, 59.5); this.scene.add(post2);

    // Gate bars
    for (let x = -28; x <= 28; x += 4) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.3, 5, 0.3), gateMat);
      bar.position.set(x, 2.5, 59.5); this.scene.add(bar);
    }
  }

  // ============================================================
  // UI SETUP
  // ============================================================
  setupUI() {
    const hud = document.createElement('div');
    hud.id = 'game-hud';
    hud.innerHTML = this.buildHudHTML();
    this.container.appendChild(hud);

    // Minimap canvas
    this.minimapCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
    if (this.minimapCanvas) {
      this.minimapCtx = this.minimapCanvas.getContext('2d');
    }

    // Return button
    const returnBtn = document.createElement('button');
    returnBtn.textContent = '← Меню';
    returnBtn.style.cssText = `
      position:fixed;top:16px;left:50%;transform:translateX(-50%);
      background:rgba(0,0,0,0.7);color:#ff4444;border:1px solid #ff4444;
      border-radius:4px;padding:6px 16px;font-size:13px;cursor:pointer;z-index:1000;
      font-family:monospace;transition:all 0.2s;
    `;
    returnBtn.onmouseover = () => returnBtn.style.background = 'rgba(255,68,68,0.2)';
    returnBtn.onmouseout = () => returnBtn.style.background = 'rgba(0,0,0,0.7)';
    returnBtn.onclick = () => {
      if ((window as any).__GAME_RETURN__) (window as any).__GAME_RETURN__();
    };
    this.container.appendChild(returnBtn);

    // Vending machine UI overlay
    this.setupVendingUI();
    this.updateHUD();
  }

  buildHudHTML(): string {
    return `
<style>
  #game-hud * { box-sizing: border-box; font-family: 'Courier New', monospace; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.5} }
  @keyframes slideUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
  @keyframes killFeedOut { to{opacity:0;transform:translateX(20px)} }
  @keyframes flashIn { 0%{transform:scale(1.3)} 100%{transform:scale(1)} }
  @keyframes waveFlash { 0%{opacity:0;transform:scale(0.8)} 20%{opacity:1;transform:scale(1)} 80%{opacity:1} 100%{opacity:0} }
  @keyframes hpPulse { 0%,100%{box-shadow:0 0 6px #ff4444} 50%{box-shadow:0 0 18px #ff4444} }
  @keyframes boostGlow { 0%,100%{box-shadow:0 0 8px #ffdd44} 50%{box-shadow:0 0 20px #ffdd44} }
  @keyframes comboFlash { 0%{transform:scale(1.2) translateX(-50%)} 100%{transform:scale(1) translateX(-50%)} }

  #game-hud { position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:100; }

  /* HP Bar */
  #hp-container {
    position:fixed;bottom:80px;left:20px;width:220px;
    background:rgba(0,0,0,0.75);border:1px solid rgba(255,68,68,0.5);border-radius:6px;padding:8px 12px;
  }
  #hp-label { color:#ff6666;font-size:11px;letter-spacing:2px;margin-bottom:4px; }
  #hp-bar-bg { background:rgba(255,255,255,0.1);border-radius:3px;height:12px;overflow:hidden; }
  #hp-bar { height:100%;background:linear-gradient(90deg,#ff2222,#ff6666);border-radius:3px;transition:width 0.2s; }
  #hp-text { color:#ffaaaa;font-size:11px;margin-top:3px;text-align:right; }

  /* Ammo */
  #ammo-container {
    position:fixed;bottom:20px;right:20px;
    background:rgba(0,0,0,0.75);border:1px solid rgba(255,200,0,0.4);border-radius:6px;padding:8px 16px;text-align:right;
  }
  #weapon-name { color:#ffdd44;font-size:12px;letter-spacing:2px;margin-bottom:4px; }
  #ammo-display { color:#ffffff;font-size:22px;font-weight:bold; }
  #ammo-reserve { color:#aaaaaa;font-size:14px; }

  /* Money */
  #money-container {
    position:fixed;bottom:80px;right:20px;
    background:rgba(0,0,0,0.75);border:1px solid rgba(255,220,50,0.4);border-radius:6px;padding:6px 16px;
  }
  #money-display { color:#ffdd44;font-size:18px;font-weight:bold; }

  /* Grenades */
  #grenades-container {
    position:fixed;bottom:140px;right:20px;
    background:rgba(0,0,0,0.7);border:1px solid rgba(255,150,50,0.4);border-radius:6px;padding:5px 12px;font-size:14px;color:#ffaa44;
  }

  /* Wave */
  #wave-container {
    position:fixed;top:16px;right:20px;
    background:rgba(0,0,0,0.75);border:1px solid rgba(255,100,100,0.5);border-radius:6px;padding:6px 16px;text-align:center;
  }
  #wave-display { color:#ff6644;font-size:16px;font-weight:bold;letter-spacing:2px; }
  #zombie-count { color:#aaaaaa;font-size:11px;margin-top:2px; }
  #wave-timer { color:#888888;font-size:10px;margin-top:2px; }

  /* Boosts */
  #boosts-container {
    position:fixed;top:80px;right:20px;display:flex;flex-direction:column;gap:4px;
  }
  .boost-indicator {
    background:rgba(0,0,0,0.8);border:1px solid #ffdd44;border-radius:4px;
    padding:3px 10px;font-size:11px;color:#ffdd44;animation:boostGlow 1s infinite;
  }

  /* Combo */
  #combo-display {
    position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
    text-align:center;opacity:0;transition:opacity 0.3s;pointer-events:none;
  }
  #combo-text { color:#ffdd44;font-size:32px;font-weight:bold;text-shadow:0 0 20px #ffaa00; }
  #combo-sub { color:#ffaaaa;font-size:16px;text-shadow:0 0 10px #ff4444; }

  /* Wave announce */
  #wave-announce {
    position:fixed;top:35%;left:50%;transform:translateX(-50%);
    text-align:center;opacity:0;transition:opacity 0.5s;pointer-events:none;
  }
  #wave-announce-text { color:#ff4444;font-size:42px;font-weight:bold;text-shadow:0 0 30px #ff0000,0 2px 0 #000; }
  #wave-announce-sub { color:#ffaaaa;font-size:18px;margin-top:8px; }

  /* Kill feed */
  #kill-feed {
    position:fixed;top:80px;left:20px;width:240px;
    display:flex;flex-direction:column;gap:4px;
  }

  /* Interact prompt */
  #interact-prompt {
    position:fixed;bottom:45%;left:50%;transform:translateX(-50%);
    background:rgba(0,0,0,0.85);border:1px solid #44ff88;border-radius:6px;
    padding:8px 20px;text-align:center;display:none;
  }
  #interact-key { color:#44ff88;font-size:14px;font-weight:bold; }
  #interact-text { color:#cccccc;font-size:12px;margin-top:2px; }

  /* Crosshair */
  #crosshair {
    position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
    pointer-events:none;
  }
  .ch-h { width:16px;height:2px;background:#fff;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%); }
  .ch-v { width:2px;height:16px;background:#fff;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%); }
  .ch-dot { width:3px;height:3px;background:#fff;border-radius:50%;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%); }

  /* Reload bar */
  #reload-bar-container {
    position:fixed;bottom:180px;left:50%;transform:translateX(-50%);
    width:200px;background:rgba(0,0,0,0.7);border:1px solid #ffdd44;border-radius:4px;padding:4px;display:none;
  }
  #reload-text { color:#ffdd44;font-size:11px;text-align:center;margin-bottom:2px;display:none; }
  #reload-bar-bg { background:rgba(255,255,255,0.1);border-radius:2px;height:6px;overflow:hidden; }
  #reload-bar { height:100%;background:#ffdd44;width:0%;transition:width 0.05s; }

  /* Leaderboard */
  #leaderboard {
    position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
    background:rgba(0,0,0,0.9);border:1px solid #44ff88;border-radius:8px;
    padding:20px 30px;min-width:320px;display:none;
  }
  #leaderboard h2 { color:#44ff88;text-align:center;margin:0 0 16px;letter-spacing:3px;font-size:18px; }
  #leaderboard-content div { padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.1);color:#cccccc;font-size:14px; }
  #leaderboard-content .local-row { color:#44ff88; }

  /* Minimap */
  #minimap-container {
    position:fixed;top:16px;left:20px;
    background:rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.2);border-radius:4px;
    overflow:hidden;width:130px;height:130px;
  }
  #minimap-label { position:absolute;top:2px;right:4px;color:rgba(255,255,255,0.5);font-size:9px; }

  /* Down / death screens */
  #down-overlay {
    position:fixed;top:0;left:0;width:100%;height:100%;
    background:rgba(200,0,0,0.3);display:none;align-items:center;justify-content:center;flex-direction:column;
  }
  #down-text { color:#ff4444;font-size:48px;font-weight:bold;text-shadow:0 0 30px #ff0000; }
  #down-timer-text { color:#ffaaaa;font-size:20px;margin-top:10px; }
  #down-crawl-text { color:#ff8888;font-size:14px;margin-top:6px; }

  #victory-screen {
    position:fixed;top:0;left:0;width:100%;height:100%;
    background:rgba(0,0,0,0.85);display:none;align-items:center;justify-content:center;flex-direction:column;
    pointer-events:all;
  }
  #victory-screen h1 { color:#ffdd44;font-size:64px;text-shadow:0 0 40px #ffaa00; }
  #victory-screen p { color:#88ff88;font-size:22px;margin-top:10px; }
  #victory-btn { margin-top:30px;padding:12px 40px;background:#ffdd44;color:#000;border:none;border-radius:6px;font-size:18px;cursor:pointer;font-family:monospace;font-weight:bold; }

  #defeat-screen {
    position:fixed;top:0;left:0;width:100%;height:100%;
    background:rgba(0,0,0,0.9);display:none;align-items:center;justify-content:center;flex-direction:column;
    pointer-events:all;
  }
  #defeat-screen h1 { color:#ff4444;font-size:56px;text-shadow:0 0 30px #ff0000; }
  #defeat-screen p { color:#ff8888;font-size:18px;margin-top:10px; }
  #defeat-btn { margin-top:30px;padding:12px 40px;background:#ff4444;color:#fff;border:none;border-radius:6px;font-size:18px;cursor:pointer;font-family:monospace;font-weight:bold; }

  /* Streak bar */
  #streak-container {
    position:fixed;bottom:200px;left:20px;
    background:rgba(0,0,0,0.7);border:1px solid rgba(255,200,0,0.4);border-radius:6px;padding:5px 10px;
  }
  #streak-text { color:#ffdd44;font-size:11px; }
  #streak-bar-bg { background:rgba(255,255,255,0.1);border-radius:3px;height:5px;margin-top:3px;width:180px;overflow:hidden; }
  #streak-bar { height:100%;background:linear-gradient(90deg,#ff8800,#ffdd44);width:0%;transition:width 0.3s; }

  /* Barricade count */
  #barricade-container {
    position:fixed;bottom:160px;left:20px;
    background:rgba(0,0,0,0.7);border:1px solid rgba(100,100,200,0.4);border-radius:6px;padding:5px 12px;color:#aaaaff;font-size:12px;
  }
</style>

<!-- Crosshair -->
<div id="crosshair"><div class="ch-h"></div><div class="ch-v"></div><div class="ch-dot"></div></div>

<!-- HP -->
<div id="hp-container">
  <div id="hp-label">ЗДОРОВЬЕ</div>
  <div id="hp-bar-bg"><div id="hp-bar" style="width:100%"></div></div>
  <div id="hp-text">100 / 100</div>
</div>

<!-- Ammo -->
<div id="ammo-container">
  <div id="weapon-name">AK-47</div>
  <div><span id="ammo-mag" style="font-size:28px;color:#ffdd44;font-weight:bold;">30</span><span style="color:#888;font-size:18px;"> / </span><span id="ammo-reserve" style="color:#aaaaaa;font-size:18px;">180</span></div>
</div>

<!-- Money -->
<div id="money-container"><div id="money-display">$0</div></div>

<!-- Grenades -->
<div id="grenades-container"><div id="grenades-display">🧨 x0</div></div>

<!-- Wave -->
<div id="wave-container">
  <div id="wave-display">ВОЛНА 0/10</div>
  <div id="zombie-count">Зомби: 0</div>
  <div id="wave-timer"></div>
</div>

<!-- Boosts -->
<div id="boosts-container"></div>

<!-- Combo -->
<div id="combo-display"><div id="combo-text"></div><div id="combo-sub"></div></div>

<!-- Wave announce -->
<div id="wave-announce"><div id="wave-announce-text"></div><div id="wave-announce-sub"></div></div>

<!-- Kill feed -->
<div id="kill-feed"></div>

<!-- Interact prompt -->
<div id="interact-prompt" style="pointer-events:none;">
  <div id="interact-key">[E]</div>
  <div id="interact-text">Взаимодействие</div>
</div>

<!-- Reload -->
<div id="reload-text" style="position:fixed;bottom:190px;left:50%;transform:translateX(-50%);color:#ffdd44;font-size:13px;display:none;">ПЕРЕЗАРЯДКА...</div>
<div id="reload-bar-container"><div id="reload-bar-bg"><div id="reload-bar"></div></div></div>

<!-- Leaderboard -->
<div id="leaderboard" style="pointer-events:all;">
  <h2>🏆 ЛИДЕРЫ</h2>
  <div id="leaderboard-content"></div>
</div>

<!-- Minimap -->
<div id="minimap-container" style="pointer-events:none;">
  <canvas id="minimap-canvas" width="130" height="130"></canvas>
  <div id="minimap-label">M</div>
</div>

<!-- Streak -->
<div id="streak-container">
  <div id="streak-text">СЕРИЯ: <span id="streak-count">0</span></div>
  <div id="streak-bar-bg"><div id="streak-bar"></div></div>
</div>

<!-- Barricades -->
<div id="barricade-container">🧱 Баррикады: <span id="barricade-count">0</span>/3</div>

<!-- Down overlay -->
<div id="down-overlay" style="display:none;flex-direction:column;align-items:center;justify-content:center;">
  <div id="down-text">ВЫ РАНЕНЫ!</div>
  <div id="down-timer-text">Осталось: 15 сек</div>
  <div id="down-crawl-text">Зажмите E на союзника для реанимации</div>
</div>

<!-- Victory -->
<div id="victory-screen" style="display:none;">
  <h1>🏆 ПОБЕДА!</h1>
  <p>Ширибазаров повержен! Вы спасли базу!</p>
  <button id="victory-btn" onclick="if(window.__GAME_RETURN__)window.__GAME_RETURN__()">В меню</button>
</div>

<!-- Defeat -->
<div id="defeat-screen" style="display:none;">
  <h1>💀 ПОРАЖЕНИЕ</h1>
  <p>База пала. Попробуйте снова...</p>
  <button id="defeat-btn" onclick="if(window.__GAME_RETURN__)window.__GAME_RETURN__()">В меню</button>
</div>
    `;
  }

  setupVendingUI() {
    const vendingUI = document.createElement('div');
    vendingUI.id = 'vending-ui';
    vendingUI.style.cssText = `
      position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);
      background:rgba(0,10,30,0.97);border:2px solid #0066ff;border-radius:12px;
      padding:24px 32px;min-width:360px;display:none;z-index:500;pointer-events:all;
      box-shadow:0 0 30px rgba(0,100,255,0.5);font-family:monospace;
    `;
    vendingUI.innerHTML = `
      <h2 style="color:#44aaff;text-align:center;margin:0 0 16px;letter-spacing:3px;font-size:18px;">🛒 АВТОМАТ СНАРЯЖЕНИЯ</h2>
      <div id="vending-money" style="text-align:center;color:#ffdd44;font-size:14px;margin-bottom:16px;"></div>
      <div style="display:flex;flex-direction:column;gap:10px;">
        <div class="vm-item" data-action="ammo">
          <span style="color:#ffdd44;font-size:16px;">💥 Патроны АК</span>
          <span style="color:#aaaaaa;font-size:12px;">0-10 случайных патронов</span>
          <button class="vm-btn" onclick="window.__game__.vendingBuy('ammo')">$50</button>
        </div>
        <div class="vm-item" data-action="health">
          <span style="color:#ff6666;font-size:16px;">❤️ Аптечка</span>
          <span style="color:#aaaaaa;font-size:12px;">+30 HP (до 100)</span>
          <button class="vm-btn" onclick="window.__game__.vendingBuy('health')">$100</button>
        </div>
        <div class="vm-item" data-action="boost">
          <span style="color:#ffdd44;font-size:16px;">⚡ Усиление</span>
          <span style="color:#aaaaaa;font-size:12px;">Случайный буст 15 сек</span>
          <button class="vm-btn" onclick="window.__game__.vendingBuy('boost')">$150</button>
        </div>
        <div class="vm-item" data-action="grenade">
          <span style="color:#ff8844;font-size:16px;">🧨 Граната</span>
          <span style="color:#aaaaaa;font-size:12px;">1 граната, взрыв 2 сек</span>
          <button class="vm-btn" onclick="window.__game__.vendingBuy('grenade')">$200</button>
        </div>
      </div>
      <button onclick="window.__game__.closeVendingUI()" style="
        margin-top:16px;width:100%;padding:8px;background:rgba(255,0,0,0.2);
        border:1px solid #ff4444;color:#ff4444;border-radius:4px;cursor:pointer;font-family:monospace;font-size:13px;
      ">✕ Закрыть</button>
      <style>
        .vm-item { background:rgba(255,255,255,0.05);border:1px solid rgba(68,170,255,0.3);border-radius:6px;padding:10px 14px;display:flex;flex-direction:column;gap:3px;position:relative; }
        .vm-btn { position:absolute;right:12px;top:50%;transform:translateY(-50%);padding:6px 14px;background:#1144aa;border:1px solid #44aaff;color:#fff;border-radius:4px;cursor:pointer;font-family:monospace;font-size:13px;font-weight:bold;transition:background 0.2s; }
        .vm-btn:hover { background:#2255cc; }
      </style>
    `;
    this.container.appendChild(vendingUI);
    (window as any).__game__ = this;
  }

  // ============================================================
  // CONTROLS
  // ============================================================
  setupControls() {
    const canvas = this.renderer.domElement;

    canvas.addEventListener('click', () => {
      if (!this.pointerLocked) canvas.requestPointerLock();
    });

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === canvas;
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked) return;
      this.mouseDX += e.movementX;
      this.mouseDY += e.movementY;
    });

    document.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.leftMouseDown = true;
      if (e.button === 2) this.rightMouseDown = true;
    });

    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.leftMouseDown = false;
      if (e.button === 2) this.rightMouseDown = false;
    });

    document.addEventListener('contextmenu', (e) => e.preventDefault());

    document.addEventListener('keydown', (e) => {
      if (this.isDestroyed) return;
      this.keys.add(e.code);

      // Weapon switch
      if (e.code === 'Digit1') this.switchWeapon('ak47');
      if (e.code === 'Digit2') this.switchWeapon('pistol');

      // Reload
      if (e.code === 'KeyR') this.startReload();

      // Interact / revive
      if (e.code === 'KeyE') {
        this.eKeyHeld = true;
        const interactable = this.getInteractable();
        if (interactable && !interactable.startsWith('revive_')) {
          this.handleInteract(interactable);
        }
      }

      // Grenade
      if (e.code === 'KeyG') this.throwGrenade();

      // Barricade
      if (e.code === 'KeyF') this.buildBarricade();

      // Leaderboard
      if (e.code === 'Tab') {
        e.preventDefault();
        this.toggleLeaderboard();
      }

      // Minimap
      if (e.code === 'KeyM') {
        this.showMinimap = !this.showMinimap;
        const mm = document.getElementById('minimap-container');
        if (mm) mm.style.display = this.showMinimap ? 'block' : 'none';
      }
    });

    document.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (e.code === 'KeyE') {
        this.eKeyHeld = false;
        this.eHoldTimer = 0;
        this.reviveTarget = null;
        const prompt = document.getElementById('interact-prompt');
        const key = document.getElementById('interact-key');
        if (key) key.textContent = '[E]';
      }
    });

    // Scroll wheel (not used but prevent zoom)
    canvas.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
  }

  // ============================================================
  // WEAPON SWITCH
  // ============================================================
  switchWeapon(w: 'ak47' | 'pistol') {
    if (this.reloading) return;
    this.localPlayer.weapon = w;

    const pistolMesh = (this.weaponGroup as any)?.pistolMesh;
    if (this.weaponMesh) this.weaponMesh.visible = (w === 'ak47');
    if (pistolMesh) pistolMesh.visible = (w === 'pistol');

    this.updateHUD();
  }

  // ============================================================
  // SHOOTING
  // ============================================================
  handleShooting(dt: number) {
    if (this.reloading || this.localPlayer.isDead || this.localPlayer.isDown) return;

    this.fireTimer -= dt;
    if (this.fireTimer > 0) return;

    if (!this.leftMouseDown) return;

    const weapon = this.localPlayer.weapon;
    const upgrades = this.localPlayer.weaponUpgrades[weapon];

    if (weapon === 'ak47') {
      if (this.currentMagAmmo <= 0) {
        this.startReload();
        return;
      }
      const fireRate = C.AK47_FIRE_RATE / upgrades.fireRate;
      this.fireTimer = fireRate;
      this.currentMagAmmo--;

      const damage = Math.floor(C.AK47_DAMAGE_BASE * upgrades.damage *
        (this.localPlayer.boosted && this.localPlayer.boostType === 'damage' ? 2 : 1));
      this.shoot(damage, C.AK47_RANGE);

      if (this.currentMagAmmo === 0) {
        setTimeout(() => this.startReload(), 50);
      }
    } else {
      // Pistol - infinite ammo
      const fireRate = C.PISTOL_FIRE_RATE / upgrades.fireRate;
      this.fireTimer = fireRate;

      const damage = Math.floor(C.PISTOL_DAMAGE_BASE * upgrades.damage *
        (this.localPlayer.boosted && this.localPlayer.boostType === 'damage' ? 2 : 1));
      this.shoot(damage, C.PISTOL_RANGE);
    }

    this.updateHUD();
  }

  shoot(damage: number, range: number) {
    // Muzzle flash
    if (this.muzzleFlashMesh) {
      this.muzzleFlashMesh.material.opacity = 1;
      setTimeout(() => {
        if (this.muzzleFlashMesh) this.muzzleFlashMesh.material.opacity = 0;
      }, 60);
    }

    // Weapon recoil animation
    if (this.weaponMesh) {
      this.weaponMesh.rotation.x = -0.08;
      setTimeout(() => { if (this.weaponMesh) this.weaponMesh.rotation.x = 0; }, 100);
    }

    // Raycast
    const dir = new THREE.Vector3(0, 0, -1);
    dir.applyQuaternion(this.camera.quaternion);
    const origin = this.camera.position.clone();

    // Check wall collision first (server-side authoritative in MP, but do client-side too)
    let hitDist = range;
    for (const col of this.colBoxes) {
      if (!col.isSolid) continue;
      const t = this.rayVsAABB(
        origin.x, origin.y, origin.z,
        dir.x, dir.y, dir.z,
        col.aabb
      );
      if (t !== null && t < hitDist) hitDist = t;
    }

    // Tracer
    this.createTracer(origin, dir, hitDist);

    // Check zombie hits
    let hitZombie: ZombieState | null = null;
    let hitZombieDist = hitDist;

    for (const [id, zombie] of this.zombies) {
      if (!zombie.isAlive) continue;
      const zPos = new THREE.Vector3(zombie.position.x, 1.0, zombie.position.z);
      const toZ = zPos.clone().sub(origin);
      const dot = toZ.dot(dir);
      if (dot < 0) continue;
      const closest = origin.clone().addScaledVector(dir, dot);
      const distToLine = closest.distanceTo(zPos);
      const hitRadius = zombie.type === 'boss' ? 2.5 : zombie.type === 'miniboss' ? 1.2 : 0.7;

      if (distToLine < hitRadius && dot < hitZombieDist) {
        hitZombieDist = dot;
        hitZombie = zombie;
      }
    }

    if (hitZombie) {
      this.damageZombie(hitZombie, damage);

      // Blood effect
      this.createBloodEffect(new THREE.Vector3(
        hitZombie.position.x + dir.x * 0.5,
        1.0,
        hitZombie.position.z + dir.z * 0.5
      ));

      // Reset streak on hit (streak counts kills, not shots)
      // Streak only breaks on misses (no hit)
    } else {
      // Missed shot — reset streak
      if (this.localPlayer.streak > 0) {
        this.localPlayer.streak = 0;
        this.updateHUD();
      }

      // Bullet impact on wall
      const impactPos = origin.clone().addScaledVector(dir, Math.min(hitDist, range));
      this.createWallImpact(impactPos);
    }

    // Multiplayer: send shoot event
    if (this.socket?.connected) {
      this.socket.emit('shoot', {
        playerId: this.localPlayer.id,
        direction: { x: dir.x, y: dir.y, z: dir.z },
        origin: { x: origin.x, y: origin.y, z: origin.z },
        damage,
      });
    }
  }

  rayVsAABB(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, box: AABB): number | null {
    const eps = 0.0001;
    let tmin = (box.min.x - ox) / (dx || eps);
    let tmax = (box.max.x - ox) / (dx || eps);
    if (tmin > tmax) { const t = tmin; tmin = tmax; tmax = t; }
    let tymin = (box.min.y - oy) / (dy || eps);
    let tymax = (box.max.y - oy) / (dy || eps);
    if (tymin > tymax) { const t = tymin; tymin = tymax; tymax = t; }
    if (tmin > tymax || tymin > tmax) return null;
    tmin = Math.max(tmin, tymin); tmax = Math.min(tmax, tymax);
    let tzmin = (box.min.z - oz) / (dz || eps);
    let tzmax = (box.max.z - oz) / (dz || eps);
    if (tzmin > tzmax) { const t = tzmin; tzmin = tzmax; tzmax = t; }
    if (tmin > tzmax || tzmin > tmax) return null;
    tmin = Math.max(tmin, tzmin);
    return tmin >= 0 ? tmin : null;
  }

  createTracer(origin: any, dir: any, distance: number) {
    const tracerGeo = new THREE.BufferGeometry();
    const end = origin.clone().addScaledVector(dir, Math.min(distance, 200));
    tracerGeo.setFromPoints([origin.clone(), end]);
    const tracerMat = new THREE.LineBasicMaterial({
      color: this.localPlayer.weapon === 'ak47' ? 0xffeeaa : 0xaaaaff,
      transparent: true, opacity: 0.8
    });
    const tracer = new THREE.Line(tracerGeo, tracerMat);
    this.scene.add(tracer);

    let life = 0.1;
    const fade = () => {
      if (this.isDestroyed) { this.scene.remove(tracer); return; }
      life -= 0.016;
      tracerMat.opacity = Math.max(0, life / 0.1 * 0.8);
      if (life > 0) requestAnimationFrame(fade);
      else this.scene.remove(tracer);
    };
    fade();
  }

  createBloodEffect(pos: any) {
    for (let i = 0; i < 8; i++) {
      const geo = new THREE.SphereGeometry(0.04 + Math.random() * 0.04, 4, 4);
      const mat = new THREE.MeshBasicMaterial({ color: 0xcc1111 });
      const p = new THREE.Mesh(geo, mat);
      p.position.copy(pos);
      this.scene.add(p);

      const vel = {
        x: (Math.random() - 0.5) * 4,
        y: Math.random() * 3,
        z: (Math.random() - 0.5) * 4
      };
      let life = 0.4;
      const update = () => {
        if (this.isDestroyed) { this.scene.remove(p); return; }
        vel.y -= 15 * 0.016;
        p.position.x += vel.x * 0.016;
        p.position.y += vel.y * 0.016;
        p.position.z += vel.z * 0.016;
        life -= 0.016;
        if (life > 0) requestAnimationFrame(update);
        else this.scene.remove(p);
      };
      update();
    }
  }

  createWallImpact(pos: any) {
    for (let i = 0; i < 5; i++) {
      const geo = new THREE.SphereGeometry(0.03, 4, 4);
      const mat = new THREE.MeshBasicMaterial({ color: 0xaaaaaa });
      const p = new THREE.Mesh(geo, mat);
      p.position.copy(pos);
      this.scene.add(p);
      const vel = { x: (Math.random() - 0.5) * 3, y: Math.random() * 2, z: (Math.random() - 0.5) * 3 };
      let life = 0.3;
      const update = () => {
        if (this.isDestroyed) { this.scene.remove(p); return; }
        vel.y -= 15 * 0.016;
        p.position.x += vel.x * 0.016; p.position.y += vel.y * 0.016; p.position.z += vel.z * 0.016;
        life -= 0.016;
        if (life > 0) requestAnimationFrame(update); else this.scene.remove(p);
      };
      update();
    }
  }

  // ============================================================
  // GRENADE
  // ============================================================
  throwGrenade() {
    if (this.localPlayer.grenadeCount <= 0 || this.localPlayer.isDead) return;
    this.localPlayer.grenadeCount--;
    this.updateHUD();

    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const startPos = this.camera.position.clone().addScaledVector(dir, 0.5);
    startPos.y -= 0.2;

    const grenGeo = new THREE.SphereGeometry(0.12, 8, 8);
    const grenMat = new THREE.MeshLambertMaterial({ color: 0x333322 });
    const gren = new THREE.Mesh(grenGeo, grenMat);
    gren.position.copy(startPos);
    gren.castShadow = true;
    this.scene.add(gren);

    const vel = {
      x: dir.x * 18,
      y: dir.y * 18 + 5,
      z: dir.z * 18
    };

    const grenObj: any = { mesh: gren, vel, fuse: C.GRENADE_FUSE, exploded: false };
    this.activeGrenades.push(grenObj);
  }

  updateGrenades(dt: number) {
    for (let i = this.activeGrenades.length - 1; i >= 0; i--) {
      const g = this.activeGrenades[i];
      if (g.exploded) { this.activeGrenades.splice(i, 1); continue; }

      g.fuse -= dt;
      g.vel.y += C.GRAVITY * dt;
      g.mesh.position.x += g.vel.x * dt;
      g.mesh.position.y += g.vel.y * dt;
      g.mesh.position.z += g.vel.z * dt;
      g.mesh.rotation.x += dt * 5;

      // Ground bounce
      if (g.mesh.position.y <= 0.12) {
        g.mesh.position.y = 0.12;
        g.vel.y = Math.abs(g.vel.y) * 0.4;
        g.vel.x *= 0.7; g.vel.z *= 0.7;
      }

      if (g.fuse <= 0) {
        g.exploded = true;
        const pos = g.mesh.position.clone();
        this.scene.remove(g.mesh);
        this.createExplosion({ x: pos.x, y: pos.y, z: pos.z }, C.GRENADE_RADIUS, C.GRENADE_DAMAGE);

        // Damage zombies
        for (const [id, zombie] of this.zombies) {
          if (!zombie.isAlive) continue;
          const d = vecDist2D(zombie.position, { x: pos.x, y: 0, z: pos.z });
          if (d < C.GRENADE_RADIUS) {
            const dmg = Math.floor(C.GRENADE_DAMAGE * (1 - d / C.GRENADE_RADIUS));
            this.damageZombie(zombie, dmg);
          }
        }

        // Damage local player if in range
        const pd = vecDist2D(this.localPlayer.position, { x: pos.x, y: 0, z: pos.z });
        if (pd < C.GRENADE_RADIUS * 0.7) {
          this.takeDamage(Math.floor(50 * (1 - pd / C.GRENADE_RADIUS)), true);
        }
      }
    }
  }

  // ============================================================
  // RELOAD
  // ============================================================
  startReload() {
    if (this.reloading || this.localPlayer.weapon !== 'ak47') return;
    const maxMag = Math.floor(C.AK47_MAG_SIZE * this.localPlayer.weaponUpgrades.ak47.magSize);
    if (this.currentMagAmmo >= maxMag) return;
    if (this.localPlayer.ammoAkReserve <= 0) return;

    this.reloading = true;
    this.reloadTimer = C.AK47_RELOAD_TIME;

    const reloadBarContainer = document.getElementById('reload-bar-container');
    const reloadText = document.getElementById('reload-text');
    if (reloadBarContainer) reloadBarContainer.style.display = 'block';
    if (reloadText) reloadText.style.display = 'block';

    // Weapon reload animation
    if (this.weaponMesh) {
      this.weaponMesh.rotation.z = 0.5;
      setTimeout(() => { if (this.weaponMesh) this.weaponMesh.rotation.z = 0; }, C.AK47_RELOAD_TIME * 700);
    }
  }

  updateReload(dt: number) {
    if (!this.reloading) return;
    this.reloadTimer -= dt;
    const pct = ((C.AK47_RELOAD_TIME - this.reloadTimer) / C.AK47_RELOAD_TIME) * 100;
    const bar = document.getElementById('reload-bar');
    if (bar) bar.style.width = pct + '%';

    if (this.reloadTimer <= 0) {
      this.reloading = false;
      const maxMag = Math.floor(C.AK47_MAG_SIZE * this.localPlayer.weaponUpgrades.ak47.magSize);
      const needed = maxMag - this.currentMagAmmo;
      const actual = Math.min(needed, this.localPlayer.ammoAkReserve);
      this.currentMagAmmo += actual;
      this.localPlayer.ammoAkReserve -= actual;

      const rbc = document.getElementById('reload-bar-container');
      const rt = document.getElementById('reload-text');
      if (rbc) rbc.style.display = 'none';
      if (rt) rt.style.display = 'none';
      this.updateHUD();
    }
  }

  // ============================================================
  // PLAYER MOVEMENT
  // ============================================================
  updatePlayer(dt: number) {
    if (this.localPlayer.isDead) return;

    const sensitivity = this.rightMouseDown ? 0.001 : 0.002;
    this.yaw -= this.mouseDX * sensitivity;
    this.pitch -= this.mouseDY * sensitivity;
    this.pitch = clamp(this.pitch, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
    this.mouseDX = 0;
    this.mouseDY = 0;

    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;

    // Revive hold logic
    if (this.eKeyHeld) {
      const interactable = this.getInteractable();
      if (interactable && interactable.startsWith('revive_')) {
        this.eHoldTimer += dt;
        const key = document.getElementById('interact-key');
        const pct = Math.min(100, (this.eHoldTimer / C.REVIVE_TIME) * 100);
        if (key) key.textContent = `[Реанимация ${Math.floor(pct)}%]`;
        if (this.eHoldTimer >= C.REVIVE_TIME) {
          const pid = interactable.split('_')[1];
          this.revivePlayer(pid);
          this.eKeyHeld = false;
          this.eHoldTimer = 0;
        }
      } else {
        this.eHoldTimer = 0;
      }
    }

    if (this.localPlayer.isDown) {
      // Downed state
      this.camera.position.y = 0.4;
      this.handleMovement(dt, 1.5);

      this.localPlayer.downTimer -= dt;
      const dtEl = document.getElementById('down-timer-text');
      if (dtEl) dtEl.textContent = `Осталось: ${Math.max(0, Math.ceil(this.localPlayer.downTimer))} сек`;

      if (this.localPlayer.downTimer <= 0) {
        this.killPlayer();
      }
      return;
    }

    // Normal movement
    const isSprinting = (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) &&
                        !this.keys.has('ControlLeft') && !this.keys.has('ControlRight');
    const isCrouching = this.keys.has('ControlLeft') || this.keys.has('ControlRight');
    this.localPlayer.isSprinting = isSprinting;
    this.localPlayer.isCrouching = isCrouching;

    let speed = C.PLAYER_SPEED;
    if (isSprinting) speed *= C.PLAYER_SPRINT_MULT;
    if (isCrouching) speed *= C.PLAYER_CROUCH_MULT;
    if (this.localPlayer.boosted && this.localPlayer.boostType === 'speed') speed *= 1.5;

    this.handleMovement(dt, speed);

    const targetHeight = isCrouching ? 0.8 : C.PLAYER_HEIGHT;
    this.camera.position.y += (targetHeight - this.camera.position.y) * 10 * dt;

    // Jump
    if (!(this.localPlayer as any).velocityY) (this.localPlayer as any).velocityY = 0;
    if (!(this.localPlayer as any).onGround) (this.localPlayer as any).onGround = true;

    if (this.keys.has('Space') && (this.localPlayer as any).onGround) {
      (this.localPlayer as any).velocityY = C.PLAYER_JUMP_FORCE;
      (this.localPlayer as any).onGround = false;
    }

    (this.localPlayer as any).velocityY += C.GRAVITY * dt;
    this.localPlayer.position.y += (this.localPlayer as any).velocityY * dt;
    if (this.localPlayer.position.y <= C.PLAYER_HEIGHT) {
      this.localPlayer.position.y = C.PLAYER_HEIGHT;
      (this.localPlayer as any).velocityY = 0;
      (this.localPlayer as any).onGround = true;
    }

    this.updateWeaponBob(dt);

    // ADS zoom
    if (this.rightMouseDown) {
      this.camera.fov += (55 - this.camera.fov) * 10 * dt;
    } else {
      this.camera.fov += (75 - this.camera.fov) * 10 * dt;
    }
    this.camera.updateProjectionMatrix();

    this.updateInteractPrompt();
  }

  handleMovement(dt: number, speed: number) {
    const forward = { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
    const right = { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) };

    let moveX = 0, moveZ = 0;
    if (this.keys.has('KeyW')) { moveX += forward.x; moveZ += forward.z; }
    if (this.keys.has('KeyS')) { moveX -= forward.x; moveZ -= forward.z; }
    if (this.keys.has('KeyA')) { moveX -= right.x; moveZ -= right.z; }
    if (this.keys.has('KeyD')) { moveX += right.x; moveZ += right.z; }

    const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (len > 0) {
      moveX = (moveX / len) * speed * dt;
      moveZ = (moveZ / len) * speed * dt;

      const newX = this.localPlayer.position.x + moveX;
      const newZ = this.localPlayer.position.z + moveZ;
      const r = C.PLAYER_RADIUS;

      if (!this.checkSolidCollision(newX, this.localPlayer.position.z, r)) {
        this.localPlayer.position.x = newX;
      }
      if (!this.checkSolidCollision(this.localPlayer.position.x, newZ, r)) {
        this.localPlayer.position.z = newZ;
      }

      const half = C.MAP_SIZE / 2 - 2;
      this.localPlayer.position.x = clamp(this.localPlayer.position.x, -half, half);
      this.localPlayer.position.z = clamp(this.localPlayer.position.z, -half, half);
    }

    this.camera.position.x = this.localPlayer.position.x;
    this.camera.position.z = this.localPlayer.position.z;
    this.localPlayer.rotation = this.yaw;
  }

  checkSolidCollision(x: number, z: number, radius: number): boolean {
    const testAABB: AABB = {
      min: vec3(x - radius, 0, z - radius),
      max: vec3(x + radius, 2, z + radius)
    };
    for (const col of this.colBoxes) {
      if (!col.isSolid) continue;
      if (aabbOverlap(testAABB, col.aabb)) return true;
    }
    for (const [, barc] of this.barricades) {
      const bAABB: AABB = {
        min: vec3(barc.position.x - 0.75, 0, barc.position.z - 0.3),
        max: vec3(barc.position.x + 0.75, 1.2, barc.position.z + 0.3)
      };
      if (aabbOverlap(testAABB, bAABB)) return true;
    }
    return false;
  }

  updateWeaponBob(dt: number) {
    if (!this.weaponMesh) return;
    const isMoving = this.keys.has('KeyW') || this.keys.has('KeyS') || this.keys.has('KeyA') || this.keys.has('KeyD');
    if (isMoving) {
      this.bobTimer += dt * (this.localPlayer.isSprinting ? 14 : 9);
      const bobX = Math.sin(this.bobTimer) * 0.015;
      const bobY = Math.abs(Math.sin(this.bobTimer * 2)) * 0.01;
      this.weaponMesh.position.set(0.2 + bobX, -0.18 - bobY, -0.35);
    } else {
      this.weaponMesh.position.x += (0.2 - this.weaponMesh.position.x) * 5 * dt;
      this.weaponMesh.position.y += (-0.18 - this.weaponMesh.position.y) * 5 * dt;
    }
  }

  // ============================================================
  // INTERACT
  // ============================================================
  getInteractable(): string | null {
    const pos = this.localPlayer.position;
    const interactRadius = 3.5;

    // Vending machine
    if (vecDist2D(pos, { x: -12, y: 0, z: -28 }) < interactRadius) return 'vending';

    // Mystery box
    if (vecDist2D(pos, this.mysteryBoxPos) < interactRadius) return 'mystery_box';

    // Traps
    for (let i = 0; i < this.traps.length; i++) {
      if (vecDist2D(pos, this.traps[i].position) < interactRadius) return `trap_${i}`;
    }

    // Downed players
    for (const [id, p] of this.remotePlayers) {
      if (p.isDown && vecDist2D(pos, p.position) < interactRadius) return `revive_${id}`;
    }

    return null;
  }

  updateInteractPrompt() {
    const interactable = this.getInteractable();
    const prompt = document.getElementById('interact-prompt');
    const text = document.getElementById('interact-text');
    const key = document.getElementById('interact-key');

    if (interactable && prompt && text && key) {
      prompt.style.display = 'block';
      if (!this.eKeyHeld) key.textContent = '[E]';
      if (interactable === 'vending') {
        text.textContent = `Автомат снаряжения | $${this.localPlayer.money}`;
      } else if (interactable === 'mystery_box') {
        text.textContent = `Мистическая коробка ($200)`;
      } else if (interactable.startsWith('trap_')) {
        const idx = parseInt(interactable.split('_')[1]);
        const trap = this.traps[idx];
        text.textContent = trap?.active
          ? `Ловушка активна (${Math.ceil(trap.timer)} сек)`
          : `Активировать ловушку ($${C.TRAP_COST})`;
      } else if (interactable.startsWith('revive_')) {
        text.textContent = 'Реанимация союзника (зажми E)';
      }
    } else if (prompt) {
      prompt.style.display = 'none';
    }
  }

  handleInteract(interactable: string) {
    if (this.localPlayer.isDead) return;

    if (interactable === 'vending') {
      this.openVendingUI();
    } else if (interactable === 'mystery_box') {
      this.useMysteryBox();
    } else if (interactable.startsWith('trap_')) {
      const idx = parseInt(interactable.split('_')[1]);
      this.activateTrap(idx);
    }
  }

  // ============================================================
  // VENDING MACHINE
  // ============================================================
  openVendingUI() {
    const ui = document.getElementById('vending-ui');
    if (!ui) return;

    document.exitPointerLock();
    const moneyEl = document.getElementById('vending-money');
    if (moneyEl) moneyEl.textContent = `💰 Ваши деньги: $${this.localPlayer.money}`;
    ui.style.display = 'block';
  }

  closeVendingUI() {
    const ui = document.getElementById('vending-ui');
    if (ui) ui.style.display = 'none';
    this.renderer.domElement.requestPointerLock();
  }

  vendingBuy(action: string) {
    const moneyEl = document.getElementById('vending-money');
    const update = () => { if (moneyEl) moneyEl.textContent = `💰 Ваши деньги: $${this.localPlayer.money}`; };

    if (action === 'ammo') {
      if (this.localPlayer.money < C.VENDING_AMMO_COST) {
        this.showVendingError('Недостаточно денег!'); return;
      }
      this.localPlayer.money -= C.VENDING_AMMO_COST;
      const ammo = Math.floor(Math.random() * 11);
      this.localPlayer.ammoAkReserve = Math.min(C.AK47_MAX_AMMO, this.localPlayer.ammoAkReserve + ammo);
      this.showKillFeedMessage(`Куплено ${ammo} патронов АК`, '#ffdd44');
      update(); this.updateHUD();
    } else if (action === 'health') {
      if (this.localPlayer.money < C.VENDING_HEALTH_COST) {
        this.showVendingError('Недостаточно денег!'); return;
      }
      this.localPlayer.money -= C.VENDING_HEALTH_COST;
      this.localPlayer.hp = Math.min(this.localPlayer.maxHp, this.localPlayer.hp + 30);
      this.showKillFeedMessage(`+30 HP`, '#44ff88');
      update(); this.updateHUD();
    } else if (action === 'boost') {
      if (this.localPlayer.money < C.VENDING_BOOST_COST) {
        this.showVendingError('Недостаточно денег!'); return;
      }
      this.localPlayer.money -= C.VENDING_BOOST_COST;
      const boostTypes = ['speed', 'damage'];
      const bt = boostTypes[Math.floor(Math.random() * boostTypes.length)];
      this.applyBoost(bt, 15);
      this.showKillFeedMessage(`Усиление: ${bt === 'speed' ? 'Ускорение' : 'Двойной урон'}`, '#ffdd44');
      update(); this.updateHUD();
    } else if (action === 'grenade') {
      if (this.localPlayer.money < C.VENDING_GRENADE_COST) {
        this.showVendingError('Недостаточно денег!'); return;
      }
      this.localPlayer.money -= C.VENDING_GRENADE_COST;
      this.localPlayer.grenadeCount++;
      this.showKillFeedMessage('Граната получена!', '#ff8844');
      update(); this.updateHUD();
    }

    // Vending machine ejection animation
    this.animateVendingEject();
  }

  showVendingError(msg: string) {
    const moneyEl = document.getElementById('vending-money');
    if (!moneyEl) return;
    const orig = moneyEl.textContent;
    moneyEl.textContent = `❌ ${msg}`;
    moneyEl.style.color = '#ff4444';
    setTimeout(() => {
      moneyEl.textContent = `💰 Ваши деньги: $${this.localPlayer.money}`;
      moneyEl.style.color = '#ffdd44';
    }, 1500);
  }

  animateVendingEject() {
    if (!this.vendingScreen) return;
    // Flash screen
    this.vendingScreen.material.color.setHex(0xffffff);
    setTimeout(() => {
      if (this.vendingScreen) this.vendingScreen.material.color.setHex(0x00ff88);
    }, 200);
  }

  // ============================================================
  // MYSTERY BOX
  // ============================================================
  useMysteryBox() {
    if (this.localPlayer.money < C.MYSTERY_BOX_COST) {
      this.showKillFeedMessage('Недостаточно денег для коробки!', '#ff4444');
      return;
    }
    this.localPlayer.money -= C.MYSTERY_BOX_COST;

    const upgrades = ['damage', 'fireRate', 'magSize'];
    const upg = upgrades[Math.floor(Math.random() * upgrades.length)];
    const weapon = this.localPlayer.weapon;
    const wu = this.localPlayer.weaponUpgrades[weapon];

    if (upg === 'damage') {
      wu.damage *= 1.2;
      this.showKillFeedMessage(`${weapon === 'ak47' ? 'AK-47' : 'Пистолет'}: Урон +20%!`, '#ff44ff');
    } else if (upg === 'fireRate') {
      wu.fireRate *= 1.25;
      this.showKillFeedMessage(`${weapon === 'ak47' ? 'AK-47' : 'Пистолет'}: Скорострельность +25%!`, '#ff44ff');
    } else {
      wu.magSize = Math.min(2, wu.magSize + 0.33);
      this.showKillFeedMessage(`${weapon === 'ak47' ? 'AK-47' : 'Пистолет'}: Магазин +10!`, '#ff44ff');
    }

    // Relocate box
    this.relocateMysteryBox();
    this.updateHUD();

    // Spinning eject animation
    if (this.mysteryBoxMesh) {
      let t = 0;
      const spin = () => {
        if (this.isDestroyed) return;
        t += 0.05;
        this.mysteryBoxMesh.rotation.y += 0.3;
        if (t < 1) requestAnimationFrame(spin);
      };
      spin();
    }
  }

  relocateMysteryBox() {
    const positions = [
      vec3(20, 0, -20), vec3(-15, 0, 25), vec3(35, 0, 15),
      vec3(5, 0, -45), vec3(-40, 0, 25), vec3(10, 0, 35)
    ];
    const newPos = positions[Math.floor(Math.random() * positions.length)];
    this.mysteryBoxPos = newPos;
    if (this.mysteryBoxMesh) {
      this.mysteryBoxMesh.position.set(newPos.x, 0, newPos.z);
    }
  }

  // ============================================================
  // TRAPS
  // ============================================================
  activateTrap(idx: number) {
    const trap = this.traps[idx];
    if (!trap || trap.active) return;
    if (this.localPlayer.money < C.TRAP_COST) {
      this.showKillFeedMessage('Недостаточно денег для ловушки!', '#ff4444');
      return;
    }
    this.localPlayer.money -= C.TRAP_COST;
    trap.active = true;
    trap.timer = C.TRAP_DURATION;
    trap.damageTimer = 0;
    this.updateHUD();
    this.showKillFeedMessage(`Ловушка ${trap.type === 'electric' ? 'электрическая' : 'огнемётная'} активирована!`, '#44ff88');

    // Visual
    const mesh = this.trapMeshes[idx];
    if (mesh) {
      const light = (mesh as any).statusLight;
      if (light) light.color.setHex(trap.type === 'electric' ? 0x4444ff : 0xff4400);

      // Spawn trap effect
      this.createTrapEffect(trap);
    }

    if (this.socket?.connected) {
      this.socket.emit('activateTrap', { trapId: idx, playerId: this.localPlayer.id });
    }
  }

  createTrapEffect(trap: Trap) {
    const effectGroup = new THREE.Group();
    effectGroup.position.set(trap.position.x, 0.1, trap.position.z);

    if (trap.type === 'electric') {
      // Electric field - expanding ring
      for (let i = 0; i < 3; i++) {
        const ringGeo = new THREE.RingGeometry(i * 3 + 0.5, i * 3 + 1, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0x4444ff, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        effectGroup.add(ring);
      }
    } else {
      // Flame effect
      const fireGeo = new THREE.CylinderGeometry(0.1, 2, 4, 16, 1, true);
      const fireMat = new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
      const fire = new THREE.Mesh(fireGeo, fireMat);
      fire.position.y = 2;
      effectGroup.add(fire);
    }

    const ptLight = new THREE.PointLight(trap.type === 'electric' ? 0x4444ff : 0xff4400, 2, 20);
    ptLight.position.y = 1;
    effectGroup.add(ptLight);

    this.scene.add(effectGroup);

    // Remove after duration
    setTimeout(() => {
      if (!this.isDestroyed) this.scene.remove(effectGroup);
    }, C.TRAP_DURATION * 1000);
  }

  updateTraps(dt: number) {
    for (let i = 0; i < this.traps.length; i++) {
      const trap = this.traps[i];
      if (!trap.active) continue;

      trap.timer -= dt;
      trap.damageTimer -= dt;

      if (trap.timer <= 0) {
        trap.active = false;
        trap.timer = 0;
        const mesh = this.trapMeshes[i];
        if (mesh) {
          const light = (mesh as any).statusLight;
          if (light) light.color.setHex(0x44ff44);
        }
        continue;
      }

      if (trap.damageTimer <= 0) {
        trap.damageTimer = 0.5;
        const trapRadius = 12;

        for (const [id, zombie] of this.zombies) {
          if (!zombie.isAlive) continue;
          const d = vecDist2D(zombie.position, trap.position);
          if (d < trapRadius) {
            this.damageZombie(zombie, C.TRAP_DAMAGE);
          }
        }
      }
    }
  }

  // ============================================================
  // BARRICADES
  // ============================================================
  buildBarricade() {
    if (this.localPlayer.money < C.BARRICADE_COST) {
      this.showKillFeedMessage('Недостаточно денег для баррикады!', '#ff4444');
      return;
    }
    if (this.localPlayer.barricadeCount >= C.MAX_BARRICADES) {
      this.showKillFeedMessage('Максимум 3 баррикады!', '#ff4444');
      return;
    }

    // Place in front of player
    const forward = { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
    const placePos = {
      x: this.localPlayer.position.x + forward.x * 2.5,
      y: 0,
      z: this.localPlayer.position.z + forward.z * 2.5
    };

    this.localPlayer.money -= C.BARRICADE_COST;
    this.localPlayer.barricadeCount++;

    const id = 'barc_' + Date.now();
    const barc: Barricade = {
      id, ownerId: this.localPlayer.id,
      position: placePos, hp: 150, maxHp: 150
    };
    this.barricades.set(id, barc);

    // Visual
    const mat = new THREE.MeshLambertMaterial({ color: 0x888888 });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.2, 0.5), mat);
    mesh.position.set(placePos.x, 0.6, placePos.z);
    mesh.rotation.y = this.yaw + Math.PI / 2;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);
    this.barricadeMeshes.set(id, mesh);

    this.updateHUD();
    this.showKillFeedMessage('Баррикада установлена!', '#aaaaff');

    if (this.socket?.connected) {
      this.socket.emit('placeBarricade', { id, position: placePos, ownerId: this.localPlayer.id });
    }
  }

  damageBarricade(id: string, damage: number) {
    const barc = this.barricades.get(id);
    if (!barc) return;

    barc.hp -= damage;
    const mesh = this.barricadeMeshes.get(id);

    if (barc.hp <= 0) {
      if (mesh) this.scene.remove(mesh);
      this.barricadeMeshes.delete(id);
      if (barc.ownerId === this.localPlayer.id) {
        this.localPlayer.barricadeCount = Math.max(0, this.localPlayer.barricadeCount - 1);
        this.updateHUD();
      }
      this.barricades.delete(id);
      return;
    }

    // Update color based on HP
    if (mesh) {
      const ratio = barc.hp / barc.maxHp;
      (mesh.material as any).color.setHex(
        ratio > 0.6 ? 0x888888 : ratio > 0.3 ? 0xaa6622 : 0xaa2222
      );
    }
  }

  // ============================================================
  // REVIVE
  // ============================================================
  revivePlayer(playerId: string) {
    if (this.socket?.connected) {
      this.socket.emit('revivePlayer', { targetId: playerId, reviverId: this.localPlayer.id });
    }
    this.showKillFeedMessage('Союзник поднят!', '#44ff88');
  }

  // ============================================================
  // DAMAGE / HP
  // ============================================================
  takeDamage(amount: number, fromZombie: boolean) {
    if (this.localPlayer.isDead || this.localPlayer.isDown) return;

    this.localPlayer.hp = Math.max(0, this.localPlayer.hp - amount);
    this.updateHUD();

    // Screen flash red
    const flash = document.createElement('div');
    flash.style.cssText = `
      position:fixed;top:0;left:0;width:100%;height:100%;
      background:rgba(255,0,0,${Math.min(0.4, amount / 100)});pointer-events:none;z-index:200;
      animation:pulse 0.3s ease forwards;
    `;
    this.container.appendChild(flash);
    setTimeout(() => flash.remove(), 300);

    // HP pulse on low health
    const hpBar = document.getElementById('hp-container');
    if (hpBar && this.localPlayer.hp < 30) {
      hpBar.style.animation = 'hpPulse 1s infinite';
    }

    if (this.localPlayer.hp <= 0) {
      this.goDown();
    }
  }

  goDown() {
    this.localPlayer.isDown = true;
    this.localPlayer.hp = 0;
    this.localPlayer.downTimer = C.DOWN_TIMER;
    this.localPlayer.streak = 0;

    const overlay = document.getElementById('down-overlay');
    if (overlay) overlay.style.display = 'flex';

    // Tilt camera
    this.camera.position.y = 0.4;

    this.showKillFeedMessage('Вы ранены! Нужна помощь!', '#ff4444');
  }

  killPlayer() {
    this.localPlayer.isDown = false;
    this.localPlayer.isDead = true;

    const overlay = document.getElementById('down-overlay');
    if (overlay) overlay.style.display = 'none';

    this.showKillFeedMessage('Вы погибли! Возрождение через 10 сек...', '#ff4444');

    // Check defeat (solo mode - no allies)
    if (this.config.mode === 'solo') {
      setTimeout(() => {
        if (!this.isDestroyed) this.respawnPlayer();
      }, C.RESPAWN_TIME * 1000);
    }
  }

  respawnPlayer() {
    this.localPlayer.isDead = false;
    this.localPlayer.isDown = false;
    this.localPlayer.hp = 50;
    this.localPlayer.position = vec3(0, C.PLAYER_HEIGHT, 5);
    this.camera.position.set(0, C.PLAYER_HEIGHT, 5);
    this.updateHUD();
    this.showKillFeedMessage('Возрождение!', '#44ff88');
  }

  // ============================================================
  // BOOSTS
  // ============================================================
  applyBoost(type: string, duration: number) {
    this.localPlayer.boosted = true;
    this.localPlayer.boostType = type;
    this.localPlayer.boostTimer = duration;
    this.updateBoostUI();
  }

  updateBoosts(dt: number) {
    if (!this.localPlayer.boosted) return;
    this.localPlayer.boostTimer -= dt;
    if (this.localPlayer.boostTimer <= 0) {
      this.localPlayer.boosted = false;
      this.localPlayer.boostType = '';
      this.updateBoostUI();
    }
  }

  updateBoostUI() {
    const container = document.getElementById('boosts-container');
    if (!container) return;
    container.innerHTML = '';
    if (this.localPlayer.boosted) {
      const el = document.createElement('div');
      el.className = 'boost-indicator';
      const icons: Record<string, string> = { speed: '⚡ Ускорение', damage: '💥 Двойной урон' };
      el.textContent = `${icons[this.localPlayer.boostType] || this.localPlayer.boostType} (${Math.ceil(this.localPlayer.boostTimer)}с)`;
      container.appendChild(el);
    }
  }

  // ============================================================
  // ZOMBIES — SPAWNING
  // ============================================================
  startWave(waveNum: number) {
    if (waveNum > C.WAVES.length) return;

    this.wave = waveNum;
    this.phase = 'combat';
    this.zombies.clear();

    const waveData = C.WAVES[waveNum - 1];
    const { count, hpMult, speedMult, damageMult, hasBoss } = waveData;

    this.showWaveAnnounce(
      `ВОЛНА ${waveNum}`,
      hasBoss ? '⚠️ ШИРИБАЗАРОВ ПРОБУЖДАЕТСЯ!' : `${count} зомби наступают!`,
      3000
    );

    // Spawn zombies with delay
    const types = waveNum <= 2 ? ['normal'] :
                  waveNum <= 4 ? ['normal', 'normal', 'exploder'] :
                  waveNum <= 7 ? ['normal', 'exploder', 'acid'] :
                                 ['normal', 'exploder', 'acid', 'acid'];

    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        if (this.isDestroyed || this.phase !== 'combat') return;
        const type = types[Math.floor(Math.random() * types.length)];
        this.spawnZombie(type, hpMult, speedMult, damageMult);
      }, i * 400);
    }

    // Miniboss on waves 1-9
    if (!hasBoss && waveNum >= 1) {
      const modCount = Math.min(2, Math.floor(waveNum / 3) + 1);
      const mods = this.pickMinibossModifiers(modCount);
      setTimeout(() => {
        if (this.isDestroyed || this.phase !== 'combat') return;
        this.spawnMiniboss(mods, hpMult, speedMult, damageMult);
      }, count * 400 + 1000);
    }

    // Boss on wave 10
    if (hasBoss) {
      setTimeout(() => {
        if (this.isDestroyed || this.phase !== 'combat') return;
        this.spawnBoss(hpMult, speedMult, damageMult);
      }, count * 400 + 2000);
    }

    this.updateHUD();
  }

  pickMinibossModifiers(count: number): string[] {
    const all = [...C.MINIBOSS_MODIFIERS];
    const picked: string[] = [];
    for (let i = 0; i < count; i++) {
      const idx = Math.floor(Math.random() * all.length);
      picked.push(all.splice(idx, 1)[0]);
    }
    return picked;
  }

  spawnZombie(type: string, hpMult: number, speedMult: number, damageMult: number) {
    const id = 'z_' + (++this.zombieIdCounter);
    const baseStats = C.ZOMBIE_TYPES[type] || C.ZOMBIE_TYPES.normal;

    // Spawn around edges
    const angle = Math.random() * Math.PI * 2;
    const r = 52 + Math.random() * 5;
    const sx = clamp(Math.cos(angle) * r, -55, 55);
    const sz = clamp(Math.sin(angle) * r, -55, 55);

    const zombie: ZombieState = {
      id, type,
      position: vec3(sx, 0, sz),
      hp: Math.floor(baseStats.hp * hpMult),
      maxHp: Math.floor(baseStats.hp * hpMult),
      isAlive: true,
      attackTimer: 0,
      attackCooldown: 0,
    };
    (zombie as any).speedMult = speedMult;
    (zombie as any).damageMult = damageMult;

    this.zombies.set(id, zombie);
    this.createZombieMesh(zombie);
    return zombie;
  }

  spawnMiniboss(modifiers: string[], hpMult: number, speedMult: number, damageMult: number) {
    const id = 'z_mb_' + (++this.zombieIdCounter);
    const base = C.ZOMBIE_TYPES.miniboss;

    let mbHp = base.hp * hpMult;
    let mbSpeedMult = speedMult;
    let mbDmgMult = damageMult;
    let mbScale = base.scale;

    for (const mod of modifiers) {
      if (mod === 'giant') { mbHp *= 2; mbScale = 2.2; }
      if (mod === 'fast') mbSpeedMult *= 1.4;
      if (mod === 'armored') mbDmgMult *= 0.7;
      if (mod === 'explosive') { /* handled on death */ }
    }

    const angle = Math.random() * Math.PI * 2;
    const r = 52;
    const sx = clamp(Math.cos(angle) * r, -55, 55);
    const sz = clamp(Math.sin(angle) * r, -55, 55);

    const zombie: ZombieState = {
      id, type: 'miniboss',
      position: vec3(sx, 0, sz),
      hp: Math.floor(mbHp),
      maxHp: Math.floor(mbHp),
      isAlive: true,
      modifiers,
      attackTimer: 0, attackCooldown: 0,
      regenTimer: 0, teleportTimer: 0, summonTimer: 0,
    };
    (zombie as any).speedMult = mbSpeedMult;
    (zombie as any).damageMult = mbDmgMult;
    (zombie as any).armorMult = modifiers.includes('armored') ? 0.7 : 1.0;
    (zombie as any).mbScale = mbScale;

    this.zombies.set(id, zombie);
    this.createZombieMesh(zombie);
    this.showKillFeedMessage(`⚠️ Минибосс появился! [${modifiers.join(', ')}]`, '#ff44ff');
    return zombie;
  }

  spawnBoss(hpMult: number, speedMult: number, damageMult: number) {
    const id = 'z_boss_' + (++this.zombieIdCounter);
    const base = C.ZOMBIE_TYPES.boss;

    const zombie: ZombieState = {
      id, type: 'boss',
      position: vec3(0, 0, 55),
      hp: Math.floor(base.hp * hpMult),
      maxHp: Math.floor(base.hp * hpMult),
      isAlive: true,
      attackTimer: 0, attackCooldown: 3, attackPhase: 'move', chargeTarget: null, meleeTimer: 0,
    };
    (zombie as any).speedMult = speedMult;
    (zombie as any).damageMult = damageMult;

    this.zombies.set(id, zombie);
    this.createZombieMesh(zombie);
    this.showWaveAnnounce('⚠️ ШИРИБАЗАРОВ!', 'Уничтожьте босса для победы!', 4000);
    return zombie;
  }

  // ============================================================
  // ZOMBIE MESHES
  // ============================================================
  createZombieMesh(zombie: ZombieState) {
    const group = new THREE.Group();
    const stats = C.ZOMBIE_TYPES[zombie.type] || C.ZOMBIE_TYPES.normal;
    const scale = (zombie as any).mbScale || stats.scale;

    let bodyColor = stats.color;
    let headColor = 0x8a6a4a;
    let clothColor = 0x3a3a2a;

    if (zombie.type === 'miniboss') {
      // Aura color based on modifiers
      const mods = zombie.modifiers || [];
      if (mods.includes('giant')) bodyColor = 0x440044;
      if (mods.includes('fast')) bodyColor = 0x004444;
      if (mods.includes('toxic')) bodyColor = 0x225500;
      if (mods.includes('armored')) bodyColor = 0x444444;
      if (mods.includes('explosive')) bodyColor = 0x884400;
    }

    const bodyMat = new THREE.MeshLambertMaterial({ color: bodyColor });
    const headMat = new THREE.MeshLambertMaterial({ color: headColor });
    const clothMat = new THREE.MeshLambertMaterial({ color: clothColor });

    // Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.3), bodyMat);
    body.position.y = 1.2; body.castShadow = true; group.add(body);

    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.38, 0.38), headMat);
    head.position.y = 1.75; head.castShadow = true; group.add(head);

    // Eyes
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff2200 });
    const eye1 = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.02), eyeMat);
    eye1.position.set(-0.1, 1.78, 0.2); group.add(eye1);
    const eye2 = eye1.clone(); eye2.position.set(0.1, 1.78, 0.2); group.add(eye2);

    // Arms
    const armGeo = new THREE.BoxGeometry(0.15, 0.6, 0.15);
    const armL = new THREE.Mesh(armGeo, bodyMat);
    armL.position.set(-0.32, 1.1, 0); armL.castShadow = true; group.add(armL);
    const armR = new THREE.Mesh(armGeo, bodyMat);
    armR.position.set(0.32, 1.1, 0); armR.castShadow = true; group.add(armR);
    (group as any).armL = armL;
    (group as any).armR = armR;

    // Legs
    const legGeo = new THREE.BoxGeometry(0.2, 0.6, 0.2);
    const legL = new THREE.Mesh(legGeo, clothMat);
    legL.position.set(-0.14, 0.65, 0); legL.castShadow = true; group.add(legL);
    const legR = new THREE.Mesh(legGeo, clothMat);
    legR.position.set(0.14, 0.65, 0); legR.castShadow = true; group.add(legR);
    (group as any).legL = legL;
    (group as any).legR = legR;

    // HP bar
    const hpBarBg = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.08),
      new THREE.MeshBasicMaterial({ color: 0x333333, side: THREE.DoubleSide })
    );
    hpBarBg.position.y = 2.3; hpBarBg.rotation.y = 0; group.add(hpBarBg);

    const hpBarFill = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.08),
      new THREE.MeshBasicMaterial({ color: 0x44ff44, side: THREE.DoubleSide })
    );
    hpBarFill.position.y = 2.3; hpBarFill.position.z = 0.001; group.add(hpBarFill);
    (group as any).hpBarFill = hpBarFill;
    (group as any).hpBarScale = 0.7;

    // Boss specific
    if (zombie.type === 'boss') {
      group.scale.set(3, 3, 3);
      // Crown
      const crownMat = new THREE.MeshBasicMaterial({ color: 0xffdd00 });
      const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.15, 8), crownMat);
      crown.position.y = 2.0; group.add(crown);

      // Aura
      const auraMat = new THREE.MeshBasicMaterial({ color: 0x8800aa, transparent: true, opacity: 0.3, side: THREE.DoubleSide });
      const aura = new THREE.Mesh(new THREE.SphereGeometry(1.5, 16, 16), auraMat);
      aura.position.y = 1.2; group.add(aura);
      (group as any).aura = aura;

      // HP bar further up
      hpBarBg.position.y = 3.0; hpBarFill.position.y = 3.0;
      hpBarBg.scale.x = 2; hpBarFill.scale.x = 2;
    } else if (zombie.type === 'miniboss') {
      group.scale.set(scale, scale, scale);

      // Miniboss aura
      const mods = zombie.modifiers || [];
      const auraColor = mods.includes('fast') ? 0x00ffff :
                        mods.includes('toxic') ? 0x44ff00 :
                        mods.includes('explosive') ? 0xff4400 :
                        mods.includes('armored') ? 0x888888 : 0xaa00ff;
      const auraMat = new THREE.MeshBasicMaterial({ color: auraColor, transparent: true, opacity: 0.25, side: THREE.DoubleSide });
      const aura = new THREE.Mesh(new THREE.SphereGeometry(1.0, 12, 12), auraMat);
      aura.position.y = 1.2; group.add(aura);
      (group as any).aura = aura;

      hpBarBg.position.y = 2.5; hpBarFill.position.y = 2.5;
    } else {
      group.scale.set(scale, scale, scale);
    }

    // HP bar always faces camera
    (group as any).hpBarBg = hpBarBg;

    group.position.set(zombie.position.x, 0, zombie.position.z);
    this.scene.add(group);
    this.zombieMeshes.set(zombie.id, group);
  }

  removeZombieMesh(id: string) {
    const mesh = this.zombieMeshes.get(id);
    if (mesh) {
      this.scene.remove(mesh);
      this.zombieMeshes.delete(id);
    }
  }

  // ============================================================
  // ZOMBIE AI
  // ============================================================
  updateZombies(dt: number) {
    const players = this.getAlivePlayers();
    if (players.length === 0) return;

    for (const [id, zombie] of this.zombies) {
      if (!zombie.isAlive) continue;

      const mesh = this.zombieMeshes.get(id);
      if (!mesh) continue;

      // Find nearest player
      let nearestDist = Infinity;
      let nearestPlayer: PlayerState | null = null;
      for (const p of players) {
        const d = vecDist2D(zombie.position, p.position);
        if (d < nearestDist) { nearestDist = d; nearestPlayer = p; }
      }
      if (!nearestPlayer) continue;

      const stats = C.ZOMBIE_TYPES[zombie.type] || C.ZOMBIE_TYPES.normal;
      const speedMult = (zombie as any).speedMult || 1;
      const damageMult = (zombie as any).damageMult || 1;
      const armorMult = (zombie as any).armorMult || 1;

      // Boss AI
      if (zombie.type === 'boss') {
        this.updateBossAI(zombie, nearestPlayer, dt, mesh);
        continue;
      }

      // Miniboss AI
      if (zombie.type === 'miniboss') {
        this.updateMinibossAI(zombie, nearestPlayer, dt, mesh, stats, speedMult, damageMult);
        continue;
      }

      // Exploder: proximity detonation
      if (zombie.type === 'exploder' && nearestDist < 2.5) {
        this.exploderDetonate(zombie);
        continue;
      }

      // Acid zombie: ranged attack
      if (zombie.type === 'acid') {
        if (nearestDist < stats.attackRange) {
          zombie.attackTimer = (zombie.attackTimer || 0) - dt;
          if ((zombie.attackTimer || 0) <= 0) {
            zombie.attackTimer = stats.attackRate;
            this.acidZombieSpitAt(zombie, nearestPlayer);
          }
          if (nearestDist > 8) {
            this.moveZombieTowards(zombie, nearestPlayer.position, stats.speed * speedMult * 0.5, dt, mesh);
          }
          continue;
        }
      }

      // Normal movement
      if (nearestDist > stats.attackRange) {
        this.moveZombieTowards(zombie, nearestPlayer.position, stats.speed * speedMult, dt, mesh);
      } else {
        // Melee attack
        zombie.attackTimer = (zombie.attackTimer || 0) - dt;
        if ((zombie.attackTimer || 0) <= 0) {
          zombie.attackTimer = stats.attackRate;
          if (nearestPlayer.id === this.localPlayer.id) {
            const dmg = Math.floor(stats.damage * damageMult);
            this.takeDamage(dmg, true);
          }
        }
        mesh.rotation.y = Math.atan2(
          nearestPlayer.position.x - zombie.position.x,
          nearestPlayer.position.z - zombie.position.z
        );
      }

      this.animateZombieWalk(mesh, zombie, nearestDist, stats.attackRange);
      this.updateZombieHPBar(mesh, zombie);
    }

    this.updateAcidProjectiles(dt);
    this.updateAcidPools(dt);
    this.checkWaveComplete();
  }

  animateZombieWalk(mesh: any, zombie: ZombieState, dist: number, attackRange: number) {
    const t = Date.now() * 0.008;
    const legL = mesh.legL || mesh.children.find((c: any) => c.position && c.position.x < 0 && c.position.y < 1);
    const legR = mesh.legR || mesh.children.find((c: any) => c.position && c.position.x > 0 && c.position.y < 1);
    const armL = mesh.armL;
    const armR = mesh.armR;

    if (legL && legR) {
      if (dist > attackRange) {
        legL.rotation.x = Math.sin(t) * 0.4;
        legR.rotation.x = -Math.sin(t) * 0.4;
      } else {
        // Attack animation - arms forward
        if (armL) armL.rotation.x = -0.6;
        if (armR) armR.rotation.x = -0.6;
      }
    }

    // Aura pulse
    if (mesh.aura) {
      mesh.aura.material.opacity = 0.2 + Math.sin(t * 2) * 0.1;
    }

    // HP bar faces camera
    const hpBarFill = (mesh as any).hpBarFill;
    const hpBarBg = (mesh as any).hpBarBg;
    if (hpBarFill && this.camera) {
      const angle = Math.atan2(
        this.camera.position.x - mesh.position.x,
        this.camera.position.z - mesh.position.z
      );
      hpBarFill.rotation.y = angle;
      if (hpBarBg) hpBarBg.rotation.y = angle;
    }
  }

  updateZombieHPBar(mesh: any, zombie: ZombieState) {
    const hpBarFill = (mesh as any).hpBarFill;
    if (!hpBarFill) return;
    const ratio = Math.max(0, zombie.hp / zombie.maxHp);
    hpBarFill.scale.x = ratio;
    hpBarFill.position.x = (ratio - 1) * (mesh as any).hpBarScale * 0.5 / (mesh.scale.x || 1);
    (hpBarFill.material as any).color.setHex(ratio > 0.5 ? 0x44ff44 : ratio > 0.25 ? 0xffaa00 : 0xff4444);
  }

  updateMinibossAI(zombie: ZombieState, target: PlayerState, dt: number, mesh: any, stats: any, speedMult: number, damageMult: number) {
    const mods = zombie.modifiers || [];
    const dist = vecDist2D(zombie.position, target.position);

    // Movement & melee
    if (dist > stats.attackRange) {
      this.moveZombieTowards(zombie, target.position, stats.speed * speedMult, dt, mesh);
    } else {
      zombie.attackTimer = (zombie.attackTimer || 0) - dt;
      if ((zombie.attackTimer || 0) <= 0) {
        zombie.attackTimer = stats.attackRate;
        if (target.id === this.localPlayer.id) {
          let dmg = Math.floor(stats.damage * damageMult);
          if (mods.includes('toxic')) {
            this.applyPoison(dmg);
          } else {
            this.takeDamage(dmg, true);
          }
        }
      }
    }

    // Regen modifier
    if (mods.includes('regen')) {
      zombie.regenTimer = (zombie.regenTimer || 3) - dt;
      if ((zombie.regenTimer || 0) <= 0) {
        zombie.regenTimer = 3;
        zombie.hp = Math.min(zombie.maxHp, zombie.hp + 10);
      }
    }

    // Teleport modifier
    if (mods.includes('teleporter')) {
      zombie.teleportTimer = (zombie.teleportTimer || 8) - dt;
      if ((zombie.teleportTimer || 0) <= 0) {
        zombie.teleportTimer = 8;
        // Teleport near target
        const angle = Math.random() * Math.PI * 2;
        const r = 5 + Math.random() * 3;
        zombie.position.x = clamp(target.position.x + Math.cos(angle) * r, -55, 55);
        zombie.position.z = clamp(target.position.z + Math.sin(angle) * r, -55, 55);
        this.createTeleportEffect(zombie.position);
      }
    }

    // Summoner modifier
    if (mods.includes('summoner')) {
      zombie.summonTimer = (zombie.summonTimer || 12) - dt;
      if ((zombie.summonTimer || 0) <= 0) {
        zombie.summonTimer = 12;
        for (let i = 0; i < 2; i++) {
          const nz = this.spawnZombie('normal', 1, (zombie as any).speedMult, (zombie as any).damageMult);
          nz.position.x = zombie.position.x + (Math.random() - 0.5) * 4;
          nz.position.z = zombie.position.z + (Math.random() - 0.5) * 4;
          const m = this.zombieMeshes.get(nz.id);
          if (m) m.position.set(nz.position.x, 0, nz.position.z);
        }
        this.showKillFeedMessage('Минибосс призвал зомби!', '#ff44ff');
      }
    }

    this.animateZombieWalk(mesh, zombie, dist, stats.attackRange);
    this.updateZombieHPBar(mesh, zombie);
    mesh.position.set(zombie.position.x, 0, zombie.position.z);
  }

  applyPoison(dmg: number) {
    // Poison: apply damage over 5 seconds
    let ticks = 5;
    const tick = () => {
      if (this.isDestroyed || ticks <= 0) return;
      this.takeDamage(Math.floor(dmg * 0.2), true);
      ticks--;
      if (ticks > 0) setTimeout(tick, 1000);
    };
    tick();
  }

  createTeleportEffect(pos: Vec3) {
    const geo = new THREE.SphereGeometry(1, 12, 12);
    const mat = new THREE.MeshBasicMaterial({ color: 0xaa00ff, transparent: true, opacity: 0.6 });
    const effect = new THREE.Mesh(geo, mat);
    effect.position.set(pos.x, 1, pos.z);
    this.scene.add(effect);
    let life = 0.5;
    const fade = () => {
      if (this.isDestroyed) { this.scene.remove(effect); return; }
      life -= 0.016;
      mat.opacity = Math.max(0, life / 0.5 * 0.6);
      effect.scale.x += 0.05; effect.scale.y += 0.05; effect.scale.z += 0.05;
      if (life > 0) requestAnimationFrame(fade); else this.scene.remove(effect);
    };
    fade();
  }

  updateBossAI(zombie: ZombieState, target: PlayerState, dt: number, mesh: any) {
    zombie.attackCooldown = (zombie.attackCooldown || 3) - dt;
    const dist = vecDist2D(zombie.position, target.position);
    const stats = C.ZOMBIE_TYPES.boss;
    const speedMult = (zombie as any).speedMult || 1;

    if ((zombie.attackCooldown || 0) <= 0) {
      const r = Math.random();
      if (r < 0.33) {
        zombie.attackCooldown = 4;
        this.bossShockwave(zombie);
      } else if (r < 0.66) {
        zombie.attackCooldown = 5;
        zombie.attackPhase = 'charge';
        zombie.chargeTarget = { x: target.position.x, y: 0, z: target.position.z };
      } else {
        zombie.attackCooldown = 3;
        this.bossToxicSpit(zombie, target);
      }
    }

    if (zombie.attackPhase === 'charge' && zombie.chargeTarget) {
      this.moveZombieTowards(zombie, zombie.chargeTarget, stats.speed * speedMult * 2.5, dt, mesh);
      if (vecDist2D(zombie.position, zombie.chargeTarget) < 2) {
        zombie.attackPhase = 'move';
        zombie.chargeTarget = null;
        if (target.id === this.localPlayer.id) {
          this.takeDamage(Math.floor(stats.damage * 1.5 * ((zombie as any).damageMult || 1)), true);
        }
      }
    } else {
      this.moveZombieTowards(zombie, target.position, stats.speed * speedMult, dt, mesh);
    }

    // Melee
    if (dist < stats.attackRange) {
      zombie.meleeTimer = (zombie.meleeTimer || 0) - dt;
      if ((zombie.meleeTimer || 0) <= 0) {
        zombie.meleeTimer = stats.attackRate;
        if (target.id === this.localPlayer.id) {
          this.takeDamage(Math.floor(stats.damage * ((zombie as any).damageMult || 1)), true);
        }
      }
    }

    mesh.position.set(zombie.position.x, Math.sin(Date.now() * 0.003) * 0.3, zombie.position.z);
    mesh.rotation.y += dt * 0.2;

    this.updateZombieHPBar(mesh, zombie);
    this.animateZombieWalk(mesh, zombie, dist, stats.attackRange);
  }

  bossShockwave(zombie: ZombieState) {
    const ringGeo = new THREE.RingGeometry(0.5, 1.5, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xff00ff, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(zombie.position.x, 0.15, zombie.position.z);
    this.scene.add(ring);

    let radius = 0.5;
    const expand = () => {
      if (this.isDestroyed) { this.scene.remove(ring); return; }
      radius += 0.4;
      ring.scale.set(radius, radius, 1);
      ringMat.opacity = Math.max(0, 0.8 - radius / 15);

      if (radius < 12) {
        const localDist = vecDist2D(this.localPlayer.position, zombie.position);
        if (localDist < radius + 1 && localDist > radius - 0.8) {
          this.takeDamage(15, true);
        }
        requestAnimationFrame(expand);
      } else {
        this.scene.remove(ring);
      }
    };
    requestAnimationFrame(expand);
  }

  bossToxicSpit(zombie: ZombieState, target: PlayerState) {
    for (let i = 0; i < 3; i++) {
      setTimeout(() => {
        if (this.isDestroyed) return;
        const angle = Math.atan2(
          target.position.z - zombie.position.z,
          target.position.x - zombie.position.x
        ) + (Math.random() - 0.5) * 0.6;

        const geo = new THREE.SphereGeometry(0.25, 8, 8);
        const mat = new THREE.MeshBasicMaterial({ color: 0x44ff00 });
        const spit = new THREE.Mesh(geo, mat);
        spit.position.set(zombie.position.x, 4, zombie.position.z);
        this.scene.add(spit);
        const ptLight = new THREE.PointLight(0x44ff00, 1, 5);
        spit.add(ptLight);

        const vel = { x: Math.cos(angle) * 12, y: 8, z: Math.sin(angle) * 12 };
        const animate = () => {
          if (this.isDestroyed) { this.scene.remove(spit); return; }
          vel.y -= 20 * 0.016;
          spit.position.x += vel.x * 0.016;
          spit.position.y += vel.y * 0.016;
          spit.position.z += vel.z * 0.016;
          if (spit.position.y <= 0.2) {
            this.createAcidPool(spit.position.x, spit.position.z);
            this.scene.remove(spit);
          } else {
            requestAnimationFrame(animate);
          }
        };
        animate();
      }, i * 350);
    }
  }

  exploderDetonate(zombie: ZombieState) {
    const stats = C.ZOMBIE_TYPES.exploder;
    this.createExplosion(zombie.position, 5, stats.damage);
    this.killZombie(zombie.id, this.localPlayer.id, stats.reward, false);

    const dist = vecDist2D(zombie.position, this.localPlayer.position);
    if (dist < 5) {
      const dmg = Math.floor(stats.damage * (1 - dist / 5));
      this.takeDamage(dmg, true);
    }

    // Damage zombies nearby
    for (const [id, z] of this.zombies) {
      if (!z.isAlive || id === zombie.id) continue;
      const d = vecDist2D(zombie.position, z.position);
      if (d < 4) this.damageZombie(z, Math.floor(30 * (1 - d / 4)));
    }

    // Damage barricades
    for (const [bid, barc] of this.barricades) {
      if (vecDist2D(zombie.position, barc.position) < 5) {
        this.damageBarricade(bid, 60);
      }
    }
  }

  acidZombieSpitAt(zombie: ZombieState, target: PlayerState) {
    const startPos = { x: zombie.position.x, y: 1.4, z: zombie.position.z };
    const dx = target.position.x - startPos.x;
    const dz = target.position.z - startPos.z;
    const dist = Math.sqrt(dx * dx + dz * dz) || 1;
    const speed = 12;
    const travelTime = dist / speed;
    const velY = (0.5 * 20 * travelTime) + 1.4 / travelTime;

    const geo = new THREE.SphereGeometry(0.14, 8, 8);
    const mat = new THREE.MeshBasicMaterial({ color: 0x88ff00 });
    const projMesh = new THREE.Mesh(geo, mat);
    projMesh.position.set(startPos.x, startPos.y, startPos.z);
    this.scene.add(projMesh);

    const ptLight = new THREE.PointLight(0x88ff00, 0.8, 3);
    projMesh.add(ptLight);

    this.acidProjectiles.push({
      mesh: projMesh,
      position: { ...startPos },
      velocity: { x: (dx / dist) * speed, y: velY, z: (dz / dist) * speed },
    });
  }

  updateAcidProjectiles(dt: number) {
    for (let i = this.acidProjectiles.length - 1; i >= 0; i--) {
      const proj = this.acidProjectiles[i];
      proj.velocity.y -= 20 * dt;
      proj.position.x += proj.velocity.x * dt;
      proj.position.y += proj.velocity.y * dt;
      proj.position.z += proj.velocity.z * dt;
      proj.mesh.position.set(proj.position.x, proj.position.y, proj.position.z);

      // Check collision with walls
      let hitWall = false;
      for (const col of this.colBoxes) {
        if (!col.isSolid) continue;
        const b = col.aabb;
        if (proj.position.x > b.min.x && proj.position.x < b.max.x &&
            proj.position.z > b.min.z && proj.position.z < b.max.z &&
            proj.position.y < b.max.y) {
          hitWall = true; break;
        }
      }

      if (proj.position.y <= 0.1 || hitWall) {
        this.scene.remove(proj.mesh);
        this.acidProjectiles.splice(i, 1);
        this.createAcidPool(proj.position.x, proj.position.z);
      }
    }
  }

  createAcidPool(x: number, z: number) {
    const id = 'pool_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    const pool: AcidPool = { id, position: vec3(x, 0, z), radius: 2.5, timer: C.ACID_POOL_DURATION, damageTimer: 0 };
    this.acidPools.set(id, pool);

    const geo = new THREE.CircleGeometry(2.5, 20);
    const mat = new THREE.MeshBasicMaterial({ color: 0x44ff00, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.05, z);
    this.scene.add(mesh);

    const ptLight = new THREE.PointLight(0x44ff00, 1, 5);
    ptLight.position.set(x, 0.6, z);
    this.scene.add(ptLight);

    this.acidPoolMeshes.set(id, { mesh, light: ptLight });
  }

  updateAcidPools(dt: number) {
    for (const [id, pool] of this.acidPools) {
      pool.timer -= dt;

      if (pool.timer <= 0) {
        const md = this.acidPoolMeshes.get(id);
        if (md) { this.scene.remove(md.mesh); this.scene.remove(md.light); this.acidPoolMeshes.delete(id); }
        this.acidPools.delete(id);
        continue;
      }

      // Damage local player
      const dist = vecDist2D(this.localPlayer.position, pool.position);
      if (dist < pool.radius) {
        pool.damageTimer = (pool.damageTimer || 0) - dt;
        if ((pool.damageTimer || 0) <= 0) {
          pool.damageTimer = 1;
          this.takeDamage(C.ACID_POOL_DAMAGE, true);
        }
      }

      // Pulsing
      const md = this.acidPoolMeshes.get(id);
      if (md) {
        (md.mesh.material as any).opacity = 0.3 + Math.sin(Date.now() * 0.005) * 0.15;
        md.light.intensity = 0.8 + Math.sin(Date.now() * 0.008) * 0.3;
      }
    }
  }

  moveZombieTowards(zombie: ZombieState, target: Vec3, speed: number, dt: number, mesh: any) {
    const dx = target.x - zombie.position.x;
    const dz = target.z - zombie.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 0.1) return;

    // Separation from other zombies
    let sepX = 0, sepZ = 0;
    for (const [oid, oz] of this.zombies) {
      if (oid === zombie.id || !oz.isAlive) continue;
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

    const zRadius = zombie.type === 'boss' ? 1.5 : zombie.type === 'miniboss' ? 0.8 : 0.4;

    if (!this.checkSolidCollision(newX, zombie.position.z, zRadius)) {
      zombie.position.x = newX;
    } else {
      // Try to slide along wall
      if (!this.checkSolidCollision(zombie.position.x + moveX * 0.5, zombie.position.z, zRadius)) {
        zombie.position.x += moveX * 0.5;
      }
    }
    if (!this.checkSolidCollision(zombie.position.x, newZ, zRadius)) {
      zombie.position.z = newZ;
    } else {
      if (!this.checkSolidCollision(zombie.position.x, zombie.position.z + moveZ * 0.5, zRadius)) {
        zombie.position.z += moveZ * 0.5;
      }
    }

    zombie.position.x = clamp(zombie.position.x, -C.MAP_SIZE / 2 + 1, C.MAP_SIZE / 2 - 1);
    zombie.position.z = clamp(zombie.position.z, -C.MAP_SIZE / 2 + 1, C.MAP_SIZE / 2 - 1);

    // Damage barricades
    for (const [bid, barc] of this.barricades) {
      const bd = vecDist2D(zombie.position, barc.position);
      if (bd < 1.5) {
        const dmg = Math.floor(5 * ((zombie as any).damageMult || 1));
        this.damageBarricade(bid, dmg);
      }
    }

    mesh.rotation.y = Math.atan2(dx, dz);
    mesh.position.set(zombie.position.x, 0, zombie.position.z);
  }

  // ============================================================
  // ZOMBIE DAMAGE & KILL
  // ============================================================
  damageZombie(zombie: ZombieState, damage: number) {
    if (!zombie.isAlive) return;

    const armorMult = (zombie as any).armorMult || 1.0;
    const actualDamage = Math.floor(damage * armorMult);
    zombie.hp -= actualDamage;

    if (zombie.hp <= 0) {
      zombie.hp = 0;
      this.killZombie(zombie.id, this.localPlayer.id, C.ZOMBIE_TYPES[zombie.type]?.reward || 10, false);
    }

    // Multiplayer: send hit event
    if (this.socket?.connected) {
      this.socket.emit('zombieHit', { zombieId: zombie.id, damage: actualDamage, attackerId: this.localPlayer.id });
    }
  }

  killZombie(zombieId: string, killerId: string | null, reward: number, fromExplosion: boolean) {
    const zombie = this.zombies.get(zombieId);
    if (!zombie || !zombie.isAlive) return;

    zombie.isAlive = false;

    // Death/dissolve animation (5 seconds)
    const mesh = this.zombieMeshes.get(zombieId);
    if (mesh) {
      // Immediate fall over
      let fallAngle = 0;
      const fallInterval = setInterval(() => {
        if (this.isDestroyed) { clearInterval(fallInterval); return; }
        fallAngle += 0.08;
        mesh.rotation.z = Math.min(Math.PI / 2, fallAngle);
        mesh.position.y = -Math.sin(fallAngle) * 0.5;
        if (fallAngle >= Math.PI / 2) clearInterval(fallInterval);
      }, 16);

      // Dissolve after 5s
      setTimeout(() => {
        if (this.isDestroyed) return;
        let opacity = 1;
        const dissolve = () => {
          if (this.isDestroyed) { this.scene.remove(mesh); this.zombieMeshes.delete(zombieId); return; }
          opacity -= 0.04;
          mesh.traverse((child: any) => {
            if (child.material) {
              child.material.transparent = true;
              child.material.opacity = Math.max(0, opacity);
            }
          });
          if (opacity > 0) requestAnimationFrame(dissolve);
          else {
            this.scene.remove(mesh);
            this.zombieMeshes.delete(zombieId);
          }
        };
        dissolve();
      }, C.CORPSE_FADE_TIME * 1000);
    }

    // Explosion on death for 'exploder' (already handled) and miniboss 'explosive'
    if (zombie.type === 'miniboss' && zombie.modifiers?.includes('explosive') && !fromExplosion) {
      setTimeout(() => this.createExplosion(zombie.position, 6, 100), 100);
    }

    // Drop items
    if (Math.random() < 0.1) {
      this.spawnHealthDrop(zombie.position);
    }

    if (killerId === this.localPlayer.id) {
      this.addMoney(reward);
      this.onZombieKilled(zombieId);
    }
  }

  onZombieKilled(zombieId: string) {
    this.localPlayer.kills++;
    this.localPlayer.streak++;

    if (this.localPlayer.streak === C.STREAK_SPEED_THRESHOLD) {
      this.applyBoost('speed', 10);
      this.showCombo('🔥 x5 СЕРИЯ!', 'Ускорение на 10 сек!');
    } else if (this.localPlayer.streak === C.STREAK_DAMAGE_THRESHOLD) {
      this.applyBoost('damage', 10);
      this.showCombo('💀 x10 СЕРИЯ!', 'Двойной урон на 10 сек!');
    } else if (this.localPlayer.streak === C.STREAK_CLEANSE_THRESHOLD) {
      this.showCombo('⚡ x15 СЕРИЯ!', 'ОЧИЩЕНИЕ КАРТЫ!');
      this.cleanseMap();
    } else if (this.localPlayer.streak > 3) {
      this.showCombo(`x${this.localPlayer.streak} СЕРИЯ`, '');
    }

    // Update streak bar
    const bar = document.getElementById('streak-bar');
    const count = document.getElementById('streak-count');
    if (bar) bar.style.width = Math.min(100, (this.localPlayer.streak / 15) * 100) + '%';
    if (count) count.textContent = String(this.localPlayer.streak);

    this.updateHUD();
  }

  cleanseMap() {
    for (const [id, zombie] of this.zombies) {
      if (zombie.type === 'normal' && zombie.isAlive) {
        this.createExplosion(zombie.position, 2, 0);
        zombie.isAlive = false;
        this.killZombie(id, this.localPlayer.id, C.ZOMBIE_TYPES.normal.reward, false);
      }
    }
  }

  spawnHealthDrop(pos: Vec3) {
    const geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff4444 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos.x, 0.25, pos.z);
    const ptLight = new THREE.PointLight(0xff4444, 0.6, 3);
    ptLight.position.copy(mesh.position);
    this.scene.add(mesh);
    this.scene.add(ptLight);

    const cross = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    mesh.add(cross);

    const drop: any = { mesh, ptLight, position: pos };
    this.healthDrops.push(drop);
  }

  updateHealthDrops(dt: number) {
    for (let i = this.healthDrops.length - 1; i >= 0; i--) {
      const drop = this.healthDrops[i];
      drop.mesh.rotation.y += dt * 2;

      const dist = vecDist2D(this.localPlayer.position, drop.position);
      if (dist < 1.5 && !this.localPlayer.isDead) {
        const healed = Math.min(30, this.localPlayer.maxHp - this.localPlayer.hp);
        if (healed > 0) {
          this.localPlayer.hp += healed;
          this.showKillFeedMessage(`+${healed} HP`, '#44ff88');
          this.updateHUD();
        }
        this.scene.remove(drop.mesh);
        this.scene.remove(drop.ptLight);
        this.healthDrops.splice(i, 1);
      }
    }
  }

  // ============================================================
  // WAVE MANAGEMENT
  // ============================================================
  checkWaveComplete() {
    if (this.phase !== 'combat') return;

    const alive = Array.from(this.zombies.values()).filter(z => z.isAlive);
    const el = document.getElementById('zombie-count');
    if (el) el.textContent = `Зомби: ${alive.length}`;

    if (alive.length === 0 && this.zombies.size > 0) {
      this.zombies.clear();

      if (this.wave >= C.WAVES.length) {
        this.showVictory();
        return;
      }

      this.phase = 'intermission';
      this.showWaveAnnounce('ВОЛНА ЗАВЕРШЕНА!', `Следующая волна через 10 секунд`, 3000);
      const timerEl = document.getElementById('wave-timer');
      if (timerEl) timerEl.textContent = 'Отдыхайте...';

      let countdown = 10;
      const countdownInterval = setInterval(() => {
        if (this.isDestroyed) { clearInterval(countdownInterval); return; }
        countdown--;
        if (timerEl) timerEl.textContent = `Следующая волна через ${countdown} сек`;
        if (countdown <= 0) {
          clearInterval(countdownInterval);
          if (timerEl) timerEl.textContent = '';
          if (!this.isDestroyed) this.startWave(this.wave + 1);
        }
      }, 1000);
    }
  }

  // ============================================================
  // EFFECTS
  // ============================================================
  createExplosion(pos: Vec3, radius: number, damage: number) {
    // Orange flash
    const flashGeo = new THREE.SphereGeometry(radius * 0.5, 16, 16);
    const flashMat = new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.9 });
    const flash = new THREE.Mesh(flashGeo, flashMat);
    flash.position.set(pos.x, pos.y + 0.5, pos.z);
    this.scene.add(flash);

    const ptLight = new THREE.PointLight(0xff6600, 5, radius * 3);
    ptLight.position.copy(flash.position);
    this.scene.add(ptLight);

    // Particles
    for (let i = 0; i < 20; i++) {
      const pg = new THREE.SphereGeometry(0.12, 4, 4);
      const pm = new THREE.MeshBasicMaterial({ color: Math.random() > 0.5 ? 0xff4400 : 0xffaa00 });
      const pp = new THREE.Mesh(pg, pm);
      pp.position.set(pos.x, pos.y + 0.5, pos.z);
      this.scene.add(pp);
      const vel = {
        x: (Math.random() - 0.5) * radius * 4,
        y: Math.random() * radius * 2,
        z: (Math.random() - 0.5) * radius * 4
      };
      let life = 0.8;
      const updatePart = () => {
        if (this.isDestroyed) { this.scene.remove(pp); return; }
        vel.y -= 15 * 0.016;
        pp.position.x += vel.x * 0.016; pp.position.y += vel.y * 0.016; pp.position.z += vel.z * 0.016;
        life -= 0.016;
        pm.opacity = Math.max(0, life / 0.8);
        pm.transparent = true;
        if (life > 0) requestAnimationFrame(updatePart); else this.scene.remove(pp);
      };
      updatePart();
    }

    // Fade flash
    let opacity = 0.9;
    const fadeFlash = () => {
      if (this.isDestroyed) { this.scene.remove(flash); this.scene.remove(ptLight); return; }
      opacity -= 0.06;
      flashMat.opacity = Math.max(0, opacity);
      flash.scale.x += 0.1; flash.scale.y += 0.1; flash.scale.z += 0.1;
      ptLight.intensity = Math.max(0, ptLight.intensity - 0.3);
      if (opacity > 0) requestAnimationFrame(fadeFlash);
      else { this.scene.remove(flash); this.scene.remove(ptLight); }
    };
    fadeFlash();
  }

  // ============================================================
  // HUD
  // ============================================================
  updateHUD() {
    const p = this.localPlayer;

    // HP
    const hpPct = (p.hp / p.maxHp) * 100;
    const hpBar = document.getElementById('hp-bar');
    const hpText = document.getElementById('hp-text');
    if (hpBar) {
      hpBar.style.width = hpPct + '%';
      hpBar.style.background = hpPct > 50 ? 'linear-gradient(90deg,#ff2222,#ff6666)' :
                                hpPct > 25 ? 'linear-gradient(90deg,#ff8800,#ffaa44)' :
                                             'linear-gradient(90deg,#ff0000,#ff4444)';
    }
    if (hpText) hpText.textContent = `${p.hp} / ${p.maxHp}`;

    // HP pulsing at low health
    const hpCont = document.getElementById('hp-container');
    if (hpCont) {
      hpCont.style.animation = p.hp < 30 ? 'hpPulse 1s infinite' : 'none';
    }

    // Weapon/ammo
    const weaponName = document.getElementById('weapon-name');
    const ammoMag = document.getElementById('ammo-mag');
    const ammoReserve = document.getElementById('ammo-reserve');
    if (weaponName) weaponName.textContent = p.weapon === 'ak47' ? 'AK-47' : 'ПИСТОЛЕТ';
    if (p.weapon === 'ak47') {
      if (ammoMag) ammoMag.textContent = String(this.currentMagAmmo);
      if (ammoReserve) ammoReserve.textContent = String(p.ammoAkReserve);
    } else {
      if (ammoMag) ammoMag.textContent = '∞';
      if (ammoReserve) ammoReserve.textContent = '∞';
    }

    // Money
    const moneyEl = document.getElementById('money-display');
    if (moneyEl) moneyEl.textContent = `$${p.money}`;

    // Grenades
    const grenadesEl = document.getElementById('grenades-display');
    if (grenadesEl) grenadesEl.textContent = `🧨 x${p.grenadeCount}`;

    // Wave
    const waveEl = document.getElementById('wave-display');
    if (waveEl) waveEl.textContent = `ВОЛНА ${this.wave}/${C.WAVES.length}`;

    // Barricades
    const barcCount = document.getElementById('barricade-count');
    if (barcCount) barcCount.textContent = String(p.barricadeCount);

    this.updateBoostUI();
  }

  addMoney(amount: number) {
    this.localPlayer.money += amount;
    if (amount > 0) this.showKillFeedMessage(`+$${amount}`, '#ffdd44');
    this.updateHUD();
  }

  showKillFeedMessage(msg: string, color: string) {
    const feed = document.getElementById('kill-feed');
    if (!feed) return;
    const el = document.createElement('div');
    el.style.cssText = `background:rgba(0,0,0,0.75);border-left:2px solid ${color};padding:4px 8px;font-size:12px;color:${color};border-radius:2px;animation:slideUp 0.3s ease;margin-bottom:2px;`;
    el.textContent = msg;
    feed.appendChild(el);
    setTimeout(() => {
      el.style.animation = 'killFeedOut 0.5s ease forwards';
      setTimeout(() => { if (el.parentNode) el.remove(); }, 500);
    }, 2500);
  }

  showCombo(text: string, sub: string) {
    const display = document.getElementById('combo-display');
    const textEl = document.getElementById('combo-text');
    const subEl = document.getElementById('combo-sub');
    if (display && textEl && subEl) {
      textEl.textContent = text;
      subEl.textContent = sub;
      display.style.opacity = '1';
      display.style.animation = 'comboFlash 0.3s ease';
      setTimeout(() => { if (display) display.style.opacity = '0'; }, 3000);
    }
  }

  showWaveAnnounce(text: string, sub: string, duration: number) {
    const el = document.getElementById('wave-announce');
    const textEl = document.getElementById('wave-announce-text');
    const subEl = document.getElementById('wave-announce-sub');
    if (el && textEl && subEl) {
      textEl.textContent = text;
      subEl.textContent = sub;
      el.style.opacity = '1';
      el.style.animation = 'waveFlash 1s ease';
      setTimeout(() => { if (el) el.style.opacity = '0'; }, duration);
    }
  }

  // ============================================================
  // LEADERBOARD
  // ============================================================
  toggleLeaderboard() {
    this.showLeaderboard = !this.showLeaderboard;
    const lb = document.getElementById('leaderboard');
    if (!lb) return;
    lb.style.display = this.showLeaderboard ? 'block' : 'none';
    if (this.showLeaderboard) this.updateLeaderboard();
  }

  updateLeaderboard() {
    const content = document.getElementById('leaderboard-content');
    if (!content) return;
    const allPlayers = [
      { ...this.localPlayer, isLocal: true },
      ...Array.from(this.remotePlayers.values()).map(p => ({ ...p, isLocal: false }))
    ].sort((a, b) => b.kills - a.kills);

    content.innerHTML = allPlayers.map((p, i) => `
      <div class="${p.isLocal ? 'local-row' : ''}" style="display:flex;justify-content:space-between;align-items:center;">
        <span>${i + 1}. ${p.name} ${p.isLocal ? '(Вы)' : ''}</span>
        <span style="color:#ffdd44">💀 ${p.kills} | $${p.money}</span>
      </div>
    `).join('');
  }

  // ============================================================
  // VICTORY / DEFEAT
  // ============================================================
  showVictory() {
    this.phase = 'victory';
    const screen = document.getElementById('victory-screen');
    if (screen) screen.style.display = 'flex';
    document.exitPointerLock();
    this.spawnFireworks();
  }

  showDefeat() {
    this.phase = 'defeat';
    const screen = document.getElementById('defeat-screen');
    if (screen) screen.style.display = 'flex';
    document.exitPointerLock();
  }

  spawnFireworks() {
    if (this.isDestroyed || this.phase !== 'victory') return;
    const colors = [0xff4444, 0x44ff44, 0x4444ff, 0xffdd44, 0xff44ff, 0x44ffff];
    for (let fw = 0; fw < 6; fw++) {
      setTimeout(() => {
        if (this.isDestroyed) return;
        const x = randomRange(-25, 25);
        const z = randomRange(-25, 25);
        for (let i = 0; i < 30; i++) {
          const geo = new THREE.SphereGeometry(0.12, 4, 4);
          const mat = new THREE.MeshBasicMaterial({ color: colors[Math.floor(Math.random() * colors.length)], transparent: true });
          const p = new THREE.Mesh(geo, mat);
          p.position.set(x, randomRange(8, 18), z);
          this.scene.add(p);
          const angle = Math.random() * Math.PI * 2;
          const pitch = randomRange(-Math.PI / 2, Math.PI / 2);
          const speed = randomRange(5, 15);
          const vel = {
            x: Math.cos(angle) * Math.cos(pitch) * speed,
            y: Math.sin(pitch) * speed,
            z: Math.sin(angle) * Math.cos(pitch) * speed
          };
          let life = 2;
          const updateFw = () => {
            if (this.isDestroyed) { this.scene.remove(p); return; }
            vel.y -= 8 * 0.016;
            p.position.x += vel.x * 0.016; p.position.y += vel.y * 0.016; p.position.z += vel.z * 0.016;
            life -= 0.016;
            mat.opacity = Math.max(0, life / 2);
            if (life > 0) requestAnimationFrame(updateFw); else this.scene.remove(p);
          };
          updateFw();
        }
      }, fw * 500);
    }
    setTimeout(() => { if (!this.isDestroyed && this.phase === 'victory') this.spawnFireworks(); }, 3500);
  }

  // ============================================================
  // MINIMAP
  // ============================================================
  updateMinimap() {
    if (!this.minimapCtx || !this.showMinimap) return;
    const ctx = this.minimapCtx;
    const w = 130, h = 130;
    const scale = w / C.MAP_SIZE;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(5,10,5,0.85)';
    ctx.fillRect(0, 0, w, h);

    const worldToMap = (wx: number, wz: number) => ({
      x: (wx + C.MAP_SIZE / 2) * scale,
      y: (wz + C.MAP_SIZE / 2) * scale
    });

    // Obstacles
    ctx.fillStyle = 'rgba(120,120,100,0.5)';
    for (const col of this.colBoxes) {
      const b = col.aabb;
      const x1 = (b.min.x + C.MAP_SIZE / 2) * scale;
      const y1 = (b.min.z + C.MAP_SIZE / 2) * scale;
      ctx.fillRect(x1, y1, (b.max.x - b.min.x) * scale, (b.max.z - b.min.z) * scale);
    }

    // Zombies
    for (const [, z] of this.zombies) {
      if (!z.isAlive) continue;
      const mp = worldToMap(z.position.x, z.position.z);
      ctx.fillStyle = z.type === 'boss' ? '#ff00ff' : z.type === 'miniboss' ? '#ff44ff' : '#ff4444';
      ctx.beginPath();
      ctx.arc(mp.x, mp.y, z.type === 'boss' ? 5 : z.type === 'miniboss' ? 3.5 : 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Key objects
    // Vending machine
    const vm = worldToMap(-12, -28);
    ctx.fillStyle = '#0088ff';
    ctx.fillRect(vm.x - 2.5, vm.y - 2.5, 5, 5);

    // Mystery box
    const mb = worldToMap(this.mysteryBoxPos.x, this.mysteryBoxPos.z);
    ctx.fillStyle = '#aa00ff';
    ctx.beginPath();
    ctx.arc(mb.x, mb.y, 3, 0, Math.PI * 2);
    ctx.fill();

    // Traps
    for (const trap of this.traps) {
      const tp = worldToMap(trap.position.x, trap.position.z);
      ctx.fillStyle = trap.active ? '#ff4400' : '#446644';
      ctx.fillRect(tp.x - 2, tp.y - 2, 4, 4);
    }

    // Remote players
    for (const [, p] of this.remotePlayers) {
      const mp = worldToMap(p.position.x, p.position.z);
      ctx.fillStyle = p.isDown ? '#ff8800' : '#44ff88';
      ctx.beginPath();
      ctx.arc(mp.x, mp.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Local player
    const lmp = worldToMap(this.localPlayer.position.x, this.localPlayer.position.z);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(lmp.x, lmp.y, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Direction arrow
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(lmp.x, lmp.y);
    ctx.lineTo(lmp.x + Math.sin(-this.yaw) * 8, lmp.y + Math.cos(-this.yaw) * 8);
    ctx.stroke();
  }

  // ============================================================
  // VENDING MACHINE ANIMATION
  // ============================================================
  updateVendingMachine(dt: number) {
    if (!this.vendingScreen || !this.vendingMachineMesh) return;
    const t = Date.now() * 0.001;
    const r = Math.sin(t * 3) * 0.5 + 0.5;
    (this.vendingScreen.material as any).color.setRGB(0, r * 0.8 + 0.2, r * 0.4 + 0.4);
    const light = (this.vendingMachineMesh as any).screenLight;
    if (light) light.intensity = 0.4 + r * 0.4;
  }

  updateMysteryBox(dt: number) {
    if (!this.mysteryBoxMesh) return;
    this.mysteryBoxMesh.rotation.y += dt * 0.8;
    this.mysteryBoxMesh.position.y = Math.sin(Date.now() * 0.002) * 0.15;
  }

  // ============================================================
  // MULTIPLAYER SYNC
  // ============================================================
  connectToServer(url: string) {
    if (typeof (window as any).io === 'undefined') {
      console.warn('Socket.IO not available');
      return;
    }

    try {
      const cleanUrl = url.replace(/\/$/, '');
      this.socket = (window as any).io(cleanUrl, {
        path: '/ws/',
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 5,
        timeout: 10000,
      });

      this.socket.on('connect', () => {
        console.log('Connected to server:', this.socket.id);
        this.showKillFeedMessage('Подключено к серверу!', '#44ff88');
        this.socket.emit('playerJoin', {
          id: this.localPlayer.id,
          name: this.localPlayer.name,
          color: this.localPlayer.color,
          position: this.localPlayer.position,
        });
      });

      this.socket.on('disconnect', () => {
        this.showKillFeedMessage('Отключено от сервера', '#ff4444');
      });

      this.socket.on('gameState', (state: any) => {
        this.onGameState(state);
      });

      this.socket.on('playerJoined', (player: any) => {
        if (player.id === this.localPlayer.id) return;
        this.remotePlayers.set(player.id, player);
        this.createRemotePlayerMesh(player);
        this.showKillFeedMessage(`${player.name} присоединился!`, '#44ff88');
      });

      this.socket.on('playerLeft', (playerId: string) => {
        const p = this.remotePlayers.get(playerId);
        if (p) this.showKillFeedMessage(`${p.name} вышел`, '#aaaaaa');
        this.removeRemotePlayer(playerId);
      });

      this.socket.on('playerUpdated', (player: any) => {
        if (player.id === this.localPlayer.id) return;
        const rp = this.remotePlayers.get(player.id);
        if (rp) {
          Object.assign(rp, player);
          this.updateRemotePlayerMesh(player.id);
        }
      });

      this.socket.on('zombieSpawned', (zombie: any) => {
        if (!this.zombies.has(zombie.id)) {
          this.zombies.set(zombie.id, zombie);
          this.createZombieMesh(zombie);
        }
      });

      this.socket.on('zombieKilled', (data: any) => {
        this.killZombie(data.zombieId, data.killerId, data.reward, false);
        if (data.killerId !== this.localPlayer.id && this.localPlayer.money !== undefined) {
          const proportion = data.proportion || 0;
          if (proportion > 0) this.addMoney(Math.floor(data.reward * proportion));
        }
      });

      this.socket.on('waveStart', (data: any) => {
        this.wave = data.wave;
        this.phase = 'combat';
        this.showWaveAnnounce(`ВОЛНА ${data.wave}`, data.message || '', 3000);
        this.updateHUD();
      });

      this.socket.on('waveComplete', () => {
        this.phase = 'intermission';
        this.showWaveAnnounce('ВОЛНА ЗАВЕРШЕНА!', 'Отдыхайте...', 3000);
      });

      this.socket.on('victory', () => this.showVictory());
      this.socket.on('defeat', () => this.showDefeat());

      this.socket.on('playerRevived', (data: any) => {
        if (data.targetId === this.localPlayer.id) {
          this.localPlayer.isDown = false;
          this.localPlayer.hp = 50;
          const overlay = document.getElementById('down-overlay');
          if (overlay) overlay.style.display = 'none';
          this.showKillFeedMessage('Вас подняли!', '#44ff88');
          this.updateHUD();
        }
        const rp = this.remotePlayers.get(data.targetId);
        if (rp) { rp.isDown = false; rp.hp = 50; }
      });

      this.socket.on('acidPool', (data: any) => {
        this.createAcidPool(data.x, data.z);
      });

      this.socket.on('explosion', (data: any) => {
        this.createExplosion(data.position, data.radius, 0);
      });

    } catch (err) {
      console.error('Failed to connect:', err);
      this.showKillFeedMessage('Ошибка подключения!', '#ff4444');
    }
  }

  onGameState(state: any) {
    if (!state) return;

    for (const [id, z] of Object.entries(state.zombies || {})) {
      const zs = z as any;
      if (!this.zombies.has(id)) {
        this.zombies.set(id, zs);
        this.createZombieMesh(zs);
      } else {
        Object.assign(this.zombies.get(id)!, zs);
      }
    }

    for (const [id] of this.zombies) {
      if (!state.zombies?.[id]) {
        this.removeZombieMesh(id);
        this.zombies.delete(id);
      }
    }

    for (const [id, p] of Object.entries(state.players || {})) {
      const ps = p as any;
      if (id === this.localPlayer.id) continue;
      if (!this.remotePlayers.has(id)) {
        this.remotePlayers.set(id, ps);
        this.createRemotePlayerMesh(ps);
      } else {
        Object.assign(this.remotePlayers.get(id)!, ps);
        this.updateRemotePlayerMesh(id);
      }
    }

    if (state.wave) { this.wave = state.wave; this.updateHUD(); }
    if (state.phase) this.phase = state.phase;
  }

  syncToServer() {
    if (!this.socket?.connected) return;
    this.socket.emit('playerUpdate', {
      id: this.localPlayer.id,
      position: this.localPlayer.position,
      rotation: this.localPlayer.rotation,
      hp: this.localPlayer.hp,
      isDown: this.localPlayer.isDown,
      isDead: this.localPlayer.isDead,
      money: this.localPlayer.money,
      kills: this.localPlayer.kills,
      weapon: this.localPlayer.weapon,
      streak: this.localPlayer.streak,
    });
  }

  // ============================================================
  // REMOTE PLAYER MESHES
  // ============================================================
  createRemotePlayerMesh(player: any) {
    const group = new THREE.Group();
    const color = player.color || 0x44ff44;
    const bodyMat = new THREE.MeshLambertMaterial({ color });
    const headMat = new THREE.MeshLambertMaterial({ color: 0xffccaa });
    const legMat = new THREE.MeshLambertMaterial({ color: 0x333355 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.3), bodyMat);
    body.position.y = 1.2; body.castShadow = true; group.add(body);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), headMat);
    head.position.y = 1.75; head.castShadow = true; group.add(head);

    const legGeo = new THREE.BoxGeometry(0.2, 0.6, 0.2);
    const legL = new THREE.Mesh(legGeo, legMat);
    legL.position.set(-0.15, 0.7, 0); group.add(legL);
    const legR = new THREE.Mesh(legGeo, legMat);
    legR.position.set(0.15, 0.7, 0); group.add(legR);

    // Name tag (always faces camera)
    const nameCanvas = document.createElement('canvas');
    nameCanvas.width = 128; nameCanvas.height = 32;
    const nc = nameCanvas.getContext('2d')!;
    nc.fillStyle = 'rgba(0,0,0,0)';
    nc.fillRect(0, 0, 128, 32);
    nc.font = 'bold 18px Arial';
    nc.fillStyle = '#ffffff';
    nc.textAlign = 'center';
    nc.fillText(player.name || 'Player', 64, 22);
    const nameTex = new THREE.CanvasTexture(nameCanvas);
    const nameSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTex, transparent: true }));
    nameSprite.scale.set(1.5, 0.4, 1);
    nameSprite.position.y = 2.4;
    group.add(nameSprite);

    group.position.set(player.position?.x || 0, 0, player.position?.z || 0);
    this.scene.add(group);
    this.remotePlayerMeshes.set(player.id, group);
  }

  updateRemotePlayerMesh(id: string) {
    const player = this.remotePlayers.get(id);
    const mesh = this.remotePlayerMeshes.get(id);
    if (!player || !mesh) return;
    // Interpolate
    mesh.position.x += (player.position.x - mesh.position.x) * 0.3;
    mesh.position.z += (player.position.z - mesh.position.z) * 0.3;
    mesh.rotation.y = player.rotation || 0;
    mesh.position.y = player.isDown ? -0.5 : 0;
  }

  removeRemotePlayer(id: string) {
    const mesh = this.remotePlayerMeshes.get(id);
    if (mesh) { this.scene.remove(mesh); this.remotePlayerMeshes.delete(id); }
    this.remotePlayers.delete(id);
  }

  getAlivePlayers(): PlayerState[] {
    const result: PlayerState[] = [];
    if (!this.localPlayer.isDead && !this.localPlayer.isDown) result.push(this.localPlayer);
    for (const [, p] of this.remotePlayers) {
      if (!p.isDead && !p.isDown) result.push(p);
    }
    return result;
  }

  // ============================================================
  // MAIN LOOP
  // ============================================================
  animate() {
    if (this.isDestroyed) return;
    requestAnimationFrame(() => this.animate());

    const dt = Math.min(this.clock.getDelta(), 0.05);

    this.updatePlayer(dt);
    this.handleShooting(dt);
    this.updateReload(dt);
    this.updateZombies(dt);
    this.updateTraps(dt);
    this.updateBoosts(dt);
    this.updateGrenades(dt);
    this.updateHealthDrops(dt);
    this.updateVendingMachine(dt);
    this.updateMysteryBox(dt);
    this.updateMinimap();

    // Remote player mesh updates
    for (const [id] of this.remotePlayers) {
      this.updateRemotePlayerMesh(id);
    }

    // Server sync
    if (this.socket) {
      if (!(this as any).syncTimer) (this as any).syncTimer = 0;
      (this as any).syncTimer -= dt;
      if ((this as any).syncTimer <= 0) {
        (this as any).syncTimer = 1 / C.SYNC_RATE;
        this.syncToServer();
      }
    }

    this.renderer.render(this.scene, this.camera);
  }

  // ============================================================
  // DESTROY
  // ============================================================
  destroy() {
    this.isDestroyed = true;

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.domElement.parentNode) {
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      }
    }

    document.exitPointerLock();

    const hud = document.getElementById('game-hud');
    if (hud) hud.remove();

    const vendingUI = document.getElementById('vending-ui');
    if (vendingUI) vendingUI.remove();

    const btns = this.container.querySelectorAll('button');
    btns.forEach(b => {
      if (b.textContent === '← Меню') b.remove();
    });

    (window as any).__game__ = null;
  }
}

(window as any).ZombieGame = ZombieGame;
