// EntityManager - Creates and manages 3D models for players, zombies, effects

declare const THREE: any;

export interface ZombieModel {
  group: any;
  type: 'normal' | 'explosive' | 'acid' | 'boss';
  mixer?: any;
  healthBar?: any;
  glowLight?: any;
  walkAnim?: { t: number };
}

export interface PlayerModel {
  group: any;
  body: any;
  head: any;
  weaponMesh: any;
}

export interface ParticleSystem {
  particles: Array<{
    mesh: any;
    velocity: { x: number; y: number; z: number };
    life: number;
    maxLife: number;
  }>;
  update(dt: number): void;
  dispose(): void;
}

export class EntityManager {
  private scene: any;
  private zombieModels: Map<string, ZombieModel> = new Map();
  private playerModels: Map<string, PlayerModel> = new Map();
  private particleSystems: ParticleSystem[] = [];
  private acidPoolMeshes: Map<string, any> = new Map();
  private trapEffects: Map<string, any[]> = new Map();
  private bulletTrails: Array<{ line: any; life: number }> = [];
  private dropItems: Map<string, any> = new Map();

  constructor(scene: any) {
    this.scene = scene;
  }

  // ---- ZOMBIE MODELS ----

  createZombie(id: string, type: 'normal' | 'explosive' | 'acid' | 'boss'): ZombieModel {
    const group = new THREE.Group();
    let model: ZombieModel;

    if (type === 'boss') {
      model = this.buildBossModel(group);
    } else {
      model = this.buildZombieModel(group, type);
    }

    model.group = group;
    model.type = type;
    model.walkAnim = { t: 0 };
    this.scene.add(group);
    this.zombieModels.set(id, model);
    return model;
  }

