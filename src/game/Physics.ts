// Physics - Collision detection and resolution

import { AABB } from './types';
import { MapObject } from './MapBuilder';

export class Physics {
  private collisionObjects: MapObject[] = [];

  setCollisionObjects(objects: MapObject[]) {
    this.collisionObjects = objects;
  }

  // AABB vs AABB overlap test
  aabbOverlap(a: AABB, b: AABB): boolean {
    return (
      a.minX < b.maxX && a.maxX > b.minX &&
      a.minY < b.maxY && a.maxY > b.minY &&
      a.minZ < b.maxZ && a.maxZ > b.minZ
    );
  }

  // Check if a point is inside any collision AABB
  pointInAny(x: number, y: number, z: number, margin = 0): boolean {
    for (const obj of this.collisionObjects) {
      const b = obj.aabb;
      if (
        x > b.minX - margin && x < b.maxX + margin &&
        y > b.minY - margin && y < b.maxY + margin &&
        z > b.minZ - margin && z < b.maxZ + margin
      ) return true;
    }
    return false;
  }

  // Resolve movement: try to slide along walls if blocked
  resolveMovement(
    ox: number, oy: number, oz: number, // origin
    nx: number, ny: number, nz: number, // desired new position
    radius: number, height: number
  ): { x: number; y: number; z: number; onGround: boolean } {
    let x = nx, y = ny, z = nz;

    // Build AABB for the entity
    const entityAABB = (ex: number, ey: number, ez: number): AABB => ({
      minX: ex - radius,
      maxX: ex + radius,
      minY: ey,
      maxY: ey + height,
      minZ: ez - radius,
      maxZ: ez + radius,
    });

    // Ground check
    let onGround = false;
    if (y <= 0) {
      y = 0;
      onGround = true;
    }

    // Check X movement independently
    const eaabb = entityAABB(x, oy, oz);
    let blockedX = false;
    for (const obj of this.collisionObjects) {
      if (this.aabbOverlap(eaabb, obj.aabb)) {
        blockedX = true;
        break;
      }
    }
    if (blockedX) {
      x = ox;
    }

    // Check Z movement independently
    const zaabb = entityAABB(x, oy, z);
    let blockedZ = false;
    for (const obj of this.collisionObjects) {
      if (this.aabbOverlap(zaabb, obj.aabb)) {
        blockedZ = true;
        break;
      }
    }
    if (blockedZ) {
      z = oz;
    }

    // Check Y (vertical)
    const yaabb = entityAABB(x, y, z);
    for (const obj of this.collisionObjects) {
      if (this.aabbOverlap(yaabb, obj.aabb)) {
        // Push out upward or downward
        const b = obj.aabb;
        if (oy + height <= b.minY + 0.1) {
          // Coming from below - push down
          y = b.minY - height - 0.01;
        } else if (oy >= b.maxY - 0.1) {
          // Standing on top
          y = b.maxY;
          onGround = true;
        }
        break;
      }
    }

    // Clamp to map bounds
    const MAP_HALF = 54;
    x = Math.max(-MAP_HALF + radius, Math.min(MAP_HALF - radius, x));
    z = Math.max(-MAP_HALF + radius, Math.min(MAP_HALF - radius, z));
    y = Math.max(0, y);

    return { x, y, z, onGround };
  }

  // Raycast against all collision objects and optionally against zombie list
  raycast(
    origin: { x: number; y: number; z: number },
    direction: { x: number; y: number; z: number },
    maxDist: number
  ): { hit: boolean; point: { x: number; y: number; z: number }; dist: number; hitWall: boolean } {
    let closestDist = maxDist;
    let hitPoint = { x: origin.x + direction.x * maxDist, y: origin.y + direction.y * maxDist, z: origin.z + direction.z * maxDist };
    let hitWall = false;

    for (const obj of this.collisionObjects) {
      const result = this.rayAABB(origin, direction, obj.aabb, maxDist);
      if (result !== null && result < closestDist) {
        closestDist = result;
        hitPoint = {
          x: origin.x + direction.x * result,
          y: origin.y + direction.y * result,
          z: origin.z + direction.z * result,
        };
        hitWall = true;
      }
    }

    return {
      hit: hitWall,
      point: hitPoint,
      dist: closestDist,
      hitWall,
    };
  }

  // Ray vs AABB intersection (slab method)
  rayAABB(
    origin: { x: number; y: number; z: number },
    dir: { x: number; y: number; z: number },
    aabb: AABB,
    maxDist: number
  ): number | null {
    let tmin = 0;
    let tmax = maxDist;

    const axes = [
      { o: origin.x, d: dir.x, min: aabb.minX, max: aabb.maxX },
      { o: origin.y, d: dir.y, min: aabb.minY, max: aabb.maxY },
      { o: origin.z, d: dir.z, min: aabb.minZ, max: aabb.maxZ },
    ];

    for (const ax of axes) {
      if (Math.abs(ax.d) < 1e-9) {
        if (ax.o < ax.min || ax.o > ax.max) return null;
      } else {
        const t1 = (ax.min - ax.o) / ax.d;
        const t2 = (ax.max - ax.o) / ax.d;
        const tNear = Math.min(t1, t2);
        const tFar = Math.max(t1, t2);
        tmin = Math.max(tmin, tNear);
        tmax = Math.min(tmax, tFar);
        if (tmin > tmax) return null;
      }
    }

    return tmin >= 0 ? tmin : (tmax >= 0 ? tmax : null);
  }

  // Check if a ray hits an axis-aligned sphere (for zombie hit detection)
  raySphere(
    origin: { x: number; y: number; z: number },
    dir: { x: number; y: number; z: number },
    center: { x: number; y: number; z: number },
    radius: number,
    maxDist: number
  ): number | null {
    const dx = center.x - origin.x;
    const dy = center.y - origin.y;
    const dz = center.z - origin.z;

    const tca = dx * dir.x + dy * dir.y + dz * dir.z;
    if (tca < 0) return null;

    const d2 = dx * dx + dy * dy + dz * dz - tca * tca;
    const r2 = radius * radius;
    if (d2 > r2) return null;

    const thc = Math.sqrt(r2 - d2);
    const t0 = tca - thc;
    const t1 = tca + thc;

    if (t0 > 0 && t0 <= maxDist) return t0;
    if (t1 > 0 && t1 <= maxDist) return t1;
    return null;
  }

  // Simple distance check for two positions
  distance2D(ax: number, az: number, bx: number, bz: number): number {
    const dx = ax - bx;
    const dz = az - bz;
    return Math.sqrt(dx * dx + dz * dz);
  }

  distance3D(a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }): number {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    const dz = a.z - b.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
}
