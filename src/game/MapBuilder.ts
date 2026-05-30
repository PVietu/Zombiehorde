// MapBuilder - Creates the 3D game map with all objects and collision data

import { AABB } from './types';

declare const THREE: any;

export interface MapObject {
  mesh: any; // THREE.Mesh
  aabb: AABB;
  isWall?: boolean;
}

export class MapBuilder {
  private scene: any;
  private collisionObjects: MapObject[] = [];
  private spawnPoints: Array<{ x: number; z: number }> = [];
  private playerSpawns: Array<{ x: number; z: number }> = [];

  constructor(scene: any) {
    this.scene = scene;
  }

  build(): { collisionObjects: MapObject[]; spawnPoints: Array<{ x: number; z: number }>; playerSpawns: Array<{ x: number; z: number }> } {
    this.createGround();
    this.createSky();
    this.createLighting();
    this.createPerimeterWalls();
    this.createBuildings();
    this.createCrates();
    this.createBarricades();
    this.createRoads();
    this.createVendingMachineMarker();
    this.createTrapPanels();
    this.createMysteryBoxMarker();
    this.setupSpawnPoints();

    return {
      collisionObjects: this.collisionObjects,
      spawnPoints: this.spawnPoints,
      playerSpawns: this.playerSpawns,
    };
  }

  private createGround() {
    // Main ground
    const groundGeo = new THREE.PlaneGeometry(120, 120);
    const groundMat = new THREE.MeshLambertMaterial({ color: 0x2a2a1a });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // Concrete patches
    const patches = [
      { x: 0, z: 0, w: 40, h: 40, color: 0x333325 },
      { x: -20, z: -20, w: 20, h: 20, color: 0x2d2d1f },
      { x: 20, z: 20, w: 15, h: 15, color: 0x2a2a1c },
    ];
    patches.forEach(p => {
      const pg = new THREE.PlaneGeometry(p.w, p.h);
      const pm = new THREE.MeshLambertMaterial({ color: p.color });
      const mesh = new THREE.Mesh(pg, pm);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(p.x, 0.01, p.z);
      mesh.receiveShadow = true;
      this.scene.add(mesh);
    });
  }

