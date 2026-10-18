import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { MathUtils, PerspectiveCamera, Vector3 } from 'three';
import { useExperience } from '@/shared/scene/experience-store';
import { useProject } from '@/shared/scene/scene-store';
import { exteriorCamera } from '@/shared/scene/exterior';
import { entryPose } from '@/shared/navigation/entry';

export function EntranceCamera() {
  const stage = useExperience((state) => state.stage),
    compiled = useProject((state) => state.compiled);
  const elapsed = useRef(0),
    reduced = useRef(false);
  useEffect(() => {
    elapsed.current = 0;
  }, [stage, compiled.building.id]);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      reduced.current = media.matches;
    };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useFrame(({ camera, size }, delta) => {
    if (stage === 'ready') return;
    const outside = exteriorCamera(compiled, size.width / size.height);
    const entry = entryPose(compiled);
    if (useProject.getState().sceneReady) elapsed.current += Math.min(delta, 0.05);
    const approaching = stage === 'approach';
    const t = approaching
      ? useExperience.getState().fastForward
        ? 1
        : MathUtils.smootherstep(elapsed.current / (reduced.current ? 0.05 : 3.2), 0, 1)
      : 0;
    camera.position
      .set(outside.position.x, outside.position.y, outside.position.z)
      .lerp(new Vector3(entry.outside.x, entry.outside.y, entry.outside.z), t);
    if (stage === 'prompt')
      camera.position.lerp(new Vector3(outside.target.x, outside.target.y, outside.target.z), 0.5);
    const portrait = size.width / size.height < 0.8;
    const aim = new Vector3(outside.target.x, outside.target.y, outside.target.z).lerp(
      new Vector3(entry.target.x, entry.target.y, entry.target.z),
      t,
    );
    camera.lookAt(aim);
    if (camera instanceof PerspectiveCamera) {
      camera.fov = MathUtils.lerp(45, portrait ? 55 : 45, t);
      camera.updateProjectionMatrix();
    }
    if (stage === 'reveal' && elapsed.current > 1.8) useExperience.getState().approach();
    if (approaching && t === 1) useExperience.getState().finish();
  }, -0.9);
  return null;
}
