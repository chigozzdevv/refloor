import { useProject } from '@/shared/scene/scene-store';
import { useSurface } from '@/shared/scene/asset-loader';
import { finishes } from '@refloor/catalogue';
import type { Floor, Wall } from '@refloor/scene';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { Group } from 'three';
import { hiddenExterior } from '@/shared/scene/visibility';
import { Exterior } from '@/components/scene/exterior';
import { exteriorNormal } from '@/shared/scene/exterior';
import { siteSurfaceMaterial } from '@refloor/scene/site-material';
import { SiteBox, SiteSurface } from '@/components/scene/site-surface';
import { wallDetailGeometry } from '@/shared/scene/wall-details';

function WallDetails({ floor, wall }: { floor: Floor; wall: Wall }) {
  const ref = useRef<Group>(null),
    camera = useThree((state) => state.camera),
    mode = useProject((state) => state.mode),
    floorId = useProject((state) => state.floorId),
    cutaway = useProject((state) => state.cutaway);
  useFrame(() => {
    if (ref.current)
      ref.current.visible =
        mode !== 'orbit' ||
        !cutaway ||
        floorId !== floor.id ||
        !hiddenExterior(wall, floor, camera.position);
  });
  const angle = Math.atan2(-(wall.end.z - wall.start.z), wall.end.x - wall.start.x),
    geometry = useMemo(() => wallDetailGeometry(wall), [wall]);
  useEffect(
    () => () => {
      geometry.paint?.dispose();
      geometry.wood?.dispose();
    },
    [geometry],
  );
  const building = useProject((state) => state.compiled.building),
    material = useSurface(finishes.chalk),
    wood = useSurface(finishes.oak),
    windowTrim = useSurface(siteSurfaceMaterial(building, 'window-trim')),
    doorTrim = useSurface(siteSurfaceMaterial(building, 'door-trim'));
  const outward = exteriorNormal(wall, floor);
  const normalSign = outward
    ? Math.sign(outward.x * Math.sin(angle) + outward.z * Math.cos(angle))
    : 0;
  return (
    <group
      ref={ref}
      position={[wall.start.x, floor.elevation, wall.start.z]}
      rotation={[0, angle, 0]}
    >
      {geometry.paint && (
        <mesh geometry={geometry.paint} material={material} castShadow receiveShadow />
      )}
      {geometry.wood && <mesh geometry={geometry.wood} material={wood} castShadow receiveShadow />}
      {wall.openings.map((opening) => {
        const sill = opening.kind === 'window' ? opening.sill : 0,
          centre = opening.offset + opening.width / 2;
        return (
          <group key={opening.id} position={[centre, sill, 0]}>
            {outward && (
              <SiteSurface
                buildingId={building.id}
                slot={opening.kind === 'door' ? 'door-trim' : 'window-trim'}
              >
                <group position={[0, 0, normalSign * (wall.thickness / 2 + 0.025)]}>
                  {[-1, 1].map((side) => (
                    <group key={side}>
                      <SiteBox
                        position={[
                          side * (opening.width / 2 + (opening.kind === 'door' ? 0.015 : -0.025)),
                          opening.height / 2,
                          0,
                        ]}
                        size={[0.055, opening.height + 0.045, 0.065]}
                        material={opening.kind === 'door' ? doorTrim : windowTrim}
                      />
                      {(opening.kind === 'window' || side === 1) && (
                        <SiteBox
                          position={[
                            0,
                            side === 1 ? opening.height + (opening.kind === 'door' ? 0.015 : 0) : 0,
                            0,
                          ]}
                          size={[opening.width + 0.045, 0.055, 0.065]}
                          material={opening.kind === 'door' ? doorTrim : windowTrim}
                        />
                      )}
                    </group>
                  ))}
                </group>
              </SiteSurface>
            )}
          </group>
        );
      })}
    </group>
  );
}

export function ArchitecturalDetails() {
  const compiled = useProject((state) => state.compiled),
    mode = useProject((state) => state.mode),
    floorId = useProject((state) => state.floorId),
    cutaway = useProject((state) => state.cutaway);
  const active = compiled.building.floors.find((value) => value.id === floorId);
  return (
    <>
      {compiled.building.floors
        .filter(
          (floor) => mode !== 'orbit' || !cutaway || !active || floor.elevation <= active.elevation,
        )
        .map((floor) => (
          <group key={floor.id}>
            {floor.walls.map((wall) => (
              <WallDetails key={wall.id} floor={floor} wall={wall} />
            ))}
          </group>
        ))}
      <Exterior />
    </>
  );
}
