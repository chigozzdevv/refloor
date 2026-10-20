import { RoundedBox } from '@react-three/drei';
import { useProject } from '@/shared/scene/scene-store';
import { useSurface } from '@/shared/scene/asset-loader';
import { finishes } from '@refloor/catalogue';
import type { Floor, Wall } from '@refloor/scene';
import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import type { Group } from 'three';
import { hiddenExterior } from '@/shared/scene/visibility';
import { Exterior } from '@/components/scene/exterior';
import { exteriorNormal } from '@/shared/scene/exterior';
import { siteSurfaceMaterial } from '@refloor/scene/site-material';
import { SiteBox, SiteSurface } from '@/components/scene/site-surface';

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
  const length = Math.hypot(wall.end.x - wall.start.x, wall.end.z - wall.start.z),
    angle = Math.atan2(-(wall.end.z - wall.start.z), wall.end.x - wall.start.x);
  const building = useProject((state) => state.compiled.building),
    material = useSurface(finishes.chalk),
    wood = useSurface(finishes.oak),
    windowTrim = useSurface(siteSurfaceMaterial(building, 'window-trim')),
    doorTrim = useSurface(siteSurfaceMaterial(building, 'door-trim'));
  const outward = exteriorNormal(wall, floor);
  const normalSign = outward
    ? Math.sign(outward.x * Math.sin(angle) + outward.z * Math.cos(angle))
    : 0;
  const doors = wall.openings.filter((opening) => opening.kind === 'door');
  const cuts = [
    0,
    length,
    ...doors.flatMap((door) => [door.offset, door.offset + door.width]),
  ].sort((a, b) => a - b);
  return (
    <group
      ref={ref}
      position={[wall.start.x, floor.elevation, wall.start.z]}
      rotation={[0, angle, 0]}
    >
      {cuts.slice(1).map((end, i) => {
        const start = cuts[i] ?? 0,
          centre = (start + end) / 2;
        if (
          end - start < 0.001 ||
          doors.some((door) => centre > door.offset && centre < door.offset + door.width)
        )
          return null;
        return (
          <mesh
            key={`skirt:${i}`}
            position={[centre, 0.055, 0]}
            material={material}
            castShadow
            receiveShadow
          >
            <boxGeometry args={[end - start, 0.11, wall.thickness + 0.022]} />
          </mesh>
        );
      })}
      {wall.openings.map((opening) => {
        const sill = opening.kind === 'window' ? opening.sill : 0,
          centre = opening.offset + opening.width / 2;
        return (
          <group key={opening.id} position={[centre, sill, 0]}>
            {[-1, 1].map((sign) => (
              <RoundedBox
                key={sign}
                args={[0.045, opening.height + 0.045, wall.thickness + 0.035]}
                radius={0.004}
                smoothness={2}
                position={[sign * (opening.width / 2 + 0.015), opening.height / 2, 0]}
                material={opening.kind === 'door' ? wood : material}
                castShadow
                receiveShadow
              />
            ))}
            <RoundedBox
              args={[opening.width + 0.09, 0.045, wall.thickness + 0.035]}
              radius={0.004}
              smoothness={2}
              position={[0, opening.height + 0.015, 0]}
              material={opening.kind === 'door' ? wood : material}
              castShadow
              receiveShadow
            />
            {opening.kind === 'window' && (
              <>
                <mesh position={[0, -0.025, 0]} material={material} castShadow receiveShadow>
                  <boxGeometry args={[opening.width + 0.14, 0.05, wall.thickness + 0.13]} />
                </mesh>
                <mesh position={[0, opening.height / 2, 0]} material={material} castShadow>
                  <boxGeometry args={[0.022, opening.height, 0.025]} />
                </mesh>
              </>
            )}
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
