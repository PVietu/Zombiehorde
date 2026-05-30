// ============================================================
// ZOMBIE HORDE - Main Game Engine
// Three.js based 3D zombie shooter
// ============================================================

import { GAME_CONSTANTS as C } from './constants';
import type { GameConfig } from '../App';
import type { PlayerState, ZombieState, Vec3, AABB, AcidPool, Barricade, Trap } from './types';
// AcidPool and Barricade used in maps; Trap in array

declare const THREE: any;

// ============================================================
// UTILITY FUNCTIONS
// ============================================================
function vec3(x = 0, y = 0, z = 0): Vec3 { return { x, y, z }; }
function vecDist2D(a: Vec3, b: Vec3) {
  return Math.sqrt((a.x - b.x) ** 2 + (a.z - b.z) ** 2);
}
function aabbOverlap(a: AABB, b: AABB): boolean {
  return a.min.x <= b.max.x && a.max.x >= b.min.x &&
    a.min.y <= b.max.y && a.max.y >= b.min.y &&
    a.min.z <= b.max.z && a.max.z >= b.min.z;
}
function randomRange(a: number, b: number) { return a + Math.random() * (b - a); }
function clamp(v: number, mn: number, mx: number) { return Math.max(mn, Math.min(mx, v)); }

// ============================================================
// COLLISION SYSTEM - Static world obstacles
// ============================================================
interface ColBox {
  aabb: AABB;
  isSolid: boolean;
  label: string;
}

// ============================================================
// NAVMESH - Simple 2D grid for pathfinding
// ============================================================
const NAV_GRID_SIZE = 2.5; // meters per cell
const NAV_COLS = Math.ceil(C.MAP_SIZE / NAV_GRID_SIZE);
const NAV_ROWS = Math.ceil(C.MAP_SIZE / NAV_GRID_SIZE);

function worldToGrid(x: number, z: number) {
  const col = Math.floor((x + C.MAP_SIZE / 2) / NAV_GRID_SIZE);
  const row = Math.floor((z + C.MAP_SIZE / 2) / NAV_GRID_SIZE);
  return { col: clamp(col, 0, NAV_COLS - 1), row: clamp(row, 0, NAV_ROWS - 1) };
}
function gridToWorld(col: number, row: number) {
  return {
    x: col * NAV_GRID_SIZE - C.MAP_SIZE / 2 + NAV_GRID_SIZE / 2,
    z: row * NAV_GRID_SIZE - C.MAP_SIZE / 2 + NAV_GRID_SIZE / 2
  };
}

// ============================================================
// MAIN GAME CLASS
// ============================================================
export class ZombieGame {
  container: HTMLElement;
  config: GameConfig;

  // Three.js
  scene: any;
  camera: any;
  renderer: any;
  clock: any;

  // Game state
  localPlayer!: PlayerState;
  remotePlayers: Map<string, PlayerState> = new Map();
  zombies: Map<string, ZombieState> = new Map();
  acidPools: Map<string, AcidPool> = new Map();
  barricades: Map<string, Barricade> = new Map();
  traps: Trap[] = [];

  wave = 0;
  phase: 'waiting' | 'combat' | 'intermission' | 'victory' | 'defeat' = 'waiting';
  waveCountdown = 5;
  mysteryBoxPos = vec3(20, 0, -20);

  // Scene objects
  meshes: Map<string, any> = new Map();
  particles: any[] = [];
  colBoxes: ColBox[] = [];
  navGrid: boolean[][] = [];  // true = walkable
  trapMeshes: any[] = [];
  barricadeMeshes: Map<string, any> = new Map();
  acidPoolMeshes: Map<string, any> = new Map();
  mysteryBoxMesh: any = null;
  vendingMachineMesh: any = null;
  vendingScreen: any = null;

  // Player meshes
  localPlayerMesh: any = null;
  weaponMesh: any = null;
  remotePlayerMeshes: Map<string, any> = new Map();
  zombieMeshes: Map<string, any> = new Map();

  // Input state
  keys: Set<string> = new Set();
  mouseX = 0;
  mouseY = 0;
  mouseDX = 0;
  mouseDY = 0;
  isPointerLocked = false;
  leftMouseDown = false;
  rightMouseDown = false;

  // Camera
  yaw = 0;
  pitch = 0;
  bobTimer = 0;

  // Game timers
  fireTimer = 0;
  reloading = false;
  reloadTimer = 0;
  currentMagAmmo = 30;
  lastShotTime = 0;

  // Network
  socket: any = null;
  isServer = false;  // true if running solo (acts as server)
  isSolo = false;

  // Effects
  muzzleFlash: any = null;
  bloodParticles: any[] = [];
  explosions: any[] = [];
  acidProjectiles: any[] = [];
  electricArcs: any[] = [];
  bulletTrails: any[] = [];

  // HUD
  hud!: HTMLElement;
  minimap!: HTMLCanvasElement;
  minimapCtx!: CanvasRenderingContext2D;
  interactPrompt!: HTMLElement;
  vendingMenu!: HTMLElement;
  leaderboard!: HTMLElement;
  deathScreen!: HTMLElement;
  victoryScreen!: HTMLElement;
  waveAnnounce!: HTMLElement;
  comboDisplay!: HTMLElement;

  // State flags
  vendingOpen = false;
  showLeaderboard = false;
  isDestroyed = false;
  reviveTarget: string | null = null;
  reviveTimer = 0;
  nearInteractable: string | null = null;

  // Solo server simulation
  soloGameState: any = null;
  soloUpdateTimer = 0;
  zombieIdCounter = 0;
  acidProjectileCounter = 0;
  barricadeCounter = 0;

  constructor(container: HTMLElement, config: GameConfig) {
    this.container = container;
    this.config = config;
    this.isSolo = config.mode === 'solo';

    this.initThree();
    this.buildWorld();
    this.buildNavGrid();
    this.initPlayer();
    this.initHUD();
    this.initInput();

    if (this.isSolo) {
      this.initSoloMode();
    } else {
      this.initMultiplayer();
    }

    this.animate();
  }

  // ============================================================
  // THREE.JS SETUP
  // ============================================================
  initThree() {
    // Scene
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x87ceeb, 0.008);

    // Sky gradient background
    this.scene.background = new THREE.Color(0x87ceeb);

