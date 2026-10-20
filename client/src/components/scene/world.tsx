import { Suspense, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { NoToneMapping, PCFShadowMap, SRGBColorSpace } from 'three';
import { Selection } from '@react-three/postprocessing';
import { useProject } from '@/shared/scene/scene-store';
import { Lighting } from '@/components/scene/lighting';
import { Building } from '@/components/scene/building';
import { Furniture } from '@/components/scene/furniture';
import { ArchitecturalDetails } from '@/components/scene/architectural-details';
import { NavigationControls } from '@/components/navigation/navigation-controls';
import { PhysicsRuntime } from '@/shared/navigation/physics-runtime';
import { SelectionChat } from '@/components/editor/selection-chat';
import { NavigationMarkers } from '@/components/navigation/navigation-markers';
import { SelectedFloor } from '@/components/editor/selected-floor';
import { EntranceCamera } from '@/components/entrance/entrance-camera';
import { ActionEvents } from '@/components/scene/action-events';
import { useExperience } from '@/shared/scene/experience-store';
import { exteriorUpgradeCommands } from '@/shared/editor/exterior-upgrade';
import { SceneCapture } from '@/components/scene/capture';
import { RenderPerformance } from '@/components/scene/render-performance';
import { useRenderSettings } from '@/shared/scene/render-settings';
import { catalogueBehaviourUpgrades } from '@refloor/catalogue';

function SceneReady() {
  const setReady = useProject((state) => state.setSceneReady);
  useEffect(() => {
    const state = useProject.getState(),
      commands = [
        ...exteriorUpgradeCommands(state.compiled.building, state.memory),
        ...catalogueBehaviourUpgrades(state.compiled.building),
      ];
    for (let offset = 0; offset < commands.length; offset += 100)
      if (
        !useProject
          .getState()
          .edit(commands.slice(offset, offset + 100), { label: 'Enable household interactions' })
      )
        break;
    setReady(true);
  }, [setReady]);
  return null;
}

export function World() {
  const epoch = useProject((state) => state.projectEpoch),
    select = useProject((state) => state.select);
  const stage = useExperience((state) => state.stage);
  const dpr = useRenderSettings((state) => state.dpr);
  return (
    <Canvas
      style={{ overflow: 'clip' }}
      frameloop={stage === 'prompt' ? 'demand' : 'always'}
      shadows
      camera={{ fov: 45, near: 0.08, far: 200, position: [16, 12, -8] }}
      dpr={dpr}
      gl={{
        antialias: false,
        alpha: false,
        powerPreference: 'high-performance',
        toneMapping: NoToneMapping,
        outputColorSpace: SRGBColorSpace,
      }}
      onCreated={({ gl }) => {
        gl.shadowMap.type = PCFShadowMap;
      }}
      onPointerMissed={(event) => {
        if (event.target instanceof HTMLCanvasElement) select(null);
      }}
    >
      <RenderPerformance />
      <Suspense fallback={null}>
        <Selection>
          <PhysicsRuntime />
          <Lighting />
          <SceneCapture />
          <Building />
          <Furniture />
          <ArchitecturalDetails />
          <NavigationControls />
          <EntranceCamera />
          <ActionEvents />
          <NavigationMarkers />
          <SelectionChat />
          <SelectedFloor />
          <SceneReady key={epoch} />
        </Selection>
      </Suspense>
    </Canvas>
  );
}
