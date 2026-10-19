import { useEffect, useMemo } from 'react';
import { RoundedBox, useGLTF } from '@react-three/drei';
import { Box3, BufferGeometry, Float32BufferAttribute, Mesh, Quaternion, Vector3 } from 'three';
import type { CompiledBuilding, Point3 } from '@refloor/engine';
import { useProject } from '@/shared/scene/scene-store';
import { exteriorLayout } from '@/shared/scene/exterior';
import { Compound } from '@/components/scene/compound';

function RoofSeams({
  x,
  y,
  z,
  width,
  depth,
  rise,
}: {
  x: number;
  y: number;
  z: number;
  width: number;
  depth: number;
  rise: number;
}) {
  const geometry = useMemo(() => {
    const points: number[] = [];
    for (let row = 0.55; row < depth; row += 0.55)
      for (const side of [-1, 1])
        points.push(
          x + (side * width) / 2,
          y + 0.012,
          z - depth / 2 + row,
          x,
          y + rise + 0.012,
          z - depth / 2 + row,
        );
    return new BufferGeometry().setAttribute('position', new Float32BufferAttribute(points, 3));
  }, [x, y, z, width, depth, rise]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <lineSegments geometry={geometry} raycast={() => undefined}>
      <lineBasicMaterial color="#8e999e" transparent opacity={0.28} depthWrite={false} />
    </lineSegments>
  );
}

function Beam({
  from,
  to,
  thickness = 0.055,
  color = '#4d514d',
}: {
  from: Point3;
  to: Point3;
  thickness?: number;
  color?: string;
}) {
  const centre = new Vector3(from.x + to.x, from.y + to.y, from.z + to.z).multiplyScalar(0.5);
  const direction = new Vector3(to.x - from.x, to.y - from.y, to.z - from.z);
  const rotation = useMemo(() => {
    const axis = direction.clone().normalize();
    return { axis, length: direction.length() };
  }, [from.x, from.y, from.z, to.x, to.y, to.z]);
  return (
    <mesh
      position={centre}
      quaternion={new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), rotation.axis)}
      castShadow
    >
      <boxGeometry args={[thickness, rotation.length, thickness]} />
      <meshStandardMaterial color={color} roughness={0.55} metalness={0.2} />
    </mesh>
  );
}

