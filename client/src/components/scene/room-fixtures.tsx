import { useEffect, useMemo } from 'react';
import { CatmullRomCurve3, DoubleSide, LatheGeometry, TubeGeometry, Vector2, Vector3 } from 'three';
import type { Material as ThreeMaterial } from 'three';
import type { SceneObject } from '@refloor/scene';
import type { FurnitureRenderer } from '@refloor/catalogue';
import { finishes } from '@refloor/catalogue';
import { useSurface } from '@/shared/scene/asset-loader';
import { Mirror } from '@/components/scene/mirror';
import { FurnitureSolid as Solid } from '@/components/scene/furniture-solid';

function Cupboard({
  w,
  h,
  d,
  material,
  frame,
  drawers = false,
}: {
  w: number;
  h: number;
  d: number;
  material: ThreeMaterial;
  frame: ThreeMaterial;
  drawers?: boolean;
}) {
  const count = Math.max(2, Math.round(w / 0.6));
  return (
    <>
      <Solid size={[w - 0.08, 0.09, d - 0.08]} at={[0, 0.045, 0]} material={frame} />
      <Solid
        size={[w - 0.035, h - 0.1, d - 0.035]}
        at={[0, (h + 0.1) / 2, -0.01]}
        color="#25251f"
      />
      {[-1, 1].map((side) => (
        <Solid
          key={side}
          size={[0.025, h - 0.1, d]}
          at={[side * (w / 2 - 0.013), (h + 0.1) / 2, 0]}
          material={material}
        />
      ))}
      {Array.from({ length: drawers ? 2 : count }, (_, index) => (
        <group
          key={index}
          position={[
            drawers ? 0 : -w / 2 + ((index + 0.5) * w) / count,
            drawers ? 0.1 + ((index + 0.5) * (h - 0.12)) / 2 : (h + 0.1) / 2,
            d / 2 - 0.014,
          ]}
        >
          <Solid
            size={[
              drawers ? w - 0.012 : w / count - 0.012,
              drawers ? (h - 0.14) / 2 : h - 0.13,
              0.025,
            ]}
            at={[0, 0, 0]}
            material={material}
          />
          <Solid
            size={[drawers ? w * 0.38 : 0.012, drawers ? 0.012 : Math.min(0.18, h * 0.25), 0.02]}
            at={[drawers ? 0 : (w / count) * 0.3, drawers ? 0.03 : h * 0.08, 0.015]}
            material={frame}
          />
        </group>
      ))}
    </>
  );
}

function Tap({
  x,
  y,
  z,
  scale = 1,
  material,
}: {
  x: number;
  y: number;
  z: number;
  scale?: number;
  material: ThreeMaterial;
}) {
  const geometry = useMemo(
    () =>
      new TubeGeometry(
        new CatmullRomCurve3([
          new Vector3(0, 0.025, 0),
          new Vector3(0, 0.21, 0),
          new Vector3(0, 0.26, 0.055),
          new Vector3(0, 0.22, 0.15),
        ]),
        24,
        0.013,
        8,
        false,
      ),
    [],
  );
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <group position={[x, y, z]} scale={scale}>
      <mesh position={[0, 0.012, 0]} material={material} castShadow>
        <cylinderGeometry args={[0.024, 0.025, 0.024, 20]} />
      </mesh>
      <mesh geometry={geometry} material={material} castShadow />
      <Solid size={[0.065, 0.012, 0.016]} at={[0.03, 0.09, 0]} material={material} />
    </group>
  );
}

