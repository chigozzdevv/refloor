import { RoundedBox } from '@react-three/drei';
import type { Material as ThreeMaterial } from 'three';
import type { SceneObject } from '@refloor/scene';
import type { FurnitureRenderer } from '@refloor/catalogue';
import { finishes } from '@refloor/catalogue';
import { useSurface } from '@/shared/scene/asset-loader';
import { Mirror } from '@/components/scene/mirror';

type Vec3 = [number, number, number];
function Solid({
  size,
  at,
  material,
  color = '#edece5',
  metalness = 0,
  roughness = 0.45,
  opacity = 1,
}: {
  size: Vec3;
  at: Vec3;
  material?: ThreeMaterial;
  color?: string;
  metalness?: number;
  roughness?: number;
  opacity?: number;
}) {
  return (
    <RoundedBox
      args={size}
      position={at}
      radius={Math.min(0.018, ...size.map((value) => value / 3))}
      smoothness={3}
      {...(material ? { material } : {})}
      castShadow
      receiveShadow
    >
      {!material && (
        <meshPhysicalMaterial
          color={color}
          roughness={roughness}
          metalness={metalness}
          transparent={opacity < 1}
          opacity={opacity}
        />
      )}
    </RoundedBox>
  );
}

function Cupboard({
  w,
  h,
  d,
  material,
  frame,
}: {
  w: number;
  h: number;
  d: number;
  material: ThreeMaterial;
  frame: ThreeMaterial;
}) {
  const count = Math.max(2, Math.round(w / 0.6));
  return (
    <>
      <Solid size={[w, 0.1, d - 0.08]} at={[0, 0.05, 0]} material={frame} />
      <Solid size={[w, h - 0.1, 0.02]} at={[0, (h + 0.1) / 2, -d / 2 + 0.01]} material={material} />
      {[-1, 1].map((side) => (
        <Solid
          key={side}
          size={[0.025, h - 0.1, d]}
          at={[side * (w / 2 - 0.013), (h + 0.1) / 2, 0]}
          material={material}
        />
      ))}
      {Array.from({ length: count }, (_, index) => (
        <group key={index} position={[-w / 2 + ((index + 0.5) * w) / count, 0, d / 2]}>
          <Solid
            size={[w / count - 0.012, h - 0.13, 0.025]}
            at={[0, (h + 0.1) / 2, 0]}
            material={material}
          />
          <Solid
            size={[0.012, Math.min(0.2, h * 0.3), 0.025]}
            at={[(w / count) * 0.3, h * 0.62, 0.025]}
            material={frame}
          />
        </group>
      ))}
    </>
  );
}

function Tap({ x, y, z, scale = 1 }: { x: number; y: number; z: number; scale?: number }) {
  return (
    <group position={[x, y, z]} scale={scale}>
      <mesh position={[0, 0.12, 0]} castShadow>
        <cylinderGeometry args={[0.018, 0.022, 0.24, 16]} />
        <meshStandardMaterial color="#cbd1ce" metalness={0.92} roughness={0.18} />
      </mesh>
      <Solid
        size={[0.036, 0.03, 0.19]}
        at={[0, 0.235, 0.075]}
        color="#cbd1ce"
        metalness={0.92}
        roughness={0.18}
      />
      <Solid
        size={[0.07, 0.012, 0.025]}
        at={[0.04, 0.18, 0]}
        color="#cbd1ce"
        metalness={0.92}
        roughness={0.18}
      />
    </group>
  );
}

function Basin({ x, y, w, d }: { x: number; y: number; w: number; d: number }) {
  return (
    <group position={[x, y, 0]}>
      <Solid
        size={[w, 0.012, d]}
        at={[0, -0.135, 0]}
        color="#b6bfc1"
        metalness={0.8}
        roughness={0.28}
      />
      {[-1, 1].map((side) => (
        <group key={side}>
          <Solid
            size={[0.015, 0.14, d]}
            at={[(side * w) / 2, -0.07, 0]}
            color="#cad1d0"
            metalness={0.8}
            roughness={0.2}
          />
          <Solid
            size={[w, 0.14, 0.015]}
            at={[0, -0.07, (side * d) / 2]}
            color="#cad1d0"
            metalness={0.8}
            roughness={0.2}
          />
        </group>
      ))}
      <mesh position={[0, -0.125, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.025, 24]} />
        <meshStandardMaterial color="#555f61" metalness={0.85} roughness={0.2} />
      </mesh>
    </group>
  );
}

