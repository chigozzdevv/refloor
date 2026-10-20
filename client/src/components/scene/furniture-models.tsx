import { useEffect } from 'react';
import { RoundedBox } from '@react-three/drei';
import type { SceneObject } from '@refloor/scene';
import type { FurnitureRenderer } from '@refloor/catalogue';
import { finishes, lightOutput, lightTuning } from '@refloor/catalogue';
import { useSurface } from '@/shared/scene/asset-loader';
import { useProject } from '@/shared/scene/scene-store';
import { TelevisionScreen } from '@/components/objects/television';
import { RoomFixtures } from '@/components/scene/room-fixtures';
import { Floodlight } from '@/components/objects/floodlight';
import { WallLight } from '@/components/objects/wall-light';
import { OutdoorPlanter } from '@/components/objects/outdoor-planter';
import { Bed } from '@/components/scene/bed';
import { FurnitureSolid as Solid } from '@/components/scene/furniture-solid';

function Cabinet({ object }: { object: SceneObject }) {
  const material = useSurface(object.materials.body ?? finishes.oak),
    frame = useSurface(object.materials.frame ?? finishes.black),
    { width: w, height: h, depth: d } = object.dimensions;
  const sections = Math.max(2, Math.round(w / 0.55));
  return (
    <>
      <Solid
        size={[w - 0.035, h - 0.14, d - 0.045]}
        at={[0, (h + 0.1) / 2, -0.012]}
        material={frame}
      />
      <Solid size={[w, 0.025, d]} at={[0, h - 0.0125, 0]} material={material} />
      {[-1, 1].map((side) => (
        <Solid
          key={side}
          size={[0.025, h - 0.11, d]}
          at={[side * (w / 2 - 0.0125), (h + 0.1) / 2, 0]}
          material={material}
        />
      ))}
      {Array.from({ length: sections }, (_, i) => (
        <group
          key={i}
          position={[-w / 2 + ((i + 0.5) * w) / sections, h / 2 + 0.035, d / 2 - 0.014]}
        >
          <Solid
            size={[w / sections - 0.009, h - 0.16, 0.026]}
            at={[0, 0, 0]}
            radius={0.004}
            material={material}
          />
          <Solid
            size={[(w / sections) * 0.43, 0.012, 0.018]}
            at={[0, (h - 0.16) / 2 - 0.022, 0.012]}
            radius={0.004}
            material={frame}
          />
        </group>
      ))}
      <Solid size={[w - 0.18, 0.09, d - 0.14]} at={[0, 0.045, 0]} material={frame} />
    </>
  );
}

function Pendant({ object }: { object: SceneObject }) {
  const state = object.behaviours.find((behaviour) => behaviour.kind === 'light')?.state,
    lighting = useProject((value) => value.lighting),
    quality = useProject((value) => value.quality);
  const intensity = lightOutput(object),
    normal = lightTuning(object)?.normal ?? 3,
    powered = intensity > 0,
    shade = useSurface(object.materials.body ?? finishes.linen),
    frame = useSurface(object.materials.frame ?? finishes.brass);
  useEffect(() => {
    shade.transmission = 0;
    shade.thickness = 0;
    shade.emissive.set(state?.color ?? '#ffe6bf');
    shade.emissiveIntensity = (intensity / normal) * 0.8;
    shade.needsUpdate = true;
  }, [shade, intensity, normal, state?.color]);
  return (
    <>
      <mesh position={[0, 0.2, 0]} material={shade}>
        <sphereGeometry args={[0.2, 32, 24]} />
      </mesh>
      <mesh position={[0, 0.397, 0]} material={frame}>
        <cylinderGeometry args={[0.006, 0.006, 0.09, 8]} />
      </mesh>
      <mesh position={[0, 0.44, 0]} material={frame}>
        <cylinderGeometry args={[0.065, 0.065, 0.018, 20]} />
      </mesh>
      {powered && (
        <pointLight
          castShadow
          userData={{
            lightBudget: {
              id: object.id,
              floorId: object.floorId,
              exterior: object.placement === 'exterior',
            },
          }}
          shadow-mapSize={quality === 'high' ? [512, 512] : [256, 256]}
          shadow-camera-near={0.08}
          shadow-bias={-0.00015}
          shadow-normalBias={0.015}
          shadow-autoUpdate={false}
          position={[0, 0.18, 0]}
          color={state?.color ?? '#ffe6bf'}
          intensity={intensity * (lighting === 'day' ? 4 : 7)}
          distance={8}
          decay={2}
        />
      )}
    </>
  );
}

function Television({ object }: { object: SceneObject }) {
  const { width: w, height: h, depth: d } = object.dimensions,
    body = useSurface(object.materials.body ?? finishes.black);
  return (
    <>
      <RoundedBox
        args={[w, h, d]}
        radius={0.018}
        smoothness={4}
        position={[0, h / 2, 0]}
        castShadow
        material={body}
      />
      <mesh name="screen" position={[0, h / 2, d / 2 + 0.001]}>
        <planeGeometry args={[w - 0.035, h - 0.035]} />
        <TelevisionScreen object={object} />
      </mesh>
      <mesh position={[w / 2 - 0.05, 0.013, d / 2 + 0.002]}>
        <sphereGeometry args={[0.0025, 8, 6]} />
        <meshBasicMaterial color="#acb493" />
      </mesh>
    </>
  );
}

export function FurnitureModels({
  object,
  renderer,
}: {
  object: SceneObject;
  renderer: FurnitureRenderer;
}) {
  if (renderer === 'bed') return <Bed object={object} />;
  if (renderer === 'cabinet') return <Cabinet object={object} />;
  if (renderer === 'pendant') return <Pendant object={object} />;
  if (renderer === 'floodlight') return <Floodlight object={object} />;
  if (renderer === 'wall-light') return <WallLight object={object} />;
  if (renderer === 'outdoor-planter') return <OutdoorPlanter object={object} />;
  if (renderer === 'television') return <Television object={object} />;
  return <RoomFixtures object={object} renderer={renderer} />;
}
