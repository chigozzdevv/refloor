import { useEffect, useRef } from 'react';
import type { Point3 } from '@refloor/engine';
import type { CharacterWorld } from '@/runtime/physics/CharacterWorld';
import { physicsSession } from '@/runtime/physics/session';
import { useProject } from '@/features/projects/project-store';

export function PhysicsRuntime() {
  const compiled = useProject((state) => state.compiled),
    epoch = useProject((state) => state.projectEpoch);
  const last = useRef<Point3 | undefined>(undefined),
    house = useRef(epoch);
  useEffect(() => {
    let cancelled = false,
      owned: CharacterWorld | null = null;
    if (house.current !== epoch) {
      last.current = undefined;
      house.current = epoch;
    }
    const position = last.current;
    void import('@/runtime/physics/CharacterWorld')
      .then(async ({ CharacterWorld, initializePhysics }) => {
        await initializePhysics();
        if (cancelled) return;
        owned = new CharacterWorld(compiled, position);
        physicsSession.current = owned;
      })
      .catch((error: unknown) =>
        useProject
          .getState()
          .notify(error instanceof Error ? error.message : 'Physics could not start'),
      );
    return () => {
      cancelled = true;
      if (owned) {
        last.current = owned.feet;
        if (physicsSession.current === owned) physicsSession.current = null;
        owned.dispose();
      }
    };
  }, [compiled, epoch]);
  return null;
}
