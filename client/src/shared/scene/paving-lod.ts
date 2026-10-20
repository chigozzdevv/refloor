import { Vector3 } from 'three';
import type { Camera } from 'three';
import type { exteriorLayout } from '@/shared/scene/exterior';

export type PavingRegion = { x: number; z: number; width: number; depth: number; y: number };

export function pavingRegions(site: ReturnType<typeof exteriorLayout>): PavingRegion[] {
  const compound = site.compound,
    pad = site.paving[0]!,
    minX = compound.x,
    maxX = compound.x + compound.width,
    minZ = compound.z,
    maxZ = compound.z + compound.depth,
    left = Math.max(minX, pad.position.x - pad.width / 2),
    right = Math.min(maxX, pad.position.x + pad.width / 2),
    front = Math.max(minZ, pad.position.z - pad.depth / 2),
    back = Math.min(maxZ, pad.position.z + pad.depth / 2),
    y = site.ground.elevation - 0.095;
  return [
    { x: (minX + maxX) / 2, z: (minZ + front) / 2, width: maxX - minX, depth: front - minZ, y },
    { x: (minX + maxX) / 2, z: (back + maxZ) / 2, width: maxX - minX, depth: maxZ - back, y },
    { x: (minX + left) / 2, z: (front + back) / 2, width: left - minX, depth: back - front, y },
    { x: (right + maxX) / 2, z: (front + back) / 2, width: maxX - right, depth: back - front, y },
  ].filter((region) => region.width > 1e-6 && region.depth > 1e-6);
}

export class PavingLod {
  detailed = false;

  update(projectedPixels: number) {
    if (this.detailed && projectedPixels < 18) this.detailed = false;
    else if (!this.detailed && projectedPixels > 24) this.detailed = true;
    return this.detailed;
  }
}

export class PavingProjection {
  private centre = new Vector3();
  private a = new Vector3();
  private b = new Vector3();
  private c = new Vector3();
  private cameraPosition = new Vector3();
  private direction = new Vector3();

  constructor(private regions: PavingRegion[]) {}

  measure(camera: Camera, width: number, height: number) {
    camera.getWorldPosition(this.cameraPosition);
    camera.getWorldDirection(this.direction);
    let maximum = 0;
    for (const region of this.regions) {
      const left = region.x - region.width / 2,
        right = region.x + region.width / 2,
        front = region.z - region.depth / 2,
        back = region.z + region.depth / 2;
      for (let sample = 0; sample < 8; sample++) {
        let x = region.x,
          z = region.z;
        if (sample < 4) {
          x = sample % 2 ? left + 0.22 : right - 0.22;
          z = sample < 2 ? front + 0.11 : back - 0.11;
        } else if (sample > 4) {
          const ahead = sample === 5 ? 2 : sample === 6 ? 5 : 10;
          x = Math.max(
            left + 0.22,
            Math.min(right - 0.22, this.cameraPosition.x + this.direction.x * ahead),
          );
          z = Math.max(
            front + 0.11,
            Math.min(back - 0.11, this.cameraPosition.z + this.direction.z * ahead),
          );
        }
        this.centre.set(x, region.y, z).project(camera);
        if (
          Math.abs(this.centre.x) > 1.1 ||
          Math.abs(this.centre.y) > 1.1 ||
          Math.abs(this.centre.z) > 1
        )
          continue;
        this.a.set(x - 0.215, region.y, z - 0.105).project(camera);
        this.b.set(x + 0.215, region.y, z - 0.105).project(camera);
        this.c.set(x - 0.215, region.y, z + 0.105).project(camera);
        const ax = ((this.b.x - this.a.x) * width) / 2,
          ay = ((this.b.y - this.a.y) * height) / 2,
          bx = ((this.c.x - this.a.x) * width) / 2,
          by = ((this.c.y - this.a.y) * height) / 2,
          longest = Math.max(Math.hypot(ax, ay), Math.hypot(bx, by));
        if (longest > 0) maximum = Math.max(maximum, Math.abs(ax * by - ay * bx) / longest);
      }
    }
    return maximum;
  }
}
