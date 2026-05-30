// ============================================================
// ZOMBIE HORDE — Full Client Game Engine
// Three.js r128 (loaded via CDN in index.html)
// ============================================================

const MAP_SIZE = 80;
const GRAVITY = -20;
const PLAYER_SPEED = 8;
const PLAYER_SPRINT = 14;
const PLAYER_CROUCH = 4;
const JUMP_FORCE = 9;
const PLAYER_HEIGHT = 1.8;
const PLAYER_RADIUS = 0.4;
const MAX_HEALTH = 100;
const NAV_RES = 2;

class GameEngine {
  constructor() {
    this.renderer = null;
    this.scene = null;
    this.camera = null;
    this.clock = null;
    this.animFrame = 0;

    // State
    this.state = null;
    this.localId = 'local';

    // Input
    this.keys = {};
    this.mouse = { dx: 0, dy: 0, left: false, right: false, locked: false };

    // Meshes
    this.playerMeshes = {};
    this.zombieMeshes = {};
    this.projectileMeshes = {};
    this.barricadeMeshes = {};
    this.effectMeshes = [];
    this.staticObstacles = [];
    this.navGrid = null;
    this.navCols = 0;
    this.navRows = 0;

    // Camera control
    this.yaw = 0;
    this.pitch = 0;
    this.camBobT = 0;
    this.playerYVel = 0;
    this.playerOnGround = true;

    // Weapon
    this.gunGroup = null;
    this.muzzleFlash = null;
    this.shootTimer = 0;
    this.pistolTimer = 0;
    this.reloadTimer = 0;
    this.reloadDuration = 2.0;
    this.isReloading = false;

    // Interaction
    this.nearVending = false;
    this.nearMystery = false;
    this.nearTrapIdx = -1;
    this.nearDownPlayer = null;
    this.reviveTimer = 0;
    this.idCounter = 0;

    // Callbacks
    this.onStateChange = null;
    this.onNotify = null;
    this.onWaveAnnounce = null;
    this.onDamage = null;
    this.onVendingOpen = null;
    this.onVendingClose = null;
    this.onKillFeed = null;

    // Minimap
    this.minimapCanvas = null;
    this.minimapCtx = null;

    // Timers
    this.bossPhaseTimer = 0;
    this.trapEffectMeshes = [];
  }

  // ─── Init ────────────────────────────────────────────────────
  init(canvas, minimapCanvas) {
    this.minimapCanvas = minimapCanvas;
    this.minimapCtx = minimapCanvas.getContext('2d');
    this.setupThree(canvas);
    this.buildScene();
    this.buildNavGrid();
    this.initState();
    this.setupInput();
    this.loop();
  }

