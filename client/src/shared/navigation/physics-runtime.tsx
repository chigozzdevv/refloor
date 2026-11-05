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
    house = useRef(epoch),
    owned = useRef<CharacterWorld | null>(null);
  useEffect(
    () => () => {
      const world = owned.current;
      if (!world) return;
      if (physicsSession.current === world) physicsSession.current = null;
      owned.current = null;
      world.dispose();
    },
    [],
  );
  useEffect(() => {
    let cancelled = false;
    const changedHouse = house.current !== epoch,
      world = owned.current;
    if (changedHouse) {
      last.current = undefined;
      house.current = epoch;
    }
    if (world) {
      if (!changedHouse && world.update(compiled)) return;
      if (!changedHouse) last.current = world.feet;
      if (physicsSession.current === world) physicsSession.current = null;
      owned.current = null;
      world.dispose();
    }
    const view = viewSession.pending;
    const position =
      last.current ??
      (view?.buildingId === compiled.building.id ? view.player?.position : undefined);
    void import('@/shared/navigation/physics-world')
      .then(({ CharacterWorld }) => {
        if (cancelled) return;
        owned.current = new CharacterWorld(compiled, position);
        physicsSession.current = owned.current;
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        useProject
          .getState()
          .notify(error instanceof Error ? error.message : 'Physics could not start');
      });
    return () => {
      cancelled = true;
    };
  }, [compiled, epoch]);
  return null;
}