function Kitchen({
  object,
  body,
  frame,
  island = false,
}: {
  object: SceneObject;
  body: ThreeMaterial;
  frame: ThreeMaterial;
  island?: boolean;
}) {
  const { width: w, height: h, depth: d } = object.dimensions,
    top = island ? h : h * 0.76,
    sinkX = -w * 0.25,
    sinkW = Math.min(0.55, w * 0.24),
    sinkD = Math.min(0.38, d * 0.6),
    left = w / 2 + sinkX - sinkW / 2,
    right = w - left - sinkW;
  return (
    <>
      <Cupboard w={w} h={top - 0.04} d={d - 0.035} material={body} frame={frame} />
      {island ? (
        <Solid
          size={[w + 0.025, 0.05, d + 0.025]}
          at={[0, top - 0.025, 0]}
          color="#d5d3c7"
          roughness={0.35}
        />
      ) : (
        <>
          <Solid size={[left, 0.05, d]} at={[-w / 2 + left / 2, top - 0.025, 0]} color="#d5d3c7" />
          <Solid size={[right, 0.05, d]} at={[w / 2 - right / 2, top - 0.025, 0]} color="#d5d3c7" />
          {[-1, 1].map((side) => (
            <Solid
              key={side}
              size={[sinkW, 0.05, (d - sinkD) / 2]}
              at={[sinkX, top - 0.025, (side * (d + sinkD)) / 4]}
              color="#d5d3c7"
            />
          ))}
          <Basin x={sinkX} y={top - 0.012} w={sinkW} d={sinkD} />
          <Tap x={sinkX} y={top} z={-d * 0.38} scale={h / 1.18} />
          <Solid
            size={[Math.min(0.66, w * 0.3), 0.014, d * 0.76]}
            at={[w * 0.23, top + 0.007, 0]}
            color="#111819"
            metalness={0.35}
            roughness={0.12}
          />
          {[-1, 1].flatMap((x) =>
            [-1, 1].map((z) => (
              <mesh
                key={`${x}:${z}`}
                position={[w * 0.23 + x * 0.14, top + 0.018, z * 0.12]}
                rotation={[-Math.PI / 2, 0, 0]}
              >
                <torusGeometry args={[0.078, 0.004, 8, 32]} />
                <meshStandardMaterial color="#778085" metalness={0.75} roughness={0.35} />
              </mesh>
            )),
          )}
          <Solid
            size={[0.59, top * 0.5, 0.028]}
            at={[w * 0.23, top * 0.43, d / 2 + 0.025]}
            color="#141a1d"
            roughness={0.16}
            metalness={0.4}
          />
          <Solid
            size={[0.47, 0.025, 0.055]}
            at={[w * 0.23, top * 0.65, d / 2 + 0.055]}
            color="#c2c9c8"
            metalness={0.9}
            roughness={0.22}
          />
          {[-1, 0, 1].map((knob) => (
            <mesh
              key={knob}
              position={[w * 0.23 + knob * 0.15, top * 0.77, d / 2 + 0.03]}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <cylinderGeometry args={[0.025, 0.025, 0.025, 20]} />
              <meshStandardMaterial color="#aab2b4" metalness={0.8} roughness={0.22} />
            </mesh>
          ))}
        </>
      )}
    </>
  );
}

