import RAPIER from '@dimforge/rapier3d-compat';
import type { CompiledBuilding, Point3 } from '@refloor/engine';

export async function createPhysics(compiled: CompiledBuilding) {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  for (const collider of compiled.colliders) {
    const descriptor =
      collider.shape === 'box'
        ? RAPIER.ColliderDesc.cuboid(collider.size.x / 2, collider.size.y / 2, collider.size.z / 2)
        : RAPIER.ColliderDesc.trimesh(
            Float32Array.from(collider.mesh.positions),
            Uint32Array.from(collider.mesh.indices),
          );
    descriptor.setTranslation(collider.position.x, collider.position.y, collider.position.z);
    descriptor.setRotation({
      x: 0,
      y: Math.sin(collider.rotation / 2),
      z: 0,
      w: Math.cos(collider.rotation / 2),
    });
    world.createCollider(descriptor);
  }
  world.step();
  return world;
}

export function walkPath(world: RAPIER.World, compiled: CompiledBuilding, path: Point3[]): Point3 {
  const start = path[0];
  if (!start) throw new Error('Walking path is empty');
  const { height, radius, stepHeight } = compiled.options;
  const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
      start.x,
      start.y + height / 2 + 0.03,
      start.z,
    ),
  );
  const collider = world.createCollider(
    RAPIER.ColliderDesc.capsule(height / 2 - radius, radius),
    body,
  );
  const controller = world.createCharacterController(0.01);
  controller.enableAutostep(stepHeight, 0.2, false);
  controller.enableSnapToGround(stepHeight + 0.05);
  controller.setMaxSlopeClimbAngle(Math.PI / 4);
  world.step();
  let velocityY = 0;
  for (const target of path) {
    let arrived = false;
    for (let frame = 0; frame < 360; frame++) {
      const position = body.translation(),
        dx = target.x - position.x,
        dz = target.z - position.z,
        remaining = Math.hypot(dx, dz);
      if (remaining < 0.04) {
        arrived = true;
        break;
      }
      const amount = Math.min(remaining, 1.5 / 60);
      velocityY = controller.computedGrounded() ? -9.81 / 60 : velocityY - 9.81 / 60;
      controller.computeColliderMovement(collider, {
        x: (dx / remaining) * amount,
        y: velocityY / 60,
        z: (dz / remaining) * amount,
      });
      const movement = controller.computedMovement();
      body.setNextKinematicTranslation({
        x: position.x + movement.x,
        y: position.y + movement.y,
        z: position.z + movement.z,
      });
      world.step();
    }
    if (!arrived) {
      const position = body.translation();
      world.removeRigidBody(body);
      world.removeCharacterController(controller);
      throw new Error(
        `Character stuck at ${JSON.stringify(position)} while approaching ${JSON.stringify(target)}`,
      );
    }
  }
  for (let i = 0; i < 60; i++) {
    const position = body.translation();
    controller.computeColliderMovement(collider, { x: 0, y: -9.81 / 3600, z: 0 });
    const movement = controller.computedMovement();
    body.setNextKinematicTranslation({
      x: position.x + movement.x,
      y: position.y + movement.y,
      z: position.z + movement.z,
    });
    world.step();
  }
  const position = body.translation(),
    result = { x: position.x, y: position.y - height / 2, z: position.z };
  world.removeRigidBody(body);
  world.removeCharacterController(controller);
  return result;
}

export { RAPIER };
