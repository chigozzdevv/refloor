import { useEffect, useRef } from 'react';
import type { ComponentRef } from 'react';
import { useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useProject } from '@/features/projects/project-store';

export function CameraRig() {
  const camera = useThree((state) => state.camera),
    controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const floorId = useProject((state) => state.floorId),
    compiled = useProject((state) => state.compiled),
    interacting = useProject((state) => state.interacting);
  const floor = compiled.building.floors.find((value) => value.id === floorId),
    elevation = floor?.elevation ?? 0;
  useEffect(() => {
    camera.position.set(16, 12 + elevation, -8);
    controls.current?.target.set(6, elevation + 0.5, 5);
    controls.current?.update();
  }, [camera, elevation, compiled.building.id]);
  return (
    <OrbitControls
      ref={controls}
      makeDefault
      target={[6, elevation + 0.5, 5]}
      enabled={!interacting}
      minDistance={3}
      maxDistance={35}
      maxPolarAngle={Math.PI / 2 - 0.07}
      enableDamping
      dampingFactor={0.08}
    />
  );
}
