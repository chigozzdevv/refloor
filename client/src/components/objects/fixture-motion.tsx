import { useLayoutEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group, Vector3Tuple } from 'three';
import { fixtureProgress } from '@/shared/behaviours/fixture';
import { invalidateShadows } from '@/shared/scene/shadow-updates';
import { fixtureReservations } from '@/shared/behaviours/fixture-motion';
import { useProject } from '@/shared/scene/scene-store';

export function FixtureMotion({
  open,
  objectId,
  position,
  axis,
  amount,
  slide = false,
  children,
}: {
  open: boolean;
  objectId: string;
  position: Vector3Tuple;
  axis: 'x' | 'y' | 'z';
  amount: number;
  slide?: boolean;
  children: ReactNode;
}) {
  const buildingId = useProject((value) => value.compiled.building.id),
    owner = useMemo(() => Symbol('fixture motion'), []),
    group = useRef<Group>(null),
    progress = useRef(open ? 1 : 0);
  useLayoutEffect(() => {
    if (!open && progress.current > 0) fixtureReservations.reserve(owner, buildingId, objectId);
    return () => fixtureReservations.release(owner);
  }, [open, owner, buildingId, objectId]);
  useFrame((_state, delta) => {
    if (!group.current) return;
    const before = progress.current;
    progress.current = fixtureProgress(before, open ? 1 : 0, delta);
    if (!open && progress.current === 0) fixtureReservations.release(owner);
    if (before === progress.current) return;
    if (slide)
      group.current.position[axis] =
        position[{ x: 0, y: 1, z: 2 }[axis]]! + amount * progress.current;
    else group.current.rotation[axis] = amount * progress.current;
    invalidateShadows();
  });
  const initial = { x: 0, y: 0, z: 0 };
  initial[axis] = amount * progress.current;
  return (
    <group
      ref={group}
      position={
        slide
          ? [position[0] + initial.x, position[1] + initial.y, position[2] + initial.z]
          : position
      }
      rotation={slide ? [0, 0, 0] : [initial.x, initial.y, initial.z]}
    >
      {children}
    </group>
  );
}