function Refrigerator({
  object,
  body,
  frame,
}: {
  object: SceneObject;
  body: ThreeMaterial;
  frame: ThreeMaterial;
}) {
  const { width: w, height: h, depth: d } = object.dimensions;
  return (
    <>
      <Solid size={[w, h - 0.08, d]} at={[0, h / 2, 0]} material={body} />
      {[
        { height: h * 0.68, y: h * 0.64 },
        { height: h * 0.26, y: h * 0.16 },
      ].map((door, index) => (
        <group key={index}>
          <Solid
            size={[w - 0.025, door.height, d * 0.065]}
            at={[0, door.y, d / 2 + 0.01]}
            material={body}
          />
          <Solid
            size={[0.025, door.height * 0.45, 0.05]}
            at={[-w * 0.35, door.y, d / 2 + 0.065]}
            material={frame}
          />
        </group>
      ))}
      <Solid size={[w - 0.08, 0.045, d - 0.08]} at={[0, 0.025, 0]} color="#1b2022" />
    </>
  );
}

function Vanity({
  object,
  body,
  frame,
}: {
  object: SceneObject;
  body: ThreeMaterial;
  frame: ThreeMaterial;
}) {
  const { width: w, height: h, depth: d } = object.dimensions,
    top = h * 0.75,
    bw = Math.min(0.55, w * 0.55),
    bd = d * 0.6,
    side = (w - bw) / 2;
  return (
    <>
      <Cupboard w={w} h={top - 0.04} d={d - 0.025} material={body} frame={frame} />
      {[-1, 1].map((sign) => (
        <group key={sign}>
          <Solid size={[side, 0.045, d]} at={[(sign * (bw + side)) / 2, top - 0.022, 0]} />
          <Solid size={[bw, 0.045, (d - bd) / 2]} at={[0, top - 0.022, (sign * (d + bd)) / 4]} />
        </group>
      ))}
      <Basin x={0} y={top - 0.01} w={bw} d={bd} />
      <Tap x={0} y={top} z={-d * 0.38} scale={h / 0.98} />
    </>
  );
}

function Toilet({
  object,
  body,
  frame,
}: {
  object: SceneObject;
  body: ThreeMaterial;
  frame: ThreeMaterial;
}) {
  const { width: w, height: h, depth: d } = object.dimensions;
  return (
    <>
      <Solid size={[w * 0.58, h * 0.45, d * 0.62]} at={[0, h * 0.23, 0.03]} material={body} />
      <mesh
        position={[0, h * 0.48, d * 0.12]}
        scale={[w * 0.49, h * 0.19, d * 0.48]}
        material={body}
        castShadow
      >
        <sphereGeometry args={[1, 40, 24]} />
      </mesh>
      <mesh
        position={[0, h * 0.63, d * 0.12]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[w / 0.6, d / 0.68, 1]}
        material={body}
      >
        <torusGeometry args={[0.2, 0.045, 12, 40]} />
      </mesh>
      <mesh position={[0, h * 0.635, d * 0.12]} rotation={[-Math.PI / 2, 0, 0]} scale={[1, 1.2, 1]}>
        <circleGeometry args={[w * 0.22, 32]} />
        <meshStandardMaterial color="#526468" roughness={0.18} />
      </mesh>
      <Solid size={[w * 0.77, h * 0.55, d * 0.22]} at={[0, h * 0.71, -d * 0.34]} material={body} />
      <Solid size={[0.07, 0.012, 0.04]} at={[w * 0.2, h * 0.995, -d * 0.34]} material={frame} />
    </>
  );
}

function Shower({
  object,
  body,
  frame,
}: {
  object: SceneObject;
  body: ThreeMaterial;
  frame: ThreeMaterial;
}) {
  const { width: w, height: h, depth: d } = object.dimensions;
  return (
    <>
      <Solid size={[w, 0.085, d]} at={[0, 0.045, 0]} material={body} />
      <mesh position={[0, h * 0.5, -d / 2 + 0.02]}>
        <boxGeometry args={[w, h - 0.1, 0.012]} />
        <meshPhysicalMaterial
          color="#b2cac9"
          transparent
          opacity={0.2}
          roughness={0.08}
          metalness={0.08}
        />
      </mesh>
      <mesh position={[-w / 2 + 0.02, h * 0.5, 0]}>
        <boxGeometry args={[0.012, h - 0.1, d]} />
        <meshPhysicalMaterial color="#b2cac9" transparent opacity={0.2} roughness={0.08} />
      </mesh>
      <mesh position={[0, h * 0.5, d / 2 - 0.015]}>
        <boxGeometry args={[w, h - 0.1, 0.012]} />
        <meshPhysicalMaterial color="#b2cac9" transparent opacity={0.12} roughness={0.07} />
      </mesh>
      {[-1, 1].map((side) => (
        <Solid
          key={side}
          size={[0.018, h, 0.018]}
          at={[side * (w / 2 - 0.02), h / 2, d / 2 - 0.015]}
          material={frame}
        />
      ))}
      <Solid size={[w, 0.018, 0.018]} at={[0, h - 0.01, d / 2 - 0.015]} material={frame} />
      <Solid size={[0.025, h * 0.25, 0.025]} at={[0, h * 0.73, -d * 0.4]} material={frame} />
      <Solid size={[0.18, 0.025, 0.18]} at={[0, h * 0.9, -d * 0.3]} material={frame} />
      <Solid size={[0.018, 0.24, 0.04]} at={[w * 0.3, h * 0.47, d / 2 + 0.02]} material={frame} />
    </>
  );
}

