import type { CompiledBuilding, Point3 } from '@refloor/engine';
import type { EditMemory } from '@refloor/scene/edit-memory';
import type { SceneCommand } from '@refloor/scene';
import { MathUtils } from 'three';
import { arrivalView } from '@/shared/navigation/arrival';
import { doorRoute } from '@/shared/navigation/door-route';
import { smoothRoute } from '@/shared/navigation/destinations';
import { createJourney, stepJourney } from '@/shared/navigation/journey';
import type { Journey } from '@/shared/navigation/journey';
import type { CharacterWorld } from '@/shared/navigation/physics-world';
import { TourDoors } from '@/shared/navigation/tour-doors';
import type { TravelRequest } from '@/shared/navigation/navigation-store';

export type WalkView = { yaw: number; pitch: number };
export type WalkStep = WalkView & {
  status: 'idle' | 'moving' | 'arrived' | 'blocked';
  commands: SceneCommand[];
  reason?: 'no-route' | 'obstruction';
};
const angleBetween = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

export class Walkthrough {
  readonly doors = new TourDoors();
  private leg: {
    requestId: string;
    compiled: CompiledBuilding;
    journey: Journey;
    commands: SceneCommand[];
    facing?: Point3;
  } | null = null;

  reset() {
    this.leg = null;
  }

  step(
    world: CharacterWorld,
    request: TravelRequest | null,
    view: WalkView,
    delta: number,
    memory?: EditMemory,
  ): WalkStep {
    const dt = Math.min(delta, 0.05),
      compiled = world.compiled;
    const result: WalkStep = { ...view, status: request ? 'moving' : 'idle', commands: [] };
    const closures = this.doors.closures(world, Boolean(request), memory);
    if (closures.length) return { ...result, commands: closures };
    if (!request) {
      this.reset();
      return result;
    }
    if (this.leg?.requestId !== request.id || this.leg.compiled !== compiled) {
      const plan = doorRoute(compiled, world.player, request.target);
      if (!plan) return { ...result, status: 'blocked', reason: 'no-route' };
      if (plan.commands.length && !plan.staging) {
        this.doors.record(compiled, world.player, plan.commands);
        return { ...result, commands: plan.commands };
      }
      const facing = plan.staging
        ? plan.facing
        : arrivalView(compiled, request.target, request.lookAt)?.point;
      this.leg = {
        requestId: request.id,
        compiled,
        journey: createJourney(smoothRoute(compiled, plan.path.points)),
        commands: plan.staging ? plan.commands : [],
        ...(facing ? { facing } : {}),
      };
    }
    const { journey, facing, commands } = this.leg;
    const feet = world.feet,
      end = journey.points.at(-1)!;
    const remaining = Math.hypot(end.x - feet.x, end.y - feet.y, end.z - feet.z);
    const next = journey.points
      .slice(journey.index)
      .find((point) => Math.hypot(point.x - feet.x, point.z - feet.z) > 0.16);
    let yaw = next ? Math.atan2(feet.x - next.x, feet.z - next.z) : view.yaw;
    if (facing && remaining < 1) {
      const arrival = Math.atan2(feet.x - facing.x, feet.z - facing.z);
      yaw += angleBetween(arrival, yaw) * (1 - remaining);
    }
    const turn = angleBetween(yaw, view.yaw);
    result.yaw += MathUtils.clamp(turn, -dt * 2.2, dt * 2.2);
    const pitch = MathUtils.clamp(
      facing && remaining < 1
        ? Math.atan2(facing.y - feet.y - 1.62, Math.hypot(facing.x - feet.x, facing.z - feet.z))
        : -0.08,
      -0.6,
      0.3,
    );
    result.pitch = MathUtils.damp(view.pitch, pitch, 5, dt);
    if (next && Math.abs(turn) > 0.8 && remaining > 1) {
      world.step({ x: 0, z: 0 }, dt);
      return result;
    }
    const status = stepJourney(world, journey, dt);
    if (status === 'arrived' && commands.length) {
      this.doors.record(compiled, world.player, commands);
      this.reset();
      return { ...result, commands };
    }
    if (status === 'blocked')
      return {
        ...result,
        status,
        reason: 'obstruction',
      };
    if (status === 'arrived' && Math.abs(turn) < 0.025 && Math.abs(result.pitch - pitch) < 0.025)
      return { ...result, status };
    return result;
  }
}