function Basin({
  x,
  y,
  w,
  d,
  ceramic = false,
}: {
  x: number;
  y: number;
  w: number;
  d: number;
  ceramic?: boolean;
}) {
  const color = ceramic ? '#f2f1eb' : '#b7c1c2',
    metalness = ceramic ? 0 : 0.8,
    roughness = ceramic ? 0.18 : 0.28;
  return (
    <group position={[x, y, 0]}>
      <Solid
        size={[w, 0.012, d]}
        at={[0, -0.135, 0]}
        color={color}
        metalness={metalness}
        roughness={roughness}
      />
      {[-1, 1].map((side) => (
        <group key={side}>
          <Solid
            size={[0.015, 0.14, d]}
            at={[(side * w) / 2, -0.07, 0]}
            color={color}
            metalness={metalness}
            roughness={roughness}
          />
          <Solid
            size={[w, 0.14, 0.015]}
            at={[0, -0.07, (side * d) / 2]}
            color={color}
            metalness={metalness}
            roughness={roughness}
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
  const stone = useSurface(object.materials.top ?? finishes.marbleSlab),
    { width: w, height: h, depth: d } = object.dimensions,
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
        <Solid size={[w, 0.05, d]} at={[0, top - 0.025, 0]} material={stone} />
      ) : (
        <>
          <Solid size={[left, 0.05, d]} at={[-w / 2 + left / 2, top - 0.025, 0]} material={stone} />
          <Solid
            size={[right, 0.05, d]}
            at={[w / 2 - right / 2, top - 0.025, 0]}
            material={stone}
          />
          {[-1, 1].map((side) => (
            <Solid
              key={side}
              size={[sinkW, 0.05, (d - sinkD) / 2]}
              at={[sinkX, top - 0.025, (side * (d + sinkD)) / 4]}
              material={stone}
            />
          ))}
          <Basin x={sinkX} y={top - 0.012} w={sinkW} d={sinkD} />
          <Tap x={sinkX} y={top} z={-d * 0.36} scale={h / 1.18} material={frame} />
          <Solid
            size={[w, h - top, 0.018]}
            at={[0, (h + top) / 2, -d / 2 + 0.009]}
            material={stone}
          />
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
            at={[w * 0.23, top * 0.43, d / 2 - 0.016]}
            color="#141a1d"
            roughness={0.16}
            metalness={0.4}
          />
          <Solid
            size={[0.5, top * 0.29, 0.005]}
            at={[w * 0.23, top * 0.4, d / 2 - 0.0005]}
            color="#273237"
            metalness={0.35}
            roughness={0.09}
          />
          <Solid
            size={[0.47, 0.021, 0.028]}
            at={[w * 0.23, top * 0.65, d / 2 - 0.014]}
            material={frame}
          />
          {[-1, 0, 1].map((knob) => (
            <mesh
              key={knob}
              position={[w * 0.23 + knob * 0.15, top * 0.77, d / 2 - 0.0125]}
              rotation={[Math.PI / 2, 0, 0]}
            >
              <cylinderGeometry args={[0.025, 0.025, 0.025, 20]} />
              <primitive object={frame} attach="material" />
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
      <Solid size={[w, h - 0.08, d - 0.06]} at={[0, h / 2, -0.03]} material={body} />
      <Solid size={[w - 0.012, h - 0.07, 0.01]} at={[0, h / 2, d / 2 - 0.038]} color="#283134" />
      {[
        { height: h * 0.68, y: h * 0.64 },
        { height: h * 0.26, y: h * 0.16 },
      ].map((door, index) => (
        <group key={index}>
          <Solid
            size={[w - 0.025, door.height, 0.035]}
            at={[0, door.y, d / 2 - 0.025]}
            material={body}
          />
          <Solid
            size={[0.025, door.height * 0.45, 0.022]}
            at={[-w * 0.35, door.y, d / 2 - 0.011]}
            material={frame}
          />
        </group>
      ))}
      <Solid
        size={[w * 0.23, 0.075, 0.005]}
        at={[w * 0.2, h * 0.8, d / 2 - 0.004]}
        color="#1b292c"
        roughness={0.1}
      />
      {[-1, 0, 1].map((line) => (
        <Solid
          key={line}
          size={[w * 0.55, 0.004, 0.005]}
          at={[0, 0.04 + line * 0.01, d / 2 - 0.018]}
          color="#3c4445"
        />
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
  const stone = useSurface(object.materials.top ?? finishes.marbleSlab),
    { width: w, height: h, depth: d } = object.dimensions,
    top = h * 0.75,
    bw = Math.min(0.55, w * 0.55),
    bd = d * 0.6,
    side = (w - bw) / 2;
  return (
    <>
      <group position={[0, 0.12, 0]}>
        <Cupboard w={w} h={top - 0.16} d={d - 0.025} material={body} frame={frame} drawers />
      </group>
      {[-1, 1].map((sign) => (
        <group key={sign}>
          <Solid
            size={[side, 0.045, d]}
            at={[(sign * (bw + side)) / 2, top - 0.022, 0]}
            material={stone}
          />
          <Solid
            size={[bw, 0.045, (d - bd) / 2]}
            at={[0, top - 0.022, (sign * (d + bd)) / 4]}
            material={stone}
          />
        </group>
      ))}
      <Solid size={[w, 0.07, 0.015]} at={[0, top + 0.035, -d / 2 + 0.0075]} material={stone} />
      <Basin x={0} y={top - 0.01} w={bw} d={bd} ceramic />
      <Tap x={0} y={top} z={-d * 0.38} scale={0.83} material={frame} />
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
  const { width: w, height: h, depth: d } = object.dimensions,
    bowl = useMemo(
      () =>
        new LatheGeometry(
          [
            new Vector2(0.35, 0),
            new Vector2(0.39, 0.08),
            new Vector2(0.43, 0.22),
            new Vector2(0.77, 0.5),
            new Vector2(0.97, 0.72),
            new Vector2(1, 0.9),
            new Vector2(0.95, 1),
            new Vector2(0.83, 0.97),
            new Vector2(0.77, 0.77),
            new Vector2(0.58, 0.45),
            new Vector2(0.3, 0.33),
            new Vector2(0, 0.33),
          ],
          32,
        ),
      [],
    );
  useEffect(() => () => bowl.dispose(), [bowl]);
  return (
    <>
      <mesh
        geometry={bowl}
        position={[0, 0.03, d * 0.09]}
        scale={[w * 0.44, h * 0.55, d * 0.37]}
        material={body}
        castShadow
        receiveShadow
      />
      <mesh
        position={[0, h * 0.6, d * 0.09]}
        rotation={[-Math.PI / 2, 0, 0]}
        scale={[w / 0.61, d / 0.75, 1]}
        material={body}
      >
        <torusGeometry args={[0.2, 0.045, 12, 40]} />
      </mesh>
      <mesh position={[0, h * 0.29, d * 0.09]} rotation={[-Math.PI / 2, 0, 0]} scale={[1, 1.2, 1]}>
        <circleGeometry args={[w * 0.14, 24]} />
        <meshPhysicalMaterial color="#91aeb2" roughness={0.08} metalness={0.08} />
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
      <Solid
        size={[w - 0.065, 0.012, d - 0.065]}
        at={[0, 0.087, 0]}
        color="#d7dfdb"
        roughness={0.24}
      />
      <Solid size={[0.11, 0.005, 0.11]} at={[w * 0.28, 0.096, -d * 0.28]} material={frame} />
      <mesh position={[0, h * 0.5, -d / 2 + 0.02]}>
        <boxGeometry args={[w, h - 0.1, 0.012]} />
        <meshPhysicalMaterial
          color="#b6d2cd"
          transparent
          opacity={0.13}
          roughness={0.08}
          metalness={0.04}
          depthWrite={false}
          side={DoubleSide}
          envMapIntensity={0.9}
        />
      </mesh>
      <mesh position={[-w / 2 + 0.02, h * 0.5, 0]}>
        <boxGeometry args={[0.012, h - 0.1, d]} />
        <meshPhysicalMaterial
          color="#b6d2cd"
          transparent
          opacity={0.13}
          roughness={0.08}
          depthWrite={false}
          side={DoubleSide}
        />
      </mesh>
      <mesh position={[0, h * 0.5, d / 2 - 0.015]}>
        <boxGeometry args={[w, h - 0.1, 0.012]} />
        <meshPhysicalMaterial
          color="#b6d2cd"
          transparent
          opacity={0.1}
          roughness={0.07}
          depthWrite={false}
          side={DoubleSide}
        />
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
      <Solid size={[0.025, h * 0.48, 0.025]} at={[0, h * 0.65, -d * 0.43]} material={frame} />
      <Solid size={[0.025, 0.025, d * 0.32]} at={[0, h * 0.89, -d * 0.28]} material={frame} />
      <mesh position={[0, h * 0.88, -d * 0.14]} material={frame} castShadow>
        <cylinderGeometry args={[0.115, 0.115, 0.018, 32]} />
      </mesh>
      <mesh position={[0, h * 0.875, -d * 0.14]} rotation={[Math.PI / 2, 0, 0]} material={frame}>
        <torusGeometry args={[0.1, 0.004, 6, 32]} />
      </mesh>
      <Solid size={[w * 0.26, 0.045, 0.055]} at={[0, h * 0.42, -d * 0.4]} material={frame} />
      <Solid size={[0.018, 0.24, 0.03]} at={[w * 0.3, h * 0.47, d / 2 - 0.015]} material={frame} />
    </>
  );
}

function Table({
  object,
  body,
  frame,
  desk = false,
}: {
  object: SceneObject;
  body: ThreeMaterial;
  frame: ThreeMaterial;
  desk?: boolean;
}) {
  const { width: w, height: h, depth: d } = object.dimensions;
  return (
    <>
      <Solid size={[w, 0.045, d]} at={[0, h - 0.0225, 0]} material={body} radius={0.022} />
      <Solid size={[w - 0.2, 0.035, 0.045]} at={[0, h - 0.08, -d / 2 + 0.09]} material={frame} />
      {desk && (
        <>
          <Solid size={[w * 0.3, 0.12, d - 0.12]} at={[-w * 0.27, h - 0.11, 0]} material={body} />
          <Solid
            size={[w * 0.12, 0.012, 0.012]}
            at={[-w * 0.27, h - 0.1, d / 2 - 0.054]}
            material={frame}
          />
        </>
      )}
      {[-1, 1].flatMap((x) =>
        [-1, 1].map((z) => (
          <mesh
            key={`${x}:${z}`}
            position={[x * (w / 2 - 0.11), (h - 0.045) / 2, z * (d / 2 - 0.1)]}
            material={frame}
            castShadow
            receiveShadow
          >
            <cylinderGeometry args={[0.028, 0.017, h - 0.045, 12]} />
          </mesh>
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
      <Solid
        size={[w - 0.015, 0.075, d - 0.025]}
        at={[0, h * 0.53, 0]}
        material={body}
        radius={0.037}
      />
      <Solid
        size={[w - 0.025, h * 0.37, 0.075]}
        at={[0, h * 0.8, -d * 0.365]}
        material={body}
        rotation={[0.12, 0, 0]}
        radius={0.037}
      />
      <Solid size={[w * 0.73, 0.03, d * 0.73]} at={[0, h * 0.47, 0]} material={frame} />
      {[-1, 1].flatMap((x) =>
        [-1, 1].map((z) => (
          <mesh
            key={`${x}:${z}`}
            position={[x * w * 0.36, h * 0.235, z * d * 0.34]}
            rotation={[z * -0.045, 0, x * 0.045]}
            material={frame}
            castShadow
          >
            <cylinderGeometry args={[0.022, 0.012, h * 0.47, 12]} />
          </mesh>
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
      return <Table object={object} body={body} frame={frame} desk />;
    case 'dining-table':
      return <Table object={object} body={body} frame={frame} />;
    case 'dining-chair':
      return <DiningChair object={object} body={body} frame={frame} />;
    case 'wardrobe':
    case 'bedside':
      return (
        <>
          <Cupboard
            w={w}
            h={h - 0.02}
            d={d}
            material={body}
            frame={frame}
            drawers={renderer === 'bedside'}
          />
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