  private createSky() {
    // Gradient sky using large sphere
    const skyGeo = new THREE.SphereGeometry(500, 16, 16);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vWorldPosition;
        void main() {
          float y = normalize(vWorldPosition).y;
          vec3 topColor = vec3(0.15, 0.18, 0.32);
          vec3 botColor = vec3(0.35, 0.28, 0.20);
          vec3 color = mix(botColor, topColor, max(0.0, y));
          gl_FragColor = vec4(color, 1.0);
        }
      `
    });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(sky);

    // Fog
    this.scene.fog = new THREE.Fog(0x33281a, 60, 140);
  }

  private createLighting() {
    // Ambient
    const ambient = new THREE.AmbientLight(0x404055, 0.6);
    this.scene.add(ambient);

    // Main directional (sun)
    const sun = new THREE.DirectionalLight(0xffeecc, 1.2);
    sun.position.set(30, 60, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 200;
    sun.shadow.camera.left = -80;
    sun.shadow.camera.right = 80;
    sun.shadow.camera.top = 80;
    sun.shadow.camera.bottom = -80;
    sun.shadow.bias = -0.0005;
    this.scene.add(sun);

    // Fill light
    const fill = new THREE.DirectionalLight(0x3344aa, 0.4);
    fill.position.set(-20, 30, -30);
    this.scene.add(fill);

    // Point lights for atmosphere
    const ptColors = [0xff4400, 0xff6600, 0xaa2200];
    const ptPositions = [
      [-15, 3, -15], [15, 3, 15], [0, 3, -25]
    ];
    ptPositions.forEach((p, i) => {
      const pt = new THREE.PointLight(ptColors[i], 0.8, 25);
      pt.position.set(p[0], p[1], p[2]);
      this.scene.add(pt);
    });
  }

  private addBox(x: number, y: number, z: number, w: number, h: number, d: number, color: number, isWall = false, castShadow = true): MapObject {
    const geo = new THREE.BoxGeometry(w, h, d);
    const mat = new THREE.MeshLambertMaterial({ color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = castShadow;
    mesh.receiveShadow = true;
    this.scene.add(mesh);

    const hw = w / 2, hh = h / 2, hd = d / 2;
    const obj: MapObject = {
      mesh,
      isWall,
      aabb: {
        minX: x - hw, maxX: x + hw,
        minY: y - hh, maxY: y + hh,
        minZ: z - hd, maxZ: z + hd,
      }
    };
    this.collisionObjects.push(obj);
    return obj;
  }

  private createPerimeterWalls() {
    const wallH = 5;
    const wallThick = 1;
    const halfSize = 55;

    // North wall
    this.addBox(0, wallH / 2, -halfSize, 110, wallH, wallThick, 0x555544, true);
    // South wall
    this.addBox(0, wallH / 2, halfSize, 110, wallH, wallThick, 0x555544, true);
    // West wall
    this.addBox(-halfSize, wallH / 2, 0, wallThick, wallH, 110, 0x555544, true);
    // East wall
    this.addBox(halfSize, wallH / 2, 0, wallThick, wallH, 110, 0x555544, true);

    // Gate opening (south wall gap) - two sections
    // We override the south wall with two segments with a gap in the middle
    // Remove last added (south wall) and replace
    this.collisionObjects.pop();
    const mesh = this.scene.children[this.scene.children.length - 1];
    this.scene.remove(mesh);

    // Left section of south gate
    this.addBox(-27.5, wallH / 2, halfSize, 55, wallH, wallThick, 0x555544, true);
    // Right section
    this.addBox(27.5, wallH / 2, halfSize, 55, wallH, wallThick, 0x555544, true);

    // Gate posts
    this.addBox(-5.5, wallH / 2 + 1, halfSize, 2, wallH + 2, 2, 0x333322, true);
    this.addBox(5.5, wallH / 2 + 1, halfSize, 2, wallH + 2, 2, 0x333322, true);

    // Watchtowers at corners
    this.createWatchtower(-50, -50);
    this.createWatchtower(50, -50);
    this.createWatchtower(-50, 50);
    this.createWatchtower(50, 50);
  }

  private createWatchtower(x: number, z: number) {
    // Base pillars
    for (let dx = -1; dx <= 1; dx += 2) {
      for (let dz = -1; dz <= 1; dz += 2) {
        this.addBox(x + dx * 1.5, 4, z + dz * 1.5, 0.8, 8, 0.8, 0x444433, true);
      }
    }
    // Platform
    this.addBox(x, 8.5, z, 6, 0.5, 6, 0x555544, true);
    // Railings
    this.addBox(x, 9.5, z - 2.7, 6, 1, 0.2, 0x333322, true);
    this.addBox(x, 9.5, z + 2.7, 6, 1, 0.2, 0x333322, true);
    this.addBox(x - 2.7, 9.5, z, 0.2, 1, 6, 0x333322, true);
    this.addBox(x + 2.7, 9.5, z, 0.2, 1, 6, 0x333322, true);
  }

  private createBuildings() {
    // Main base building (command center)
    this.createBuilding(-25, 0, -20, 16, 8, 12, 0x4a4a3a, 'barracks');
    // Storage building
    this.createBuilding(22, 0, -22, 12, 6, 10, 0x3d3d2d, 'storage');
    // Small guard post
    this.createBuilding(-20, 0, 20, 7, 5, 7, 0x444433, 'post');
    // Ammo depot
    this.createBuilding(20, 0, 18, 9, 5, 8, 0x3a3a2a, 'depot');
  }

  private createBuilding(cx: number, cy: number, cz: number, w: number, h: number, d: number, color: number, _type: string) {
    // Walls (4 sides with openings)
    const thick = 0.5;
    // North wall (full)
    this.addBox(cx, cy + h / 2, cz - d / 2, w, h, thick, color, true);
    // South wall (with door gap)
    this.addBox(cx - w / 4, cy + h / 2, cz + d / 2, w / 2 - 1, h, thick, color, true);
    this.addBox(cx + w / 4, cy + h / 2, cz + d / 2, w / 2 - 1, h, thick, color, true);
    this.addBox(cx, cy + h - 1.5, cz + d / 2, 3, 1.5, thick, color, true); // lintel
    // West wall
    this.addBox(cx - w / 2, cy + h / 2, cz, thick, h, d, color, true);
    // East wall (with window)
    this.addBox(cx + w / 2, cy + h / 2, cz, thick, h, d, color, true);
    // Roof
    this.addBox(cx, cy + h + 0.15, cz, w + 0.5, 0.3, d + 0.5, 0x333325, false, false);

    // Dark interior floor
    const floorGeo = new THREE.PlaneGeometry(w - 1, d - 1);
    const floorMat = new THREE.MeshLambertMaterial({ color: 0x222215 });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.rotation.x = -Math.PI / 2;
    floorMesh.position.set(cx, 0.02, cz);
    this.scene.add(floorMesh);
  }

  private createCrates() {
    const cratePositions = [
      { x: -5, z: 5, w: 1.5, h: 1.5, d: 1.5 },
      { x: -6.5, z: 5, w: 1.5, h: 1.5, d: 1.5 },
      { x: -5, z: 6.5, w: 1.5, h: 1.5, d: 1.5 },
      { x: 5, z: -5, w: 1.5, h: 2, d: 1.5 },
      { x: 6.8, z: -5, w: 1.5, h: 1.5, d: 1.5 },
      { x: 10, z: 5, w: 2, h: 1, d: 1 },
      { x: 10, z: 6.2, w: 2, h: 2, d: 1 },
      { x: -8, z: -8, w: 1.5, h: 1.5, d: 1.5 },
      { x: 0, z: -10, w: 2.5, h: 1, d: 2.5 },
      { x: -2, z: -10, w: 1.5, h: 2, d: 1.5 },
      { x: 30, z: 0, w: 1.5, h: 1.5, d: 1.5 },
      { x: 32, z: 0, w: 1.5, h: 1.5, d: 1.5 },
      { x: -30, z: 5, w: 2, h: 2, d: 2 },
      { x: -30, z: 8, w: 1.5, h: 1, d: 1.5 },
      { x: 0, z: 25, w: 2, h: 1.5, d: 2 },
      { x: 2.5, z: 25, w: 1.5, h: 1.5, d: 2 },
    ];

    cratePositions.forEach(c => {
      const colors = [0x5a4a2a, 0x4a3a1a, 0x6a5a3a, 0x483c20];
      const color = colors[Math.floor(Math.random() * colors.length)];
      this.addBox(c.x, c.h / 2, c.z, c.w, c.h, c.d, color, true);
      // Crate details
      const lineGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(c.w, c.h, c.d));
      const lineMat = new THREE.LineBasicMaterial({ color: 0x8a7a5a });
      const lines = new THREE.LineSegments(lineGeo, lineMat);
      lines.position.set(c.x, c.h / 2, c.z);
      this.scene.add(lines);
    });
  }

  private createBarricades() {
    // Sandbag walls
    const sandbagPositions = [
      { x: 0, z: 35, rot: 0, len: 10 },
      { x: -5, z: 30, rot: Math.PI / 6, len: 6 },
      { x: 5, z: 30, rot: -Math.PI / 6, len: 6 },
      { x: -35, z: 0, rot: Math.PI / 2, len: 8 },
      { x: 35, z: 0, rot: Math.PI / 2, len: 8 },
      { x: -15, z: -5, rot: 0, len: 5 },
      { x: 15, z: 5, rot: 0, len: 5 },
    ];

    sandbagPositions.forEach(sb => {
      const geo = new THREE.BoxGeometry(sb.len, 0.8, 1.2);
      const mat = new THREE.MeshLambertMaterial({ color: 0x8a7a5a });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(sb.x, 0.4, sb.z);
      mesh.rotation.y = sb.rot;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.scene.add(mesh);

      // Approximate AABB (axis-aligned)
      const half = sb.len / 2;
      const sinA = Math.abs(Math.sin(sb.rot));
      const cosA = Math.abs(Math.cos(sb.rot));
      const aw = half * cosA + 0.6 * sinA;
      const ad = half * sinA + 0.6 * cosA;
      this.collisionObjects.push({
        mesh,
        isWall: true,
        aabb: {
          minX: sb.x - aw, maxX: sb.x + aw,
          minY: 0, maxY: 0.8,
          minZ: sb.z - ad, maxZ: sb.z + ad,
        }
      });
    });

    // Metal fences
    const fencePositions = [
      { x: -10, z: 35, rot: 0, len: 8 },
      { x: 12, z: 35, rot: 0, len: 8 },
    ];
    fencePositions.forEach(f => {
      const geo = new THREE.BoxGeometry(f.len, 1.5, 0.15);
      const mat = new THREE.MeshLambertMaterial({ color: 0x4a5a4a, wireframe: true });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(f.x, 0.75, f.z);
      mesh.rotation.y = f.rot;
      this.scene.add(mesh);
      this.collisionObjects.push({
        mesh,
        isWall: true,
        aabb: {
          minX: f.x - f.len / 2, maxX: f.x + f.len / 2,
          minY: 0, maxY: 1.5,
          minZ: f.z - 0.3, maxZ: f.z + 0.3,
        }
      });
    });

    // Concrete barriers (Jersey barriers)
    const barrierPos = [
      { x: 8, z: -30 }, { x: -8, z: -30 }, { x: 0, z: -30 },
      { x: -40, z: 20 }, { x: 40, z: -20 }, { x: 0, z: 40 },
    ];
    barrierPos.forEach(b => {
      this.addBox(b.x, 0.6, b.z, 3, 1.2, 1, 0x5a5a4a, true);
    });
  }

  private createRoads() {
    // Road strips
    const roads = [
      { x: 0, z: 0, w: 8, d: 100, color: 0x1a1a15 },
      { x: 0, z: 0, w: 100, d: 8, color: 0x1a1a15 },
    ];
    roads.forEach(r => {
      const geo = new THREE.PlaneGeometry(r.w, r.d);
      const mat = new THREE.MeshLambertMaterial({ color: r.color });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.set(r.x, 0.005, r.z);
      this.scene.add(mesh);
    });

    // Road markings (dashes)
    for (let i = -5; i <= 5; i++) {
      const markGeo = new THREE.PlaneGeometry(0.2, 2);
      const markMat = new THREE.MeshLambertMaterial({ color: 0x888866 });
      const mark = new THREE.Mesh(markGeo, markMat);
      mark.rotation.x = -Math.PI / 2;
      mark.position.set(0, 0.006, i * 8);
      this.scene.add(mark);
    }
  }

  private createVendingMachineMarker() {
    // Vending machine at the center-left area
    const x = -12, z = -3;
    this.addBox(x, 1.25, z, 1.2, 2.5, 0.8, 0x2255aa, true);
    // Screen glow
    const screenGeo = new THREE.PlaneGeometry(0.8, 1.2);
    const screenMat = new THREE.MeshBasicMaterial({ color: 0x44ffcc });
    const screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.set(x, 1.5, z - 0.41);
    this.scene.add(screen);
    // Point light
    const light = new THREE.PointLight(0x44ffcc, 0.8, 6);
    light.position.set(x, 2, z - 1);
    this.scene.add(light);

    // Label
    this.addFloatingLabel(x, 3.2, z, '🏪 АВТОМАТ');
  }

  private createTrapPanels() {
    // Trap panel 1 - near south gate
    this.createTrapPanel(0, 45, 'ЛОВУШКА 1');
    // Trap panel 2 - center
    this.createTrapPanel(-35, -35, 'ЛОВУШКА 2');
  }

  private createTrapPanel(x: number, z: number, _label: string) {
    const panelGeo = new THREE.BoxGeometry(0.8, 1.5, 0.3);
    const panelMat = new THREE.MeshLambertMaterial({ color: 0x333355 });
    const panel = new THREE.Mesh(panelGeo, panelMat);
    panel.position.set(x, 0.75, z);
    panel.castShadow = true;
    this.scene.add(panel);

    // Screen
    const screenGeo = new THREE.PlaneGeometry(0.5, 0.8);
    const screenMat = new THREE.MeshBasicMaterial({ color: 0x0033ff });
    const screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.set(x, 0.9, z - 0.16);
    this.scene.add(screen);

    // Button
    const btnGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.1, 8);
    const btnMat = new THREE.MeshLambertMaterial({ color: 0xff2200 });
    const btn = new THREE.Mesh(btnGeo, btnMat);
    btn.position.set(x, 0.3, z - 0.16);
    btn.rotation.x = Math.PI / 2;
    this.scene.add(btn);

    this.collisionObjects.push({
      mesh: panel,
      isWall: true,
      aabb: {
        minX: x - 0.4, maxX: x + 0.4,
        minY: 0, maxY: 1.5,
        minZ: z - 0.15, maxZ: z + 0.15,
      }
    });
  }

  private createMysteryBoxMarker() {
    // Mystery box
    const x = 30, z = -30;
    const boxGeo = new THREE.BoxGeometry(1.5, 1.5, 1.5);
    const boxMat = new THREE.MeshLambertMaterial({ color: 0x220055 });
    const box = new THREE.Mesh(boxGeo, boxMat);
    box.position.set(x, 0.75, z);
    box.castShadow = true;
    this.scene.add(box);

    // Question marks and glow
    const glowLight = new THREE.PointLight(0x8800ff, 1.5, 8);
    glowLight.position.set(x, 2, z);
    this.scene.add(glowLight);

    // Pulsing animation reference
    (box as any).isGlowing = true;
    (box as any).glowLight = glowLight;

    this.addFloatingLabel(x, 2.5, z, '❓ МИСТИКА');

    this.collisionObjects.push({
      mesh: box,
      isWall: true,
      aabb: {
        minX: x - 0.75, maxX: x + 0.75,
        minY: 0, maxY: 1.5,
        minZ: z - 0.75, maxZ: z + 0.75,
      }
    });
  }

  private addFloatingLabel(x: number, y: number, z: number, text: string) {
    // Create a canvas sprite for labels
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#ffcc00';
    ctx.font = 'bold 20px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText(text, 128, 42);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMat);
    sprite.position.set(x, y, z);
    sprite.scale.set(3, 0.75, 1);
    this.scene.add(sprite);
  }

  private setupSpawnPoints() {
    // Zombie spawn points around the perimeter (outside or near walls)
    const spawnDist = 50;
    const count = 20;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      this.spawnPoints.push({
        x: Math.cos(angle) * spawnDist,
        z: Math.sin(angle) * spawnDist,
      });
    }
    // Extra spawn points at cardinal directions
    this.spawnPoints.push(
      { x: 0, z: 52 }, { x: 0, z: -52 },
      { x: 52, z: 0 }, { x: -52, z: 0 },
      { x: 36, z: 36 }, { x: -36, z: 36 },
      { x: 36, z: -36 }, { x: -36, z: -36 },
    );

    // Player spawns (center area)
    this.playerSpawns = [
      { x: 0, z: 0 }, { x: 3, z: 0 }, { x: -3, z: 0 },
      { x: 0, z: 3 }, { x: 0, z: -3 },
      { x: 5, z: 5 }, { x: -5, z: 5 }, { x: 5, z: -5 }, { x: -5, z: -5 },
    ];
  }

  getCollisionObjects(): MapObject[] {
    return this.collisionObjects;
  }

  getZombieSpawnPoints() {
    return this.spawnPoints;
  }

  getPlayerSpawnPoints() {
    return this.playerSpawns;
  }
}