function Planting() {
  const { scene } = useGLTF('/models/furniture/potted_plant_02/potted_plant_02_1k.gltf', false);
  const model = useMemo(() => {
    const clone = scene.clone(true),
      box = new Box3().setFromObject(clone),
      size = box.getSize(new Vector3()),
      centre = box.getCenter(new Vector3());
    const scale = 1.05 / size.y;
    clone.scale.setScalar(scale);
    clone.position.set(-centre.x * scale, 0.12 - box.min.y * scale, -centre.z * scale);
    clone.traverse((child) => {
      if (child instanceof Mesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return clone;
  }, [scene]);
  return <primitive object={model} dispose={null} />;
}

function Planter({ position, rotation }: { position: Point3; rotation: number }) {
  return (
    <group position={[position.x, position.y, position.z]} rotation={[0, rotation, 0]}>
      <RoundedBox
        args={[1.2, 0.42, 0.72]}
        radius={0.04}
        smoothness={3}
        position={[0, 0.21, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#a8a798" roughness={0.95} />
      </RoundedBox>
      <mesh position={[0, 0.43, 0]}>
        <boxGeometry args={[1.08, 0.02, 0.6]} />
        <meshStandardMaterial color="#373b2b" roughness={1} />
      </mesh>
      <Planting />
    </group>
  );
}

export function Exterior() {
  const compiled = useProject((state) => state.compiled),
    evening = useProject((state) => state.lighting === 'evening');
  return <ExteriorModel compiled={compiled} evening={evening} />;
}

export function ExteriorModel({
  compiled,
  evening = false,
}: {
  compiled: CompiledBuilding;
  evening?: boolean;
}) {
  const site = useMemo(() => exteriorLayout(compiled), [compiled]);
  const top = site.top.footprint,
    roof = compiled.building.roof;
  const roofWidth = top.width + roof.overhang * 2,
    roofDepth = top.depth + roof.overhang * 2;
  const roofX = top.x + top.width / 2,
    roofZ = top.z + top.depth / 2;
  const trim = '#555c59';
  return (
    <group>
      <Compound compiled={compiled} />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[site.centre.x, site.ground.elevation - 0.205, site.centre.z]}
        receiveShadow
      >
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#69735a" roughness={1} />
      </mesh>
      {site.paving.map((paver, index) => (
        <group
          key={index}
          position={[paver.position.x, paver.position.y, paver.position.z]}
          rotation={[0, paver.rotation, 0]}
        >
          <RoundedBox
            args={[paver.width, paver.height, paver.depth]}
            radius={0.015}
            smoothness={2}
            receiveShadow
            castShadow
          >
            <meshStandardMaterial color={index ? '#b8b7aa' : '#a6a699'} roughness={0.92} />
          </RoundedBox>
          {Array.from({ length: Math.floor(paver.depth / 0.75) }, (_, row) => (
            <mesh
              key={row}
              position={[0, paver.height / 2 + 0.001, -paver.depth / 2 + (row + 1) * 0.75]}
            >
              <boxGeometry args={[paver.width - 0.03, 0.002, 0.008]} />
              <meshStandardMaterial color="#8a8d80" roughness={1} />
            </mesh>
          ))}
        </group>
      ))}
      {compiled.building.floors.map((floor) => (
        <group key={floor.id}>
          {[-1, 1].map((side) => (
            <group key={side}>
              <mesh
                position={[
                  floor.footprint.x + floor.footprint.width / 2,
                  floor.elevation - 0.065,
                  floor.footprint.z + (side === 1 ? floor.footprint.depth : 0),
                ]}
                castShadow
                receiveShadow
              >
                <boxGeometry args={[floor.footprint.width + 0.14, 0.13, 0.16]} />
                <meshStandardMaterial color="#b7b7aa" roughness={0.9} />
              </mesh>
              <mesh
                position={[
                  floor.footprint.x + (side === 1 ? floor.footprint.width : 0),
                  floor.elevation - 0.065,
                  floor.footprint.z + floor.footprint.depth / 2,
                ]}
                castShadow
                receiveShadow
              >
                <boxGeometry args={[0.16, 0.13, floor.footprint.depth + 0.14]} />
                <meshStandardMaterial color="#b7b7aa" roughness={0.9} />
              </mesh>
            </group>
          ))}
        </group>
      ))}
      {roof.kind === 'flat' ? (
        [-1, 1].map((side) => (
          <group key={side}>
            <mesh
              position={[
                roofX,
                site.eaves + site.top.slabThickness + 0.12,
                roofZ + side * (roofDepth / 2 - 0.09),
              ]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[roofWidth, 0.26, 0.18]} />
              <meshStandardMaterial color="#d1d0c4" roughness={0.9} />
            </mesh>
            <mesh
              position={[
                roofX + side * (roofWidth / 2 - 0.09),
                site.eaves + site.top.slabThickness + 0.12,
                roofZ,
              ]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[0.18, 0.26, roofDepth]} />
              <meshStandardMaterial color="#d1d0c4" roughness={0.9} />
            </mesh>
            <mesh position={[roofX, site.height, roofZ + side * (roofDepth / 2 - 0.09)]} castShadow>
              <boxGeometry args={[roofWidth + 0.04, 0.04, 0.23]} />
              <meshStandardMaterial color={trim} roughness={0.5} metalness={0.3} />
            </mesh>
            <mesh position={[roofX + side * (roofWidth / 2 - 0.09), site.height, roofZ]} castShadow>
              <boxGeometry args={[0.23, 0.04, roofDepth + 0.04]} />
              <meshStandardMaterial color={trim} roughness={0.5} metalness={0.3} />
            </mesh>
          </group>
        ))
      ) : (
        <>
          <RoofSeams
            x={roofX}
            y={site.eaves}
            z={roofZ}
            width={roofWidth}
            depth={roofDepth}
            rise={site.height - site.eaves}
          />
          {[-1, 1].map((side) => (
            <group key={side}>
              <Beam
                from={{
                  x: roofX + (side * roofWidth) / 2,
                  y: site.eaves,
                  z: roofZ - roofDepth / 2,
                }}
                to={{ x: roofX + (side * roofWidth) / 2, y: site.eaves, z: roofZ + roofDepth / 2 }}
                thickness={0.12}
              />
              {[-1, 1].map((end) => (
                <Beam
                  key={end}
                  from={{
                    x: roofX + (side * roofWidth) / 2,
                    y: site.eaves,
                    z: roofZ + (end * roofDepth) / 2,
                  }}
                  to={{ x: roofX, y: site.height, z: roofZ + (end * roofDepth) / 2 }}
                  thickness={0.09}
                />
              ))}
            </group>
          ))}
          <Beam
            from={{ x: roofX, y: site.height, z: roofZ - roofDepth / 2 }}
            to={{ x: roofX, y: site.height, z: roofZ + roofDepth / 2 }}
            thickness={0.1}
          />
        </>
      )}
      <group
        position={[site.door.centre.x, site.ground.elevation, site.door.centre.z]}
        rotation={[0, site.rotation, 0]}
      >
        <mesh position={[0, site.door.height + 0.25, 0.56]} castShadow receiveShadow>
          <boxGeometry args={[site.door.width + 1.1, 0.1, 1.2]} />
          <meshStandardMaterial color={trim} roughness={0.5} metalness={0.25} />
        </mesh>
        <mesh position={[0, site.door.height + 0.195, 0.5]}>
          <boxGeometry args={[site.door.width + 0.85, 0.012, 0.8]} />
          <meshStandardMaterial
            color="#b49b71"
            emissive="#ffd8a0"
            emissiveIntensity={evening ? 0.35 : 0}
            roughness={0.7}
          />
        </mesh>
        {evening && (
          <pointLight
            position={[0, site.door.height + 0.1, 0.7]}
            intensity={7}
            distance={5}
            decay={2}
            color="#ffe0af"
          />
        )}
      </group>
      {[-1, 1].map((side) => (
        <Planter
          key={side}
          position={site.entrancePoint(side * (site.door.width / 2 + 1.3), 0.8, -0.145)}
          rotation={site.rotation}
        />
      ))}
    </group>
  );
}