function Table({
  object,
  body,
  frame,
}: {
  object: SceneObject;
  body: ThreeMaterial;
  frame: ThreeMaterial;
}) {
  const { width: w, height: h, depth: d } = object.dimensions;
  return (
    <>
      <Solid size={[w, 0.055, d]} at={[0, h - 0.028, 0]} material={body} />
      {[-1, 1].flatMap((x) =>
        [-1, 1].map((z) => (
          <Solid
            key={`${x}:${z}`}
            size={[0.055, h - 0.055, 0.055]}
            at={[x * (w / 2 - 0.09), (h - 0.055) / 2, z * (d / 2 - 0.09)]}
            material={frame}
          />
        )),
      )}
    </>
  );
}

function DiningChair({
  object,
  body,
  frame,
}: {
  object: SceneObject;
  body: ThreeMaterial;
  frame: ThreeMaterial;
}) {
  const { width: w, height: h, depth: d } = object.dimensions;
  return (
    <>
      <Solid size={[w, 0.075, d]} at={[0, h * 0.53, 0]} material={body} />
      <Solid size={[w, h * 0.4, 0.065]} at={[0, h * 0.8, -d * 0.4]} material={body} />
      {[-1, 1].flatMap((x) =>
        [-1, 1].map((z) => (
          <Solid
            key={`${x}:${z}`}
            size={[0.035, h * 0.5, 0.035]}
            at={[x * w * 0.4, h * 0.25, z * d * 0.38]}
            material={frame}
          />
        )),
      )}
    </>
  );
}

export function RoomFixtures({
  object,
  renderer,
}: {
  object: SceneObject;
  renderer: FurnitureRenderer;
}) {
  const body = useSurface(object.materials.body ?? finishes.oak),
    frame = useSurface(object.materials.frame ?? finishes.walnut),
    { width: w, height: h, depth: d } = object.dimensions;
  switch (renderer) {
    case 'kitchen':
      return <Kitchen object={object} body={body} frame={frame} />;
    case 'island':
      return <Kitchen object={object} body={body} frame={frame} island />;
    case 'fridge':
      return <Refrigerator object={object} body={body} frame={frame} />;
    case 'vanity':
      return <Vanity object={object} body={body} frame={frame} />;
    case 'toilet':
      return <Toilet object={object} body={body} frame={frame} />;
    case 'shower':
      return <Shower object={object} body={body} frame={frame} />;
    case 'desk':
    case 'dining-table':
      return <Table object={object} body={body} frame={frame} />;
    case 'dining-chair':
      return <DiningChair object={object} body={body} frame={frame} />;
    case 'wardrobe':
    case 'bedside':
      return (
        <>
          <Cupboard w={w} h={h} d={d} material={body} frame={frame} />
          <Solid size={[w, 0.025, d]} at={[0, h - 0.012, 0]} material={body} />
        </>
      );
    case 'mirror':
      return (
        <>
          <Solid size={[w, h, d]} at={[0, h / 2, 0]} material={frame} />
          <Mirror object={object} surface={body} />
        </>
      );
    default:
      throw new Error(`Furniture renderer is unavailable: ${renderer}`);
  }
}
