import { useLayoutEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { scenePresentation } from '@/shared/scene/presentation';
import { useProject } from '@/shared/scene/scene-store';
import { shadowsCurrent } from '@/shared/scene/shadow-updates';

export function PresentedScene() {
  const compiled = useProject((state) => state.compiled);
  useLayoutEffect(() => {
    scenePresentation.commit(compiled);
    return () => scenePresentation.suspend(compiled);
  }, [compiled]);
  useFrame(({ invalidate }) => {
    if (shadowsCurrent()) scenePresentation.frame(compiled);
    if (scenePresentation.pending(compiled.building.id)) invalidate();
  });
  return null;
}