    // Camera (first-person perspective)
    this.camera = new THREE.PerspectiveCamera(75, this.container.clientWidth / this.container.clientHeight, 0.1, 500);
    this.camera.position.set(0, C.PLAYER_HEIGHT, 0);

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404060, 0.6);
    this.scene.add(ambientLight);

    const sunLight = new THREE.DirectionalLight(0xffe0a0, 1.2);
    sunLight.position.set(50, 80, 30);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 2048;
    sunLight.shadow.mapSize.height = 2048;
    sunLight.shadow.camera.near = 0.5;
    sunLight.shadow.camera.far = 300;
    sunLight.shadow.camera.left = -80;
    sunLight.shadow.camera.right = 80;
    sunLight.shadow.camera.top = 80;
    sunLight.shadow.camera.bottom = -80;
    sunLight.shadow.bias = -0.001;
    this.scene.add(sunLight);

    const fillLight = new THREE.DirectionalLight(0x4080ff, 0.3);
    fillLight.position.set(-30, 20, -30);
    this.scene.add(fillLight);

    // Clock
    this.clock = new THREE.Clock();

    // Resize handler
    window.addEventListener('resize', () => {
      if (this.isDestroyed) return;
      const w = this.container.clientWidth;
      const h = this.container.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    });

    // Muzzle flash (small sphere)
    const muzzleGeo = new THREE.SphereGeometry(0.08, 6, 6);
    const muzzleMat = new THREE.MeshBasicMaterial({ color: 0xffdd44 });
    this.muzzleFlash = new THREE.Mesh(muzzleGeo, muzzleMat);
    this.muzzleFlash.visible = false;
    this.camera.add(this.muzzleFlash);
    this.scene.add(this.camera);
  }

  // ============================================================
  // WORLD BUILDING
  // ============================================================
  buildWorld() {
    // Ground
    const groundGeo = new THREE.PlaneGeometry(C.MAP_SIZE, C.MAP_SIZE, 30, 30);
    const groundMat = new THREE.MeshLambertMaterial({
      color: 0x3d5a3e,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Concrete base texture
    const concreteGeo = new THREE.PlaneGeometry(50, 50);
    const concreteMat = new THREE.MeshLambertMaterial({ color: 0x888878 });
    const concrete = new THREE.Mesh(concreteGeo, concreteMat);
    concrete.rotation.x = -Math.PI / 2;
    concrete.position.y = 0.01;
    concrete.receiveShadow = true;
    this.scene.add(concrete);

    // Border fence/wall
    this.buildBorderWalls();

    // Main base building (large shelter)
    this.buildBuilding(-15, 0, -35, 20, 8, 12, 0x888878, 'main_building');
    // Side building
    this.buildBuilding(25, 0, -30, 14, 6, 10, 0x998877, 'side_building');
    // Small bunker
    this.buildBuilding(-30, 0, 10, 10, 5, 8, 0x778877, 'bunker');
    // Guard tower base
    this.buildBuilding(30, 0, 20, 6, 12, 6, 0x888888, 'tower');

    // Concrete barriers / cover blocks
    this.addCoverBlocks();

    // Crates
    this.addCrates();

    // Vending machine
    this.buildVendingMachine(-12, 0, -28);

    // Trap consoles
    this.buildTrapConsole(-45, 0, 0, 0, 'electric');   // near gate
    this.buildTrapConsole(0, 0, 0, 1, 'flamethrower');  // center

    // Mystery box
    this.buildMysteryBox(20, 0, -20);

    // Gate
    this.buildGate();

    // Decorations
    this.addDecorations();

    // Skybox fog strips
    this.addSkyDetails();
  }

  buildBorderWalls() {
    const wallH = 6;
    const wallT = 1.5;
    const half = C.MAP_SIZE / 2;

    // North wall
    this.addStaticBox(0, wallH / 2, -half, C.MAP_SIZE, wallH, wallT, 0x666655, 'wall_n');
    // South wall (with gap for gate)
    this.addStaticBox(-30, wallH / 2, half, 60, wallH, wallT, 0x666655, 'wall_s1');
    this.addStaticBox(40, wallH / 2, half, 40, wallH, wallT, 0x666655, 'wall_s2');
    // East wall
    this.addStaticBox(half, wallH / 2, 0, wallT, wallH, C.MAP_SIZE, 0x666655, 'wall_e');
    // West wall
    this.addStaticBox(-half, wallH / 2, 0, wallT, wallH, C.MAP_SIZE, 0x666655, 'wall_w');
  }

  buildBuilding(x: number, y: number, z: number, w: number, h: number, d: number, color: number, label: string) {
    // Walls
    const mat = new THREE.MeshLambertMaterial({ color });

    // Floor
    const floorGeo = new THREE.BoxGeometry(w, 0.2, d);
    const floor = new THREE.Mesh(floorGeo, mat);
    floor.position.set(x, y + 0.1, z);
    floor.receiveShadow = true;
    this.scene.add(floor);

    // Four walls with window openings
    // Front wall (with door gap)
    const wallFrontL = new THREE.Mesh(new THREE.BoxGeometry(w / 2 - 1.5, h, 0.4), mat);
    wallFrontL.position.set(x - w / 4 - 0.5, y + h / 2, z + d / 2);
    wallFrontL.castShadow = true;
    wallFrontL.receiveShadow = true;
    this.scene.add(wallFrontL);

    const wallFrontR = new THREE.Mesh(new THREE.BoxGeometry(w / 2 - 1.5, h, 0.4), mat);
    wallFrontR.position.set(x + w / 4 + 0.5, y + h / 2, z + d / 2);
    wallFrontR.castShadow = true;
    wallFrontR.receiveShadow = true;
    this.scene.add(wallFrontR);

    // Door top
    const doorTop = new THREE.Mesh(new THREE.BoxGeometry(3, h - 2.5, 0.4), mat);
    doorTop.position.set(x, y + 2.5 + (h - 2.5) / 2, z + d / 2);
    doorTop.castShadow = true;
    this.scene.add(doorTop);

    // Back wall
    const wallBack = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.4), mat);
    wallBack.position.set(x, y + h / 2, z - d / 2);
    wallBack.castShadow = true;
    wallBack.receiveShadow = true;
    this.scene.add(wallBack);

    // Left wall
    const wallLeft = new THREE.Mesh(new THREE.BoxGeometry(0.4, h, d), mat);
    wallLeft.position.set(x - w / 2, y + h / 2, z);
    wallLeft.castShadow = true;
    wallLeft.receiveShadow = true;
    this.scene.add(wallLeft);

    // Right wall
    const wallRight = new THREE.Mesh(new THREE.BoxGeometry(0.4, h, d), mat);
    wallRight.position.set(x + w / 2, y + h / 2, z);
    wallRight.castShadow = true;
    wallRight.receiveShadow = true;
    this.scene.add(wallRight);

    // Roof
    const roofGeo = new THREE.BoxGeometry(w + 0.5, 0.4, d + 0.5);
    const roof = new THREE.Mesh(roofGeo, new THREE.MeshLambertMaterial({ color: 0x555544 }));
    roof.position.set(x, y + h + 0.2, z);
    roof.castShadow = true;
    this.scene.add(roof);

    // Collision boxes
    this.colBoxes.push({
      aabb: { min: vec3(x - w / 2, y, z - d / 2), max: vec3(x + w / 2, y + h + 0.5, z + d / 2) },
      isSolid: true,
      label
    });
  }

  addStaticBox(x: number, y: number, z: number, w: number, h: number, d: number, color: number, label: string) {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshLambertMaterial({ color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    this.colBoxes.push({
      aabb: { min: vec3(x - w / 2, y - h / 2, z - d / 2), max: vec3(x + w / 2, y + h / 2, z + d / 2) },
      isSolid: true,
      label
    });

    return mesh;
  }

  addCoverBlocks() {
    const blocks = [
      { x: -8, z: -5, w: 3, h: 1.2, d: 1 },
      { x: 8, z: -5, w: 3, h: 1.2, d: 1 },
      { x: 0, z: -8, w: 1, h: 1.2, d: 3 },
      { x: -15, z: 10, w: 4, h: 1.5, d: 1 },
      { x: 15, z: 10, w: 4, h: 1.5, d: 1 },
      { x: -20, z: -10, w: 1, h: 1.5, d: 4 },
      { x: 20, z: -10, w: 1, h: 1.5, d: 4 },
      { x: 5, z: 15, w: 6, h: 1, d: 1.2 },
      { x: -5, z: 20, w: 1, h: 1, d: 6 },
      { x: 35, z: -5, w: 2, h: 1.5, d: 5 },
    ];

    blocks.forEach((b, i) => {
      this.addStaticBox(b.x, b.h / 2, b.z, b.w, b.h, b.d, 0x7a7a6a, `cover_${i}`);
    });
  }

  addCrates() {
    const crates = [
      { x: -5, z: -20, size: 1.2 },
      { x: -3, z: -20, size: 1.0 },
      { x: -5, z: -22, size: 1.0 },
      { x: 18, z: -12, size: 1.2 },
      { x: 20, z: -12, size: 1.2 },
      { x: 18, z: -14, size: 1.0 },
      { x: -25, z: -5, size: 1.3 },
      { x: -27, z: -5, size: 1.0 },
      { x: 35, z: 15, size: 1.2 },
      { x: 33, z: 15, size: 1.0 },
    ];

    const crateMat = new THREE.MeshLambertMaterial({ color: 0x8B6914 });
    crates.forEach((c, i) => {
      const geo = new THREE.BoxGeometry(c.size, c.size, c.size);
      const mesh = new THREE.Mesh(geo, crateMat);
      mesh.position.set(c.x, c.size / 2, c.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);

      this.colBoxes.push({
        aabb: { min: vec3(c.x - c.size / 2, 0, c.z - c.size / 2), max: vec3(c.x + c.size / 2, c.size, c.z + c.size / 2) },
        isSolid: true,
        label: `crate_${i}`
      });
    });
  }

  buildVendingMachine(x: number, y: number, z: number) {
    const group = new THREE.Group();

    // Body
    const bodyGeo = new THREE.BoxGeometry(1.2, 2.2, 0.7);
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x2255aa });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 1.1;
    group.add(body);

    // Screen
    const screenGeo = new THREE.PlaneGeometry(0.8, 0.6);
    const screenMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
    this.vendingScreen = new THREE.Mesh(screenGeo, screenMat);
    this.vendingScreen.position.set(0, 1.6, 0.36);
    group.add(this.vendingScreen);

    // Neon light strip
    const lightGeo = new THREE.BoxGeometry(1.25, 0.05, 0.72);
    const lightMat = new THREE.MeshBasicMaterial({ color: 0x00aaff });
    const light = new THREE.Mesh(lightGeo, lightMat);
    light.position.y = 2.25;
    group.add(light);

    // Coin slot
    const slotGeo = new THREE.BoxGeometry(0.4, 0.05, 0.05);
    const slotMat = new THREE.MeshBasicMaterial({ color: 0x888800 });
    const slot = new THREE.Mesh(slotGeo, slotMat);
    slot.position.set(0, 0.9, 0.36);
    group.add(slot);

    // Point light
    const ptLight = new THREE.PointLight(0x00aaff, 1, 5);
    ptLight.position.set(0, 1.5, 0.5);
    group.add(ptLight);

    group.position.set(x, y, z);
    group.castShadow = true;
    this.scene.add(group);
    this.vendingMachineMesh = group;

    // Sign
    const signGeo = new THREE.PlaneGeometry(1.2, 0.4);
    const signMat = new THREE.MeshBasicMaterial({ color: 0xffdd00 });
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.set(x, 2.5, z + 0.36);
    this.scene.add(sign);

    this.colBoxes.push({
      aabb: { min: vec3(x - 0.6, 0, z - 0.35), max: vec3(x + 0.6, 2.2, z + 0.35) },
      isSolid: true,
      label: 'vending'
    });
  }

  buildTrapConsole(x: number, y: number, z: number, idx: number, type: 'electric' | 'flamethrower') {
    const group = new THREE.Group();

    const bodyGeo = new THREE.BoxGeometry(0.8, 1.2, 0.5);
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x334433 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.6;
    group.add(body);

    const btnGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.08, 8);
    const btnMat = new THREE.MeshBasicMaterial({ color: type === 'electric' ? 0x00ffff : 0xff4400 });
    const btn = new THREE.Mesh(btnGeo, btnMat);
    btn.position.set(0, 1.1, 0.26);
    group.add(btn);

    const screenGeo = new THREE.PlaneGeometry(0.5, 0.3);
    const screenMat = new THREE.MeshBasicMaterial({ color: type === 'electric' ? 0x0044ff : 0xff2200 });
    const screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.set(0, 0.8, 0.26);
    group.add(screen);

    group.position.set(x, y, z);
    this.scene.add(group);

    // Trap effect mesh (hidden initially)
    const trapRadius = 8;
    if (type === 'electric') {
      const effectGeo = new THREE.CylinderGeometry(trapRadius, trapRadius, 0.1, 32);
      const effectMat = new THREE.MeshBasicMaterial({
        color: 0x00ffff, transparent: true, opacity: 0.3, wireframe: true
      });
      const effect = new THREE.Mesh(effectGeo, effectMat);
      effect.position.set(x, 0.05, z);
      effect.visible = false;
      this.scene.add(effect);
      this.trapMeshes.push(effect);
    } else {
      const effectGeo = new THREE.ConeGeometry(trapRadius * 0.3, trapRadius, 16);
      const effectMat = new THREE.MeshBasicMaterial({
        color: 0xff4400, transparent: true, opacity: 0.4
      });
      const effect = new THREE.Mesh(effectGeo, effectMat);
      effect.position.set(x, trapRadius / 2, z);
      effect.visible = false;
      this.scene.add(effect);
      this.trapMeshes.push(effect);
    }

    this.traps.push({
      id: idx,
      position: vec3(x, y, z),
      active: false,
      timer: 0,
      type
    });

    this.colBoxes.push({
      aabb: { min: vec3(x - 0.4, 0, z - 0.25), max: vec3(x + 0.4, 1.2, z + 0.25) },
      isSolid: true,
      label: `trap_console_${idx}`
    });
  }

  buildMysteryBox(x: number, y: number, z: number) {
    const group = new THREE.Group();

    const boxGeo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
    const boxMat = new THREE.MeshLambertMaterial({ color: 0x8800aa });
    const box = new THREE.Mesh(boxGeo, boxMat);
    box.position.y = 0.6;
    group.add(box);

    // Glowing outline
    const glowGeo = new THREE.BoxGeometry(1.3, 1.3, 1.3);
    const glowMat = new THREE.MeshBasicMaterial({ color: 0xaa00ff, transparent: true, opacity: 0.3, wireframe: true });
    const glow = new THREE.Mesh(glowGeo, glowMat);
    glow.position.y = 0.6;
    group.add(glow);

    // Question mark sprite
    const ptLight = new THREE.PointLight(0xaa00ff, 1.5, 4);
    ptLight.position.set(0, 1.5, 0);
    group.add(ptLight);

    group.position.set(x, y, z);
    this.scene.add(group);
    this.mysteryBoxMesh = group;

    this.colBoxes.push({
      aabb: { min: vec3(x - 0.6, 0, z - 0.6), max: vec3(x + 0.6, 1.2, z + 0.6) },
      isSolid: false,
      label: 'mystery_box'
    });
  }

  buildGate() {
    // Gate posts
    const postMat = new THREE.MeshLambertMaterial({ color: 0x555555 });

    const post1 = new THREE.Mesh(new THREE.BoxGeometry(1.5, 8, 1.5), postMat);
    post1.position.set(-10, 4, 60);
    post1.castShadow = true;
    this.scene.add(post1);

    const post2 = new THREE.Mesh(new THREE.BoxGeometry(1.5, 8, 1.5), postMat);
    post2.position.set(10, 4, 60);
    post2.castShadow = true;
    this.scene.add(post2);

    // Gate bar (horizontal)
    const bar = new THREE.Mesh(new THREE.BoxGeometry(20, 1, 0.5), new THREE.MeshLambertMaterial({ color: 0xaa3300 }));
    bar.position.set(0, 7.5, 60);
    this.scene.add(bar);

    // Warning stripes
    const stripes = new THREE.Mesh(new THREE.BoxGeometry(20, 0.4, 0.3), new THREE.MeshBasicMaterial({ color: 0xffcc00 }));
    stripes.position.set(0, 7.0, 60);
    this.scene.add(stripes);

    this.colBoxes.push({
      aabb: { min: vec3(-11, 0, 59), max: vec3(-9, 8, 61) },
      isSolid: true, label: 'gate_post_1'
    });
    this.colBoxes.push({
      aabb: { min: vec3(9, 0, 59), max: vec3(11, 8, 61) },
      isSolid: true, label: 'gate_post_2'
    });
  }

  addDecorations() {
    // Barrels
    const barrelMat = new THREE.MeshLambertMaterial({ color: 0x334455 });
    const barrelPositions = [
      { x: 10, z: 5 }, { x: 12, z: 5 }, { x: -20, z: -15 },
      { x: -22, z: -15 }, { x: 30, z: -40 },
    ];
    barrelPositions.forEach(p => {
      const barrelGeo = new THREE.CylinderGeometry(0.4, 0.4, 1.0, 12);
      const barrel = new THREE.Mesh(barrelGeo, barrelMat);
      barrel.position.set(p.x, 0.5, p.z);
      barrel.castShadow = true;
      this.scene.add(barrel);
    });

    // Light poles
    const poleMat = new THREE.MeshLambertMaterial({ color: 0x444444 });
    [{ x: 15, z: -15 }, { x: -15, z: -15 }, { x: 0, z: 30 }].forEach(p => {
      const poleGeo = new THREE.CylinderGeometry(0.1, 0.1, 7, 8);
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(p.x, 3.5, p.z);
      pole.castShadow = true;
      this.scene.add(pole);

      const lightSphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xffff88 })
      );
      lightSphere.position.set(p.x, 7.2, p.z);
      this.scene.add(lightSphere);

      const ptLight = new THREE.PointLight(0xffee88, 0.8, 12);
      ptLight.position.set(p.x, 7, p.z);
      this.scene.add(ptLight);
    });

    // Sand bags around perimeter
    const sandbagMat = new THREE.MeshLambertMaterial({ color: 0xb8a050 });
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2;
      const r = 18 + Math.random() * 3;
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;
      const geo = new THREE.BoxGeometry(1.2 + Math.random() * 0.5, 0.6, 0.6);
      const sb = new THREE.Mesh(geo, sandbagMat);
      sb.position.set(x, 0.3, z);
      sb.rotation.y = angle;
      sb.castShadow = true;
      this.scene.add(sb);
    }
  }

  addSkyDetails() {
    // Clouds (simple boxes)
    const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 });
    for (let i = 0; i < 8; i++) {
      const cloud = new THREE.Group();
      for (let j = 0; j < 4; j++) {
        const geo = new THREE.BoxGeometry(
          6 + Math.random() * 8,
          2 + Math.random() * 2,
          4 + Math.random() * 4
        );
        const m = new THREE.Mesh(geo, cloudMat);
        m.position.set(Math.random() * 5 - 2.5, Math.random() * 2, Math.random() * 5 - 2.5);
        cloud.add(m);
      }
      cloud.position.set(
        randomRange(-80, 80), randomRange(40, 70), randomRange(-80, 80)
      );
      this.scene.add(cloud);
    }
  }

  // ============================================================
  // NAVGRID BUILDING
  // ============================================================
  buildNavGrid() {
    // Initialize all cells as walkable
    for (let r = 0; r < NAV_ROWS; r++) {
      this.navGrid[r] = [];
      for (let c = 0; c < NAV_COLS; c++) {
        this.navGrid[r][c] = true;
      }
    }

    // Mark obstacle cells
    for (const col of this.colBoxes) {
      if (!col.isSolid) continue;
      const b = col.aabb;
      const margin = 1.0; // extra margin
      const g1 = worldToGrid(b.min.x - margin, b.min.z - margin);
      const g2 = worldToGrid(b.max.x + margin, b.max.z + margin);
      for (let r = g1.row; r <= g2.row; r++) {
        for (let c = g1.col; c <= g2.col; c++) {
          if (r >= 0 && r < NAV_ROWS && c >= 0 && c < NAV_COLS) {
            this.navGrid[r][c] = false;
          }
        }
      }
    }
  }

  // A* pathfinding
  findPath(startPos: Vec3, endPos: Vec3): Vec3[] {
    const start = worldToGrid(startPos.x, startPos.z);
    const end = worldToGrid(endPos.x, endPos.z);

    if (!this.navGrid[end.row]?.[end.col]) {
      // Destination is blocked, try adjacent cells
      const adjacent = [
        { col: end.col + 1, row: end.row },
        { col: end.col - 1, row: end.row },
        { col: end.col, row: end.row + 1 },
        { col: end.col, row: end.row - 1 },
      ];
      for (const adj of adjacent) {
        if (adj.col >= 0 && adj.col < NAV_COLS && adj.row >= 0 && adj.row < NAV_ROWS
          && this.navGrid[adj.row][adj.col]) {
          return this.findPath(startPos, { x: gridToWorld(adj.col, adj.row).x, y: 0, z: gridToWorld(adj.col, adj.row).z });
        }
      }
      return [];
    }

    // Simple BFS (A* simplified)
    const open: Array<{ col: number; row: number; g: number; h: number; parent: any }> = [];
    const closed = new Set<string>();
    const key = (c: number, r: number) => `${c},${r}`;

    open.push({ col: start.col, row: start.row, g: 0, h: 0, parent: null });

    const came = new Map<string, { col: number; row: number }>();
    const gScore = new Map<string, number>();
    gScore.set(key(start.col, start.row), 0);

    const h = (c: number, r: number) => Math.abs(c - end.col) + Math.abs(r - end.row);

    const maxIter = 500;
    let iter = 0;

    while (open.length > 0 && iter++ < maxIter) {
      // Get lowest f
      open.sort((a, b) => (a.g + a.h) - (b.g + b.h));
      const current = open.shift()!;
      const ck = key(current.col, current.row);

      if (current.col === end.col && current.row === end.row) {
        // Reconstruct path
        const path: Vec3[] = [];
        let cur: { col: number; row: number } | null = { col: current.col, row: current.row };
        while (cur) {
          const wpos = gridToWorld(cur.col, cur.row);
          path.unshift(vec3(wpos.x, 0, wpos.z));
          cur = came.get(key(cur.col, cur.row)) || null;
        }
        return path;
      }

      closed.add(ck);

      const dirs = [
        { dc: 1, dr: 0 }, { dc: -1, dr: 0 }, { dc: 0, dr: 1 }, { dc: 0, dr: -1 },
        { dc: 1, dr: 1 }, { dc: -1, dr: 1 }, { dc: 1, dr: -1 }, { dc: -1, dr: -1 },
      ];

      for (const { dc, dr } of dirs) {
        const nc = current.col + dc;
        const nr = current.row + dr;
        if (nc < 0 || nc >= NAV_COLS || nr < 0 || nr >= NAV_ROWS) continue;
        if (!this.navGrid[nr][nc]) continue;
        const nk = key(nc, nr);
        if (closed.has(nk)) continue;

        const diagonal = dc !== 0 && dr !== 0;
        if (diagonal && (!this.navGrid[current.row + dr]?.[current.col] || !this.navGrid[current.row]?.[current.col + dc])) continue;

        const tentG = (gScore.get(ck) || 0) + (diagonal ? 1.414 : 1);
        if (!gScore.has(nk) || tentG < (gScore.get(nk) || Infinity)) {
          gScore.set(nk, tentG);
          came.set(nk, { col: current.col, row: current.row });
          open.push({ col: nc, row: nr, g: tentG, h: h(nc, nr), parent: ck });
        }
      }
    }

    // Fallback: direct move
    return [vec3(endPos.x, 0, endPos.z)];
  }

  // ============================================================
  // PLAYER INITIALIZATION
  // ============================================================
  initPlayer() {
    const playerId = 'local_' + Math.random().toString(36).substr(2, 9);
    const colors = [0xff4444, 0x44ff44, 0x4444ff, 0xffff44, 0xff44ff, 0x44ffff];
    this.localPlayer = {
      id: playerId,
      name: 'Player_' + playerId.substr(6),
      position: vec3(0, C.PLAYER_HEIGHT, 5),
      rotation: 0,
      hp: C.PLAYER_MAX_HP,
      maxHp: C.PLAYER_MAX_HP,
      ammoAk: C.AK47_MAG_SIZE,
      ammoAkReserve: 90,
      money: 0,
      kills: 0,
      weapon: 'ak47',
      isDown: false,
      isDead: false,
      downTimer: 0,
      isSprinting: false,
      isCrouching: false,
      streak: 0,
      boosted: false,
      boostType: '',
      boostTimer: 0,
      weaponUpgrades: {
        ak47: { damage: 1, fireRate: 1, magSize: 1 },
        pistol: { damage: 1, fireRate: 1, magSize: 1 },
      },
      barricadeCount: 0,
      grenadeCount: 0,
      color: colors[Math.floor(Math.random() * colors.length)],
    };

    this.currentMagAmmo = C.AK47_MAG_SIZE;
    this.camera.position.set(
      this.localPlayer.position.x,
      this.localPlayer.position.y,
      this.localPlayer.position.z
    );

    // Build weapon mesh (visible gun model)
    this.buildWeaponMesh();
  }

  buildWeaponMesh() {
    const group = new THREE.Group();

    // AK-47 model from primitives
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x4a3222 });
    const metalMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const woodMat = new THREE.MeshLambertMaterial({ color: 0x6B4226 });

    // Main body
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.5), bodyMat);
    body.position.set(0, 0, -0.25);
    group.add(body);

    // Barrel
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.35, 8), metalMat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.015, -0.57);
    group.add(barrel);

    // Magazine
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.15, 0.06), metalMat);
    mag.position.set(0, -0.09, -0.22);
    mag.rotation.x = -0.2;
    group.add(mag);

    // Stock
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.055, 0.2), woodMat);
    stock.position.set(0, -0.005, 0.08);
    group.add(stock);

    // Sight
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.02), metalMat);
    sight.position.set(0, 0.04, -0.45);
    group.add(sight);

    group.position.set(0.2, -0.18, -0.35);
    this.camera.add(group);
    this.weaponMesh = group;
  }

  // ============================================================
  // HUD INITIALIZATION
  // ============================================================
  initHUD() {
    const hud = document.createElement('div');
    hud.id = 'game-hud';
    hud.style.cssText = `
      position:absolute; inset:0; pointer-events:none; font-family:'Courier New',monospace; color:#fff; z-index:100;
      user-select:none;
    `;

    hud.innerHTML = `
      <!-- Crosshair -->
      <div id="crosshair" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:20px;height:20px;pointer-events:none;">
        <div style="position:absolute;top:50%;left:0;right:0;height:2px;background:#fff;transform:translateY(-50%);opacity:0.8;"></div>
        <div style="position:absolute;left:50%;top:0;bottom:0;width:2px;background:#fff;transform:translateX(-50%);opacity:0.8;"></div>
        <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:4px;height:4px;border:1px solid rgba(255,255,255,0.6);border-radius:50%;"></div>
      </div>

      <!-- Health bar -->
      <div style="position:absolute;bottom:80px;left:20px;width:200px;">
        <div style="font-size:11px;color:#aaa;margin-bottom:4px;letter-spacing:0.1em;text-transform:uppercase;">HP</div>
        <div style="background:rgba(0,0,0,0.5);border:1px solid #444;border-radius:3px;overflow:hidden;height:14px;">
          <div id="hp-bar" style="height:100%;width:100%;background:linear-gradient(to right,#44ff44,#88ff44);transition:width 0.3s;"></div>
        </div>
        <div id="hp-text" style="font-size:12px;margin-top:2px;">100 / 100</div>
      </div>

      <!-- Ammo -->
      <div style="position:absolute;bottom:80px;right:20px;text-align:right;">
        <div id="weapon-name" style="font-size:12px;color:#aaa;letter-spacing:0.1em;margin-bottom:2px;">AK-47</div>
        <div style="display:flex;align-items:baseline;gap:8px;justify-content:flex-end;">
          <span id="ammo-mag" style="font-size:32px;font-weight:bold;color:#ffdd44;">30</span>
          <span style="color:#888;font-size:18px;">/</span>
          <span id="ammo-reserve" style="font-size:20px;color:#aaa;">90</span>
        </div>
        <div id="reload-bar-container" style="display:none;background:rgba(0,0,0,0.5);border:1px solid #ffdd44;border-radius:3px;overflow:hidden;height:4px;margin-top:4px;">
          <div id="reload-bar" style="height:100%;width:0%;background:#ffdd44;transition:width 0.1s;"></div>
        </div>
        <div id="reload-text" style="display:none;font-size:11px;color:#ffdd44;margin-top:2px;">RELOADING...</div>
      </div>

      <!-- Money -->
      <div style="position:absolute;top:20px;right:20px;text-align:right;">
        <div style="font-size:11px;color:#aaa;letter-spacing:0.1em;">FUNDS</div>
        <div id="money-display" style="font-size:22px;color:#ffdd44;font-weight:bold;">$0</div>
        <div id="grenades-display" style="font-size:13px;color:#ff8844;margin-top:4px;">🧨 x0</div>
      </div>

      <!-- Wave & wave timer -->
      <div style="position:absolute;top:20px;left:50%;transform:translateX(-50%);text-align:center;">
        <div id="wave-display" style="font-size:16px;font-weight:bold;color:#ff4444;text-shadow:0 0 10px rgba(255,68,68,0.8);letter-spacing:0.2em;">WAVE 1</div>
        <div id="wave-timer" style="font-size:12px;color:#aaa;margin-top:2px;"></div>
        <div id="zombie-count" style="font-size:12px;color:#ff8844;margin-top:2px;"></div>
      </div>

      <!-- Combo -->
      <div id="combo-display" style="position:absolute;top:80px;left:50%;transform:translateX(-50%);text-align:center;opacity:0;transition:opacity 0.5s;">
        <div id="combo-text" style="font-size:28px;font-weight:bold;color:#ffdd44;text-shadow:0 0 20px rgba(255,221,68,0.9);"></div>
        <div id="combo-sub" style="font-size:13px;color:#ffaa00;"></div>
      </div>

      <!-- Boost indicator -->
      <div id="boost-display" style="position:absolute;top:20px;left:20px;opacity:0;transition:opacity 0.3s;">
        <div id="boost-text" style="font-size:13px;color:#88ffff;text-shadow:0 0 10px #88ffff;"></div>
        <div style="background:rgba(0,0,0,0.5);border:1px solid #88ffff;border-radius:3px;overflow:hidden;height:4px;margin-top:4px;width:120px;">
          <div id="boost-bar" style="height:100%;width:100%;background:#88ffff;transition:width 0.1s;"></div>
        </div>
      </div>

      <!-- Down state overlay -->
      <div id="down-overlay" style="display:none;position:absolute;inset:0;background:rgba(200,0,0,0.3);pointer-events:none;">
        <div style="position:absolute;top:40%;left:50%;transform:translate(-50%,-50%);text-align:center;">
          <div style="font-size:36px;font-weight:bold;color:#ff4444;text-shadow:0 0 20px #ff0000;animation:pulse 0.5s ease infinite alternate;">ВЫ ПРИ СМЕРТИ</div>
          <div id="down-timer-text" style="font-size:20px;color:#ff8888;margin-top:8px;"></div>
          <div style="font-size:14px;color:#ffaaaa;margin-top:4px;">Союзник может вас поднять (зажми E)</div>
        </div>
      </div>

      <!-- Interact prompt -->
      <div id="interact-prompt" style="position:absolute;bottom:40%;left:50%;transform:translateX(-50%);display:none;text-align:center;">
        <div style="background:rgba(0,0,0,0.7);border:1px solid #44ff88;border-radius:4px;padding:8px 16px;">
          <span style="color:#44ff88;font-weight:bold;">[E]</span>
          <span id="interact-text" style="color:#fff;margin-left:8px;font-size:14px;"></span>
        </div>
      </div>

      <!-- Wave announce -->
      <div id="wave-announce" style="position:absolute;top:35%;left:50%;transform:translate(-50%,-50%);text-align:center;opacity:0;transition:opacity 0.5s;pointer-events:none;">
        <div id="wave-announce-text" style="font-size:clamp(28px,5vw,48px);font-weight:bold;color:#ff4444;text-shadow:0 0 30px rgba(255,68,68,0.9);letter-spacing:0.2em;"></div>
        <div id="wave-announce-sub" style="font-size:16px;color:#ff8888;margin-top:8px;"></div>
      </div>

      <!-- Minimap -->
      <div style="position:absolute;bottom:20px;right:20px;">
        <div style="font-size:10px;color:#666;letter-spacing:0.1em;text-align:center;margin-bottom:2px;">КАРТА</div>
        <div style="border:1px solid #444;border-radius:3px;overflow:hidden;">
          <canvas id="minimap" width="120" height="120" style="display:block;"></canvas>
        </div>
      </div>

      <!-- Leaderboard -->
      <div id="leaderboard" style="display:none;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
        background:rgba(0,0,0,0.85);border:1px solid #444;border-radius:8px;padding:24px;min-width:300px;">
        <div style="font-size:18px;font-weight:bold;color:#ffdd44;text-align:center;margin-bottom:16px;letter-spacing:0.2em;">ЛИДЕРБОРД</div>
        <div id="leaderboard-content" style="font-size:13px;"></div>
        <div style="font-size:11px;color:#666;text-align:center;margin-top:12px;">[TAB] закрыть</div>
      </div>

      <!-- Victory screen -->
      <div id="victory-screen" style="display:none;position:absolute;inset:0;background:rgba(0,0,0,0.7);
        display:none;align-items:center;justify-content:center;flex-direction:column;text-align:center;">
        <div style="font-size:clamp(40px,8vw,72px);font-weight:bold;color:#ffdd44;text-shadow:0 0 40px rgba(255,221,68,1);letter-spacing:0.2em;">ПОБЕДА!</div>
        <div style="font-size:20px;color:#88ff44;margin-top:16px;">Ширибазаров повержен!</div>
        <div style="font-size:16px;color:#aaa;margin-top:8px;">Отличная работа, выжившие!</div>
        <button id="victory-return" onclick="window.__GAME_RETURN__()" style="
          margin-top:30px;padding:12px 32px;background:#ffdd44;border:none;border-radius:4px;
          font-size:18px;font-family:inherit;font-weight:bold;cursor:pointer;color:#000;pointer-events:all;
        ">В главное меню</button>
      </div>

      <!-- Defeat screen -->
      <div id="defeat-screen" style="display:none;position:absolute;inset:0;background:rgba(100,0,0,0.7);
        align-items:center;justify-content:center;flex-direction:column;text-align:center;">
        <div style="font-size:clamp(40px,8vw,72px);font-weight:bold;color:#ff4444;text-shadow:0 0 40px rgba(255,68,68,1);letter-spacing:0.2em;">ПОРАЖЕНИЕ</div>
        <div style="font-size:20px;color:#ff8888;margin-top:16px;">База пала...</div>
        <button onclick="window.__GAME_RETURN__()" style="
          margin-top:30px;padding:12px 32px;background:#ff4444;border:none;border-radius:4px;
          font-size:18px;font-family:inherit;font-weight:bold;cursor:pointer;color:#fff;pointer-events:all;
        ">В главное меню</button>
      </div>

      <!-- Vending machine menu -->
      <div id="vending-menu" style="display:none;position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);
        background:rgba(0,0,30,0.95);border:2px solid #0088ff;border-radius:8px;padding:24px;min-width:320px;pointer-events:all;">
        <div style="font-size:16px;font-weight:bold;color:#0088ff;text-align:center;margin-bottom:16px;letter-spacing:0.2em;">🔧 АВТОМАТ СНАРЯЖЕНИЯ</div>
        <div id="vending-balance" style="font-size:13px;color:#ffdd44;text-align:center;margin-bottom:12px;"></div>
        <div style="display:flex;flex-direction:column;gap:8px;">
          <button class="vend-btn" onclick="window.__game__.vendingBuy('ammo')" style="
            padding:10px;background:rgba(0,100,255,0.2);border:1px solid #0088ff;border-radius:4px;
            color:#88aaff;font-family:inherit;cursor:pointer;font-size:13px;text-align:left;">
            💊 Патроны АК (0-10) — <span style="color:#ffdd44;">$50</span>
          </button>
          <button class="vend-btn" onclick="window.__game__.vendingBuy('health')" style="
            padding:10px;background:rgba(0,200,100,0.2);border:1px solid #00aa66;border-radius:4px;
            color:#88ffaa;font-family:inherit;cursor:pointer;font-size:13px;text-align:left;">
            ❤️ Аптечка (+30 HP) — <span style="color:#ffdd44;">$100</span>
          </button>
          <button class="vend-btn" onclick="window.__game__.vendingBuy('boost')" style="
            padding:10px;background:rgba(255,100,0,0.2);border:1px solid #ff6600;border-radius:4px;
            color:#ffaa44;font-family:inherit;cursor:pointer;font-size:13px;text-align:left;">
            ⚡ Усиление (15 сек) — <span style="color:#ffdd44;">$150</span>
          </button>
          <button class="vend-btn" onclick="window.__game__.vendingBuy('grenade')" style="
            padding:10px;background:rgba(200,50,0,0.2);border:1px solid #ff3300;border-radius:4px;
            color:#ff8844;font-family:inherit;cursor:pointer;font-size:13px;text-align:left;">
            🧨 Граната — <span style="color:#ffdd44;">$200</span>
          </button>
        </div>
        <button onclick="window.__game__.closeVending()" style="
          margin-top:12px;width:100%;padding:8px;background:transparent;border:1px solid #444;border-radius:4px;
          color:#666;font-family:inherit;cursor:pointer;font-size:12px;">
          [E] Закрыть
        </button>
      </div>

      <!-- Kill feed -->
      <div id="kill-feed" style="position:absolute;top:70px;right:20px;display:flex;flex-direction:column;gap:4px;max-width:280px;"></div>

      <!-- Damage indicator -->
      <div id="damage-overlay" style="position:absolute;inset:0;pointer-events:none;opacity:0;background:radial-gradient(ellipse at center, transparent 60%, rgba(255,0,0,0.4) 100%);transition:opacity 0.1s;"></div>

      <!-- Revive progress -->
      <div id="revive-progress" style="display:none;position:absolute;bottom:45%;left:50%;transform:translateX(-50%);text-align:center;">
        <div style="font-size:13px;color:#44ff88;margin-bottom:4px;">Поднимаем союзника...</div>
        <div style="background:rgba(0,0,0,0.5);border:1px solid #44ff88;border-radius:3px;overflow:hidden;height:6px;width:150px;">
          <div id="revive-bar" style="height:100%;width:0%;background:#44ff88;transition:width 0.1s;"></div>
        </div>
      </div>
    `;

    hud.style.pointerEvents = 'none';
    this.container.appendChild(hud);
    this.hud = hud;

    // Setup minimap
    const minimapCanvas = document.getElementById('minimap') as HTMLCanvasElement;
    this.minimap = minimapCanvas;
    this.minimapCtx = minimapCanvas.getContext('2d')!;

    // Make vending menu interactive
    const vendingMenu = document.getElementById('vending-menu')!;
    vendingMenu.addEventListener('pointerdown', e => e.stopPropagation());

    // Add CSS animations
    const style = document.createElement('style');
    style.textContent = `
      @keyframes pulse { from { opacity: 1; } to { opacity: 0.5; } }
      @keyframes flashIn { from { opacity: 0; transform: scale(0.8); } to { opacity: 1; transform: scale(1); } }
      @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      @keyframes killFeedOut { from { opacity: 1; } to { opacity: 0; transform: translateX(20px); } }
      .vend-btn:hover { filter: brightness(1.3); }
    `;
    document.head.appendChild(style);

    // Return button
    const returnBtn = document.createElement('button');
    returnBtn.textContent = '← Меню';
    returnBtn.style.cssText = `
      position:absolute;top:10px;left:10px;padding:6px 12px;
      background:rgba(0,0,0,0.7);border:1px solid #444;border-radius:4px;
      color:#888;font-family:inherit;font-size:12px;cursor:pointer;z-index:200;pointer-events:all;
    `;
    returnBtn.addEventListener('click', () => {
      if (confirm('Вернуться в главное меню?')) {
        this.destroy();
        (window as any).__GAME_RETURN__();
      }
    });
    this.container.appendChild(returnBtn);
  }

  // ============================================================
  // INPUT HANDLING
  // ============================================================
  initInput() {
    const canvas = this.renderer.domElement;

    canvas.addEventListener('click', () => {
      if (!this.vendingOpen) {
        canvas.requestPointerLock();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement === canvas;
    });

    document.addEventListener('mousemove', (e) => {
      if (this.isPointerLocked) {
        this.mouseDX += e.movementX;
        this.mouseDY += e.movementY;
      }
    });

    document.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.leftMouseDown = true;
      if (e.button === 2) this.rightMouseDown = true;
    });

    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.leftMouseDown = false;
      if (e.button === 2) this.rightMouseDown = false;
    });

    document.addEventListener('contextmenu', e => e.preventDefault());

    document.addEventListener('keydown', (e) => {
      this.keys.add(e.code);

      if (e.code === 'KeyE') this.handleInteract();
      if (e.code === 'Digit1') this.switchWeapon('ak47');
      if (e.code === 'Digit2') this.switchWeapon('pistol');
      if (e.code === 'Tab') {
        e.preventDefault();
        this.toggleLeaderboard();
      }
      if (e.code === 'KeyR' && !this.reloading) this.startReload();
      if (e.code === 'KeyG') this.throwGrenade();
      if (e.code === 'KeyF') this.buildBarricade();
      if (e.code === 'Escape') {
        if (this.vendingOpen) this.closeVending();
      }
    });

    document.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
  }

  // ============================================================
  // SOLO MODE (acts as local server)
  // ============================================================
  initSoloMode() {
    this.isServer = true;
    this.soloGameState = {
      zombies: new Map(),
      acidProjectiles: new Map(),
      barricades: new Map(),
      nextWaveTimer: 5,
      phase: 'waiting',
      wave: 0,
      zombiesKilledThisWave: 0,
      totalZombiesThisWave: 0,
    };

    // Add player to solo state
    this.phase = 'waiting';
    this.wave = 0;
    this.waveCountdown = 5;
    this.showWaveAnnounce('ЖДЁМ НАЧАЛА', 'Нажми для старта или жди...', 3000);
    this.addMoney(0); // init display

    // Start first wave after delay
    setTimeout(() => this.startWave(1), 3000);
  }

  startWave(waveNum: number) {
    if (this.isDestroyed) return;
    this.wave = waveNum;
    this.phase = 'combat';

    const waveConfig = C.WAVES[waveNum - 1];
    const { count, hpMult, speedMult, damageMult, hasBoss } = waveConfig as any;

    this.showWaveAnnounce(
      `ВОЛНА ${waveNum}`,
      hasBoss ? '⚠ ВНИМАНИЕ: ШИРИБАЗАРОВ ИДЁТ ⚠' : `Зомби: ${count}`,
      3000
    );

    // Spawn zombies
    let spawned = 0;
    const spawnZombie = () => {
      if (this.isDestroyed) return;
      if (spawned >= count) return;

      let type: 'normal' | 'exploder' | 'acid' = 'normal';
      const r = Math.random();
      if (waveNum >= 3) {
        if (r < 0.15) type = 'exploder';
        else if (r < 0.30) type = 'acid';
      } else if (waveNum >= 2) {
        if (r < 0.10) type = 'exploder';
      }

      this.spawnZombie(type, hpMult, speedMult as number, damageMult as number);
      spawned++;

      if (spawned < count) {
        setTimeout(spawnZombie, 800 + Math.random() * 500);
      }
    };

    setTimeout(spawnZombie, 1000);

    // Spawn boss on wave 10
    if (hasBoss) {
      setTimeout(() => {
        this.spawnZombie('boss', hpMult * 1.5, speedMult as number, (damageMult as number) * 1.5);
      }, count * 900 + 3000);
    }
  }

  spawnZombie(type: 'normal' | 'exploder' | 'acid' | 'boss', hpMult = 1, speedMult = 1, damageMult = 1) {
    const id = 'z_' + (++this.zombieIdCounter);
    const baseStats = C.ZOMBIE_TYPES[type];

    // Spawn at map edge
    const spawnAngle = Math.random() * Math.PI * 2;
    const spawnR = 55 + Math.random() * 5;
    const spawnX = clamp(Math.cos(spawnAngle) * spawnR, -C.MAP_SIZE / 2 + 5, C.MAP_SIZE / 2 - 5);
    const spawnZ = clamp(Math.sin(spawnAngle) * spawnR, -C.MAP_SIZE / 2 + 5, C.MAP_SIZE / 2 - 5);

    const hp = Math.floor(baseStats.hp * hpMult);
    const zombie: ZombieState = {
      id,
      type,
      position: vec3(spawnX, 0, spawnZ),
      hp,
      maxHp: hp,
      targetId: this.localPlayer.id,
      isAlive: true,
      rotation: 0,
      animState: 'walk',
      damageMap: {},
    };

    // Store wave multipliers as extra data
    (zombie as any).speedMult = speedMult;
    (zombie as any).damageMult = damageMult;

    this.zombies.set(id, zombie);
    this.createZombieMesh(zombie);
    return zombie;
  }

  createZombieMesh(zombie: ZombieState) {
    const stats = C.ZOMBIE_TYPES[zombie.type];
    const scale = stats.scale;
    const color = stats.color;

    const group = new THREE.Group();

    // Body
    const bodyGeo = new THREE.BoxGeometry(0.5 * scale, 0.8 * scale, 0.3 * scale);
    const bodyMat = new THREE.MeshLambertMaterial({ color });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.9 * scale;
    body.castShadow = true;
    group.add(body);

    // Head
    const headGeo = new THREE.BoxGeometry(0.35 * scale, 0.35 * scale, 0.35 * scale);
    const headColor = zombie.type === 'boss' ? 0x330033 : 0x88aa88;
    const headMat = new THREE.MeshLambertMaterial({ color: headColor });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.5 * scale;
    head.castShadow = true;
    group.add(head);

    // Eyes (glowing)
    const eyeMat = new THREE.MeshBasicMaterial({ color: zombie.type === 'boss' ? 0xff00ff : 0xff2222 });
    const eyeGeo = new THREE.SphereGeometry(0.04 * scale, 6, 6);
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.08 * scale, 1.55 * scale, 0.18 * scale);
    group.add(eyeL);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.08 * scale, 1.55 * scale, 0.18 * scale);
    group.add(eyeR);

    // Arms
    const armGeo = new THREE.BoxGeometry(0.15 * scale, 0.6 * scale, 0.15 * scale);
    const armL = new THREE.Mesh(armGeo, bodyMat);
    armL.position.set(-0.35 * scale, 0.9 * scale, 0);
    armL.rotation.z = 0.4;
    group.add(armL);
    const armR = new THREE.Mesh(armGeo, bodyMat);
    armR.position.set(0.35 * scale, 0.9 * scale, 0);
    armR.rotation.z = -0.4;
    group.add(armR);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.18 * scale, 0.6 * scale, 0.18 * scale);
    const legL = new THREE.Mesh(legGeo, new THREE.MeshLambertMaterial({ color: 0x334433 }));
    legL.position.set(-0.15 * scale, 0.3 * scale, 0);
    group.add(legL);
    const legR = new THREE.Mesh(legGeo, new THREE.MeshLambertMaterial({ color: 0x334433 }));
    legR.position.set(0.15 * scale, 0.3 * scale, 0);
    group.add(legR);

    // Special effects for types
    if (zombie.type === 'exploder') {
      const glowGeo = new THREE.SphereGeometry(0.35 * scale, 8, 8);
      const glowMat = new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.3, wireframe: true });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.position.y = 0.9 * scale;
      group.add(glow);
    }
    if (zombie.type === 'acid') {
      const droolGeo = new THREE.SphereGeometry(0.08 * scale, 6, 6);
      const droolMat = new THREE.MeshBasicMaterial({ color: 0x44ff00, transparent: true, opacity: 0.8 });
      const drool = new THREE.Mesh(droolGeo, droolMat);
      drool.position.set(0, 1.3 * scale, 0.18 * scale);
      group.add(drool);
    }
    if (zombie.type === 'boss') {
      // Crown/horns
      const hornMat = new THREE.MeshBasicMaterial({ color: 0xff00ff });
      const hornGeo = new THREE.ConeGeometry(0.08 * scale, 0.25 * scale, 6);
      for (let i = -1; i <= 1; i++) {
        const horn = new THREE.Mesh(hornGeo, hornMat);
        horn.position.set(i * 0.12 * scale, 1.75 * scale, 0);
        group.add(horn);
      }
      // Point light
      const bossLight = new THREE.PointLight(0xff00ff, 1.5, 6);
      bossLight.position.y = 1;
      group.add(bossLight);
    }

    // HP bar
    const hpBarBg = new THREE.Mesh(
      new THREE.PlaneGeometry(0.6 * scale, 0.07 * scale),
      new THREE.MeshBasicMaterial({ color: 0x330000 })
    );
    hpBarBg.position.y = (zombie.type === 'boss' ? 4.5 : 2.1) * scale;
    hpBarBg.rotation.x = -0.5;
    group.add(hpBarBg);

    const hpBarFill = new THREE.Mesh(
      new THREE.PlaneGeometry(0.6 * scale, 0.065 * scale),
      new THREE.MeshBasicMaterial({ color: 0x44ff44 })
    );
    hpBarFill.position.y = (zombie.type === 'boss' ? 4.5 : 2.1) * scale;
    hpBarFill.rotation.x = -0.5;
    hpBarFill.position.z = 0.001;
    group.add(hpBarFill);
    (group as any).hpBarFill = hpBarFill;
    (group as any).hpBarScale = 0.6 * scale;

    group.position.set(zombie.position.x, 0, zombie.position.z);
    this.scene.add(group);
    this.zombieMeshes.set(zombie.id, group);
    this.meshes.set(zombie.id, group);

    return group;
  }

  // ============================================================
  // MULTIPLAYER MODE
  // ============================================================
  initMultiplayer() {
    const url = this.config.serverUrl || '';
    if (!url) {
      console.warn('No server URL provided, falling back to solo');
      this.isSolo = true;
      this.initSoloMode();
      return;
    }

    try {
      const io = (window as any).io;
      if (!io) {
        console.warn('Socket.IO not loaded, falling back to solo');
        this.isSolo = true;
        this.initSoloMode();
        return;
      }

      this.socket = io(url, {
        path: '/ws/',
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 3,
      });

      this.socket.on('connect', () => {
        console.log('Connected to server:', this.socket.id);
        this.socket.emit('join', {
          id: this.localPlayer.id,
          name: this.localPlayer.name,
          color: this.localPlayer.color,
        });
        this.showKillFeedMessage('Подключено к серверу!', '#44ff88');
      });

      this.socket.on('disconnect', () => {
        this.showKillFeedMessage('Соединение потеряно', '#ff4444');
      });

      this.socket.on('gameState', (state: any) => {
        this.syncGameState(state);
      });

      this.socket.on('playerJoined', (player: any) => {
        if (player.id !== this.localPlayer.id) {
          this.remotePlayers.set(player.id, player);
          this.createRemotePlayerMesh(player);
          this.showKillFeedMessage(`${player.name} подключился`, '#44ff88');
        }
      });

      this.socket.on('playerLeft', (id: string) => {
        const player = this.remotePlayers.get(id);
        if (player) {
          this.showKillFeedMessage(`${player.name} отключился`, '#888');
          this.removeRemotePlayer(id);
        }
      });

      this.socket.on('playerUpdate', (data: any) => {
        if (data.id === this.localPlayer.id) return;
        const rp = this.remotePlayers.get(data.id);
        if (rp) {
          Object.assign(rp, data);
          this.updateRemotePlayerMesh(data.id);
        }
      });

      this.socket.on('zombieSpawned', (zombie: any) => {
        this.zombies.set(zombie.id, zombie);
        this.createZombieMesh(zombie);
      });

      this.socket.on('zombieUpdate', (data: any) => {
        const z = this.zombies.get(data.id);
        if (z) Object.assign(z, data);
      });

      this.socket.on('zombieDied', (data: any) => {
        this.killZombie(data.zombieId, data.killerId, data.reward, false);
      });

      this.socket.on('waveStart', (data: any) => {
        this.wave = data.wave;
        this.phase = 'combat';
        this.showWaveAnnounce(`ВОЛНА ${data.wave}`, data.message, 3000);
      });

      this.socket.on('waveComplete', () => {
        this.phase = 'intermission';
        this.showWaveAnnounce('ВОЛНА ЗАВЕРШЕНА', 'Следующая через 10 секунд...', 3000);
      });

      this.socket.on('victory', () => {
        this.showVictory();
      });

      this.socket.on('defeat', () => {
        this.showDefeat();
      });

      this.socket.on('hitConfirmed', (data: any) => {
        if (data.killed) {
          this.onZombieKilled(data.zombieId, data.reward);
        }
        this.spawnBloodEffect(data.position);
      });

      this.socket.on('damage', (data: any) => {
        if (data.playerId === this.localPlayer.id) {
          this.takeDamage(data.amount, false);
        }
      });

      this.socket.on('moneyUpdate', (data: any) => {
        if (data.playerId === this.localPlayer.id) {
          this.localPlayer.money = data.money;
          this.updateHUD();
        }
      });

    } catch (err) {
      console.error('Failed to connect:', err);
      this.isSolo = true;
      this.initSoloMode();
    }
  }

  syncGameState(state: any) {
    // Sync zombies
    for (const [id, z] of Object.entries<any>(state.zombies || {})) {
      if (!this.zombies.has(id)) {
        this.zombies.set(id, z);
        this.createZombieMesh(z);
      } else {
        const local = this.zombies.get(id)!;
        Object.assign(local, z);
      }
    }

    // Remove dead zombies
    for (const [id] of this.zombies) {
      if (!state.zombies[id]) {
        this.removeZombieMesh(id);
        this.zombies.delete(id);
      }
    }

    // Sync players
    for (const [id, p] of Object.entries<any>(state.players || {})) {
      if (id === this.localPlayer.id) continue;
      if (!this.remotePlayers.has(id)) {
        this.remotePlayers.set(id, p);
        this.createRemotePlayerMesh(p);
      } else {
        Object.assign(this.remotePlayers.get(id)!, p);
        this.updateRemotePlayerMesh(id);
      }
    }

    this.wave = state.wave;
    this.phase = state.phase;
  }

  // ============================================================
  // REMOTE PLAYER MESHES
  // ============================================================
  createRemotePlayerMesh(player: any) {
    const group = new THREE.Group();

    const color = player.color || 0x44ff44;
    const bodyMat = new THREE.MeshLambertMaterial({ color });

    // Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.3), bodyMat);
    body.position.y = 1.2;
    body.castShadow = true;
    group.add(body);

    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), new THREE.MeshLambertMaterial({ color: 0xffccaa }));
    head.position.y = 1.75;
    head.castShadow = true;
    group.add(head);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.2, 0.6, 0.2);
    const legMat = new THREE.MeshLambertMaterial({ color: 0x333355 });
    const legL = new THREE.Mesh(legGeo, legMat);
    legL.position.set(-0.15, 0.7, 0);
    group.add(legL);
    const legR = new THREE.Mesh(legGeo, legMat);
    legR.position.set(0.15, 0.7, 0);
    group.add(legR);

    // Name tag
    const nameMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const nameGeo = new THREE.PlaneGeometry(0.6, 0.15);
    const nameTag = new THREE.Mesh(nameGeo, nameMat);
    nameTag.position.y = 2.3;
    nameTag.rotation.y = Math.PI;
    group.add(nameTag);

    group.position.set(player.position.x, 0, player.position.z);
    this.scene.add(group);
    this.remotePlayerMeshes.set(player.id, group);
  }

  updateRemotePlayerMesh(id: string) {
    const player = this.remotePlayers.get(id);
    const mesh = this.remotePlayerMeshes.get(id);
    if (!player || !mesh) return;

    mesh.position.set(player.position.x, 0, player.position.z);
    mesh.rotation.y = player.rotation;
  }

  removeRemotePlayer(id: string) {
    const mesh = this.remotePlayerMeshes.get(id);
    if (mesh) {
      this.scene.remove(mesh);
      this.remotePlayerMeshes.delete(id);
    }
    this.remotePlayers.delete(id);
  }

  // ============================================================
  // ZOMBIE MANAGEMENT
  // ============================================================
  updateZombies(dt: number) {
    const players = this.getAlivePlayers();
    if (players.length === 0) return;

    for (const [id, zombie] of this.zombies) {
      if (!zombie.isAlive) continue;

      const mesh = this.zombieMeshes.get(id);
      if (!mesh) continue;

      const stats = C.ZOMBIE_TYPES[zombie.type];

      // Find nearest player
      let nearestDist = Infinity;
      let nearestPlayer: PlayerState | null = null;
      for (const p of players) {
        const d = vecDist2D(zombie.position, p.position);
        if (d < nearestDist) {
          nearestDist = d;
          nearestPlayer = p;
        }
      }

      if (!nearestPlayer) continue;

      // Boss AI
      if (zombie.type === 'boss') {
        this.updateBossAI(zombie, nearestPlayer, dt, mesh);
        continue;
      }

      // Exploder: check proximity
      if (zombie.type === 'exploder' && nearestDist < 2.5) {
        this.exploderDetonate(zombie);
        continue;
      }

      // Acid zombie: ranged attack
      if (zombie.type === 'acid') {
        if (nearestDist < stats.attackRange) {
          // Attack timer
          if (!(zombie as any).attackTimer) (zombie as any).attackTimer = 0;
          (zombie as any).attackTimer -= dt;
          if ((zombie as any).attackTimer <= 0) {
            (zombie as any).attackTimer = stats.attackRate;
            this.acidZombieSpitAt(zombie, nearestPlayer);
          }
          // Still move towards player but slower
          if (nearestDist > 8) {
            this.moveZombieTowards(zombie, nearestPlayer.position, stats.speed * 0.5, dt, mesh);
          }
          continue;
        }
      }

      // Normal/acid move
      if (nearestDist > stats.attackRange) {
        this.moveZombieTowards(zombie, nearestPlayer.position, stats.speed, dt, mesh);
      } else {
        // Attack
        if (!(zombie as any).attackTimer) (zombie as any).attackTimer = 0;
        (zombie as any).attackTimer -= dt;
        if ((zombie as any).attackTimer <= 0) {
          (zombie as any).attackTimer = stats.attackRate;
          if (nearestPlayer.id === this.localPlayer.id) {
            this.takeDamage(Math.floor(stats.damage * ((zombie as any).damageMult || 1)), true);
          }
        }
        // Attack animation
        mesh.rotation.y = Math.atan2(
          nearestPlayer.position.x - zombie.position.x,
          nearestPlayer.position.z - zombie.position.z
        );
      }

      // Walk animation (leg bobbing)
      const legL = mesh.children.find((c: any) => c.position.x < 0 && c.position.y < 0.5);
      const legR = mesh.children.find((c: any) => c.position.x > 0 && c.position.y < 0.5);
      if (legL && legR) {
        const bobAmt = Math.sin(Date.now() * 0.008) * 0.15;
        legL.rotation.x = bobAmt;
        legR.rotation.x = -bobAmt;
      }

      // Update HP bar
      const hpBarFill = (mesh as any).hpBarFill;
      if (hpBarFill) {
        const ratio = zombie.hp / zombie.maxHp;
        hpBarFill.scale.x = Math.max(0, ratio);
        hpBarFill.position.x = (ratio - 1) * (mesh as any).hpBarScale * 0.5;
        const mat = hpBarFill.material;
        mat.color.setHex(ratio > 0.5 ? 0x44ff44 : ratio > 0.25 ? 0xffaa00 : 0xff4444);
      }
    }

    // Update acid projectiles
    this.updateAcidProjectiles(dt);

    // Update acid pools - damage players
    this.updateAcidPools(dt);

    // Check wave completion
    this.checkWaveComplete();
  }

  moveZombieTowards(zombie: ZombieState, target: Vec3, speed: number, dt: number, mesh: any) {
    const dx = target.x - zombie.position.x;
    const dz = target.z - zombie.position.z;
    const dist = Math.sqrt(dx * dx + dz * dz);

    if (dist < 0.1) return;

    // Simple separation from other zombies
    let sepX = 0, sepZ = 0;
    for (const [oid, oz] of this.zombies) {
      if (oid === zombie.id || !oz.isAlive) continue;
      const sdx = zombie.position.x - oz.position.x;
      const sdz = zombie.position.z - oz.position.z;
      const sd = Math.sqrt(sdx * sdx + sdz * sdz);
      if (sd < 1.2 && sd > 0) {
        sepX += sdx / sd * 2;
        sepZ += sdz / sd * 2;
      }
    }

    const moveX = (dx / dist * speed + sepX * 0.5) * dt;
    const moveZ = (dz / dist * speed + sepZ * 0.5) * dt;

    const newX = zombie.position.x + moveX;
    const newZ = zombie.position.z + moveZ;

    // Collision check
    if (!this.checkSolidCollision(newX, zombie.position.z, 0.4)) {
      zombie.position.x = newX;
    }
    if (!this.checkSolidCollision(zombie.position.x, newZ, 0.4)) {
      zombie.position.z = newZ;
    }

    // Clamp to map
    zombie.position.x = clamp(zombie.position.x, -C.MAP_SIZE / 2 + 1, C.MAP_SIZE / 2 - 1);
    zombie.position.z = clamp(zombie.position.z, -C.MAP_SIZE / 2 + 1, C.MAP_SIZE / 2 - 1);

    // Rotate mesh towards movement direction
    mesh.rotation.y = Math.atan2(dx, dz);
    mesh.position.set(zombie.position.x, 0, zombie.position.z);
  }

  updateBossAI(zombie: ZombieState, target: PlayerState, dt: number, mesh: any) {
    if (!(zombie as any).aiTimer) (zombie as any).aiTimer = 0;
    if (!(zombie as any).attackPhase) (zombie as any).attackPhase = 'move';
    if (!(zombie as any).attackCooldown) (zombie as any).attackCooldown = 0;

    (zombie as any).aiTimer -= dt;
    (zombie as any).attackCooldown -= dt;

    const dist = vecDist2D(zombie.position, target.position);
    const stats = C.ZOMBIE_TYPES.boss;

    if ((zombie as any).attackCooldown <= 0) {
      const r = Math.random();
      if (r < 0.33) {
        // Shockwave attack
        (zombie as any).attackPhase = 'shockwave';
        (zombie as any).attackCooldown = 4;
        this.bossShockwave(zombie);
      } else if (r < 0.66) {
        // Charge attack
        (zombie as any).attackPhase = 'charge';
        (zombie as any).chargeTarget = { x: target.position.x, z: target.position.z };
        (zombie as any).attackCooldown = 5;
      } else {
        // Toxic spit
        (zombie as any).attackPhase = 'spit';
        (zombie as any).attackCooldown = 3;
        this.bossToxicSpit(zombie, target);
      }
    }

    if ((zombie as any).attackPhase === 'charge' && (zombie as any).chargeTarget) {
      // Charge movement
      const ct = (zombie as any).chargeTarget;
      this.moveZombieTowards(zombie, { x: ct.x, y: 0, z: ct.z }, stats.speed * 2.5, dt, mesh);

      if (vecDist2D(zombie.position, { x: ct.x, y: 0, z: ct.z }) < 2) {
        (zombie as any).attackPhase = 'move';
        (zombie as any).chargeTarget = null;
        if (target.id === this.localPlayer.id) {
          this.takeDamage(stats.damage * 1.5, true);
        }
      }
    } else {
      this.moveZombieTowards(zombie, target.position, stats.speed, dt, mesh);
    }

    // Melee attack
    if (dist < stats.attackRange) {
      if (!(zombie as any).meleeTimer) (zombie as any).meleeTimer = 0;
      (zombie as any).meleeTimer -= dt;
      if ((zombie as any).meleeTimer <= 0) {
        (zombie as any).meleeTimer = stats.attackRate;
        if (target.id === this.localPlayer.id) {
          this.takeDamage(stats.damage, true);
        }
      }
    }

    mesh.position.set(zombie.position.x, 0, zombie.position.z);

    // Boss floating animation
    mesh.position.y = Math.sin(Date.now() * 0.003) * 0.2;
    mesh.rotation.y += dt * 0.3;
  }

  bossShockwave(zombie: ZombieState) {
    // Create expanding ring
    const ringGeo = new THREE.RingGeometry(0.5, 1, 32);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xff00ff, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(zombie.position.x, 0.1, zombie.position.z);
    this.scene.add(ring);

    let radius = 0.5;
    const expand = () => {
      if (this.isDestroyed) return;
      radius += 0.5;
      ring.scale.set(radius, radius, 1);
      ring.material.opacity = Math.max(0, 0.8 - radius / 12);

      // Damage players in range
      if (radius < 10) {
        const localDist = vecDist2D(this.localPlayer.position, zombie.position);
        if (localDist < radius + 1 && localDist > radius - 0.5) {
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
    const count = 3;
    for (let i = 0; i < count; i++) {
      setTimeout(() => {
        if (this.isDestroyed) return;
        const angle = Math.atan2(
          target.position.z - zombie.position.z,
          target.position.x - zombie.position.x
        ) + (Math.random() - 0.5) * 0.5;

        const spitGeo = new THREE.SphereGeometry(0.2, 8, 8);
        const spitMat = new THREE.MeshBasicMaterial({ color: 0x44ff00 });
        const spit = new THREE.Mesh(spitGeo, spitMat);
        spit.position.set(zombie.position.x, 2, zombie.position.z);
        this.scene.add(spit);

        const vel = {
          x: Math.cos(angle) * 15,
          y: 10,
          z: Math.sin(angle) * 15
        };

        const ptLight = new THREE.PointLight(0x44ff00, 0.8, 3);
        spit.add(ptLight);

        const animate = () => {
          if (this.isDestroyed) { this.scene.remove(spit); return; }
          vel.y -= 20 * 0.016;
          spit.position.x += vel.x * 0.016;
          spit.position.y += vel.y * 0.016;
          spit.position.z += vel.z * 0.016;

          if (spit.position.y <= 0) {
            this.createAcidPool(spit.position.x, spit.position.z);
            this.scene.remove(spit);
          } else {
            requestAnimationFrame(animate);
          }
        };
        animate();
      }, i * 300);
    }
  }

  exploderDetonate(zombie: ZombieState) {
    this.createExplosion(zombie.position, 5, 80);
    this.killZombie(zombie.id, null, C.ZOMBIE_TYPES.exploder.reward, true);

    // Damage nearby players
    const dist = vecDist2D(zombie.position, this.localPlayer.position);
    if (dist < 5) {
      const dmg = Math.floor(80 * (1 - dist / 5));
      this.takeDamage(dmg, true);
    }
  }

  acidZombieSpitAt(zombie: ZombieState, target: PlayerState) {
    const projId = 'ap_' + (++this.acidProjectileCounter);
    const startPos = { x: zombie.position.x, y: 1.2, z: zombie.position.z };
    const dx = target.position.x - startPos.x;
    const dz = target.position.z - startPos.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    const speed = 12;
    const travelTime = dist / speed;

    // Parabolic trajectory
    const velY = (0.5 * 20 * travelTime) - (0 - 1.2) / travelTime;

    // Visual projectile
    const projGeo = new THREE.SphereGeometry(0.15, 8, 8);
    const projMat = new THREE.MeshBasicMaterial({ color: 0x44ff00 });
    const projMesh = new THREE.Mesh(projGeo, projMat);
    projMesh.position.set(startPos.x, startPos.y, startPos.z);
    this.scene.add(projMesh);

    const ptLight = new THREE.PointLight(0x44ff00, 0.8, 3);
    projMesh.add(ptLight);

    const vel = {
      x: (dx / dist) * speed,
      y: velY,
      z: (dz / dist) * speed
    };

    const proj = {
      id: projId,
      mesh: projMesh,
      position: { ...startPos },
      velocity: vel,
      zombieId: zombie.id
    };

    this.acidProjectiles.push(proj);
  }

  updateAcidProjectiles(dt: number) {
    for (let i = this.acidProjectiles.length - 1; i >= 0; i--) {
      const proj = this.acidProjectiles[i] as any;
      proj.velocity.y -= 20 * dt;
      proj.position.x += proj.velocity.x * dt;
      proj.position.y += proj.velocity.y * dt;
      proj.position.z += proj.velocity.z * dt;
      proj.mesh.position.set(proj.position.x, proj.position.y, proj.position.z);

      if (proj.position.y <= 0) {
        this.scene.remove(proj.mesh);
        this.acidProjectiles.splice(i, 1);
        this.createAcidPool(proj.position.x, proj.position.z);
      }
    }
  }

  createAcidPool(x: number, z: number) {
    const id = 'pool_' + Date.now() + Math.random();
    const pool: AcidPool = {
      id,
      position: vec3(x, 0, z),
      radius: 2.5,
      timer: C.ACID_POOL_DURATION
    };
    this.acidPools.set(id, pool);

    // Visual
    const poolGeo = new THREE.CircleGeometry(2.5, 16);
    const poolMat = new THREE.MeshBasicMaterial({ color: 0x44ff00, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
    const poolMesh = new THREE.Mesh(poolGeo, poolMat);
    poolMesh.rotation.x = -Math.PI / 2;
    poolMesh.position.set(x, 0.05, z);
    this.scene.add(poolMesh);

    const ptLight = new THREE.PointLight(0x44ff00, 1, 5);
    ptLight.position.set(x, 0.5, z);
    this.scene.add(ptLight);

    this.acidPoolMeshes.set(id, { mesh: poolMesh, light: ptLight });
  }

  updateAcidPools(dt: number) {
    for (const [id, pool] of this.acidPools) {
      pool.timer -= dt;

      if (pool.timer <= 0) {
        const meshData = this.acidPoolMeshes.get(id);
        if (meshData) {
          this.scene.remove(meshData.mesh);
          this.scene.remove(meshData.light);
          this.acidPoolMeshes.delete(id);
        }
        this.acidPools.delete(id);
        continue;
      }

      // Damage local player if in pool
      const dist = vecDist2D(this.localPlayer.position, pool.position);
      if (dist < pool.radius) {
        if (!(pool as any).damageTimer) (pool as any).damageTimer = 0;
        (pool as any).damageTimer -= dt;
        if ((pool as any).damageTimer <= 0) {
          (pool as any).damageTimer = 1;
          this.takeDamage(C.ACID_POOL_DAMAGE, true);
        }
      }

      // Pulsing glow
      const meshData = this.acidPoolMeshes.get(id);
      if (meshData) {
        meshData.mesh.material.opacity = 0.3 + Math.sin(Date.now() * 0.005) * 0.15;
        meshData.light.intensity = 0.8 + Math.sin(Date.now() * 0.008) * 0.3;
      }
    }
  }

  checkWaveComplete() {
    if (this.phase !== 'combat') return;

    const aliveZombies = Array.from(this.zombies.values()).filter(z => z.isAlive);
    const el = document.getElementById('zombie-count');
    if (el) el.textContent = `Зомби: ${aliveZombies.length}`;

    if (aliveZombies.length === 0 && this.zombies.size > 0) {
      this.zombies.clear();

      if (this.wave >= 10) {
        this.showVictory();
        return;
      }

      this.phase = 'intermission';
      this.showWaveAnnounce('ВОЛНА ЗАВЕРШЕНА!', `Следующая волна через 10 секунд`, 3000);

      setTimeout(() => {
        if (this.isDestroyed) return;
        this.startWave(this.wave + 1);
      }, 10000);
    }
  }

  killZombie(zombieId: string, killerId: string | null, reward: number, _fromServer: boolean) {
    const zombie = this.zombies.get(zombieId);
    if (!zombie || !zombie.isAlive) return;

    zombie.isAlive = false;

    // Death animation
    const mesh = this.zombieMeshes.get(zombieId);
    if (mesh) {
      const dissolve = () => {
        if (this.isDestroyed) return;
        mesh.scale.y -= 0.05;
        mesh.position.y -= 0.03;
        if (mesh.scale.y > 0) {
          requestAnimationFrame(dissolve);
        } else {
          this.scene.remove(mesh);
          this.zombieMeshes.delete(zombieId);
        }
      };
      setTimeout(dissolve, 100);
    }

    // Drop items
    if (Math.random() < 0.1) {
      this.spawnHealthDrop(zombie.position);
    }

    if (killerId === this.localPlayer.id) {
      this.addMoney(reward);
      this.onZombieKilled(zombieId, reward);
    }
  }

  onZombieKilled(zombieId: string, _reward: number) {
    const zombie = this.zombies.get(zombieId);
    if (!zombie) return;

    this.localPlayer.kills++;
    this.localPlayer.streak++;

    // Streak bonuses
    if (this.localPlayer.streak === 5) {
      this.applyBoost('speed', 10);
      this.showCombo('🔥 x5 СЕРИЯ!', 'Ускорение на 10 сек');
    } else if (this.localPlayer.streak === 10) {
      this.applyBoost('damage', 10);
      this.showCombo('💀 x10 СЕРИЯ!', 'Двойной урон на 10 сек');
    } else if (this.localPlayer.streak === 15) {
      this.applyBoost('cleanse', 0);
      this.showCombo('⚡ x15 СЕРИЯ!', 'ОЧИЩЕНИЕ КАРТЫ!');
      this.cleanseMap();
    } else if (this.localPlayer.streak > 5) {
      this.showCombo(`x${this.localPlayer.streak} СЕРИЯ`, '');
    }

    this.updateHUD();
  }

  cleanseMap() {
    // Kill all normal zombies
    for (const [id, zombie] of this.zombies) {
      if (zombie.type === 'normal' && zombie.isAlive) {
        this.createExplosion(zombie.position, 2, 0);
        this.killZombie(id, this.localPlayer.id, zombie.type === 'normal' ? C.ZOMBIE_TYPES.normal.reward : 0, false);
      }
    }
  }

  spawnHealthDrop(pos: Vec3) {
    const geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff4444 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos.x, 0.25, pos.z);
    mesh.rotation.y = Math.PI / 4;
    this.scene.add(mesh);

    const light = new THREE.PointLight(0xff4444, 1, 3);
    light.position.set(pos.x, 0.5, pos.z);
    this.scene.add(light);

    // Bobbing animation
    let t = 0;
    const bob = setInterval(() => {
      if (this.isDestroyed) { clearInterval(bob); return; }
      t += 0.05;
      mesh.position.y = 0.25 + Math.sin(t) * 0.1;
      mesh.rotation.y += 0.03;
    }, 16);

    // Auto pickup if player nearby
    const checkPickup = setInterval(() => {
      if (this.isDestroyed) { clearInterval(checkPickup); clearInterval(bob); return; }
      const dist = vecDist2D(this.localPlayer.position, pos);
      if (dist < 1.5) {
        this.localPlayer.hp = Math.min(C.PLAYER_MAX_HP, this.localPlayer.hp + 30);
        this.scene.remove(mesh);
        this.scene.remove(light);
        clearInterval(checkPickup);
        clearInterval(bob);
        this.updateHUD();
        this.showKillFeedMessage('+30 HP', '#ff4444');
      }
    }, 200);

    // Expire after 15 seconds
    setTimeout(() => {
      clearInterval(checkPickup);
      clearInterval(bob);
      if (mesh.parent) this.scene.remove(mesh);
      if (light.parent) this.scene.remove(light);
    }, 15000);
  }

  removeZombieMesh(id: string) {
    const mesh = this.zombieMeshes.get(id);
    if (mesh) {
      this.scene.remove(mesh);
      this.zombieMeshes.delete(id);
    }
  }

  // ============================================================
  // PLAYER ACTIONS
  // ============================================================
  handleInteract() {
    if (this.vendingOpen) {
      this.closeVending();
      return;
    }

    const interactable = this.getInteractable();
    if (!interactable) return;

    if (interactable === 'vending') {
      this.openVending();
    } else if (interactable === 'mystery_box') {
      this.openMysteryBox();
    } else if (interactable.startsWith('trap_')) {
      const idx = parseInt(interactable.split('_')[1]);
      this.activateTrap(idx);
    } else if (interactable.startsWith('revive_')) {
      const targetId = interactable.substring(7);
      this.startReviving(targetId);
    }
  }

  getInteractable(): string | null {
    const pos = this.localPlayer.position;

    // Vending machine
    const vdist = vecDist2D(pos, { x: -12, y: 0, z: -28 });
    if (vdist < 3) return 'vending';

    // Mystery box
    const mbdist = vecDist2D(pos, this.mysteryBoxPos);
    if (mbdist < 3) return 'mystery_box';

    // Trap consoles
    for (const trap of this.traps) {
      const tdist = vecDist2D(pos, trap.position);
      if (tdist < 3) return `trap_${trap.id}`;
    }

    // Downed allies
    for (const [id, player] of this.remotePlayers) {
      if (player.isDown) {
        const pdist = vecDist2D(pos, player.position);
        if (pdist < 2.5) return `revive_${id}`;
      }
    }

    return null;
  }

  openVending() {
    this.vendingOpen = true;
    const menu = document.getElementById('vending-menu')!;
    menu.style.display = 'block';
    menu.style.animation = 'flashIn 0.2s ease';
    document.getElementById('vending-balance')!.textContent = `Баланс: $${this.localPlayer.money}`;

    if (document.pointerLockElement) {
      document.exitPointerLock();
    }
  }

  closeVending() {
    this.vendingOpen = false;
    const menu = document.getElementById('vending-menu')!;
    menu.style.display = 'none';
  }

  vendingBuy(item: string) {
    const costs: Record<string, number> = {
      ammo: C.VENDING_AMMO_COST,
      health: C.VENDING_HEALTH_COST,
      boost: C.VENDING_BOOST_COST,
      grenade: C.VENDING_GRENADE_COST,
    };

    const cost = costs[item];
    if (this.localPlayer.money < cost) {
      this.showKillFeedMessage('Недостаточно средств!', '#ff4444');
      return;
    }

    this.localPlayer.money -= cost;

    if (item === 'ammo') {
      const ammo = Math.floor(Math.random() * 11);
      this.localPlayer.ammoAkReserve = Math.min(C.AK47_MAX_AMMO, this.localPlayer.ammoAkReserve + ammo);
      this.showKillFeedMessage(`+${ammo} патронов 7.62`, '#ffdd44');
    } else if (item === 'health') {
      const healed = Math.min(30, C.PLAYER_MAX_HP - this.localPlayer.hp);
      this.localPlayer.hp = Math.min(C.PLAYER_MAX_HP, this.localPlayer.hp + 30);
      this.showKillFeedMessage(`+${healed} HP`, '#ff4444');
    } else if (item === 'boost') {
      const boosts = ['speed', 'damage', 'regen'];
      const boost = boosts[Math.floor(Math.random() * boosts.length)];
      this.applyBoost(boost, 15);
      this.showKillFeedMessage(`Усиление: ${boost}!`, '#88ffff');
    } else if (item === 'grenade') {
      this.localPlayer.grenadeCount++;
      this.showKillFeedMessage('+1 граната', '#ff8844');
    }

    // Vending animation
    if (this.vendingMachineMesh) {
      const screen = this.vendingScreen;
      if (screen) {
        screen.material.color.setHex(0xffdd44);
        setTimeout(() => { screen.material.color.setHex(0x00ff88); }, 500);
      }
    }

    document.getElementById('vending-balance')!.textContent = `Баланс: $${this.localPlayer.money}`;
    this.updateHUD();
  }

  openMysteryBox() {
    if (this.localPlayer.money < C.MYSTERY_BOX_COST) {
      this.showKillFeedMessage('Нужно $200!', '#ff4444');
      return;
    }

    this.localPlayer.money -= C.MYSTERY_BOX_COST;

    const upgrades = ['damage', 'fireRate', 'magSize'];
    const upgrade = upgrades[Math.floor(Math.random() * upgrades.length)];
    const weapon = this.localPlayer.weapon;
    const upg = this.localPlayer.weaponUpgrades[weapon];

    if (upgrade === 'damage') {
      upg.damage += 0.2;
      this.showKillFeedMessage(`${weapon.toUpperCase()} Урон +20%!`, '#aa00ff');
    } else if (upgrade === 'fireRate') {
      upg.fireRate -= 0.15;
      this.showKillFeedMessage(`${weapon.toUpperCase()} Скорострельность +25%!`, '#aa00ff');
    } else if (upgrade === 'magSize') {
      upg.magSize += 10;
      this.showKillFeedMessage(`${weapon.toUpperCase()} Магазин +10!`, '#aa00ff');
    }

    // Animate box
    if (this.mysteryBoxMesh) {
      this.mysteryBoxMesh.rotation.y += Math.PI;
    }

    this.updateHUD();
  }

  activateTrap(idx: number) {
    const trap = this.traps[idx];
    if (!trap) return;

    if (trap.active) {
      this.showKillFeedMessage('Ловушка уже активна!', '#ff8844');
      return;
    }

    if (this.localPlayer.money < C.TRAP_COST) {
      this.showKillFeedMessage(`Нужно $${C.TRAP_COST}!`, '#ff4444');
      return;
    }

    this.localPlayer.money -= C.TRAP_COST;
    trap.active = true;
    trap.timer = C.TRAP_DURATION;

    // Show trap effect
    const effectMesh = this.trapMeshes[idx];
    if (effectMesh) {
      effectMesh.visible = true;
    }

    this.showKillFeedMessage(`Ловушка ${trap.type} активна!`, '#00ffff');
    this.updateHUD();
  }

  updateTraps(dt: number) {
    for (let i = 0; i < this.traps.length; i++) {
      const trap = this.traps[i];
      if (!trap.active) continue;

      trap.timer -= dt;

      if (trap.timer <= 0) {
        trap.active = false;
        const effectMesh = this.trapMeshes[i];
        if (effectMesh) effectMesh.visible = false;
        continue;
      }

      // Animate trap mesh
      const effectMesh = this.trapMeshes[i];
      if (effectMesh) {
        effectMesh.rotation.y += dt * 2;
        effectMesh.material.opacity = 0.2 + Math.sin(Date.now() * 0.01) * 0.15;
      }

      // Damage zombies in range
      const trapRadius = 8;
      if (!(trap as any).damageTimer) (trap as any).damageTimer = 0;
      (trap as any).damageTimer -= dt;

      if ((trap as any).damageTimer <= 0) {
        (trap as any).damageTimer = 0.5;

        for (const [id, zombie] of this.zombies) {
          if (!zombie.isAlive) continue;
          const dist = vecDist2D(zombie.position, trap.position);
          if (dist < trapRadius) {
            this.damageZombie(id, C.TRAP_DAMAGE, this.localPlayer.id);
          }
        }
      }
    }
  }

  buildBarricade() {
    if (this.localPlayer.barricadeCount >= C.MAX_BARRICADES) {
      this.showKillFeedMessage(`Максимум ${C.MAX_BARRICADES} баррикад!`, '#ff8844');
      return;
    }

    if (this.localPlayer.money < C.BARRICADE_COST) {
      this.showKillFeedMessage(`Нужно $${C.BARRICADE_COST}!`, '#ff4444');
      return;
    }

    // Place in front of player
    const dir = { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
    const placePos = {
      x: this.localPlayer.position.x + dir.x * 2,
      y: 0,
      z: this.localPlayer.position.z + dir.z * 2
    };

    if (this.checkSolidCollision(placePos.x, placePos.z, 1)) {
      this.showKillFeedMessage('Нельзя разместить здесь!', '#ff4444');
      return;
    }

    this.localPlayer.money -= C.BARRICADE_COST;
    this.localPlayer.barricadeCount++;

    const barricadeId = 'barc_' + Date.now();
    const barricade: Barricade = {
      id: barricadeId,
      ownerId: this.localPlayer.id,
      position: placePos,
      hp: 150,
      maxHp: 150,
    };

    this.barricades.set(barricadeId, barricade);

    // Visual
    const geo = new THREE.BoxGeometry(1.5, 1.2, 0.4);
    const mat = new THREE.MeshLambertMaterial({ color: 0x888877 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(placePos.x, 0.6, placePos.z);
    mesh.castShadow = true;
    this.scene.add(mesh);
    this.barricadeMeshes.set(barricadeId, mesh);

    // Add to collision
    this.colBoxes.push({
      aabb: { min: vec3(placePos.x - 0.75, 0, placePos.z - 0.2), max: vec3(placePos.x + 0.75, 1.2, placePos.z + 0.2) },
      isSolid: true,
      label: barricadeId
    });

    this.updateHUD();
  }

  throwGrenade() {
    if (this.localPlayer.grenadeCount <= 0) return;
    this.localPlayer.grenadeCount--;

    const dir = { x: -Math.sin(this.yaw) * Math.cos(this.pitch), y: -Math.sin(this.pitch) + 0.3, z: -Math.cos(this.yaw) * Math.cos(this.pitch) };
    const startPos = { x: this.localPlayer.position.x, y: this.localPlayer.position.y - 0.2, z: this.localPlayer.position.z };

    const grenadeGeo = new THREE.SphereGeometry(0.1, 8, 8);
    const grenadeMat = new THREE.MeshLambertMaterial({ color: 0x333300 });
    const grenadeMesh = new THREE.Mesh(grenadeGeo, grenadeMat);
    grenadeMesh.position.set(startPos.x, startPos.y, startPos.z);
    this.scene.add(grenadeMesh);

    const speed = 18;
    const vel = { x: dir.x * speed, y: dir.y * speed + 5, z: dir.z * speed };
    let timer = 0;
    const fuse = C.GRENADE_FUSE;
    const ownerId = this.localPlayer.id;

    const update = () => {
      if (this.isDestroyed) { this.scene.remove(grenadeMesh); return; }
      const dt = 0.016;
      vel.y += C.GRAVITY * dt;
      grenadeMesh.position.x += vel.x * dt;
      grenadeMesh.position.y += vel.y * dt;
      grenadeMesh.position.z += vel.z * dt;
      grenadeMesh.rotation.x += 0.1;
      grenadeMesh.rotation.z += 0.08;

      if (grenadeMesh.position.y < 0) {
        grenadeMesh.position.y = 0;
        vel.y *= -0.4;
        vel.x *= 0.8;
        vel.z *= 0.8;
      }

      timer += dt;
      if (timer >= fuse) {
        const pos = { x: grenadeMesh.position.x, y: 0, z: grenadeMesh.position.z };
        this.scene.remove(grenadeMesh);
        this.createExplosion(pos, C.GRENADE_RADIUS, C.GRENADE_DAMAGE);

        // Damage zombies
        for (const [id, zombie] of this.zombies) {
          if (!zombie.isAlive) continue;
          const dist = vecDist2D(zombie.position, pos);
          if (dist < C.GRENADE_RADIUS) {
            const dmg = Math.floor(C.GRENADE_DAMAGE * (1 - dist / C.GRENADE_RADIUS));
            this.damageZombie(id, dmg, ownerId);
          }
        }

        // Self damage
        const selfDist = vecDist2D(this.localPlayer.position, pos);
        if (selfDist < C.GRENADE_RADIUS) {
          const dmg = Math.floor(C.GRENADE_DAMAGE * 0.5 * (1 - selfDist / C.GRENADE_RADIUS));
          if (dmg > 0) this.takeDamage(dmg, true);
        }
        return;
      }

      requestAnimationFrame(update);
    };

    update();
    this.updateHUD();
  }

  switchWeapon(weapon: 'ak47' | 'pistol') {
    if (this.reloading) return;
    this.localPlayer.weapon = weapon;
    this.updateWeaponMesh(weapon);
    this.updateHUD();
  }

  updateWeaponMesh(weapon: 'ak47' | 'pistol') {
    if (!this.weaponMesh) return;

    // Remove all children
    while (this.weaponMesh.children.length > 0) {
      this.weaponMesh.remove(this.weaponMesh.children[0]);
    }

    const metalMat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const woodMat = new THREE.MeshLambertMaterial({ color: 0x6B4226 });

    if (weapon === 'ak47') {
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.5), woodMat);
      body.position.set(0, 0, -0.25);
      this.weaponMesh.add(body);

      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.35, 8), metalMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.015, -0.57);
      this.weaponMesh.add(barrel);

      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.15, 0.06), metalMat);
      mag.position.set(0, -0.09, -0.22);
      mag.rotation.x = -0.2;
      this.weaponMesh.add(mag);
    } else {
      // Pistol
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.1, 0.18), metalMat);
      body.position.set(0, 0, -0.09);
      this.weaponMesh.add(body);

      const grip = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.12, 0.07), new THREE.MeshLambertMaterial({ color: 0x4a3222 }));
      grip.position.set(0, -0.1, -0.02);
      this.weaponMesh.add(grip);

      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.010, 0.010, 0.2, 8), metalMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 0.02, -0.22);
      this.weaponMesh.add(barrel);
    }
  }

  handleShooting(dt: number) {
    if (!this.leftMouseDown || this.vendingOpen || this.localPlayer.isDown || this.localPlayer.isDead) return;
    if (this.localPlayer.hp <= 0) return;

    const weapon = this.localPlayer.weapon;
    const isAK = weapon === 'ak47';
    const upgrades = this.localPlayer.weaponUpgrades[weapon];

    const fireRate = isAK
      ? C.AK47_FIRE_RATE * upgrades.fireRate
      : C.PISTOL_FIRE_RATE * upgrades.fireRate;

    this.fireTimer -= dt;
    if (this.fireTimer > 0) return;

    // Check ammo
    if (isAK) {
      if (this.currentMagAmmo <= 0) {
        if (!this.reloading) this.startReload();
        return;
      }
      this.currentMagAmmo--;
      if (this.currentMagAmmo === 0 && this.localPlayer.ammoAkReserve > 0) {
        this.startReload();
      }
    }

    this.fireTimer = fireRate;

    // Raycast
    const hit = this.performRaycast();

    // Muzzle flash
    this.showMuzzleFlash();

    // Bullet trail
    this.createBulletTrail();

    // Weapon bob/kick
    if (this.weaponMesh) {
      this.weaponMesh.rotation.x = -0.15;
      setTimeout(() => { if (this.weaponMesh) this.weaponMesh.rotation.x = 0; }, 80);
    }

    if (hit.hit && hit.zombieId) {
      const baseDamage = isAK ? C.AK47_DAMAGE_BASE : C.PISTOL_DAMAGE_BASE;
      const dmgMult = this.localPlayer.boosted && this.localPlayer.boostType === 'damage' ? 2 : 1;
      const weaponUpgDmg = upgrades.damage;
      const damage = Math.floor(baseDamage * weaponUpgDmg * dmgMult);

      this.damageZombie(hit.zombieId!, damage, this.localPlayer.id);
      this.spawnBloodEffect(hit.position || vec3());
    } else {
      // Miss resets streak
      if (this.localPlayer.streak > 0) {
        this.localPlayer.streak = 0;
      }
    }

    // AK-47 auto fire
    if (!isAK) this.leftMouseDown = false;  // pistol: one shot per click (handled by fire rate)

    this.updateHUD();
  }

  performRaycast(): { hit: boolean; zombieId?: string; position?: Vec3 } {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);

    // Check collision with world first
    const worldObjs: any[] = [];
    for (const [id, mesh] of this.zombieMeshes) {
      worldObjs.push(mesh);
    }

    // Use ray vs AABB for zombies
    const ray = raycaster.ray;
    const origin = ray.origin;
    const dir = ray.direction;

    let nearestDist = Infinity;
    let hitZombieId: string | null = null;

    // Check if ray hits any solid wall first
    let wallDist = Infinity;
    for (const col of this.colBoxes) {
      if (!col.isSolid) continue;
      const d = this.rayVsAABB(origin, dir, col.aabb);
      if (d !== null && d < wallDist) wallDist = d;
    }

    for (const [id, zombie] of this.zombies) {
      if (!zombie.isAlive) continue;
      const zombieAABB: AABB = {
        min: vec3(zombie.position.x - 0.4, 0, zombie.position.z - 0.4),
        max: vec3(zombie.position.x + 0.4, zombie.type === 'boss' ? 4 : 2, zombie.position.z + 0.4)
      };
      const d = this.rayVsAABB(origin, dir, zombieAABB);
      if (d !== null && d < nearestDist && d < wallDist) {
        nearestDist = d;
        hitZombieId = id;
      }
    }

    if (hitZombieId) {
      const hitPos = vec3(
        origin.x + dir.x * nearestDist,
        origin.y + dir.y * nearestDist,
        origin.z + dir.z * nearestDist
      );
      return { hit: true, zombieId: hitZombieId, position: hitPos };
    }

    return { hit: false };
  }

  rayVsAABB(origin: any, dir: any, box: AABB): number | null {
    let tmin = (box.min.x - origin.x) / (dir.x || 0.0001);
    let tmax = (box.max.x - origin.x) / (dir.x || 0.0001);
    if (tmin > tmax) [tmin, tmax] = [tmax, tmin];

    let tymin = (box.min.y - origin.y) / (dir.y || 0.0001);
    let tymax = (box.max.y - origin.y) / (dir.y || 0.0001);
    if (tymin > tymax) [tymin, tymax] = [tymax, tymin];

    if (tmin > tymax || tymin > tmax) return null;
    tmin = Math.max(tmin, tymin);
    tmax = Math.min(tmax, tymax);

    let tzmin = (box.min.z - origin.z) / (dir.z || 0.0001);
    let tzmax = (box.max.z - origin.z) / (dir.z || 0.0001);
    if (tzmin > tzmax) [tzmin, tzmax] = [tzmax, tzmin];

    if (tmin > tzmax || tzmin > tmax) return null;
    tmin = Math.max(tmin, tzmin);

    if (tmin < 0) return null;
    return tmin;
  }

  damageZombie(zombieId: string, damage: number, sourcePlayerId: string) {
    const zombie = this.zombies.get(zombieId);
    if (!zombie || !zombie.isAlive) return;

    zombie.hp -= damage;

    // Track damage for rewards
    zombie.damageMap[sourcePlayerId] = (zombie.damageMap[sourcePlayerId] || 0) + damage;

    // Flash zombie mesh red
    const mesh = this.zombieMeshes.get(zombieId);
    if (mesh) {
      mesh.traverse((child: any) => {
        if (child.isMesh && child.material && child.material.color) {
          const origColor = child.material.color.getHex();
          child.material.color.setHex(0xffffff);
          setTimeout(() => {
            if (child.material) child.material.color.setHex(origColor);
          }, 80);
        }
      });
    }

    if (zombie.hp <= 0) {
      zombie.hp = 0;
      zombie.isAlive = false;

      // Find who did most damage
      let maxDmg = 0;
      let topKiller = sourcePlayerId;
      for (const [pid, dmg] of Object.entries(zombie.damageMap)) {
        if (dmg > maxDmg) { maxDmg = dmg; topKiller = pid; }
      }

      const reward = C.ZOMBIE_TYPES[zombie.type].reward;
      this.killZombie(zombieId, topKiller, reward, false);

      // Special death effects
      if (zombie.type === 'exploder') {
        this.createExplosion(zombie.position, 5, 0);
      } else {
        this.createBloodExplosion(zombie.position);
      }
    }
  }

  showMuzzleFlash() {
    if (!this.muzzleFlash) return;
    this.muzzleFlash.position.set(0, 0, -0.65);
    this.muzzleFlash.visible = true;
    this.muzzleFlash.material.color.setHex(0xffdd44);
    setTimeout(() => { if (this.muzzleFlash) this.muzzleFlash.visible = false; }, 50);
  }

  createBulletTrail() {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
    const origin = raycaster.ray.origin.clone();
    const end = raycaster.ray.origin.clone().add(raycaster.ray.direction.clone().multiplyScalar(100));

    const points = [origin, end];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: 0xffee88, transparent: true, opacity: 0.6 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);

    let opacity = 0.6;
    const fade = setInterval(() => {
      if (this.isDestroyed) { clearInterval(fade); return; }
      opacity -= 0.15;
      mat.opacity = Math.max(0, opacity);
      if (opacity <= 0) {
        this.scene.remove(line);
        clearInterval(fade);
      }
    }, 16);
  }

  spawnBloodEffect(position: Vec3) {
    for (let i = 0; i < 8; i++) {
      const particleGeo = new THREE.SphereGeometry(0.05, 4, 4);
      const particleMat = new THREE.MeshBasicMaterial({ color: 0xaa0000 });
      const particle = new THREE.Mesh(particleGeo, particleMat);
      particle.position.set(position.x, position.y, position.z);
      this.scene.add(particle);

      const vel = { x: randomRange(-3, 3), y: randomRange(2, 5), z: randomRange(-3, 3) };
      let life = 0.5;
      const update = () => {
        if (this.isDestroyed) { this.scene.remove(particle); return; }
        vel.y -= 15 * 0.016;
        particle.position.x += vel.x * 0.016;
        particle.position.y += vel.y * 0.016;
        particle.position.z += vel.z * 0.016;
        life -= 0.016;
        particle.material.opacity = life / 0.5;
        if (life > 0 && particle.position.y > 0) {
          requestAnimationFrame(update);
        } else {
          this.scene.remove(particle);
        }
      };
      update();
    }
  }

  createBloodExplosion(position: Vec3) {
    for (let i = 0; i < 15; i++) {
      const size = randomRange(0.05, 0.15);
      const geo = new THREE.SphereGeometry(size, 4, 4);
      const mat = new THREE.MeshBasicMaterial({ color: 0x880000 });
      const p = new THREE.Mesh(geo, mat);
      p.position.set(position.x, 0.5, position.z);
      this.scene.add(p);

      const angle = Math.random() * Math.PI * 2;
      const speed = randomRange(2, 8);
      const vel = { x: Math.cos(angle) * speed, y: randomRange(3, 8), z: Math.sin(angle) * speed };
      let life = randomRange(0.3, 0.8);

      const update = () => {
        if (this.isDestroyed) { this.scene.remove(p); return; }
        vel.y -= 15 * 0.016;
        p.position.x += vel.x * 0.016;
        p.position.y += vel.y * 0.016;
        p.position.z += vel.z * 0.016;
        life -= 0.016;
        mat.opacity = life;
        if (life > 0 && p.position.y >= 0) requestAnimationFrame(update);
        else this.scene.remove(p);
      };
      update();
    }
  }

  createExplosion(position: Vec3, radius: number, damage: number) {
    // Orange fireball
    const geo = new THREE.SphereGeometry(radius * 0.4, 12, 12);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.9 });
    const ball = new THREE.Mesh(geo, mat);
    ball.position.set(position.x, 0.5, position.z);
    this.scene.add(ball);

    const ptLight = new THREE.PointLight(0xff6600, 3, radius * 2);
    ptLight.position.set(position.x, 1, position.z);
    this.scene.add(ptLight);

    let scale = 1;
    const expand = () => {
      if (this.isDestroyed) return;
      scale += 0.15;
      ball.scale.set(scale, scale, scale);
      mat.opacity = Math.max(0, 0.9 - scale * 0.15);
      ptLight.intensity = Math.max(0, 3 - scale * 0.4);
      if (mat.opacity > 0) requestAnimationFrame(expand);
      else {
        this.scene.remove(ball);
        this.scene.remove(ptLight);
      }
    };
    expand();

    // Sparks
    for (let i = 0; i < 20; i++) {
      const sparkGeo = new THREE.SphereGeometry(0.06, 4, 4);
      const sparkMat = new THREE.MeshBasicMaterial({ color: i % 2 === 0 ? 0xffdd44 : 0xff4400 });
      const spark = new THREE.Mesh(sparkGeo, sparkMat);
      spark.position.set(position.x, 0.5, position.z);
      this.scene.add(spark);

      const angle = Math.random() * Math.PI * 2;
      const pitchA = randomRange(-Math.PI / 4, Math.PI / 2);
      const speed = randomRange(5, 15);
      const vel = {
        x: Math.cos(angle) * Math.cos(pitchA) * speed,
        y: Math.sin(pitchA) * speed + 3,
        z: Math.sin(angle) * Math.cos(pitchA) * speed
      };
      let life = randomRange(0.3, 0.8);

      const updateSpark = () => {
        if (this.isDestroyed) { this.scene.remove(spark); return; }
        vel.y -= 20 * 0.016;
        spark.position.x += vel.x * 0.016;
        spark.position.y += vel.y * 0.016;
        spark.position.z += vel.z * 0.016;
        life -= 0.016;
        if (life > 0 && spark.position.y >= 0) requestAnimationFrame(updateSpark);
        else this.scene.remove(spark);
      };
      updateSpark();
    }

    // Camera shake
    this.cameraShake(0.3, 0.2);
  }

  cameraShake(intensity: number, duration: number) {
    let elapsed = 0;
    const shake = () => {
      if (this.isDestroyed) return;
      elapsed += 0.016;
      if (elapsed < duration) {
        const factor = 1 - elapsed / duration;
        this.camera.position.x += (Math.random() - 0.5) * intensity * factor;
        this.camera.position.y += (Math.random() - 0.5) * intensity * factor;
        requestAnimationFrame(shake);
      }
    };
    shake();
  }

  takeDamage(amount: number, _showEffect: boolean) {
    if (this.localPlayer.isDead || this.localPlayer.isDown) return;

    this.localPlayer.hp = Math.max(0, this.localPlayer.hp - amount);
    this.localPlayer.streak = 0;  // Taking damage resets streak

    // Damage flash
    const overlay = document.getElementById('damage-overlay');
    if (overlay) {
      overlay.style.opacity = '1';
      setTimeout(() => { if (overlay) overlay.style.opacity = '0'; }, 200);
    }

    if (this.localPlayer.hp <= 0) {
      this.onPlayerDown();
    }

    // Camera shake
    this.cameraShake(0.1, 0.1);

    this.updateHUD();

    // HP warning
    if (this.localPlayer.hp <= 30 && this.localPlayer.hp > 0) {
      const hpBar = document.getElementById('hp-bar');
      if (hpBar) {
        hpBar.style.background = 'linear-gradient(to right, #ff2222, #ff4422)';
        hpBar.style.animation = 'pulse 0.5s ease infinite alternate';
      }
    }
  }

  onPlayerDown() {
    this.localPlayer.isDown = true;
    this.localPlayer.hp = 0;
    this.localPlayer.downTimer = C.DOWN_TIMER;

    const overlay = document.getElementById('down-overlay');
    if (overlay) overlay.style.display = 'block';

    // Crawl mode: camera low
    this.camera.position.y = 0.4;

    // Down timer
    const downInterval = setInterval(() => {
      if (this.isDestroyed) { clearInterval(downInterval); return; }
      this.localPlayer.downTimer -= 0.1;
      const timerEl = document.getElementById('down-timer-text');
      if (timerEl) timerEl.textContent = `Время: ${Math.ceil(this.localPlayer.downTimer)} сек`;

      if (this.localPlayer.downTimer <= 0) {
        clearInterval(downInterval);
        this.onPlayerDead();
      }

      if (!this.localPlayer.isDown) {
        clearInterval(downInterval);
      }
    }, 100);
  }

  onPlayerDead() {
    this.localPlayer.isDown = false;
    this.localPlayer.isDead = true;
    this.localPlayer.hp = 0;

    const overlay = document.getElementById('down-overlay');
    if (overlay) overlay.style.display = 'none';

    // Respawn after 10 seconds
    setTimeout(() => {
      if (this.isDestroyed) return;
      this.localPlayer.isDead = false;
      this.localPlayer.hp = Math.floor(C.PLAYER_MAX_HP * 0.5);
      this.localPlayer.isDown = false;

      // Respawn at base
      this.localPlayer.position = vec3(0, C.PLAYER_HEIGHT, 5);
      this.camera.position.set(0, C.PLAYER_HEIGHT, 5);

      const hpBar = document.getElementById('hp-bar');
      if (hpBar) {
        hpBar.style.background = 'linear-gradient(to right, #44ff44, #88ff44)';
        hpBar.style.animation = '';
      }

      this.updateHUD();
      this.showKillFeedMessage('Возрождение!', '#44ff44');
    }, C.RESPAWN_TIME * 1000);
  }

  startReviving(targetId: string) {
    this.reviveTarget = targetId;
    this.reviveTimer = 0;

    const progress = document.getElementById('revive-progress');
    const bar = document.getElementById('revive-bar');
    if (progress) progress.style.display = 'block';

    const reviveInterval = setInterval(() => {
      if (!this.keys.has('KeyE') || !this.reviveTarget) {
        clearInterval(reviveInterval);
        if (progress) progress.style.display = 'none';
        this.reviveTarget = null;
        return;
      }

      this.reviveTimer += 0.1;
      const pct = (this.reviveTimer / C.REVIVE_TIME) * 100;
      if (bar) bar.style.width = pct + '%';

      if (this.reviveTimer >= C.REVIVE_TIME) {
        clearInterval(reviveInterval);
        if (progress) progress.style.display = 'none';

        // Revive the player
        const target = this.remotePlayers.get(targetId);
        if (target) {
          target.isDown = false;
          target.hp = Math.floor(C.PLAYER_MAX_HP * 0.5);
        }

        if (this.socket) {
          this.socket.emit('revivePlayer', { targetId });
        }

        this.reviveTarget = null;
        this.showKillFeedMessage('Союзник поднят!', '#44ff88');
      }
    }, 100);
  }

  applyBoost(type: string, duration: number) {
    this.localPlayer.boosted = true;
    this.localPlayer.boostType = type;
    this.localPlayer.boostTimer = duration;

    const boostDisplay = document.getElementById('boost-display');
    const boostText = document.getElementById('boost-text');
    if (boostDisplay) boostDisplay.style.opacity = '1';
    if (boostText) {
      const names: Record<string, string> = {
        speed: '⚡ УСКОРЕНИЕ',
        damage: '💥 ДВОЙНОЙ УРОН',
        cleanse: '⚡ ЧИСТЫЙ ЛИСТ',
        regen: '❤ РЕГЕНЕРАЦИЯ',
      };
      boostText.textContent = names[type] || type.toUpperCase();
    }
  }

  updateBoosts(dt: number) {
    if (!this.localPlayer.boosted) return;

    this.localPlayer.boostTimer -= dt;
    const pct = (this.localPlayer.boostTimer / 15) * 100;
    const bar = document.getElementById('boost-bar');
    if (bar) bar.style.width = Math.max(0, pct) + '%';

    if (this.localPlayer.boosted && this.localPlayer.boostType === 'regen') {
      if (!(this.localPlayer as any).regenTimer) (this.localPlayer as any).regenTimer = 0;
      (this.localPlayer as any).regenTimer -= dt;
      if ((this.localPlayer as any).regenTimer <= 0) {
        (this.localPlayer as any).regenTimer = 1;
        this.localPlayer.hp = Math.min(C.PLAYER_MAX_HP, this.localPlayer.hp + 2);
        this.updateHUD();
      }
    }

    if (this.localPlayer.boostTimer <= 0) {
      this.localPlayer.boosted = false;
      this.localPlayer.boostType = '';
      const boostDisplay = document.getElementById('boost-display');
      if (boostDisplay) boostDisplay.style.opacity = '0';
    }
  }

  startReload() {
    const weapon = this.localPlayer.weapon;
    if (weapon !== 'ak47') return;
    if (this.reloading) return;
    if (this.localPlayer.ammoAkReserve <= 0) return;
    if (this.currentMagAmmo >= C.AK47_MAG_SIZE) return;

    this.reloading = true;
    this.reloadTimer = C.AK47_RELOAD_TIME;

    document.getElementById('reload-bar-container')!.style.display = 'block';
    document.getElementById('reload-text')!.style.display = 'block';

    // Weapon reload animation
    if (this.weaponMesh) {
      this.weaponMesh.rotation.z = 0.5;
      setTimeout(() => {
        if (this.weaponMesh) this.weaponMesh.rotation.z = 0;
      }, C.AK47_RELOAD_TIME * 1000 * 0.7);
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
      const needed = Math.floor(C.AK47_MAG_SIZE * this.localPlayer.weaponUpgrades.ak47.magSize) - this.currentMagAmmo;
      const actual = Math.min(needed, this.localPlayer.ammoAkReserve);
      this.currentMagAmmo += actual;
      this.localPlayer.ammoAkReserve -= actual;

      document.getElementById('reload-bar-container')!.style.display = 'none';
      document.getElementById('reload-text')!.style.display = 'none';

      this.updateHUD();
    }
  }

  // ============================================================
  // PLAYER MOVEMENT
  // ============================================================
  updatePlayer(dt: number) {
    if (this.localPlayer.isDead) return;

    // Mouse look
    const sensitivity = this.rightMouseDown ? 0.001 : 0.002;
    this.yaw -= this.mouseDX * sensitivity;
    this.pitch -= this.mouseDY * sensitivity;
    this.pitch = clamp(this.pitch, -Math.PI / 2 + 0.05, Math.PI / 2 - 0.05);
    this.mouseDX = 0;
    this.mouseDY = 0;

    // Camera rotation
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;

    if (this.localPlayer.isDown) {
      this.camera.position.y = 0.4;
      // Limited crawl movement
      this.handleMovement(dt, 1.5);
      return;
    }

    // Movement
    const isSprinting = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight');
    const isCrouching = this.keys.has('ControlLeft') || this.keys.has('ControlRight');
    this.localPlayer.isSprinting = isSprinting && !isCrouching;
    this.localPlayer.isCrouching = isCrouching;

    let speed = C.PLAYER_SPEED;
    if (this.localPlayer.isSprinting) speed *= C.PLAYER_SPRINT_MULT;
    if (this.localPlayer.isCrouching) speed *= C.PLAYER_CROUCH_MULT;
    if (this.localPlayer.boosted && this.localPlayer.boostType === 'speed') speed *= 1.5;

    this.handleMovement(dt, speed);

    // Camera height
    const targetHeight = this.localPlayer.isCrouching ? 0.8 : C.PLAYER_HEIGHT;
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

    // Weapon bob
    this.updateWeaponBob(dt);

    // ADS zoom
    if (this.rightMouseDown) {
      this.camera.fov += (55 - this.camera.fov) * 10 * dt;
    } else {
      this.camera.fov += (75 - this.camera.fov) * 10 * dt;
    }
    this.camera.updateProjectionMatrix();

    // Check interactables
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

      // Collision detection
      const radius = C.PLAYER_RADIUS;
      if (!this.checkSolidCollision(newX, this.localPlayer.position.z, radius)) {
        this.localPlayer.position.x = newX;
      }
      if (!this.checkSolidCollision(this.localPlayer.position.x, newZ, radius)) {
        this.localPlayer.position.z = newZ;
      }

      // Map bounds
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

    // Check barricades
    for (const [id, barc] of this.barricades) {
      const barcAABB: AABB = {
        min: vec3(barc.position.x - 0.75, 0, barc.position.z - 0.2),
        max: vec3(barc.position.x + 0.75, 1.2, barc.position.z + 0.2)
      };
      if (aabbOverlap(testAABB, barcAABB)) return true;
    }

    return false;
  }

  updateWeaponBob(dt: number) {
    if (!this.weaponMesh) return;
    const isMoving = this.keys.has('KeyW') || this.keys.has('KeyS') || this.keys.has('KeyA') || this.keys.has('KeyD');

    if (isMoving) {
      this.bobTimer += dt * (this.localPlayer.isSprinting ? 12 : 8);
      const bobX = Math.sin(this.bobTimer) * 0.015;
      const bobY = Math.abs(Math.sin(this.bobTimer * 2)) * 0.008;
      this.weaponMesh.position.set(0.2 + bobX, -0.18 - bobY, -0.35);
    } else {
      this.weaponMesh.position.x += (0.2 - this.weaponMesh.position.x) * 5 * dt;
      this.weaponMesh.position.y += (-0.18 - this.weaponMesh.position.y) * 5 * dt;
    }
  }

  updateInteractPrompt() {
    const interactable = this.getInteractable();
    const prompt = document.getElementById('interact-prompt')!;
    const text = document.getElementById('interact-text')!;

    if (interactable) {
      prompt.style.display = 'block';
      if (interactable === 'vending') {
        text.textContent = 'Открыть автомат снаряжения';
      } else if (interactable === 'mystery_box') {
        text.textContent = 'Мистическая коробка ($200)';
      } else if (interactable.startsWith('trap_')) {
        const idx = parseInt(interactable.split('_')[1]);
        const trap = this.traps[idx];
        text.textContent = trap?.active
          ? `Ловушка активна (${Math.ceil(trap.timer)} сек)`
          : `Активировать ловушку ($${C.TRAP_COST})`;
      } else if (interactable.startsWith('revive_')) {
        text.textContent = 'Зажми для реанимации';
      }
    } else {
      prompt.style.display = 'none';
    }
  }

  // ============================================================
  // HUD UPDATE
  // ============================================================
  updateHUD() {
    const p = this.localPlayer;
    const hpPct = (p.hp / p.maxHp) * 100;

    const hpBar = document.getElementById('hp-bar');
    const hpText = document.getElementById('hp-text');
    if (hpBar) hpBar.style.width = hpPct + '%';
    if (hpText) hpText.textContent = `${p.hp} / ${p.maxHp}`;

    const weaponName = document.getElementById('weapon-name');
    const ammoMag = document.getElementById('ammo-mag');
    const ammoRes = document.getElementById('ammo-reserve');
    if (weaponName) weaponName.textContent = p.weapon === 'ak47' ? 'AK-47' : 'Пистолет';
    if (p.weapon === 'ak47') {
      if (ammoMag) ammoMag.textContent = String(this.currentMagAmmo);
      if (ammoRes) ammoRes.textContent = String(p.ammoAkReserve);
    } else {
      if (ammoMag) ammoMag.textContent = '∞';
      if (ammoRes) ammoRes.textContent = '∞';
    }

    const moneyEl = document.getElementById('money-display');
    if (moneyEl) moneyEl.textContent = `$${p.money}`;

    const grenadesEl = document.getElementById('grenades-display');
    if (grenadesEl) grenadesEl.textContent = `🧨 x${p.grenadeCount}`;

    const waveEl = document.getElementById('wave-display');
    if (waveEl) waveEl.textContent = `ВОЛНА ${this.wave}/${C.WAVES.length}`;
  }

  addMoney(amount: number) {
    this.localPlayer.money += amount;
    if (amount > 0) {
      this.showKillFeedMessage(`+$${amount}`, '#ffdd44');
    }
    this.updateHUD();
  }

  showKillFeedMessage(msg: string, color: string) {
    const feed = document.getElementById('kill-feed');
    if (!feed) return;

    const el = document.createElement('div');
    el.style.cssText = `
      background:rgba(0,0,0,0.7);border-left:2px solid ${color};padding:4px 8px;
      font-size:12px;color:${color};border-radius:2px;animation:slideUp 0.3s ease;
    `;
    el.textContent = msg;
    feed.appendChild(el);

    setTimeout(() => {
      el.style.animation = 'killFeedOut 0.5s ease forwards';
      setTimeout(() => el.remove(), 500);
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
      display.style.animation = 'flashIn 0.3s ease';

      setTimeout(() => {
        if (display) display.style.opacity = '0';
      }, 3000);
    }
  }

  showWaveAnnounce(text: string, sub: string, duration: number) {
    const announce = document.getElementById('wave-announce');
    const textEl = document.getElementById('wave-announce-text');
    const subEl = document.getElementById('wave-announce-sub');

    if (announce && textEl && subEl) {
      textEl.textContent = text;
      subEl.textContent = sub;
      announce.style.opacity = '1';
      announce.style.animation = 'flashIn 0.3s ease';

      setTimeout(() => {
        if (announce) announce.style.opacity = '0';
      }, duration);
    }
  }

  toggleLeaderboard() {
    this.showLeaderboard = !this.showLeaderboard;
    const lb = document.getElementById('leaderboard');
    if (!lb) return;

    lb.style.display = this.showLeaderboard ? 'block' : 'none';
    if (this.showLeaderboard) {
      this.updateLeaderboard();
    }
  }

  updateLeaderboard() {
    const content = document.getElementById('leaderboard-content');
    if (!content) return;

    const players = [
      { ...this.localPlayer, isLocal: true },
      ...Array.from(this.remotePlayers.values()).map(p => ({ ...p, isLocal: false }))
    ].sort((a, b) => b.kills - a.kills);

    content.innerHTML = players.map((p, i) => `
      <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #333;
        ${(p as any).isLocal ? 'color:#ffdd44;' : 'color:#aaa;'}">
        <span>${i + 1}. ${p.name}</span>
        <span>💀 ${p.kills} | $${p.money}</span>
      </div>
    `).join('');
  }

  showVictory() {
    this.phase = 'victory';
    const screen = document.getElementById('victory-screen')!;
    screen.style.display = 'flex';
    this.spawnFireworks();
  }

  showDefeat() {
    this.phase = 'defeat';
    const screen = document.getElementById('defeat-screen')!;
    screen.style.display = 'flex';
  }

  spawnFireworks() {
    if (this.isDestroyed) return;
    const colors = [0xff4444, 0x44ff44, 0x4444ff, 0xffdd44, 0xff44ff, 0x44ffff];

    for (let fw = 0; fw < 5; fw++) {
      setTimeout(() => {
        if (this.isDestroyed) return;
        const x = randomRange(-20, 20);
        const z = randomRange(-20, 20);

        for (let i = 0; i < 30; i++) {
          const geo = new THREE.SphereGeometry(0.1, 4, 4);
          const mat = new THREE.MeshBasicMaterial({ color: colors[Math.floor(Math.random() * colors.length)] });
          const p = new THREE.Mesh(geo, mat);
          p.position.set(x, 15, z);
          this.scene.add(p);

          const angle = Math.random() * Math.PI * 2;
          const pitch = randomRange(-Math.PI / 2, Math.PI / 2);
          const speed = randomRange(5, 15);
          const vel = {
            x: Math.cos(angle) * Math.cos(pitch) * speed,
            y: Math.sin(pitch) * speed,
            z: Math.sin(angle) * Math.cos(pitch) * speed
          };
          let life = 1.5;

          const updateFw = () => {
            if (this.isDestroyed) { this.scene.remove(p); return; }
            vel.y -= 10 * 0.016;
            p.position.x += vel.x * 0.016;
            p.position.y += vel.y * 0.016;
            p.position.z += vel.z * 0.016;
            life -= 0.016;
            mat.opacity = life / 1.5;
            if (life > 0) requestAnimationFrame(updateFw);
            else this.scene.remove(p);
          };
          updateFw();
        }
      }, fw * 600);
    }

    setTimeout(() => { if (!this.isDestroyed) this.spawnFireworks(); }, 3500);
  }

  // ============================================================
  // MINIMAP
  // ============================================================
  updateMinimap() {
    if (!this.minimapCtx) return;
    const ctx = this.minimapCtx;
    const w = 120, h = 120;
    const scale = w / C.MAP_SIZE;

    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(0, 0, w, h);

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 20, 0); ctx.lineTo(i * 20, h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i * 20); ctx.lineTo(w, i * 20);
      ctx.stroke();
    }

    const worldToMap = (wx: number, wz: number) => ({
      x: (wx + C.MAP_SIZE / 2) * scale,
      y: (wz + C.MAP_SIZE / 2) * scale
    });

    // Obstacles (simplified)
    ctx.fillStyle = 'rgba(100,100,100,0.5)';
    for (const col of this.colBoxes) {
      if (!col.isSolid) continue;
      const b = col.aabb;
      const x1 = (b.min.x + C.MAP_SIZE / 2) * scale;
      const y1 = (b.min.z + C.MAP_SIZE / 2) * scale;
      const x2 = (b.max.x + C.MAP_SIZE / 2) * scale;
      const y2 = (b.max.z + C.MAP_SIZE / 2) * scale;
      ctx.fillRect(x1, y1, x2 - x1, y2 - y1);
    }

    // Zombies
    ctx.fillStyle = '#ff4444';
    for (const [id, z] of this.zombies) {
      if (!z.isAlive) continue;
      const mp = worldToMap(z.position.x, z.position.z);
      ctx.beginPath();
      ctx.arc(mp.x, mp.y, z.type === 'boss' ? 4 : 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Vending machine
    const vm = worldToMap(-12, -28);
    ctx.fillStyle = '#0088ff';
    ctx.fillRect(vm.x - 2, vm.y - 2, 4, 4);

    // Mystery box
    const mb = worldToMap(this.mysteryBoxPos.x, this.mysteryBoxPos.z);
    ctx.fillStyle = '#aa00ff';
    ctx.fillRect(mb.x - 2, mb.y - 2, 4, 4);

    // Remote players
    for (const [id, p] of this.remotePlayers) {
      const mp = worldToMap(p.position.x, p.position.z);
      ctx.fillStyle = '#44ff88';
      ctx.beginPath();
      ctx.arc(mp.x, mp.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Local player (center, with direction indicator)
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
    ctx.lineTo(
      lmp.x + Math.sin(this.yaw) * -8,
      lmp.y + Math.cos(this.yaw) * -8
    );
    ctx.stroke();
  }

  // ============================================================
  // VENDING MACHINE ANIMATION
  // ============================================================
  updateVendingMachine(dt: number) {
    if (!this.vendingScreen) return;
    const t = Date.now() * 0.001;
    const r = Math.sin(t * 3) * 0.5 + 0.5;
    this.vendingScreen.material.color.setRGB(0, r * 0.8 + 0.2, r * 0.4 + 0.4);
  }

  updateMysteryBox(dt: number) {
    if (!this.mysteryBoxMesh) return;
    this.mysteryBoxMesh.rotation.y += dt * 0.8;
    this.mysteryBoxMesh.position.y = Math.sin(Date.now() * 0.002) * 0.15;
  }

  // ============================================================
  // NETWORK SYNC
  // ============================================================
  syncToServer() {
    if (!this.socket || !this.socket.connected) return;

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
    });
  }

  getAlivePlayers(): PlayerState[] {
    const players: PlayerState[] = [];
    if (!this.localPlayer.isDead && !this.localPlayer.isDown) {
      players.push(this.localPlayer);
    }
    for (const [, p] of this.remotePlayers) {
      if (!p.isDead && !p.isDown) players.push(p);
    }
    return players;
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
    this.updateVendingMachine(dt);
    this.updateMysteryBox(dt);
    this.updateMinimap();

    // Wave timer display
    if (this.phase === 'intermission') {
      const el = document.getElementById('wave-timer');
      if (el) el.textContent = 'Готовьтесь к следующей волне...';
    } else if (this.phase === 'waiting') {
      const el = document.getElementById('wave-timer');
      if (el) el.textContent = '';
    } else {
      const el = document.getElementById('wave-timer');
      if (el) el.textContent = '';
    }

    // Network sync at rate
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
  // CLEANUP
  // ============================================================
  destroy() {
    this.isDestroyed = true;

    if (this.socket) {
      this.socket.disconnect();
    }

    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.domElement.parentNode) {
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      }
    }

    // Remove HUD
    const hud = this.container.querySelector('#game-hud');
    if (hud) hud.remove();

    // Remove return button
    const btn = this.container.querySelector('button');
    if (btn) btn.remove();
  }
}

// Register globally
(window as any).ZombieGame = ZombieGame;
