import { useEffect, useRef } from 'react';
import type { Point3 } from '@refloor/engine';
import type { CharacterWorld } from '@/shared/navigation/physics-world';
import { physicsSession } from '@/shared/navigation/physics-session';
import { useProject } from '@/shared/scene/scene-store';
import { viewSession } from '@/shared/scene/view';

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
    const view = viewSession.pending;
    const position =
      last.current ??
      (view?.buildingId === compiled.building.id ? view.player?.position : undefined);
    void import('@/shared/navigation/physics-world')
      .then(({ CharacterWorld }) => {
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
