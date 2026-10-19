import RAPIER from '@dimforge/rapier3d-compat';
import type { CompiledBuilding, Point3, NavigationPoint } from '@refloor/engine';
import { distanceToBox, rotate } from '@refloor/engine/math';
import { entryPose } from '@/shared/navigation/entry';
import { exteriorLayout } from '@/shared/scene/exterior';

let initialized: Promise<void> | undefined;
export function initializePhysics(): Promise<void> {
  return (initialized ??= RAPIER.init());
}

export class CharacterWorld {
  readonly world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  readonly body: RAPIER.RigidBody;
  readonly capsule: RAPIER.Collider;
  readonly controller: RAPIER.KinematicCharacterController;
  private readonly colliders = new Map<string, RAPIER.Collider>();
  private readonly doorFractions = new Map<string, number>();
  private velocityY = 0;
  private accumulator = 0;

  constructor(
    readonly compiled: CompiledBuilding,
    position?: Point3,
  ) {
    const feet = position ?? entryPose(compiled).inside;
    for (const source of compiled.colliders) {
      const desc =
        source.shape === 'box'
          ? RAPIER.ColliderDesc.cuboid(source.size.x / 2, source.size.y / 2, source.size.z / 2)
          : RAPIER.ColliderDesc.trimesh(
              Float32Array.from(source.mesh.positions),
              Uint32Array.from(source.mesh.indices),
            );
      desc.setTranslation(source.position.x, source.position.y, source.position.z);
      desc.setRotation({
        x: 0,
        y: Math.sin(source.rotation / 2),
        z: 0,
        w: Math.cos(source.rotation / 2),
      });
      this.colliders.set(source.id, this.world.createCollider(desc));
    }
    const site = exteriorLayout(compiled);
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(
        site.compound.width / 2,
        0.03,
        site.compound.depth / 2,
      ).setTranslation(
        site.compound.x + site.compound.width / 2,
        site.ground.elevation - 0.125,
        site.compound.z + site.compound.depth / 2,
      ),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(100, 0.1, 100).setTranslation(
        site.centre.x,
        site.ground.elevation - 0.305,
        site.centre.z,
      ),
    );
    for (const paving of site.paving)
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(paving.width / 2, paving.height / 2, paving.depth / 2)
          .setTranslation(paving.position.x, paving.position.y, paving.position.z)
          .setRotation({
            x: 0,
            y: Math.sin(paving.rotation / 2),
            z: 0,
            w: Math.cos(paving.rotation / 2),
          }),
      );
    const { height, radius, stepHeight } = compiled.options;
    this.body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
        feet.x,
        feet.y + height / 2 + (position ? 0 : 0.025),
        feet.z,
      ),
    );
    this.capsule = this.world.createCollider(
      RAPIER.ColliderDesc.capsule(height / 2 - radius, radius),
      this.body,
    );
    this.controller = this.world.createCharacterController(compiled.options.clearance + 0.005);
    this.controller.enableAutostep(stepHeight, 0.2, false);
    this.controller.enableSnapToGround(stepHeight + 0.05);
    this.controller.setMaxSlopeClimbAngle(Math.PI / 4);
    this.world.step();
  }

  get feet(): Point3 {
    const point = this.body.translation();
    return { x: point.x, y: point.y - this.compiled.options.height / 2, z: point.z };
  }
  get player(): NavigationPoint {
    const position = this.feet;
    const floors = [...this.compiled.building.floors].sort((a, b) => b.elevation - a.elevation);
    const floor = floors.find((value) => value.elevation <= position.y + 0.12) ?? floors.at(-1);
    return { floorId: floor?.id ?? '', position };
  }

  teleport(feet: Point3): void {
    this.body.setTranslation(
      { x: feet.x, y: feet.y + this.compiled.options.height / 2 + 0.025, z: feet.z },
      true,
    );
    this.body.setNextKinematicTranslation(this.body.translation());
    this.velocityY = 0;
    this.accumulator = 0;
    this.world.step();
  }

  step(direction: { x: number; z: number }, delta: number): void {
    const feet = this.feet;
    const swinging = this.compiled.doors.some(
      (door) =>
        door.hinge.y + door.height > feet.y + 0.1 &&
        door.hinge.y < feet.y + this.compiled.options.height &&
        Math.abs(this.doorFraction(door.id) - Number(door.open)) > 0.015 &&
        Math.hypot(feet.x - door.hinge.x, feet.z - door.hinge.z) <
          door.width + this.compiled.options.radius + 0.45,
    );
    if (swinging) direction = { x: 0, z: 0 };
    this.accumulator = Math.min(0.1, this.accumulator + delta);
    while (this.accumulator >= 1 / 60) {
      const point = this.body.translation();
      this.velocityY = this.controller.computedGrounded()
        ? -9.81 / 60
        : Math.max(-20, this.velocityY - 9.81 / 60);
      this.controller.computeColliderMovement(this.capsule, {
        x: direction.x / 60,
        y: this.velocityY / 60,
        z: direction.z / 60,
      });
      const movement = this.controller.computedMovement();
      this.body.setNextKinematicTranslation({
        x: point.x + movement.x,
        y: point.y + movement.y,
        z: point.z + movement.z,
      });
      this.world.step();
      this.accumulator -= 1 / 60;
    }
    if (this.feet.y < (this.compiled.building.floors[0]?.elevation ?? 0) - 3) {
      const entry = entryPose(this.compiled).inside;
      this.body.setTranslation(
        { x: entry.x, y: entry.y + this.compiled.options.height / 2 + 0.02, z: entry.z },
        true,
      );
      this.velocityY = 0;
    }
  }

  doorPose(id: string, fraction: number) {
    const portal = this.compiled.doors.find((value) => value.id === id),
      source = this.compiled.colliders.find((value) => value.id === `${id}:leaf`);
    if (!portal || !source || source.shape !== 'box') return null;
    const local = rotate(
      { x: source.position.x - portal.hinge.x, z: source.position.z - portal.hinge.z },
      -source.rotation,
    );
    const angle = portal.rotation + portal.openingAngle * fraction,
      point = rotate({ x: local.x, z: 0 }, angle);
    return {
      ...source,
      rotation: angle,
      position: { x: portal.hinge.x + point.x, y: source.position.y, z: portal.hinge.z + point.z },
    };
  }
  doorBlocked(id: string, fraction: number): boolean {
    const pose = this.doorPose(id, fraction),
      feet = this.feet;
    if (
      !pose ||
      pose.position.y + pose.size.y / 2 <= feet.y + 0.1 ||
      pose.position.y - pose.size.y / 2 >= feet.y + this.compiled.options.height
    )
      return false;
    return (
      distanceToBox(feet, pose) <
      this.compiled.options.radius + this.compiled.options.clearance + 0.005
    );
  }
  doorFraction(id: string): number {
    return (
      this.doorFractions.get(id) ?? Number(this.compiled.doors.find((door) => door.id === id)?.open)
    );
  }
  canSwingDoor(id: string, open: boolean): boolean {
    const from = this.doorFraction(id),
      to = Number(open);
    const steps = Math.max(1, Math.ceil(Math.abs(to - from) * 40));
    for (let step = 1; step <= steps; step++)
      if (this.doorBlocked(id, from + ((to - from) * step) / steps)) return false;
    return true;
  }
  setDoorFraction(id: string, fraction: number): void {
    const pose = this.doorPose(id, fraction),
      collider = this.colliders.get(`${id}:leaf`);
    if (!pose || !collider) return;
    this.doorFractions.set(id, fraction);
    collider.setTranslation(pose.position);
    collider.setRotation({
      x: 0,
      y: Math.sin(pose.rotation / 2),
      z: 0,
      w: Math.cos(pose.rotation / 2),
    });
  }
  dispose(): void {
    this.world.free();
  }
}
