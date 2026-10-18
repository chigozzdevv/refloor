import RAPIER from '@dimforge/rapier3d-compat';
import type { CompiledBuilding, Point3, NavigationPoint } from '@refloor/engine';
import { distanceToBox, rotate } from '@refloor/engine/math';
import { entryPose } from '@/shared/navigation/entry';

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
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(100, 0.1, 100).setTranslation(6, -0.305, 5),
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
    this.controller = this.world.createCharacterController(0.01);
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
    return distanceToBox(feet, pose) < this.compiled.options.radius + 0.025;
  }
  setDoorFraction(id: string, fraction: number): void {
    const pose = this.doorPose(id, fraction),
      collider = this.colliders.get(`${id}:leaf`);
    if (!pose || !collider) return;
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
