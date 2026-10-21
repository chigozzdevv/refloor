import { floorBoundary } from '@refloor/scene/footprint';
import { useEffect, useMemo } from 'react';
import { RoundedBox } from '@react-three/drei';
import { BufferGeometry, Float32BufferAttribute, Quaternion, Vector3 } from 'three';
import type { MeshPhysicalMaterial } from 'three';
import type { CompiledBuilding, Point3 } from '@refloor/engine';
import { useProject } from '@/shared/scene/scene-store';
import { exteriorLayout } from '@/shared/scene/exterior';
import { Compound } from '@/components/scene/compound';
import { siteSurfaceMaterial } from '@refloor/scene/site-material';
import { useSurface } from '@/shared/scene/asset-loader';
import { applyMetricUVs } from '@/shared/scene/metric-uv';
import { SiteBox, SiteSurface } from '@/components/scene/site-surface';

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
  material,
}: {
  from: Point3;
  to: Point3;
  thickness?: number;
  material: MeshPhysicalMaterial;
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
      material={material}
      onUpdate={(mesh) => applyMetricUVs(mesh.geometry)}
    >
      <boxGeometry args={[thickness, rotation.length, thickness]} />
    </mesh>
  );
}

export function Exterior() {
  const compiled = useProject((state) => state.compiled);
  return <ExteriorModel compiled={compiled} />;
}

export function ExteriorModel({ compiled }: { compiled: CompiledBuilding }) {
  const site = useMemo(() => exteriorLayout(compiled), [compiled]);
  const top = site.top.footprint,
    roof = compiled.building.roof;
  const roofWidth = top.width + roof.overhang * 2,
    roofDepth = top.depth + roof.overhang * 2;
  const roofX = top.x + top.width / 2,
    roofZ = top.z + top.depth / 2;
  const paving = useSurface(siteSurfaceMaterial(compiled.building, 'paving')),
    plinth = useSurface(siteSurfaceMaterial(compiled.building, 'plinth')),
    parapet = useSurface(siteSurfaceMaterial(compiled.building, 'parapet')),
    roofTrim = useSurface(siteSurfaceMaterial(compiled.building, 'roof-trim')),
    canopy = useSurface(siteSurfaceMaterial(compiled.building, 'canopy')),
    canopyUnderside = useSurface(
      compiled.building.siteMaterials?.canopy ?? {
        ...siteSurfaceMaterial(compiled.building, 'canopy'),
        color: '#b49b71',
        roughness: 0.7,
        metalness: 0,
      },
    );
  return (
    <group>
      <Compound compiled={compiled} />
      <SiteSurface buildingId={compiled.building.id} slot="paving">
        {site.paving.map((paver) => (
          <group
            key={paver.id}
            position={[paver.position.x, paver.position.y, paver.position.z]}
            rotation={[0, paver.rotation, 0]}
          >
            <RoundedBox
              args={[paver.width, paver.height, paver.depth]}
              radius={0.015}
              smoothness={2}
              receiveShadow
              castShadow
              material={paving}
              onUpdate={(mesh) => applyMetricUVs(mesh.geometry)}
            ></RoundedBox>
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
      </SiteSurface>
      <SiteSurface buildingId={compiled.building.id} slot="plinth">
        {site.plinth.map((segment) => (
          <SiteBox
            key={segment.id}
            position={[segment.position.x, segment.position.y, segment.position.z]}
            rotation={[0, segment.rotation, 0]}
            size={[segment.width, segment.height, segment.depth]}
            material={plinth}
          />
        ))}
      </SiteSurface>
      {roof.kind === 'flat' ? (
        floorBoundary(site.top).map(({ start, end, normal }, index) => {
          const dx = end.x - start.x,
            dz = end.z - start.z,
            length = Math.hypot(dx, dz) + roof.overhang * 2,
            x = (start.x + end.x) / 2 + normal.x * (roof.overhang - 0.09),
            z = (start.z + end.z) / 2 + normal.z * (roof.overhang - 0.09),
            rotation: [number, number, number] = [0, Math.atan2(-dz, dx), 0];
          return (
            <group key={index}>
              <SiteSurface buildingId={compiled.building.id} slot="parapet">
                <SiteBox
                  position={[x, site.eaves + site.top.slabThickness + 0.12, z]}
                  rotation={rotation}
                  size={[length, 0.26, 0.18]}
                  material={parapet}
                />
              </SiteSurface>
              <SiteSurface buildingId={compiled.building.id} slot="roof-trim">
                <SiteBox
                  position={[x, site.height, z]}
                  rotation={rotation}
                  size={[length + 0.04, 0.04, 0.23]}
                  material={roofTrim}
                />
              </SiteSurface>
            </group>
          );
        })
      ) : (
        <>
          {roof.material.textureId === 'metal-roof' && (
            <RoofSeams
              x={roofX}
              y={site.eaves}
              z={roofZ}
              width={roofWidth}
              depth={roofDepth}
              rise={site.height - site.eaves}
            />
          )}
          <SiteSurface buildingId={compiled.building.id} slot="roof-trim">
            {[-1, 1].map((side) => (
              <group key={side}>
                <Beam
                  from={{
                    x: roofX + (side * roofWidth) / 2,
                    y: site.eaves,
                    z: roofZ - roofDepth / 2,
                  }}
                  to={{
                    x: roofX + (side * roofWidth) / 2,
                    y: site.eaves,
                    z: roofZ + roofDepth / 2,
                  }}
                  thickness={0.12}
                  material={roofTrim}
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
                    material={roofTrim}
                  />
                ))}
              </group>
            ))}
            <Beam
              from={{ x: roofX, y: site.height, z: roofZ - roofDepth / 2 }}
              to={{ x: roofX, y: site.height, z: roofZ + roofDepth / 2 }}
              thickness={0.1}
              material={roofTrim}
            />
          </SiteSurface>
        </>
      )}
      <SiteSurface buildingId={compiled.building.id} slot="canopy">
        <group
          position={[site.door.centre.x, site.ground.elevation, site.door.centre.z]}
          rotation={[0, site.rotation, 0]}
        >
          <SiteBox
            position={[0, site.door.height + 0.25, 0.56]}
            size={[site.door.width + 1.1, 0.1, 1.2]}
            material={canopy}
          />
          <SiteBox
            position={[0, site.door.height + 0.195, 0.5]}
            size={[site.door.width + 0.85, 0.012, 0.8]}
            material={canopyUnderside}
          />
        </group>
      </SiteSurface>
    </group>
  );
}