  setupThree(canvas) {
    this.clock = new THREE.Clock();
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(canvas.clientWidth, canvas.clientHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x87CEEB, 0.012);

    this.camera = new THREE.PerspectiveCamera(75, canvas.clientWidth / canvas.clientHeight, 0.1, 500);
    this.camera.position.set(0, PLAYER_HEIGHT, 0);

    window.addEventListener('resize', () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    });
  }

  // ─── Scene ───────────────────────────────────────────────────
  buildScene() {
    this.buildLighting();
    this.buildSky();
    this.buildGround();
    this.buildMap();
    this.buildVendingMachine();
    this.buildMysteryBox();
    this.buildTraps();
    this.buildGun();
  }

  buildLighting() {
    this.scene.add(new THREE.AmbientLight(0x404060, 0.7));
    const sun = new THREE.DirectionalLight(0xfff8e8, 1.6);
    sun.position.set(40, 80, 30);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 300;
    sun.shadow.camera.left = -80;
    sun.shadow.camera.right = 80;
    sun.shadow.camera.top = 80;
    sun.shadow.camera.bottom = -80;
    sun.shadow.bias = -0.0003;
    this.scene.add(sun);
    this.scene.add(new THREE.DirectionalLight(0x6080ff, 0.3).position.set(-20, 20, -20));
    this.scene.add(new THREE.HemisphereLight(0x87CEEB, 0x556844, 0.5));
  }

  buildSky() {
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(400, 16, 8),
      new THREE.MeshBasicMaterial({ color: 0x87CEEB, side: THREE.BackSide })
    );
    this.scene.add(sky);
    for (let i = 0; i < 10; i++) {
      const cloud = new THREE.Mesh(
        new THREE.PlaneGeometry(20 + Math.random() * 20, 6 + Math.random() * 6),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.65, side: THREE.DoubleSide })
      );
      cloud.rotation.x = Math.PI / 2;
      cloud.position.set((Math.random() - 0.5) * 300, 80 + Math.random() * 40, (Math.random() - 0.5) * 300);
      this.scene.add(cloud);
    }
  }

  buildGround() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(MAP_SIZE * 2, MAP_SIZE * 2),
      new THREE.MeshLambertMaterial({ color: 0x4a5e3a })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const pad = new THREE.Mesh(
      new THREE.PlaneGeometry(MAP_SIZE, MAP_SIZE),
      new THREE.MeshLambertMaterial({ color: 0x777777 })
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.y = 0.01;
    pad.receiveShadow = true;
    this.scene.add(pad);

    const grid = new THREE.GridHelper(MAP_SIZE, MAP_SIZE / 2, 0x555555, 0x555555);
    grid.position.y = 0.02;
    this.scene.add(grid);
  }

  mkBox(w, h, d, color, x, y, z, shadow = true) {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color })
    );
    mesh.position.set(x, y + h / 2, z);
    if (shadow) { mesh.castShadow = true; mesh.receiveShadow = true; }
    this.scene.add(mesh);
    return mesh;
  }

  addObs(minX, maxX, minZ, maxZ) {
    this.staticObstacles.push({ minX, maxX, minZ, maxZ });
  }

  buildMap() {
    const hs = MAP_SIZE / 2;
    const wT = 0.8, wH = 4;

    // Perimeter walls (4 sides, with gate openings on north+south)
    // North wall (2 halves, 6-unit gap)
    this.mkBox(hs - 4, wH, wT, 0x888888, -(4 + (hs - 4) / 2), 0, -hs);
    this.mkBox(hs - 4, wH, wT, 0x888888, (4 + (hs - 4) / 2), 0, -hs);
    this.addObs(-hs, -4, -hs - 1, -hs + 0.5);
    this.addObs(4, hs, -hs - 1, -hs + 0.5);
    // South wall
    this.mkBox(hs - 4, wH, wT, 0x888888, -(4 + (hs - 4) / 2), 0, hs);
    this.mkBox(hs - 4, wH, wT, 0x888888, (4 + (hs - 4) / 2), 0, hs);
    this.addObs(-hs, -4, hs - 0.5, hs + 1);
    this.addObs(4, hs, hs - 0.5, hs + 1);
    // East+West full walls
    this.mkBox(wT, wH, MAP_SIZE, 0x888888, -hs, 0, 0);
    this.addObs(-hs - 1, -hs + 0.5, -hs, hs);
    this.mkBox(wT, wH, MAP_SIZE, 0x888888, hs, 0, 0);
    this.addObs(hs - 0.5, hs + 1, -hs, hs);

    // ── Building 1: Command Center (northwest) ──
    this.buildBuilding(-25, -20, 14, 10, 6, 0x777777, 0x666666);

    // ── Building 2: Armory (northeast) ──
    this.buildBuilding(25, -20, 12, 10, 5, 0x887766, 0x776655);

    // ── Building 3: Barracks (south) ──
    this.buildBuilding(0, 22, 18, 8, 4, 0x997766, 0x886655);

    // ── Cover barriers ──
    const barriers = [
      [-10, 5, 4, 1, 1.5], [10, 5, 4, 1, 1.5], [0, 10, 1, 4, 1.5],
      [-18, 10, 1, 4, 1.5], [18, 10, 1, 4, 1.5],
      [-10, -5, 4, 1, 1.2], [10, -5, 4, 1, 1.2], [0, -10, 1, 4, 1.2],
      [-20, 0, 1, 6, 1.8], [20, 0, 1, 6, 1.8],
    ];
    for (const [bx, bz, bw, bd, bh] of barriers) {
      this.mkBox(bw, bh, bd, 0x999999, bx, 0, bz);
      this.addObs(bx - bw / 2, bx + bw / 2, bz - bd / 2, bz + bd / 2);
    }

    // ── Crates ──
    const crates = [
      [-12, 12, 1], [12, 12, 1], [-8, 15, 1.2], [8, 15, 1.2],
      [-30, 5, 1], [-30, 8, 1], [30, 5, 1], [30, 8, 1],
      [-5, -8, 1], [5, -8, 1], [-15, -15, 1], [15, -15, 1],
      [-22, -25, 1.1], [22, -25, 1.1], [0, -25, 1],
    ];
    for (const [cx, cz, cs] of crates) {
      const c = new THREE.Mesh(
        new THREE.BoxGeometry(cs, cs, cs),
        new THREE.MeshLambertMaterial({ color: 0x8B5A2B })
      );
      c.position.set(cx, cs / 2, cz);
      c.castShadow = true; c.receiveShadow = true;
      this.scene.add(c);
      this.addObs(cx - cs / 2, cx + cs / 2, cz - cs / 2, cz + cs / 2);
    }

    // ── Watchtower (SE) ──
    this.mkBox(3, 8, 3, 0x777755, 28, 0, 28);
    this.mkBox(7, 0.4, 7, 0x888866, 28, 8, 28);
    this.addObs(26.5, 29.5, 26.5, 29.5);

    // ── Sandbag bunkers ──
    for (const [bx, bz] of [[-15, -30], [15, -30], [0, -30], [-30, -5], [30, -5]]) {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI;
        const sb = new THREE.Mesh(
          new THREE.BoxGeometry(1.2, 0.7, 0.6),
          new THREE.MeshLambertMaterial({ color: 0x8B7355 })
        );
        sb.position.set(bx + Math.cos(a) * 2.2, 0.35, bz + Math.sin(a) * 2.2);
        sb.rotation.y = a;
        sb.castShadow = true;
        this.scene.add(sb);
      }
      this.addObs(bx - 2.8, bx + 2.8, bz - 2.8, bz + 2.8);
    }

    // ── Fuel tanks ──
    for (const [tx, tz] of [[-32, -32], [32, -32]]) {
      const tank = new THREE.Mesh(
        new THREE.CylinderGeometry(1.2, 1.2, 3, 12),
        new THREE.MeshLambertMaterial({ color: 0xaa4422 })
      );
      tank.position.set(tx, 1.5, tz);
      tank.castShadow = true;
      this.scene.add(tank);
      this.addObs(tx - 1.3, tx + 1.3, tz - 1.3, tz + 1.3);
    }

    // ── Street lights ──
    for (let i = -3; i <= 3; i++) {
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.05, 0.05, 4, 6),
        new THREE.MeshLambertMaterial({ color: 0x444444 })
      );
      pole.position.set(i * 8, 2, 0);
      this.scene.add(pole);
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.18, 6, 6),
        new THREE.MeshBasicMaterial({ color: 0xffffcc })
      );
      bulb.position.set(i * 8, 4.1, 0);
      this.scene.add(bulb);
      const ptL = new THREE.PointLight(0xffffcc, 0.7, 10);
      ptL.position.set(i * 8, 4, 0);
      this.scene.add(ptL);
    }

    // ── Center flagpole ──
    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 8, 8),
      new THREE.MeshLambertMaterial({ color: 0x999999 })
    );
    pole.position.set(0, 4, 0);
    this.scene.add(pole);
    const flag = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 1.2),
      new THREE.MeshBasicMaterial({ color: 0xcc2222, side: THREE.DoubleSide })
    );
    flag.position.set(1, 7.5, 0);
    this.scene.add(flag);
    this.flagMesh = flag;
  }

  buildBuilding(cx, cz, w, d, h, wallColor, roofColor) {
    const halfW = w / 2, halfD = d / 2;
    const wallT = 0.5;
    // 4 walls (with door opening on south wall)
    this.mkBox(w, h, wallT, wallColor, cx, 0, cz - halfD); // north
    this.mkBox(w / 2 - 1, h, wallT, wallColor, cx - (1 + w / 4), 0, cz + halfD); // south left
    this.mkBox(w / 2 - 1, h, wallT, wallColor, cx + (1 + w / 4), 0, cz + halfD); // south right
    this.mkBox(wallT, h, d, wallColor, cx - halfW, 0, cz); // west
    this.mkBox(wallT, h, d, wallColor, cx + halfW, 0, cz); // east
    this.mkBox(w + wallT, 0.4, d + wallT, roofColor, cx, h, cz); // roof
    this.addObs(cx - halfW, cx + halfW, cz - halfD, cz + halfD);
  }

  buildVendingMachine() {
    const vx = -18, vz = -18;
    this.mkBox(1.2, 2.4, 0.8, 0x1a3a1a, vx, 0, vz);
    const scr = new THREE.Mesh(
      new THREE.PlaneGeometry(0.7, 0.5),
      new THREE.MeshBasicMaterial({ color: 0x00ff44 })
    );
    scr.position.set(vx, 1.6, vz + 0.41);
    this.scene.add(scr);
    this.vendingScreen = scr;
    const vl = new THREE.PointLight(0x00ff44, 1.5, 10);
    vl.position.set(vx, 2, vz + 1);
    this.scene.add(vl);
    this.addObs(vx - 0.6, vx + 0.6, vz - 0.4, vz + 0.4);
    setInterval(() => {
      const c = [0x00ff44, 0x00cc33, 0x44ff88][Math.floor(Math.random() * 3)];
      scr.material.color.setHex(c);
    }, 400);
  }

  buildMysteryBox() {
    const mx = 18, mz = 18;
    this.mysteryBoxMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 1.2, 1.2),
      new THREE.MeshLambertMaterial({ color: 0x330066 })
    );
    this.mysteryBoxMesh.position.set(mx, 0.6, mz);
    this.mysteryBoxMesh.castShadow = true;
    this.scene.add(this.mysteryBoxMesh);
    const gl = new THREE.PointLight(0x9900ff, 2.5, 12);
    gl.position.set(mx, 1.5, mz);
    this.scene.add(gl);
    this.mysteryBoxLight = gl;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.9, 0.06, 8, 20),
      new THREE.MeshBasicMaterial({ color: 0xcc44ff, wireframe: true })
    );
    ring.position.set(mx, 1.8, mz);
    this.scene.add(ring);
    this.mysteryRing = ring;
    this.addObs(mx - 0.6, mx + 0.6, mz - 0.6, mz + 0.6);
  }

  buildTraps() {
    // Trap 1: electric near north gate
    const t1 = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.3, 1.5),
      new THREE.MeshLambertMaterial({ color: 0x222244 })
    );
    t1.position.set(-8, 0.15, -35);
    this.scene.add(t1);
    const l1 = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0x4444ff })
    );
    l1.position.set(-8, 0.55, -35);
    this.scene.add(l1);
    this.trap1Light = l1;

    // Trap 2: flamethrower center
    const t2 = new THREE.Mesh(
      new THREE.BoxGeometry(1.5, 0.3, 1.5),
      new THREE.MeshLambertMaterial({ color: 0x442200 })
    );
    t2.position.set(8, 0.15, -8);
    this.scene.add(t2);
    const l2 = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 6, 6),
      new THREE.MeshBasicMaterial({ color: 0xff4400 })
    );
    l2.position.set(8, 0.55, -8);
    this.scene.add(l2);
    this.trap2Light = l2;
  }

  buildGun() {
    this.gunGroup = new THREE.Group();

    const mat = new THREE.MeshLambertMaterial({ color: 0x222222 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.1, 0.6), mat);
    this.gunGroup.add(body);

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 8), mat);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.01, -0.5);
    this.gunGroup.add(barrel);

    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.08), mat);
    mag.position.set(0, -0.12, 0.05);
    this.gunGroup.add(mag);

    const flashMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 0 });
    this.muzzleFlash = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), flashMat);
    this.muzzleFlash.position.set(0, 0.01, -0.78);
    this.gunGroup.add(this.muzzleFlash);

    this.gunGroup.position.set(0.25, -0.18, -0.4);
    this.camera.add(this.gunGroup);
    this.scene.add(this.camera);
  }

  // ─── NavGrid ─────────────────────────────────────────────────
  buildNavGrid() {
    const hs = MAP_SIZE / 2;
    this.navCols = Math.ceil(MAP_SIZE / NAV_RES);
    this.navRows = Math.ceil(MAP_SIZE / NAV_RES);
    this.navGrid = new Uint8Array(this.navCols * this.navRows);

    for (let r = 0; r < this.navRows; r++) {
      for (let c = 0; c < this.navCols; c++) {
        const wx = -hs + c * NAV_RES + NAV_RES / 2;
        const wz = -hs + r * NAV_RES + NAV_RES / 2;
        let blocked = Math.abs(wx) >= hs - 0.5 || Math.abs(wz) >= hs - 0.5;
        if (!blocked) {
          for (const ob of this.staticObstacles) {
            if (wx + 0.5 > ob.minX && wx - 0.5 < ob.maxX && wz + 0.5 > ob.minZ && wz - 0.5 < ob.maxZ) {
              blocked = true; break;
            }
          }
        }
        this.navGrid[r * this.navCols + c] = blocked ? 1 : 0;
      }
    }
  }

  wToNav(x, z) {
    const hs = MAP_SIZE / 2;
    return [
      Math.max(0, Math.min(this.navCols - 1, Math.floor((x + hs) / NAV_RES))),
      Math.max(0, Math.min(this.navRows - 1, Math.floor((z + hs) / NAV_RES))),
    ];
  }

  navToW(c, r) {
    const hs = MAP_SIZE / 2;
    return { x: -hs + c * NAV_RES + NAV_RES / 2, z: -hs + r * NAV_RES + NAV_RES / 2 };
  }

  isBlocked(c, r, barricades) {
    if (c < 0 || c >= this.navCols || r < 0 || r >= this.navRows) return true;
    if (this.navGrid[r * this.navCols + c]) return true;
    const wpos = this.navToW(c, r);
    for (const b of barricades) {
      if (Math.abs(wpos.x - b.pos.x) < 1.2 && Math.abs(wpos.z - b.pos.z) < 1.2) return true;
    }
    return false;
  }

  findPath(sx, sz, ex, ez, barricades) {
    const [sc, sr] = this.wToNav(sx, sz);
    const [ec, er] = this.wToNav(ex, ez);
    if (sc === ec && sr === er) return [{ x: ex, z: ez }];

    const key = (c, r) => r * this.navCols + c;
    const open = [{ c: sc, r: sr, g: 0, f: Math.abs(sc - ec) + Math.abs(sr - er) }];
    const gScore = new Map([[key(sc, sr), 0]]);
    const parent = new Map([[key(sc, sr), null]]);
    const closed = new Set();
    const dirs = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
    let iter = 0;

    while (open.length > 0 && iter++ < 500) {
      open.sort((a, b) => a.f - b.f);
      const cur = open.shift();
      const ck = key(cur.c, cur.r);
      if (closed.has(ck)) continue;
      closed.add(ck);

      if (cur.c === ec && cur.r === er) {
        const path = [];
        let k = [ec, er];
        while (k) {
          path.unshift(this.navToW(k[0], k[1]));
          const pk = parent.get(key(k[0], k[1]));
          k = pk;
        }
        const result = [];
        for (let i = 1; i < path.length; i += 2) result.push(path[i]);
        result.push({ x: ex, z: ez });
        return result;
      }

      for (const [dc, dr] of dirs) {
        const nc = cur.c + dc, nr = cur.r + dr;
        const nk = key(nc, nr);
        if (closed.has(nk) || this.isBlocked(nc, nr, barricades)) continue;
        const ng = (gScore.get(ck) ?? 999) + (dc !== 0 && dr !== 0 ? 1.414 : 1);
        if (ng < (gScore.get(nk) ?? Infinity)) {
          gScore.set(nk, ng);
          parent.set(nk, [nc, nr]);
          open.push({ c: nc, r: nr, g: ng, f: ng + Math.abs(nc - ec) + Math.abs(nr - er) });
        }
      }
    }
    return [{ x: ex, z: ez }];
  }

  // ─── State Init ──────────────────────────────────────────────
  initState() {
    this.state = {
      wave: 0, maxWave: 10,
      phase: 'menu',
      zombiesLeft: 0, totalZombies: 0,
      countdownTimer: 0,
      players: {},
      zombies: {},
      projectiles: {},
      barricades: {},
      traps: [
        { id: 't1', pos: { x: -8, z: -35 }, type: 'electric', active: false, timer: 0 },
        { id: 't2', pos: { x: 8, z: -8 }, type: 'flamethrower', active: false, timer: 0 },
      ],
      acidPools: [],
      mysteryBox: { pos: { x: 18, z: 18 }, active: true },
      vendingMachine: { pos: { x: -18, z: -18 } },
    };
  }

  // ─── Start Game ──────────────────────────────────────────────
  startGame(playerName = 'Survivor') {
    this.localId = 'local';
    const p = this.createPlayer(this.localId, playerName || 'Survivor');
    this.state.players[this.localId] = p;
    this.state.phase = 'intermission';
    this.state.wave = 0;
    this.state.countdownTimer = 5;
    this.requestPointerLock();
    setTimeout(() => this.startWave(1), 5000);
  }

  createPlayer(id, name) {
    return {
      id, name,
      pos: { x: (Math.random() - 0.5) * 8, y: 0, z: (Math.random() - 0.5) * 8 },
      rot: 0,
      hp: MAX_HEALTH, maxHp: MAX_HEALTH,
      ammoAK: 90, maxAmmoAK: 210, magAK: 30, maxMagAK: 30,
      money: 100, kills: 0, combo: 0,
      weapon: 'ak',
      state: 'alive',
      isReloading: false, isCrouching: false, isSprinting: false,
      boosts: { speed: 0, damage: 0 },
      barrCount: 0,
      wpUpgrades: { ak: { dmg: 1, rate: 1, mag: 30 }, pistol: { dmg: 1 } },
      grenades: 0,
      downTimer: 0,
    };
  }

  // ─── Wave Mgmt ───────────────────────────────────────────────
  startWave(wave) {
    if (wave > this.state.maxWave) { this.triggerVictory(); return; }
    this.state.wave = wave;
    this.state.phase = 'wave';
    const count = this.spawnWave(wave);
    this.state.zombiesLeft = count;
    this.state.totalZombies = count;
    const isBoss = wave === 10;
    this.onWaveAnnounce?.(wave, isBoss ? '⚠️ BOSS WAVE — SHIRIBAZAROV AWAKENS ⚠️' : `${count} enemies incoming!`);
    this.notify(`Wave ${wave} started!`, 'warning');
  }

  spawnWave(wave) {
    const base = 5 + wave * 3;
    const hpM = 1 + (wave - 1) * 0.3;
    const dmgM = 1 + (wave - 1) * 0.2;
    const spdM = 1 + (wave - 1) * 0.05;
    const spawnPoints = [
      { x: -36, z: -36 }, { x: 0, z: -38 }, { x: 36, z: -36 },
      { x: -38, z: 0 }, { x: 38, z: 0 },
      { x: -36, z: 36 }, { x: 0, z: 38 }, { x: 36, z: 36 },
    ];

    let count = 0;
    for (let i = 0; i < base; i++) {
      const sp = spawnPoints[i % spawnPoints.length];
      const jx = sp.x + (Math.random() - 0.5) * 4;
      const jz = sp.z + (Math.random() - 0.5) * 4;
      let type = 'normal';
      if (wave >= 3 && i % 5 === 0) type = 'acid';
      else if (wave >= 2 && i % 4 === 0) type = 'exploder';
      this.spawnZombie(type, jx, jz, hpM, dmgM, spdM);
      count++;
    }
    if (wave === 10) {
      this.spawnZombie('boss', 0, -36, hpM * 5, dmgM * 2, 0.7);
      count++;
    }
    return count;
  }

  spawnZombie(type, x, z, hpM, dmgM, spdM) {
    const id = 'z_' + (++this.idCounter);
    const baseHp = { normal: 80, exploder: 60, acid: 70, boss: 1800 };
    const baseDmg = { normal: 8, exploder: 35, acid: 12, boss: 25 };
    const baseSpd = { normal: 2.5, exploder: 3.2, acid: 2.0, boss: 1.5 };
    const hp = Math.round(baseHp[type] * hpM);
    this.state.zombies[id] = {
      id, type,
      pos: { x, z },
      rot: Math.random() * Math.PI * 2,
      hp, maxHp: hp,
      state: 'alive',
      targetId: '',
      dmgContribs: {},
      attackTimer: 0,
      speed: baseSpd[type] * spdM,
      dmg: baseDmg[type] * dmgM,
      pathTimer: 0,
      waypoint: null,
      bossPhase: 0,
      bossTimer: 5,
    };
    this.createZombieMesh(id, type);
  }

  // ─── Meshes ──────────────────────────────────────────────────
  createZombieMesh(id, type) {
    const colors = { normal: 0x2d5a1b, exploder: 0x8b2500, acid: 0x1a6b1a, boss: 0x3d0b3d };
    const sc = type === 'boss' ? 2.5 : 1;
    const g = new THREE.Group();

    const mat = new THREE.MeshLambertMaterial({ color: colors[type] });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6 * sc, 1.0 * sc, 0.3 * sc), mat.clone());
    body.position.y = 0.8 * sc; body.castShadow = true;
    g.add(body);

    const headMat = new THREE.MeshLambertMaterial({ color: type === 'boss' ? 0x5d0b5d : 0x3d7a2b });
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.45 * sc, 0.45 * sc, 0.45 * sc), headMat);
    head.position.y = 1.65 * sc; head.castShadow = true;
    g.add(head);

    const eyeM = new THREE.MeshBasicMaterial({ color: type === 'acid' ? 0x00ff00 : type === 'boss' ? 0xff00ff : 0xff2200 });
    const eyeG = new THREE.SphereGeometry(0.05 * sc, 4, 4);
    const eL = new THREE.Mesh(eyeG, eyeM); eL.position.set(-0.1 * sc, 1.7 * sc, 0.23 * sc); g.add(eL);
    const eR = new THREE.Mesh(eyeG, eyeM); eR.position.set(0.1 * sc, 1.7 * sc, 0.23 * sc); g.add(eR);

    const armMat = mat.clone();
    const armG = new THREE.BoxGeometry(0.2 * sc, 0.7 * sc, 0.2 * sc);
    const aL = new THREE.Mesh(armG, armMat); aL.position.set(-0.48 * sc, 0.8 * sc, 0); aL.rotation.z = 0.3; g.add(aL);
    const aR = new THREE.Mesh(armG, armMat); aR.position.set(0.48 * sc, 0.8 * sc, 0); aR.rotation.z = -0.3; g.add(aR);

    const legMat = new THREE.MeshLambertMaterial({ color: 0x1a3a0a });
    const legG = new THREE.BoxGeometry(0.25 * sc, 0.7 * sc, 0.25 * sc);
    const lL = new THREE.Mesh(legG, legMat); lL.position.set(-0.15 * sc, 0.35 * sc, 0); g.add(lL);
    const lR = new THREE.Mesh(legG, legMat); lR.position.set(0.15 * sc, 0.35 * sc, 0); g.add(lR);

    if (type === 'boss') {
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const spike = new THREE.Mesh(
          new THREE.ConeGeometry(0.1, 0.5, 4),
          new THREE.MeshBasicMaterial({ color: 0xff00ff })
        );
        spike.position.set(Math.cos(a) * 0.8, 1.2, Math.sin(a) * 0.8);
        spike.rotation.z = Math.cos(a) * Math.PI / 2;
        g.add(spike);
      }
    }
    if (type === 'acid') {
      const sac = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0x00ff44, transparent: true, opacity: 0.7 })
      );
      sac.position.set(0, 0.9, 0.22);
      g.add(sac);
    }

    // HP bar
    const hbBg = new THREE.Mesh(
      new THREE.PlaneGeometry(1.0 * sc, 0.1 * sc),
      new THREE.MeshBasicMaterial({ color: 0x330000, side: THREE.DoubleSide })
    );
    hbBg.position.y = 2.4 * sc;
    g.add(hbBg);

    const hbFill = new THREE.Mesh(
      new THREE.PlaneGeometry(1.0 * sc, 0.09 * sc),
      new THREE.MeshBasicMaterial({ color: 0x00ff00, side: THREE.DoubleSide })
    );
    hbFill.position.set(0, 2.4 * sc, 0.001);
    g.add(hbFill);

    const zs = this.state.zombies[id];
    if (zs) g.position.set(zs.pos.x, 0, zs.pos.z);
    this.scene.add(g);
    this.zombieMeshes[id] = { g, body, head, aL, aR, lL, lR, hbFill, hbBg, sc, animT: 0, attackAnimT: 0 };
  }

  // ─── Input ───────────────────────────────────────────────────
  setupInput() {
    const canvas = this.renderer.domElement;

    document.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'KeyE') this.handleInteract();
      if (e.code === 'Digit1') this.switchWeapon('ak');
      if (e.code === 'Digit2') this.switchWeapon('pistol');
      if (e.code === 'KeyR') this.startReload();
      if (e.code === 'KeyG') this.throwGrenade();
      if (e.code === 'KeyB') this.placeBarricade();
      if (e.code === 'Tab') e.preventDefault();
    });

    document.addEventListener('keyup', (e) => { this.keys[e.code] = false; });

    document.addEventListener('mousemove', (e) => {
      if (this.mouse.locked) {
        this.mouse.dx += e.movementX;
        this.mouse.dy += e.movementY;
      }
    });

    document.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouse.left = true;
      if (e.button === 2) this.mouse.right = true;
      if (!this.mouse.locked && this.state.phase === 'wave') this.requestPointerLock();
    });

    document.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });

    document.addEventListener('pointerlockchange', () => {
      this.mouse.locked = !!document.pointerLockElement;
    });

    document.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  requestPointerLock() {
    this.renderer.domElement.requestPointerLock?.();
  }

  // ─── Main Loop ───────────────────────────────────────────────
  loop() {
    this.animFrame = requestAnimationFrame(() => this.loop());
    const dt = Math.min(this.clock.getDelta(), 0.05);
    if (this.state.phase === 'wave' || this.state.phase === 'intermission') {
      this.update(dt);
    }
    this.render(dt);
    this.updateMinimap();
    this.onStateChange?.(this.state, this.state.players[this.localId] || null);
  }

  // ─── Update ──────────────────────────────────────────────────
  update(dt) {
    const local = this.state.players[this.localId];
    if (!local) return;

    // Animate environment
    if (this.mysteryRing) { this.mysteryRing.rotation.y += dt * 1.5; this.mysteryRing.rotation.x += dt * 0.7; }
    if (this.flagMesh) this.flagMesh.rotation.y = Math.sin(Date.now() * 0.001) * 0.2;

    if (local.state === 'alive') {
      this.updatePlayer(dt, local);
      this.handleShooting(dt, local);
    } else if (local.state === 'down') {
      this.updateDown(dt, local);
    }

    this.updateRevive(dt, local);
    this.updateZombies(dt);
    this.updateProjectiles(dt);
    this.updateTraps(dt);
    this.updateAcidPools(dt);
    this.updateEffects(dt);
    this.updateBoosts(dt, local);
    this.checkWaveEnd();
  }

  // ─── Player ──────────────────────────────────────────────────
  updatePlayer(dt, p) {
    if (!this.mouse.locked) { this.mouse.dx = 0; this.mouse.dy = 0; return; }

    const aimSens = this.mouse.right ? 0.0015 : 0.003;
    this.yaw -= this.mouse.dx * aimSens;
    this.pitch = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, this.pitch - this.mouse.dy * aimSens));
    this.mouse.dx = 0; this.mouse.dy = 0;

    const crouching = this.keys['ControlLeft'] || this.keys['ControlRight'];
    const sprinting = this.keys['ShiftLeft'] && !crouching;
    p.isCrouching = crouching;
    p.isSprinting = sprinting;

    const baseSpd = crouching ? PLAYER_CROUCH : sprinting ? PLAYER_SPRINT : PLAYER_SPEED;
    const spd = baseSpd * (p.boosts.speed > 0 ? 1.5 : 1) * dt;

    const fwd = { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
    const rgt = { x: Math.cos(this.yaw), z: -Math.sin(this.yaw) };
    let mx = 0, mz = 0;
    if (this.keys['KeyW']) { mx += fwd.x; mz += fwd.z; }
    if (this.keys['KeyS']) { mx -= fwd.x; mz -= fwd.z; }
    if (this.keys['KeyA']) { mx -= rgt.x; mz -= rgt.z; }
    if (this.keys['KeyD']) { mx += rgt.x; mz += rgt.z; }
    const len = Math.sqrt(mx * mx + mz * mz);
    if (len > 0) { mx /= len; mz /= len; }

    if (this.keys['Space'] && this.playerOnGround) { this.playerYVel = JUMP_FORCE; this.playerOnGround = false; }
    this.playerYVel += GRAVITY * dt;
    p.pos.y = (p.pos.y || 0) + this.playerYVel * dt;
    if (p.pos.y <= 0) { p.pos.y = 0; this.playerYVel = 0; this.playerOnGround = true; }

    const r = PLAYER_RADIUS;
    const nx = p.pos.x + mx * spd, nz = p.pos.z + mz * spd;
    if (!this.collideStatic(nx, p.pos.z, r) && !this.collideBarricades(nx, p.pos.z, r)) p.pos.x = nx;
    if (!this.collideStatic(p.pos.x, nz, r) && !this.collideBarricades(p.pos.x, nz, r)) p.pos.z = nz;

    const maxP = MAP_SIZE / 2 - 1;
    p.pos.x = Math.max(-maxP, Math.min(maxP, p.pos.x));
    p.pos.z = Math.max(-maxP, Math.min(maxP, p.pos.z));

    const eyeH = crouching ? PLAYER_HEIGHT * 0.6 : PLAYER_HEIGHT;
    this.camBobT += (sprinting ? 12 : len > 0 ? 8 : 0) * dt;
    const bob = len > 0 ? Math.sin(this.camBobT) * (sprinting ? 0.08 : 0.04) : 0;

    this.camera.position.set(p.pos.x, p.pos.y + eyeH + bob, p.pos.z);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
    this.camera.rotation.z = 0;
    p.rot = this.yaw;

    if (p.isReloading) {
      this.reloadTimer += dt;
      if (this.reloadTimer >= this.reloadDuration) this.finishReload(p);
    }

    this.checkNearby(p);

    // Acid pool damage
    for (const pool of this.state.acidPools) {
      const d = Math.hypot(p.pos.x - pool.x, p.pos.z - pool.z);
      if (d < pool.r) this.damagePlayer(this.localId, 5 * dt);
    }

    // Zombie melee
    for (const z of Object.values(this.state.zombies)) {
      if (z.state !== 'alive') continue;
      const d = Math.hypot(p.pos.x - z.pos.x, p.pos.z - z.pos.z);
      if (d < 1.3 * (z.type === 'boss' ? 2.5 : 1) && z.attackTimer <= 0) {
        this.damagePlayer(this.localId, z.dmg);
        z.attackTimer = 1.5;
      }
    }
  }

  collideStatic(x, z, r) {
    for (const ob of this.staticObstacles) {
      if (x + r > ob.minX && x - r < ob.maxX && z + r > ob.minZ && z - r < ob.maxZ) return true;
    }
    return false;
  }

  collideBarricades(x, z, r) {
    for (const b of Object.values(this.state.barricades)) {
      if (x + r > b.pos.x - 0.65 && x - r < b.pos.x + 0.65 && z + r > b.pos.z - 0.65 && z - r < b.pos.z + 0.65) return true;
    }
    return false;
  }

  updateDown(dt, p) {
    p.downTimer = (p.downTimer || 15) - dt;
    if (p.downTimer <= 0) {
      p.state = 'dead';
      this.notify('You died! Respawning...', 'error');
      setTimeout(() => { p.state = 'alive'; p.hp = 50; p.pos.x = 0; p.pos.z = 0; p.downTimer = 15; }, 10000);
    }
    // Crawl
    if (this.mouse.locked) {
      const fwd = { x: -Math.sin(this.yaw), z: -Math.cos(this.yaw) };
      if (this.keys['KeyW']) { p.pos.x += fwd.x * 1.5 * dt; p.pos.z += fwd.z * 1.5 * dt; }
    }
  }

  updateRevive(dt, local) {
    if (local.state !== 'alive') return;
    this.nearDownPlayer = null;
    for (const [pid, p] of Object.entries(this.state.players)) {
      if (pid === this.localId || p.state !== 'down') continue;
      if (Math.hypot(local.pos.x - p.pos.x, local.pos.z - p.pos.z) < 2.5) { this.nearDownPlayer = pid; break; }
    }
    if (this.nearDownPlayer && this.keys['KeyE']) {
      this.reviveTimer += dt;
      if (this.reviveTimer >= 3) {
        const t = this.state.players[this.nearDownPlayer];
        if (t) { t.state = 'alive'; t.hp = MAX_HEALTH * 0.5; t.downTimer = 15; this.notify(`${t.name} revived!`, 'success'); }
        this.reviveTimer = 0;
      }
    } else { this.reviveTimer = 0; }
  }

  damagePlayer(id, dmg) {
    const p = this.state.players[id];
    if (!p || p.state === 'dead') return;
    p.hp -= dmg;
    if (id === this.localId) this.onDamage?.();
    if (p.hp <= 0) {
      p.hp = 0;
      if (p.state === 'alive') {
        p.state = 'down';
        p.downTimer = 15;
        if (id === this.localId) this.notify('⚠️ YOU ARE DOWN! Ally can revive!', 'error');
      }
    }
  }

  // ─── Shooting ────────────────────────────────────────────────
  handleShooting(dt, p) {
    this.shootTimer -= dt;
    this.pistolTimer -= dt;
    if (!this.mouse.left || p.isReloading || p.state !== 'alive') return;

    if (p.weapon === 'ak') {
      const rate = 0.1 / p.wpUpgrades.ak.rate;
      if (this.shootTimer <= 0) {
        if (p.magAK > 0) {
          this.shootTimer = rate;
          p.magAK--;
          this.showFlash();
          const dmg = 25 * p.wpUpgrades.ak.dmg * (p.boosts.damage > 0 ? 1.3 : 1);
          this.castRay(p, dmg);
          p.combo = p.combo;
        } else if (p.ammoAK > 0) {
          this.startReload();
        } else {
          this.notify('No ammo!', 'error');
        }
      }
    } else {
      if (this.pistolTimer <= 0) {
        this.pistolTimer = 0.5;
        this.showFlash();
        const dmg = 20 * p.wpUpgrades.pistol.dmg * (p.boosts.damage > 0 ? 1.3 : 1);
        this.castRay(p, dmg);
      }
    }
  }

  showFlash() {
    if (!this.muzzleFlash) return;
    this.muzzleFlash.material.opacity = 1;
    setTimeout(() => { if (this.muzzleFlash) this.muzzleFlash.material.opacity = 0; }, 50);
    this.spawnTracer();
  }

  spawnTracer() {
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const geo = new THREE.CylinderGeometry(0.008, 0.008, 2.5, 4);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffee88, transparent: true, opacity: 0.8 });
    const t = new THREE.Mesh(geo, mat);
    t.position.copy(this.camera.position).addScaledVector(dir, 3);
    t.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    this.scene.add(t);
    this.effectMeshes.push({ mesh: t, timer: 0.08, type: 'tracer' });
  }

  castRay(p, damage) {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);

    let hit = false;
    // Check against zombie groups
    for (const [zid, zm] of Object.entries(this.zombieMeshes)) {
      const z = this.state.zombies[zid];
      if (!z || z.state !== 'alive') continue;

      // Simple sphere-ray test for performance
      const zCenter = new THREE.Vector3(z.pos.x, z.type === 'boss' ? 2.0 : 0.9, z.pos.z);
      const hitR = z.type === 'boss' ? 2.2 : 1.0;
      const dist = raycaster.ray.distanceToPoint(zCenter);
      const rayDist = raycaster.ray.origin.distanceTo(zCenter);

      if (dist < hitR && rayDist < 100 && rayDist > 0.5) {
        const hitPt = raycaster.ray.origin.clone().addScaledVector(raycaster.ray.direction, rayDist);
        this.hitZombie(zid, damage, p.id);
        this.spawnBlood(hitPt);
        hit = true;
        break;
      }
    }

    if (!hit) {
      // Wall spark
      const hits = raycaster.intersectObjects(this.scene.children, false);
      if (hits.length > 0 && hits[0].distance < 80) {
        this.spawnSpark(hits[0].point);
        // Miss resets combo
        const pl = this.state.players[this.localId];
        if (pl) pl.combo = 0;
      }
    }
  }

  hitZombie(zid, dmg, pid) {
    const z = this.state.zombies[zid];
    if (!z || z.state !== 'alive') return;
    z.hp -= dmg;
    z.dmgContribs[pid] = (z.dmgContribs[pid] || 0) + dmg;

    const zm = this.zombieMeshes[zid];
    if (zm) {
      zm.body.material.color.setHex(0xff5555);
      setTimeout(() => {
        const zz = this.state.zombies[zid];
        if (zz && zm.body) {
          const cols = { normal: 0x2d5a1b, exploder: 0x8b2500, acid: 0x1a6b1a, boss: 0x3d0b3d };
          zm.body.material.color.setHex(cols[zz.type]);
        }
      }, 80);
    }

    if (z.hp <= 0) this.killZombie(zid, pid);
  }

  killZombie(zid, killerId) {
    const z = this.state.zombies[zid];
    if (!z || z.state !== 'alive') return;
    z.state = 'dying';

    // Find top dmg contributor
    let topId = killerId, topDmg = 0;
    for (const [pid, d] of Object.entries(z.dmgContribs)) {
      if (d > topDmg) { topDmg = d; topId = pid; }
    }

    const totalDmg = Object.values(z.dmgContribs).reduce((a, b) => a + b, 0);
    const rewards = { normal: 10, exploder: 20, acid: 25, boss: 200 };
    for (const [pid, d] of Object.entries(z.dmgContribs)) {
      const pl = this.state.players[pid];
      if (pl && totalDmg > 0) pl.money += Math.round(rewards[z.type] * d / totalDmg);
    }

    const killer = this.state.players[topId];
    if (killer) {
      killer.kills++;
      killer.combo++;
      this.checkCombo(killer);
      this.onKillFeed?.(`${killer.name} killed ${z.type} zombie (+$${rewards[z.type]})`);
    }

    if (z.type === 'exploder') this.explodeZombie(z);
    if (z.type === 'boss') setTimeout(() => this.triggerVictory(), 2000);

    if (Math.random() < 0.1) this.spawnHealthDrop(z.pos);
    this.spawnDeathFX(z.pos, z.type);
    this.state.zombiesLeft = Math.max(0, this.state.zombiesLeft - 1);

    setTimeout(() => {
      const zm = this.zombieMeshes[zid];
      if (zm) { this.scene.remove(zm.g); delete this.zombieMeshes[zid]; }
      delete this.state.zombies[zid];
    }, 700);
  }

  explodeZombie(z) {
    const c3 = new THREE.Vector3(z.pos.x, 0.5, z.pos.z);
    this.spawnExplosion(c3);
    for (const p of Object.values(this.state.players)) {
      const d = Math.hypot(p.pos.x - z.pos.x, p.pos.z - z.pos.z);
      if (d < 5.5) this.damagePlayer(p.id, z.dmg * Math.max(0, 1 - d / 5.5));
    }
    for (const oz of Object.values(this.state.zombies)) {
      if (oz.id === z.id || oz.state !== 'alive') continue;
      const d = Math.hypot(oz.pos.x - z.pos.x, oz.pos.z - z.pos.z);
      if (d < 4) this.hitZombie(oz.id, 40, 'world');
    }
  }

  checkCombo(p) {
    if (p.combo === 5) { p.boosts.speed = 10; this.notify('⚡ COMBO x5 — Speed Boost!', 'combo'); }
    else if (p.combo === 10) { p.boosts.damage = 10; this.notify('💥 COMBO x10 — Double Damage!', 'combo'); }
    else if (p.combo === 15) {
      this.clearNormals();
      this.notify('☠️ COMBO x15 — ALL CLEARED!', 'combo');
      p.combo = 0;
    }
  }

  clearNormals() {
    for (const [zid, z] of Object.entries(this.state.zombies)) {
      if (z.type !== 'normal' || z.state !== 'alive') continue;
      this.spawnDeathFX(z.pos, 'normal');
      z.state = 'dead';
      const zm = this.zombieMeshes[zid];
      if (zm) { this.scene.remove(zm.g); delete this.zombieMeshes[zid]; }
      delete this.state.zombies[zid];
      this.state.zombiesLeft = Math.max(0, this.state.zombiesLeft - 1);
    }
  }

  updateBoosts(dt, p) {
    if (p.boosts.speed > 0) p.boosts.speed -= dt;
    if (p.boosts.damage > 0) p.boosts.damage -= dt;
  }

  // ─── Zombie AI ───────────────────────────────────────────────
  updateZombies(dt) {
    const players = Object.values(this.state.players).filter(p => p.state === 'alive');
    if (!players.length) return;
    const barricades = Object.values(this.state.barricades);

    for (const [zid, z] of Object.entries(this.state.zombies)) {
      if (z.state !== 'alive') continue;
      z.attackTimer -= dt;

      // Nearest player
      let nearest = players[0], minD2 = Infinity;
      for (const p of players) {
        const d2 = (p.pos.x - z.pos.x) ** 2 + (p.pos.z - z.pos.z) ** 2;
        if (d2 < minD2) { minD2 = d2; nearest = p; }
      }
      const dist = Math.sqrt(minD2);

      // Boss AI
      if (z.type === 'boss') {
        this.updateBoss(z, nearest, dist, dt);
      }

      // Acid shoot
      if (z.type === 'acid' && dist > 5 && dist < 28 && z.attackTimer <= 0) {
        z.attackTimer = 3;
        this.spawnAcidProj(z, nearest);
        continue;
      }

      // Pathfinding refresh
      z.pathTimer -= dt;
      if (z.pathTimer <= 0) {
        z.pathTimer = 0.4 + Math.random() * 0.3;
        // Target nearest barricade OR player
        let tx = nearest.pos.x, tz = nearest.pos.z;
        let nearBarr = null, nearBarrD = 8;
        for (const b of barricades) {
          const bd = Math.hypot(b.pos.x - z.pos.x, b.pos.z - z.pos.z);
          if (bd < nearBarrD) { nearBarrD = bd; nearBarr = b; }
        }
        if (nearBarr && nearBarrD < 6) { tx = nearBarr.pos.x; tz = nearBarr.pos.z; }
        const path = this.findPath(z.pos.x, z.pos.z, tx, tz, barricades);
        z.waypoint = path.length > 0 ? path[0] : null;
      }

      // Move
      if (z.waypoint) {
        const dx = z.waypoint.x - z.pos.x, dz = z.waypoint.z - z.pos.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.4) { z.waypoint = null; }
        else {
          const nx = dx / d, nz = dz / d;
          const spd = z.speed * dt;
          const testX = z.pos.x + nx * spd, testZ = z.pos.z + nz * spd;
          if (!this.collideStatic(testX, z.pos.z, 0.38)) z.pos.x = testX;
          if (!this.collideStatic(z.pos.x, testZ, 0.38)) z.pos.z = testZ;
          z.rot = Math.atan2(nx, nz);
        }
      }

      // Attack barricades
      for (const [bid, b] of Object.entries(this.state.barricades)) {
        const bd = Math.hypot(b.pos.x - z.pos.x, b.pos.z - z.pos.z);
        if (bd < 1.3 && z.attackTimer <= 0) {
          b.hp -= z.dmg;
          z.attackTimer = 1.2;
          if (b.hp <= 0) this.destroyBarricade(bid);
        }
      }

      // Anti-stack
      for (const [oid, oz] of Object.entries(this.state.zombies)) {
        if (oid === zid || oz.state !== 'alive') continue;
        const od = Math.hypot(oz.pos.x - z.pos.x, oz.pos.z - z.pos.z);
        const minSep = 0.7 * ((z.type === 'boss' ? 2 : 1) + (oz.type === 'boss' ? 2 : 1)) / 2;
        if (od < minSep && od > 0.01) {
          const push = (minSep - od) * 0.5;
          z.pos.x += (z.pos.x - oz.pos.x) / od * push;
          z.pos.z += (z.pos.z - oz.pos.z) / od * push;
        }
      }

      // Clamp
      const maxP = MAP_SIZE / 2 - 0.5;
      z.pos.x = Math.max(-maxP, Math.min(maxP, z.pos.x));
      z.pos.z = Math.max(-maxP, Math.min(maxP, z.pos.z));

      // Update mesh
      const zm = this.zombieMeshes[zid];
      if (!zm) continue;
      zm.g.position.set(z.pos.x, 0, z.pos.z);
      zm.g.rotation.y = z.rot;

      zm.animT += dt * z.speed * 3;
      const ph = Math.sin(zm.animT);
      zm.lL.rotation.x = ph * 0.5;
      zm.lR.rotation.x = -ph * 0.5;
      zm.aL.rotation.x = -ph * 0.4;
      zm.aR.rotation.x = ph * 0.4;

      // HP bar face camera
      if (zm.hbFill) {
        zm.hbFill.quaternion.copy(this.camera.quaternion);
        zm.hbBg.quaternion.copy(this.camera.quaternion);
        const pct = Math.max(0, z.hp / z.maxHp);
        zm.hbFill.scale.x = pct;
        zm.hbFill.material.color.setHex(pct > 0.6 ? 0x00ff00 : pct > 0.3 ? 0xffaa00 : 0xff2200);
      }
    }
  }

  updateBoss(z, target, dist, dt) {
    z.bossTimer -= dt;
    if (z.bossTimer > 0) return;
    z.bossTimer = 4 + Math.random() * 3;

    const roll = Math.floor(Math.random() * 3);
    if (roll === 0) {
      // Shockwave
      this.spawnShockwave(z);
    } else if (roll === 1) {
      // Charge
      z.speed = 9;
      setTimeout(() => { z.speed = 1.5; }, 2200);
    } else {
      // Toxic spit x3
      for (let i = 0; i < 3; i++) {
        setTimeout(() => {
          if (z.state === 'alive') this.spawnBossToxic(z, target);
        }, i * 350);
      }
    }
  }

  spawnShockwave(z) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.5, 1.2, 24),
      new THREE.MeshBasicMaterial({ color: 0xff00ff, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
    );
    ring.position.set(z.pos.x, 0.2, z.pos.z);
    ring.rotation.x = -Math.PI / 2;
    this.scene.add(ring);
    this.effectMeshes.push({ mesh: ring, timer: 1.2, type: 'shockwave', maxTimer: 1.2, maxR: 16 });

    setTimeout(() => {
      for (const p of Object.values(this.state.players)) {
        const d = Math.hypot(p.pos.x - z.pos.x, p.pos.z - z.pos.z);
        if (d < 9) this.damagePlayer(p.id, z.dmg * 0.6);
      }
    }, 600);
  }

  spawnBossToxic(z, target) {
    const id = 'p_' + (++this.idCounter);
    const dx = target.pos.x - z.pos.x, dz = target.pos.z - z.pos.z;
    const d = Math.hypot(dx, dz);
    this.state.projectiles[id] = {
      id, type: 'boss_toxic',
      x: z.pos.x, y: 3.5, z: z.pos.z,
      vx: (dx / d) * 8, vy: 6, vz: (dz / d) * 8,
      dmg: 15, alive: true, timer: 5,
    };
    this.createProjMesh(id, 'boss_toxic');
  }

  spawnAcidProj(z, target) {
    const id = 'p_' + (++this.idCounter);
    const dx = target.pos.x - z.pos.x, dz = target.pos.z - z.pos.z;
    const d = Math.hypot(dx, dz);
    this.state.projectiles[id] = {
      id, type: 'acid',
      x: z.pos.x, y: 1.6, z: z.pos.z,
      vx: (dx / d) * 7, vy: 4.5, vz: (dz / d) * 7,
      dmg: 10, alive: true, timer: 4,
    };
    this.createProjMesh(id, 'acid');
  }

  createProjMesh(id, type) {
    const colors = { acid: 0x00ff44, boss_toxic: 0xff00ff, grenade: 0x336633 };
    const sizes = { acid: 0.22, boss_toxic: 0.3, grenade: 0.15 };
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(sizes[type] || 0.2, 8, 8),
      new THREE.MeshBasicMaterial({ color: colors[type] || 0xffff00 })
    );
    const p = this.state.projectiles[id];
    if (p) mesh.position.set(p.x, p.y, p.z);
    this.scene.add(mesh);
    this.projectileMeshes[id] = mesh;

    // Trail
    if (type === 'acid' || type === 'boss_toxic') {
      const trailPts = Array.from({ length: 15 }, () => new THREE.Vector3());
      const trailGeo = new THREE.BufferGeometry().setFromPoints(trailPts);
      const trailMat = new THREE.LineBasicMaterial({ color: colors[type], transparent: true, opacity: 0.5 });
      const line = new THREE.Line(trailGeo, trailMat);
      this.scene.add(line);
      this.projectileMeshes[id + '_trail'] = { line, pts: trailPts, head: 0 };
    }
  }

  // ─── Projectiles ─────────────────────────────────────────────
  updateProjectiles(dt) {
    for (const [pid, p] of Object.entries(this.state.projectiles)) {
      if (!p.alive) { this.removeProj(pid); continue; }
      p.timer -= dt;
      if (p.timer <= 0) { p.alive = false; continue; }

      p.vy += GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      if (p.y <= 0) {
        p.y = 0;
        p.alive = false;
        if (p.type === 'acid' || p.type === 'boss_toxic') {
          this.createAcidPool(p.x, p.z);
          if (p.type === 'boss_toxic') {
            for (const pl of Object.values(this.state.players)) {
              const d = Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z);
              if (d < 3) this.damagePlayer(pl.id, p.dmg * 2);
            }
          }
        } else if (p.type === 'grenade') {
          const c3 = new THREE.Vector3(p.x, 0, p.z);
          this.spawnExplosion(c3);
          for (const pl of Object.values(this.state.players)) {
            const d = Math.hypot(pl.pos.x - p.x, pl.pos.z - p.z);
            if (d < 5) this.damagePlayer(pl.id, 60 * (1 - d / 5));
          }
          for (const z of Object.values(this.state.zombies)) {
            if (z.state !== 'alive') continue;
            const d = Math.hypot(z.pos.x - p.x, z.pos.z - p.z);
            if (d < 5) this.hitZombie(z.id, 80 * (1 - d / 5), this.localId);
          }
        }
      }

      const mesh = this.projectileMeshes[pid];
      if (mesh) mesh.position.set(p.x, p.y, p.z);
      const trail = this.projectileMeshes[pid + '_trail'];
      if (trail) {
        trail.pts[trail.head % trail.pts.length].set(p.x, p.y, p.z);
        trail.head++;
        trail.line.geometry.setFromPoints(trail.pts);
      }
    }
  }

  removeProj(pid) {
    const m = this.projectileMeshes[pid];
    if (m) { this.scene.remove(m); delete this.projectileMeshes[pid]; }
    const t = this.projectileMeshes[pid + '_trail'];
    if (t) { this.scene.remove(t.line); delete this.projectileMeshes[pid + '_trail']; }
    delete this.state.projectiles[pid];
  }

  createAcidPool(x, z) {
    const r = 2.2;
    this.state.acidPools.push({ x, z, r, timer: 8 });
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(r, 16),
      new THREE.MeshBasicMaterial({ color: 0x00cc22, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.06, z);
    this.scene.add(mesh);
    const gl = new THREE.PointLight(0x00ff44, 2, 6);
    gl.position.set(x, 0.5, z);
    this.scene.add(gl);
    this.effectMeshes.push({ mesh, light: gl, timer: 8, type: 'acidpool' });
    // Steam
    for (let i = 0; i < 6; i++) {
      const s = new THREE.Mesh(
        new THREE.SphereGeometry(0.15, 4, 4),
        new THREE.MeshBasicMaterial({ color: 0x88ff88, transparent: true, opacity: 0.4 })
      );
      s.position.set(x + (Math.random() - 0.5) * 3, 0.1, z + (Math.random() - 0.5) * 3);
      this.scene.add(s);
      this.effectMeshes.push({ mesh: s, timer: 4 + Math.random() * 4, type: 'steam', vy: 0.6 + Math.random() * 0.4 });
    }
  }

  // ─── Traps ───────────────────────────────────────────────────
  updateTraps(dt) {
    for (const trap of this.state.traps) {
      if (!trap.active) continue;
      trap.timer -= dt;
      if (trap.timer <= 0) { trap.active = false; continue; }
      const range = trap.type === 'electric' ? 9 : 7;
      const dmg = trap.type === 'electric' ? 32 : 22;
      for (const z of Object.values(this.state.zombies)) {
        if (z.state !== 'alive') continue;
        const d = Math.hypot(z.pos.x - trap.pos.x, z.pos.z - trap.pos.z);
        if (d < range) this.hitZombie(z.id, dmg * dt, this.localId);
      }
    }
  }

  updateAcidPools(dt) {
    for (let i = this.state.acidPools.length - 1; i >= 0; i--) {
      const pool = this.state.acidPools[i];
      pool.timer -= dt;
      if (pool.timer <= 0) { this.state.acidPools.splice(i, 1); continue; }
      for (const z of Object.values(this.state.zombies)) {
        if (z.state !== 'alive') continue;
        const d = Math.hypot(z.pos.x - pool.x, z.pos.z - pool.z);
        if (d < pool.r) this.hitZombie(z.id, 8 * dt, this.localId);
      }
    }
  }

  // ─── Effects ─────────────────────────────────────────────────
  updateEffects(dt) {
    for (let i = this.effectMeshes.length - 1; i >= 0; i--) {
      const e = this.effectMeshes[i];
      e.timer -= dt;
      if (e.timer <= 0) {
        this.scene.remove(e.mesh);
        if (e.light) this.scene.remove(e.light);
        this.effectMeshes.splice(i, 1);
        continue;
      }
      if (e.type === 'shockwave') {
        const pct = 1 - e.timer / e.maxTimer;
        const r = e.maxR * pct;
        e.mesh.scale.set(r, r, 1);
        e.mesh.material.opacity = Math.max(0, 1 - pct);
      } else if (e.type === 'steam') {
        e.mesh.position.y += e.vy * dt;
        e.mesh.material.opacity = Math.max(0, e.timer / 8 * 0.4);
      } else if (e.type === 'acidpool') {
        e.mesh.material.opacity = Math.min(0.55, e.timer / 8 * 0.55);
        if (e.light) e.light.intensity = Math.min(2, e.timer / 8 * 2);
      } else if (e.type === 'tracer') {
        e.mesh.material.opacity = Math.max(0, e.timer / 0.08);
      } else if (e.type === 'particle') {
        e.mesh.position.x += e.vx;
        e.mesh.position.y += e.vy;
        e.mesh.position.z += e.vz;
        e.vy -= 0.01;
        e.mesh.material.opacity = Math.max(0, e.timer / e.maxT);
      } else if (e.type === 'explosion') {
        const pct = e.timer / e.maxTimer;
        const sc = 1 + (1 - pct) * 3.5;
        e.mesh.scale.set(sc, sc, sc);
        e.mesh.material.opacity = pct;
        if (e.light) e.light.intensity = pct * 6;
      } else if (e.type === 'firework') {
        e.mesh.position.x += e.vx;
        e.mesh.position.y += e.vy;
        e.mesh.position.z += e.vz;
        e.vy -= 0.008;
        e.mesh.material.opacity = e.timer / 3;
        e.mesh.rotation.x += 0.1;
        e.mesh.rotation.y += 0.07;
      }
    }
  }

  spawnBlood(pt) {
    for (let i = 0; i < 6; i++) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.04 + Math.random() * 0.04, 4, 4),
        new THREE.MeshBasicMaterial({ color: 0xcc0000, transparent: true, opacity: 0.9 })
      );
      m.position.copy(pt);
      this.scene.add(m);
      this.effectMeshes.push({
        mesh: m, timer: 0.25, maxT: 0.25, type: 'particle',
        vx: (Math.random() - 0.5) * 0.15, vy: 0.05 + Math.random() * 0.1, vz: (Math.random() - 0.5) * 0.15,
      });
    }
  }

  spawnSpark(pt) {
    for (let i = 0; i < 4; i++) {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.03, 4, 4),
        new THREE.MeshBasicMaterial({ color: 0xffaa44, transparent: true, opacity: 0.8 })
      );
      m.position.copy(pt);
      this.scene.add(m);
      this.effectMeshes.push({
        mesh: m, timer: 0.3, maxT: 0.3, type: 'particle',
        vx: (Math.random() - 0.5) * 0.1, vy: 0.05 + Math.random() * 0.08, vz: (Math.random() - 0.5) * 0.1,
      });
    }
  }

  spawnExplosion(pos, scale = 1) {
    const m = new THREE.Mesh(
      new THREE.SphereGeometry(scale, 10, 10),
      new THREE.MeshBasicMaterial({ color: 0xff6600, transparent: true, opacity: 0.9 })
    );
    m.position.copy(pos);
    this.scene.add(m);
    const l = new THREE.PointLight(0xff6600, 6, 15);
    l.position.copy(pos);
    this.scene.add(l);
    this.effectMeshes.push({ mesh: m, light: l, timer: 0.5, maxTimer: 0.5, type: 'explosion' });

    for (let i = 0; i < 10; i++) {
      const s = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 4, 4),
        new THREE.MeshBasicMaterial({ color: 0xffaa00, transparent: true, opacity: 1 })
      );
      s.position.copy(pos);
      this.scene.add(s);
      const a = Math.random() * Math.PI * 2;
      this.effectMeshes.push({
        mesh: s, timer: 0.5, maxT: 0.5, type: 'particle',
        vx: Math.cos(a) * 0.18, vy: 0.12 + Math.random() * 0.12, vz: Math.sin(a) * 0.18,
      });
    }
  }

  spawnDeathFX(pos, type) {
    const c3 = new THREE.Vector3(pos.x, 0.4, pos.z);
    this.spawnExplosion(c3, type === 'boss' ? 2.5 : 0.7);
  }

  spawnHealthDrop(pos) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xff4444 });
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.1), mat));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.3), mat));
    g.position.set(pos.x, 0.25, pos.z);
    this.scene.add(g);
    const check = setInterval(() => {
      const p = this.state.players[this.localId];
      if (!p) { clearInterval(check); this.scene.remove(g); return; }
      if (Math.hypot(p.pos.x - pos.x, p.pos.z - pos.z) < 1.5) {
        p.hp = Math.min(MAX_HEALTH, p.hp + 15);
        this.notify('+15 HP!', 'success');
        clearInterval(check);
        this.scene.remove(g);
      }
    }, 150);
    setTimeout(() => { clearInterval(check); this.scene.remove(g); }, 20000);
    // Bobbing
    let t = 0;
    const bob = setInterval(() => {
      t += 0.05;
      g.position.y = 0.25 + Math.sin(t) * 0.1;
      g.rotation.y += 0.04;
    }, 16);
    setTimeout(() => clearInterval(bob), 20000);
  }

  // ─── Wave Check ──────────────────────────────────────────────
  checkWaveEnd() {
    if (this.state.phase !== 'wave') return;
    const alive = Object.values(this.state.zombies).filter(z => z.state === 'alive').length;
    if (alive === 0 && this.state.zombiesLeft <= 0) {
      this.state.phase = 'intermission';
      this.notify(`✓ Wave ${this.state.wave} cleared!`, 'success');
      for (const p of Object.values(this.state.players)) {
        if (p.state === 'alive') p.hp = Math.min(p.maxHp, p.hp + 25);
        else if (p.state === 'down' || p.state === 'dead') { p.state = 'alive'; p.hp = 50; p.pos.x = 0; p.pos.z = 0; }
      }
      const next = this.state.wave + 1;
      if (next > this.state.maxWave) { setTimeout(() => this.triggerVictory(), 1000); return; }
      setTimeout(() => this.startWave(next), 8000);
    }
  }

  // ─── Interaction ─────────────────────────────────────────────
  checkNearby(p) {
    const vp = this.state.vendingMachine.pos;
    this.nearVending = Math.hypot(p.pos.x - vp.x, p.pos.z - vp.z) < 3;

    const mb = this.state.mysteryBox.pos;
    this.nearMystery = this.state.mysteryBox.active && Math.hypot(p.pos.x - mb.x, p.pos.z - mb.z) < 3;

    this.nearTrapIdx = -1;
    for (let i = 0; i < this.state.traps.length; i++) {
      const t = this.state.traps[i];
      if (Math.hypot(p.pos.x - t.pos.x, p.pos.z - t.pos.z) < 3) { this.nearTrapIdx = i; break; }
    }
  }

  handleInteract() {
    const p = this.state.players[this.localId];
    if (!p || p.state !== 'alive') return;
    if (this.nearVending) { document.exitPointerLock(); this.onVendingOpen?.(p.money); return; }
    if (this.nearMystery) { this.openMystery(p); return; }
    if (this.nearTrapIdx >= 0) { this.activateTrap(this.nearTrapIdx, p); return; }
  }

  openVendingItem(itemId) {
    const p = this.state.players[this.localId];
    if (!p) return;
    const prices = [50, 100, 150, 200];
    const price = prices[itemId];
    if (p.money < price) { this.notify('Not enough money!', 'error'); return; }
    p.money -= price;
    switch (itemId) {
      case 0:
        const ammo = 30 + Math.floor(Math.random() * 60);
        p.ammoAK = Math.min(p.maxAmmoAK, p.ammoAK + ammo);
        this.notify(`+${ammo} AK ammo!`, 'success');
        break;
      case 1:
        p.hp = Math.min(MAX_HEALTH, p.hp + 30);
        this.notify('+30 HP!', 'success');
        break;
      case 2:
        const boost = Math.random() < 0.5 ? 'speed' : 'damage';
        p.boosts[boost] = 15;
        this.notify(`${boost === 'speed' ? '⚡ Speed' : '🔥 Damage'} boost (15s)!`, 'success');
        break;
      case 3:
        p.grenades++;
        this.notify('💣 Grenade acquired!', 'success');
        break;
    }
    this.onVendingClose?.();
    this.requestPointerLock();
  }

  closeVending() { this.onVendingClose?.(); this.requestPointerLock(); }

  openMystery(p) {
    if (p.money < 200) { this.notify('Need $200 for Mystery Box!', 'error'); return; }
    p.money -= 200;
    const w = Math.random() < 0.5 ? 'ak' : 'pistol';
    const r = Math.random();
    if (w === 'ak') {
      if (r < 0.33) { p.wpUpgrades.ak.dmg += 0.2; this.notify('🔫 AK Damage +20%!', 'success'); }
      else if (r < 0.66) { p.wpUpgrades.ak.rate += 0.25; this.notify('⚡ AK Fire Rate +25%!', 'success'); }
      else { p.maxMagAK = Math.round(p.maxMagAK * 1.1); this.notify('📦 AK Magazine +10%!', 'success'); }
    } else {
      p.wpUpgrades.pistol.dmg += 0.2;
      this.notify('🔫 Pistol Damage +20%!', 'success');
    }
    if (Math.random() < 0.3) { p.grenades++; this.notify('+ Bonus Grenade!', 'success'); }
    // FX
    for (let i = 0; i < 20; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.09, 4, 4), new THREE.MeshBasicMaterial({ color: 0xcc44ff, transparent: true, opacity: 0.8 }));
      const mb = this.state.mysteryBox.pos;
      m.position.set(mb.x + (Math.random() - 0.5) * 2, 1 + Math.random() * 2, mb.z + (Math.random() - 0.5) * 2);
      this.scene.add(m);
      const a = Math.random() * Math.PI * 2;
      this.effectMeshes.push({ mesh: m, timer: 2, type: 'firework', vx: Math.cos(a) * 0.12, vy: 0.08 + Math.random() * 0.08, vz: Math.sin(a) * 0.12 });
    }
  }

  activateTrap(idx, p) {
    if (p.money < 300) { this.notify('Need $300 to activate trap!', 'error'); return; }
    const trap = this.state.traps[idx];
    if (!trap) return;
    p.money -= 300;
    trap.active = true;
    trap.timer = 20;
    this.notify(`${trap.type === 'electric' ? '⚡ Electric Field' : '🔥 Flamethrower'} active 20s!`, 'warning');
    const color = trap.type === 'electric' ? 0x4444ff : 0xff4400;
    const tl = new THREE.PointLight(color, 4, 14);
    tl.position.set(trap.pos.x, 1, trap.pos.z);
    this.scene.add(tl);
    this.effectMeshes.push({ mesh: new THREE.Object3D(), light: tl, timer: 20, type: 'trap' });

    // Pulse effect
    const pulseColor = trap.type === 'electric' ? 0x4444ff : 0xff6600;
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        const ring = new THREE.Mesh(
          new THREE.RingGeometry(0.5, 1, 16),
          new THREE.MeshBasicMaterial({ color: pulseColor, transparent: true, opacity: 0.8, side: THREE.DoubleSide })
        );
        ring.position.set(trap.pos.x, 0.1, trap.pos.z);
        ring.rotation.x = -Math.PI / 2;
        this.scene.add(ring);
        const maxR = trap.type === 'electric' ? 9 : 7;
        this.effectMeshes.push({ mesh: ring, timer: 1.0, type: 'shockwave', maxTimer: 1.0, maxR });
      }, i * 2000);
    }
  }

  // ─── Barricade ───────────────────────────────────────────────
  placeBarricade() {
    const p = this.state.players[this.localId];
    if (!p || p.state !== 'alive') return;
    if (p.money < 100) { this.notify('Need $100!', 'error'); return; }
    if (p.barrCount >= 3) { this.notify('Max 3 barricades!', 'error'); return; }
    const bx = p.pos.x - Math.sin(this.yaw) * 2.5;
    const bz = p.pos.z - Math.cos(this.yaw) * 2.5;
    if (this.collideStatic(bx, bz, 0.7)) { this.notify('Cannot place here!', 'error'); return; }
    p.money -= 100;
    p.barrCount++;
    const id = 'b_' + (++this.idCounter);
    this.state.barricades[id] = { id, ownerId: p.id, pos: { x: bx, z: bz }, hp: 200, maxHp: 200 };
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(1.2, 1.2, 0.4),
      new THREE.MeshLambertMaterial({ color: 0x888888 })
    );
    m.position.set(bx, 0.6, bz);
    m.castShadow = true;
    this.scene.add(m);
    this.barricadeMeshes[id] = m;
    this.notify('Barricade placed!', 'success');
  }

  destroyBarricade(id) {
    const b = this.state.barricades[id];
    if (!b) return;
    const p = this.state.players[b.ownerId];
    if (p) p.barrCount = Math.max(0, p.barrCount - 1);
    const m = this.barricadeMeshes[id];
    if (m) { this.scene.remove(m); delete this.barricadeMeshes[id]; }
    this.spawnExplosion(new THREE.Vector3(b.pos.x, 0.6, b.pos.z), 0.4);
    delete this.state.barricades[id];
    this.notify('Barricade destroyed!', 'warning');
  }

  // ─── Weapon ──────────────────────────────────────────────────
  switchWeapon(w) {
    const p = this.state.players[this.localId];
    if (!p) return;
    p.weapon = w;
    p.isReloading = false;
    this.isReloading = false;
    this.notify(w === 'ak' ? '🔫 AK-47' : '🔫 Pistol', 'success');
  }

  startReload() {
    const p = this.state.players[this.localId];
    if (!p || p.weapon !== 'ak' || p.isReloading) return;
    if (p.ammoAK === 0) { this.notify('No ammo!', 'error'); return; }
    if (p.magAK >= p.maxMagAK) return;
    p.isReloading = true;
    this.isReloading = true;
    this.reloadTimer = 0;
    this.notify('Reloading...', 'warning');
  }

  finishReload(p) {
    const need = p.maxMagAK - p.magAK;
    const take = Math.min(need, p.ammoAK);
    p.ammoAK -= take;
    p.magAK += take;
    p.isReloading = false;
    this.isReloading = false;
  }

  throwGrenade() {
    const p = this.state.players[this.localId];
    if (!p || p.grenades <= 0) { this.notify('No grenades!', 'error'); return; }
    p.grenades--;
    const id = 'g_' + (++this.idCounter);
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    this.state.projectiles[id] = {
      id, type: 'grenade',
      x: this.camera.position.x, y: this.camera.position.y - 0.3, z: this.camera.position.z,
      vx: fwd.x * 12, vy: fwd.y * 12 + 5, vz: fwd.z * 12,
      dmg: 80, alive: true, timer: 4,
    };
    this.createProjMesh(id, 'grenade');
    this.notify('💣 Grenade!', 'warning');
  }

  // ─── Victory ─────────────────────────────────────────────────
  triggerVictory() {
    this.state.phase = 'victory';
    this.notify('🎉 VICTORY! YOU SURVIVED!', 'success');
    this.triggerFireworks();
  }

  triggerFireworks() {
    for (let i = 0; i < 60; i++) {
      setTimeout(() => {
        const x = (Math.random() - 0.5) * 40;
        const y = 5 + Math.random() * 20;
        const z = (Math.random() - 0.5) * 40;
        const cols = [0xff4444, 0x44ff44, 0x4444ff, 0xffff44, 0xff44ff, 0x44ffff, 0xffffff];
        const col = cols[Math.floor(Math.random() * cols.length)];
        const l = new THREE.PointLight(col, 8, 25);
        l.position.set(x, y, z);
        this.scene.add(l);
        setTimeout(() => this.scene.remove(l), 400);
        for (let j = 0; j < 20; j++) {
          const m = new THREE.Mesh(new THREE.SphereGeometry(0.1, 4, 4), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 1 }));
          m.position.set(x, y, z);
          this.scene.add(m);
          const a = Math.random() * Math.PI * 2, el = Math.random() * Math.PI;
          const spd = 0.08 + Math.random() * 0.14;
          this.effectMeshes.push({
            mesh: m, timer: 3, type: 'firework',
            vx: Math.sin(el) * Math.cos(a) * spd, vy: Math.cos(el) * spd, vz: Math.sin(el) * Math.sin(a) * spd,
          });
        }
      }, i * 180);
    }
  }

  // ─── Render ──────────────────────────────────────────────────
  render(dt) {
    const p = this.state.players[this.localId];

    // Gun animation
    if (this.gunGroup && p) {
      const moving = this.keys['KeyW'] || this.keys['KeyS'] || this.keys['KeyA'] || this.keys['KeyD'];
      const bob = moving ? Math.sin(this.camBobT * 2) * (p.isSprinting ? 0.007 : 0.004) : 0;
      this.gunGroup.position.x = 0.25 + bob;
      this.gunGroup.position.y = -0.18 + Math.abs(bob) * 0.5;

      if (p.isReloading) {
        const pct = this.reloadTimer / this.reloadDuration;
        this.gunGroup.rotation.x = Math.sin(pct * Math.PI) * 0.5;
        this.gunGroup.position.z = -0.4 + Math.sin(pct * Math.PI) * 0.08;
      } else {
        this.gunGroup.rotation.x *= 0.8;
        this.gunGroup.position.z = -0.4;
      }

      // ADS
      if (this.mouse.right && p.weapon === 'ak') {
        this.gunGroup.position.x += (0 - this.gunGroup.position.x) * 0.2;
        this.gunGroup.position.y += (-0.04 - this.gunGroup.position.y) * 0.2;
        this.camera.fov += (55 - this.camera.fov) * 0.15;
      } else {
        this.camera.fov += (75 - this.camera.fov) * 0.15;
      }
      this.camera.updateProjectionMatrix();
    }

    this.renderer.render(this.scene, this.camera);
  }

  // ─── Minimap ─────────────────────────────────────────────────
  updateMinimap() {
    const ctx = this.minimapCtx;
    if (!ctx) return;
    const W = this.minimapCanvas.width, H = this.minimapCanvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, 0, W, H);

    const wm = (wx, wz) => [(wx / MAP_SIZE + 0.5) * W, (wz / MAP_SIZE + 0.5) * H];

    // Obstacles
    ctx.fillStyle = '#444';
    for (const ob of this.staticObstacles) {
      const [x1, y1] = wm(ob.minX, ob.minZ);
      const [x2, y2] = wm(ob.maxX, ob.maxZ);
      ctx.fillRect(x1, y1, Math.max(1, x2 - x1), Math.max(1, y2 - y1));
    }

    // Vending (green square)
    ctx.fillStyle = '#00ff44';
    const [vx, vy] = wm(-18, -18);
    ctx.fillRect(vx - 3, vy - 3, 6, 6);

    // Mystery box (purple)
    if (this.state.mysteryBox.active) {
      ctx.fillStyle = '#cc44ff';
      const [mx, my] = wm(18, 18);
      ctx.fillRect(mx - 3, my - 3, 6, 6);
    }

    // Traps
    for (const t of this.state.traps) {
      ctx.fillStyle = t.active ? (t.type === 'electric' ? '#4488ff' : '#ff6600') : '#445';
      const [tx, ty] = wm(t.pos.x, t.pos.z);
      ctx.fillRect(tx - 2, ty - 2, 4, 4);
    }

    // Barricades
    ctx.fillStyle = '#aaa';
    for (const b of Object.values(this.state.barricades)) {
      const [bx, by] = wm(b.pos.x, b.pos.z);
      ctx.fillRect(bx - 2, by - 2, 4, 4);
    }

    // Zombies
    for (const z of Object.values(this.state.zombies)) {
      if (z.state !== 'alive') continue;
      const [zx, zy] = wm(z.pos.x, z.pos.z);
      ctx.fillStyle = z.type === 'boss' ? '#ff00ff' : z.type === 'acid' ? '#00ff44' : z.type === 'exploder' ? '#ff6600' : '#ff3300';
      ctx.beginPath();
      ctx.arc(zx, zy, z.type === 'boss' ? 5 : 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Players
    for (const [pid, p] of Object.entries(this.state.players)) {
      const [px, py] = wm(p.pos.x, p.pos.z);
      ctx.fillStyle = pid === this.localId ? '#ffffff' : '#44aaff';
      ctx.beginPath();
      ctx.arc(px, py, 3.5, 0, Math.PI * 2);
      ctx.fill();
      if (pid === this.localId) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px - Math.sin(p.rot) * 9, py - Math.cos(p.rot) * 9);
        ctx.stroke();
      }
    }

    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, W, H);
  }

  // ─── Utils ───────────────────────────────────────────────────
  notify(msg, type = 'info') { this.onNotify?.(msg, type); }

  getNearVending() { return this.nearVending; }
  getNearMystery() { return this.nearMystery; }
  getNearTrap() { return this.nearTrapIdx; }
  getNearDown() { return this.nearDownPlayer; }
  getReviveProgress() { return this.reviveTimer / 3; }
}

window.GameEngine = GameEngine;