  private buildZombieModel(group: any, type: 'normal' | 'explosive' | 'acid'): ZombieModel {
    const colors = {
      normal: { body: 0x4a7a3a, skin: 0x2a5a1a, accent: 0x8a9a5a },
      explosive: { body: 0x8a3a1a, skin: 0x5a1a0a, accent: 0xff4400 },
      acid: { body: 0x2a6a1a, skin: 0x1a4a0a, accent: 0x44ff00 },
    };
    const c = colors[type];

    // Torso
    const torsoGeo = new THREE.BoxGeometry(0.7, 0.9, 0.4);
    const torsoMat = new THREE.MeshLambertMaterial({ color: c.body });
    const torso = new THREE.Mesh(torsoGeo, torsoMat);
    torso.position.y = 1.1;
    torso.castShadow = true;
    group.add(torso);

    // Head
    const headGeo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const headMat = new THREE.MeshLambertMaterial({ color: c.skin });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.8;
    head.castShadow = true;
    group.add(head);

    // Eyes (glowing)
    const eyeGeo = new THREE.SphereGeometry(0.07, 6, 6);
    const eyeMat = new THREE.MeshBasicMaterial({ color: type === 'acid' ? 0x00ff44 : 0xff2200 });
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.12, 1.82, 0.26);
    group.add(eyeL);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.12, 1.82, 0.26);
    group.add(eyeR);

    // Arms
    const armGeo = new THREE.BoxGeometry(0.2, 0.7, 0.2);
    const armMat = new THREE.MeshLambertMaterial({ color: c.skin });
    const armL = new THREE.Mesh(armGeo, armMat);
    armL.position.set(-0.5, 1.0, 0);
    armL.castShadow = true;
    group.add(armL);
    const armR = new THREE.Mesh(armGeo, armMat);
    armR.position.set(0.5, 1.0, 0);
    armR.castShadow = true;
    group.add(armR);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.25, 0.7, 0.25);
    const legMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
    const legL = new THREE.Mesh(legGeo, legMat);
    legL.position.set(-0.18, 0.35, 0);
    legL.castShadow = true;
    group.add(legL);
    const legR = new THREE.Mesh(legGeo, legMat);
    legR.position.set(0.18, 0.35, 0);
    legR.castShadow = true;
    group.add(legR);

    // Type-specific details
    if (type === 'explosive') {
      // Barrel on back
      const barrelGeo = new THREE.CylinderGeometry(0.18, 0.18, 0.7, 8);
      const barrelMat = new THREE.MeshLambertMaterial({ color: 0xff6600 });
      const barrel = new THREE.Mesh(barrelGeo, barrelMat);
      barrel.position.set(0, 1.2, -0.35);
      group.add(barrel);
    } else if (type === 'acid') {
      // Acid tank
      const tankGeo = new THREE.SphereGeometry(0.2, 8, 8);
      const tankMat = new THREE.MeshLambertMaterial({ color: 0x44ff00, emissive: 0x002200 });
      const tank = new THREE.Mesh(tankGeo, tankMat);
      tank.position.set(0, 1.35, -0.35);
      group.add(tank);
      // Glow
      const glow = new THREE.PointLight(0x44ff00, 0.5, 4);
      glow.position.set(0, 1.5, -0.35);
      group.add(glow);
    }

    // Health bar (sprite above head)
    const hbCanvas = document.createElement('canvas');
    hbCanvas.width = 64; hbCanvas.height = 8;
    const hbCtx = hbCanvas.getContext('2d')!;
    hbCtx.fillStyle = '#00ff44';
    hbCtx.fillRect(0, 0, 64, 8);
    const hbTex = new THREE.CanvasTexture(hbCanvas);
    const hbMat = new THREE.SpriteMaterial({ map: hbTex, transparent: true });
    const hbSprite = new THREE.Sprite(hbMat);
    hbSprite.position.y = 2.4;
    hbSprite.scale.set(1.2, 0.15, 1);
    group.add(hbSprite);

    return { group, type, healthBar: hbSprite, walkAnim: { t: 0 } };
  }

  private buildBossModel(group: any): ZombieModel {
    // Scale up
    group.scale.set(2.0, 2.0, 2.0);

    // Torso - massive
    const torsoGeo = new THREE.BoxGeometry(1.2, 1.4, 0.7);
    const torsoMat = new THREE.MeshLambertMaterial({ color: 0x1a0a1a, emissive: 0x110011 });
    const torso = new THREE.Mesh(torsoGeo, torsoMat);
    torso.position.y = 1.4;
    torso.castShadow = true;
    group.add(torso);

    // Head - horned
    const headGeo = new THREE.BoxGeometry(0.9, 0.9, 0.8);
    const headMat = new THREE.MeshLambertMaterial({ color: 0x0a0a0a });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 2.45;
    head.castShadow = true;
    group.add(head);

    // Horns
    const hornGeo = new THREE.ConeGeometry(0.1, 0.6, 6);
    const hornMat = new THREE.MeshLambertMaterial({ color: 0x330000 });
    const hornL = new THREE.Mesh(hornGeo, hornMat);
    hornL.position.set(-0.35, 3.1, 0); hornL.rotation.z = -0.3;
    group.add(hornL);
    const hornR = new THREE.Mesh(hornGeo, hornMat);
    hornR.position.set(0.35, 3.1, 0); hornR.rotation.z = 0.3;
    group.add(hornR);

    // Eyes - red glowing
    const eyeGeo = new THREE.SphereGeometry(0.12, 8, 8);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const eyeL = new THREE.Mesh(eyeGeo, eyeMat);
    eyeL.position.set(-0.25, 2.5, 0.41);
    group.add(eyeL);
    const eyeR = new THREE.Mesh(eyeGeo, eyeMat);
    eyeR.position.set(0.25, 2.5, 0.41);
    group.add(eyeR);

    // Evil glow
    const eyeGlow = new THREE.PointLight(0xff0000, 2, 8);
    eyeGlow.position.set(0, 2.5, 0.5);
    group.add(eyeGlow);

    // Arms - massive
    const armGeo = new THREE.BoxGeometry(0.4, 1.2, 0.4);
    const armMat = new THREE.MeshLambertMaterial({ color: 0x1a0a1a });
    const armL = new THREE.Mesh(armGeo, armMat);
    armL.position.set(-0.9, 1.3, 0);
    armL.castShadow = true;
    group.add(armL);
    const armR = new THREE.Mesh(armGeo, armMat);
    armR.position.set(0.9, 1.3, 0);
    armR.castShadow = true;
    group.add(armR);

    // Claws
    const clawGeo = new THREE.ConeGeometry(0.08, 0.4, 4);
    const clawMat = new THREE.MeshLambertMaterial({ color: 0x220000 });
    for (let i = -1; i <= 1; i++) {
      const claw = new THREE.Mesh(clawGeo, clawMat);
      claw.position.set(-0.9 + i * 0.15, 0.6, 0.1);
      claw.rotation.x = 0.5;
      group.add(claw);
      const claw2 = new THREE.Mesh(clawGeo, clawMat);
      claw2.position.set(0.9 + i * 0.15, 0.6, 0.1);
      claw2.rotation.x = 0.5;
      group.add(claw2);
    }

    // Legs
    const legGeo = new THREE.BoxGeometry(0.4, 1.0, 0.4);
    const legMat = new THREE.MeshLambertMaterial({ color: 0x0a0505 });
    const legL = new THREE.Mesh(legGeo, legMat);
    legL.position.set(-0.35, 0.5, 0);
    legL.castShadow = true;
    group.add(legL);
    const legR = new THREE.Mesh(legGeo, legMat);
    legR.position.set(0.35, 0.5, 0);
    legR.castShadow = true;
    group.add(legR);

    // Armor plates
    const plateGeo = new THREE.BoxGeometry(0.3, 0.5, 0.15);
    const plateMat = new THREE.MeshLambertMaterial({ color: 0x220022 });
    for (let i = -1; i <= 1; i += 2) {
      const plate = new THREE.Mesh(plateGeo, plateMat);
      plate.position.set(i * 0.65, 1.5, 0.38);
      group.add(plate);
    }

    // Health bar
    const hbCanvas = document.createElement('canvas');
    hbCanvas.width = 128; hbCanvas.height = 12;
    const hbCtx = hbCanvas.getContext('2d')!;
    hbCtx.fillStyle = '#ff0000';
    hbCtx.fillRect(0, 0, 128, 12);
    const hbTex = new THREE.CanvasTexture(hbCanvas);
    const hbMat = new THREE.SpriteMaterial({ map: hbTex, transparent: true });
    const hbSprite = new THREE.Sprite(hbMat);
    hbSprite.position.y = 2.0; // In group space, scaled by 2x
    hbSprite.scale.set(2.0, 0.2, 1);
    group.add(hbSprite);

    return { group, type: 'boss', healthBar: hbSprite, glowLight: eyeGlow, walkAnim: { t: 0 } };
  }

  updateZombieHealth(id: string, hp: number, maxHp: number) {
    const model = this.zombieModels.get(id);
    if (!model || !model.healthBar) return;

    const pct = Math.max(0, hp / maxHp);
    const canvas = model.healthBar.material.map.image as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, w, h);

    // Health
    const color = pct > 0.6 ? '#00ff44' : pct > 0.3 ? '#ffcc00' : '#ff2200';
    ctx.fillStyle = color;
    ctx.fillRect(1, 1, (w - 2) * pct, h - 2);

    model.healthBar.material.map.needsUpdate = true;
  }

  updateZombiePosition(id: string, x: number, y: number, z: number, rot: number, dt: number, moving: boolean) {
    const model = this.zombieModels.get(id);
    if (!model) return;

    model.group.position.set(x, y, z);
    model.group.rotation.y = rot;

    // Walk animation
    if (moving && model.walkAnim) {
      model.walkAnim.t += dt * 5;
      const swing = Math.sin(model.walkAnim.t) * 0.3;
      // Animate legs/arms
      const children = model.group.children;
      children.forEach((child: any) => {
        if (child.position.x < -0.15 && child.position.y < 0.8) {
          child.rotation.x = swing;
        } else if (child.position.x > 0.15 && child.position.y < 0.8) {
          child.rotation.x = -swing;
        }
      });
    }
  }

  removeZombie(id: string) {
    const model = this.zombieModels.get(id);
    if (!model) return;
    this.scene.remove(model.group);
    // Dispose geometries
    model.group.traverse((child: any) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m: any) => m.dispose());
        else child.material.dispose();
      }
    });
    this.zombieModels.delete(id);
  }

  getZombieModel(id: string): ZombieModel | undefined {
    return this.zombieModels.get(id);
  }

  // ---- PLAYER MODELS ----

  createPlayerModel(id: string): PlayerModel {
    const group = new THREE.Group();

    // Body
    const bodyGeo = new THREE.BoxGeometry(0.6, 0.8, 0.4);
    const bodyMat = new THREE.MeshLambertMaterial({ color: 0x3a5a2a });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.9;
    body.castShadow = true;
    group.add(body);

    // Head
    const headGeo = new THREE.BoxGeometry(0.45, 0.45, 0.45);
    const headMat = new THREE.MeshLambertMaterial({ color: 0xcc9966 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 1.55;
    head.castShadow = true;
    group.add(head);

    // Helmet
    const helmetGeo = new THREE.BoxGeometry(0.5, 0.3, 0.5);
    const helmetMat = new THREE.MeshLambertMaterial({ color: 0x2a3a1a });
    const helmet = new THREE.Mesh(helmetGeo, helmetMat);
    helmet.position.y = 1.75;
    group.add(helmet);

    // Arms
    const armGeo = new THREE.BoxGeometry(0.2, 0.6, 0.2);
    const armMat = new THREE.MeshLambertMaterial({ color: 0x3a5a2a });
    const armL = new THREE.Mesh(armGeo, armMat);
    armL.position.set(-0.4, 0.9, 0);
    armL.castShadow = true;
    group.add(armL);
    const armR = new THREE.Mesh(armGeo, armMat);
    armR.position.set(0.4, 0.9, 0);
    armR.castShadow = true;
    group.add(armR);

    // Legs
    const legGeo = new THREE.BoxGeometry(0.22, 0.6, 0.22);
    const legMat = new THREE.MeshLambertMaterial({ color: 0x1a2a1a });
    const legL = new THREE.Mesh(legGeo, legMat);
    legL.position.set(-0.16, 0.3, 0);
    legL.castShadow = true;
    group.add(legL);
    const legR = new THREE.Mesh(legGeo, legMat);
    legR.position.set(0.16, 0.3, 0);
    legR.castShadow = true;
    group.add(legR);

    // Weapon placeholder
    const weapGeo = new THREE.BoxGeometry(0.1, 0.1, 0.6);
    const weapMat = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
    const weap = new THREE.Mesh(weapGeo, weapMat);
    weap.position.set(0.35, 0.9, 0.3);
    group.add(weap);

    // Name tag
    const nameCanvas = document.createElement('canvas');
    nameCanvas.width = 128; nameCanvas.height = 32;
    const nameCtx = nameCanvas.getContext('2d')!;
    nameCtx.fillStyle = 'rgba(0,0,0,0.7)';
    nameCtx.fillRect(0, 0, 128, 32);
    nameCtx.fillStyle = '#00ff88';
    nameCtx.font = 'bold 16px Courier New';
    nameCtx.textAlign = 'center';
    nameCtx.fillText(id.substring(0, 8), 64, 22);
    const nameTex = new THREE.CanvasTexture(nameCanvas);
    const nameSpriteMat = new THREE.SpriteMaterial({ map: nameTex, transparent: true });
    const nameSprite = new THREE.Sprite(nameSpriteMat);
    nameSprite.position.y = 2.1;
    nameSprite.scale.set(1.5, 0.4, 1);
    group.add(nameSprite);

    this.scene.add(group);
    const playerModel: PlayerModel = { group, body, head, weaponMesh: weap };
    this.playerModels.set(id, playerModel);
    return playerModel;
  }

  updatePlayerModel(id: string, x: number, y: number, z: number, rot: number, crouching: boolean, weapon: string) {
    const model = this.playerModels.get(id);
    if (!model) return;
    model.group.position.set(x, y, z);
    model.group.rotation.y = rot;

    // Crouch effect
    const scaleY = crouching ? 0.7 : 1.0;
    model.group.scale.y = scaleY;

    // Weapon visibility by type
    if (model.weaponMesh) {
      (model.weaponMesh.material as any).color.set(weapon === 'ak47' ? 0x2a2a2a : 0x3a3a3a);
    }
  }

  removePlayerModel(id: string) {
    const model = this.playerModels.get(id);
    if (!model) return;
    this.scene.remove(model.group);
    model.group.traverse((child: any) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m: any) => m.dispose());
        else child.material.dispose();
      }
    });
    this.playerModels.delete(id);
  }

  // ---- EFFECTS ----

  spawnBlood(x: number, y: number, z: number, count = 8) {
    const ps = this.createParticleSystem(count, {
      color: 0xcc0000,
      size: 0.08,
      life: 0.6,
      speed: 3,
      gravity: -10,
      position: { x, y, z },
    });
    this.particleSystems.push(ps);
  }

  spawnExplosion(x: number, y: number, z: number) {
    // Orange fire particles
    const ps = this.createParticleSystem(30, {
      color: 0xff6600,
      size: 0.25,
      life: 1.0,
      speed: 8,
      gravity: -3,
      position: { x, y, z },
    });
    this.particleSystems.push(ps);

    // White flash
    const ps2 = this.createParticleSystem(15, {
      color: 0xffffaa,
      size: 0.4,
      life: 0.3,
      speed: 12,
      gravity: 0,
      position: { x, y, z },
    });
    this.particleSystems.push(ps2);

    // Light flash
    const light = new THREE.PointLight(0xff4400, 5, 15);
    light.position.set(x, y, z);
    this.scene.add(light);
    setTimeout(() => this.scene.remove(light), 300);

    // Shockwave ring
    this.spawnShockwave(x, y, z, 0xff4400, 6);
  }

  spawnShockwave(x: number, _y: number, z: number, color: number, maxRadius: number) {
    const geo = new THREE.RingGeometry(0.1, 0.5, 32);
    const mat = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
    const ring = new THREE.Mesh(geo, mat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.05, z);
    this.scene.add(ring);

    let r = 0.5;
    const animate = () => {
      r += 0.4;
      ring.geometry.dispose();
      ring.geometry = new THREE.RingGeometry(r - 0.3, r, 32);
      mat.opacity = Math.max(0, 0.8 * (1 - r / maxRadius));
      ring.scale.set(1, 1, 1);
      if (r < maxRadius) {
        requestAnimationFrame(animate);
      } else {
        this.scene.remove(ring);
        ring.geometry.dispose();
        mat.dispose();
      }
    };
    requestAnimationFrame(animate);
  }

  spawnMuzzleFlash(x: number, y: number, z: number) {
    const light = new THREE.PointLight(0xffff88, 3, 4);
    light.position.set(x, y, z);
    this.scene.add(light);
    setTimeout(() => this.scene.remove(light), 60);
  }

  spawnBulletTrail(from: { x: number; y: number; z: number }, to: { x: number; y: number; z: number }) {
    const points = [
      new THREE.Vector3(from.x, from.y, from.z),
      new THREE.Vector3(to.x, to.y, to.z),
    ];
    const geo = new THREE.BufferGeometry().setFromPoints(points);
    const mat = new THREE.LineBasicMaterial({ color: 0xffff88, transparent: true, opacity: 0.7 });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.bulletTrails.push({ line, life: 0.1 });
  }

  createAcidPool(id: string, x: number, z: number, radius: number) {
    const geo = new THREE.CircleGeometry(radius, 16);
    const mat = new THREE.MeshBasicMaterial({ color: 0x44ff00, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(x, 0.02, z);
    this.scene.add(mesh);

    // Glow
    const glow = new THREE.PointLight(0x44ff00, 0.8, radius * 2);
    glow.position.set(x, 0.5, z);
    this.scene.add(glow);

    this.acidPoolMeshes.set(id, { mesh, glow });
  }

  removeAcidPool(id: string) {
    const pool = this.acidPoolMeshes.get(id);
    if (!pool) return;
    this.scene.remove(pool.mesh);
    this.scene.remove(pool.glow);
    pool.mesh.geometry.dispose();
    pool.mesh.material.dispose();
    this.acidPoolMeshes.delete(id);
  }

  createTrapEffect(trapId: string, x: number, z: number, type: 'electric' | 'flamethrower') {
    const meshes: any[] = [];
    if (type === 'electric') {
      // Electric field
      const geoE = new THREE.CylinderGeometry(8, 8, 0.1, 32, 1, true);
      const matE = new THREE.MeshBasicMaterial({ color: 0x00aaff, transparent: true, opacity: 0.3, side: THREE.DoubleSide, wireframe: true });
      const electric = new THREE.Mesh(geoE, matE);
      electric.position.set(x, 0.1, z);
      this.scene.add(electric);
      meshes.push(electric);

      // Light
      const light = new THREE.PointLight(0x0088ff, 2, 12);
      light.position.set(x, 1, z);
      this.scene.add(light);
      meshes.push(light);
    } else {
      // Flame effect
      const geoF = new THREE.ConeGeometry(8, 3, 16);
      const matF = new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
      const flame = new THREE.Mesh(geoF, matF);
      flame.position.set(x, 1.5, z);
      this.scene.add(flame);
      meshes.push(flame);

      const light = new THREE.PointLight(0xff6600, 3, 15);
      light.position.set(x, 2, z);
      this.scene.add(light);
      meshes.push(light);
    }
    this.trapEffects.set(trapId, meshes);
  }

  removeTrapEffect(trapId: string) {
    const meshes = this.trapEffects.get(trapId);
    if (!meshes) return;
    meshes.forEach(m => {
      this.scene.remove(m);
      if (m.geometry) m.geometry.dispose();
      if (m.material) m.material.dispose();
    });
    this.trapEffects.delete(trapId);
  }

  spawnDropItem(id: string, x: number, z: number, type: 'medkit') {
    const geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
    const mat = new THREE.MeshLambertMaterial({ color: type === 'medkit' ? 0xff4444 : 0xffcc00 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, 0.25, z);
    mesh.castShadow = true;

    // Cross symbol for medkit
    if (type === 'medkit') {
      const c1 = new THREE.Mesh(
        new THREE.BoxGeometry(0.15, 0.4, 0.1),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      c1.position.z = 0.26;
      mesh.add(c1);
      const c2 = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.15, 0.1),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      c2.position.z = 0.26;
      mesh.add(c2);
    }

    // Glow
    const glow = new THREE.PointLight(type === 'medkit' ? 0xff4444 : 0xffcc00, 0.8, 4);
    glow.position.set(x, 1, z);
    this.scene.add(glow);

    (mesh as any).glowRef = glow;
    (mesh as any).floatT = Math.random() * Math.PI * 2;
    this.scene.add(mesh);
    this.dropItems.set(id, mesh);
  }

  removeDropItem(id: string) {
    const mesh = this.dropItems.get(id);
    if (!mesh) return;
    if ((mesh as any).glowRef) this.scene.remove((mesh as any).glowRef);
    this.scene.remove(mesh);
    mesh.traverse((child: any) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) {
        if (Array.isArray(child.material)) child.material.forEach((m: any) => m.dispose());
        else child.material.dispose();
      }
    });
    this.dropItems.delete(id);
  }

  spawnVictoryFireworks(cx: number, cz: number) {
    const colors = [0xff2200, 0x00ff88, 0xffcc00, 0x0088ff, 0xff00ff];
    let count = 0;
    const launch = () => {
      if (count++ > 30) return;
      const x = cx + (Math.random() - 0.5) * 40;
      const z = cz + (Math.random() - 0.5) * 40;
      const y = 10 + Math.random() * 20;
      const color = colors[Math.floor(Math.random() * colors.length)];
      const ps = this.createParticleSystem(20, {
        color,
        size: 0.3,
        life: 1.5,
        speed: 6,
        gravity: -5,
        position: { x, y, z },
      });
      this.particleSystems.push(ps);
      const light = new THREE.PointLight(color, 3, 20);
      light.position.set(x, y, z);
      this.scene.add(light);
      setTimeout(() => this.scene.remove(light), 500);
      setTimeout(launch, 300 + Math.random() * 400);
    };
    launch();
  }

  private createParticleSystem(count: number, config: {
    color: number;
    size: number;
    life: number;
    speed: number;
    gravity: number;
    position: { x: number; y: number; z: number };
  }): ParticleSystem {
    const particles: ParticleSystem['particles'] = [];

    for (let i = 0; i < count; i++) {
      const geo = new THREE.SphereGeometry(config.size, 4, 4);
      const mat = new THREE.MeshBasicMaterial({ color: config.color, transparent: true, opacity: 1 });
      const mesh = new THREE.Mesh(geo, mat);

      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const spd = config.speed * (0.5 + Math.random() * 0.5);

      mesh.position.set(config.position.x, config.position.y, config.position.z);
      this.scene.add(mesh);

      particles.push({
        mesh,
        velocity: {
          x: Math.sin(phi) * Math.cos(theta) * spd,
          y: Math.cos(phi) * spd,
          z: Math.sin(phi) * Math.sin(theta) * spd,
        },
        life: config.life,
        maxLife: config.life,
      });
    }

    const scene = this.scene;
    return {
      particles,
      update(dt: number) {
        for (let i = particles.length - 1; i >= 0; i--) {
          const p = particles[i];
          p.life -= dt;
          if (p.life <= 0) {
            scene.remove(p.mesh);
            p.mesh.geometry.dispose();
            p.mesh.material.dispose();
            particles.splice(i, 1);
            continue;
          }
          p.velocity.y += config.gravity * dt;
          p.mesh.position.x += p.velocity.x * dt;
          p.mesh.position.y += p.velocity.y * dt;
          p.mesh.position.z += p.velocity.z * dt;
          (p.mesh.material as any).opacity = Math.max(0, p.life / p.maxLife);
        }
      },
      dispose() {
        particles.forEach(p => {
          scene.remove(p.mesh);
          p.mesh.geometry.dispose();
          p.mesh.material.dispose();
        });
        particles.length = 0;
      }
    };
  }

  update(dt: number) {
    // Update particles
    for (let i = this.particleSystems.length - 1; i >= 0; i--) {
      const ps = this.particleSystems[i];
      ps.update(dt);
      if (ps.particles.length === 0) {
        this.particleSystems.splice(i, 1);
      }
    }

    // Update bullet trails
    for (let i = this.bulletTrails.length - 1; i >= 0; i--) {
      const bt = this.bulletTrails[i];
      bt.life -= dt;
      if (bt.life <= 0) {
        this.scene.remove(bt.line);
        bt.line.geometry.dispose();
        bt.line.material.dispose();
        this.bulletTrails.splice(i, 1);
      }
    }

    // Animate drop items
    this.dropItems.forEach((mesh) => {
      (mesh as any).floatT = ((mesh as any).floatT || 0) + dt;
      mesh.position.y = 0.25 + Math.sin((mesh as any).floatT * 2) * 0.1;
      mesh.rotation.y += dt;
    });

    // Animate acid pools
    this.acidPoolMeshes.forEach((pool) => {
      const t = Date.now() * 0.002;
      (pool.mesh.material as any).opacity = 0.4 + Math.sin(t) * 0.15;
    });
  }

  dispose() {
    this.particleSystems.forEach(ps => ps.dispose());
    this.bulletTrails.forEach(bt => { this.scene.remove(bt.line); bt.line.geometry.dispose(); });
    this.zombieModels.forEach((_, id) => this.removeZombie(id));
    this.playerModels.forEach((_, id) => this.removePlayerModel(id));
    this.acidPoolMeshes.forEach((_, id) => this.removeAcidPool(id));
    this.dropItems.forEach((_, id) => this.removeDropItem(id));
  }
}
