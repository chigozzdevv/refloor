import { openableAngles } from '@refloor/scene';
import { finishes } from '@refloor/catalogue';
import { useSurface } from '@/shared/scene/asset-loader';
import { FurnitureSolid as Solid } from '@/components/scene/furniture-solid';
import { Cupboard } from '@/components/objects/cupboard';
import { Tap, Basin } from '@/components/objects/plumbing';
import { FixtureControl } from '@/components/objects/fixture-control';
import { FixtureMotion } from '@/components/objects/fixture-motion';
import { CookerFlames, FixtureWater } from '@/components/objects/fixture-effects';
import type { FixtureProps } from '@/components/objects/fixture-props';
import { CookerHob } from '@/components/objects/cooker-hob';

export function Kitchen({
  object,
  body,
  frame,
  island = false,
}: FixtureProps & { island?: boolean }) {
  const stone = useSurface(object.materials.top ?? finishes.marbleSlab),
    { width: w, height: h, depth: d } = object.dimensions,
    top = island ? h : h * 0.76,
    sinkX = -w * 0.25,
    sinkW = Math.min(0.55, w * 0.24),
    sinkD = Math.min(0.38, d * 0.6),
    left = w / 2 + sinkX - sinkW / 2,
    right = w - left - sinkW,
    open = object.behaviours.find((value) => value.kind === 'openable')?.state.open ?? false,
    cooker = object.behaviours.find((value) => value.kind === 'cooker')?.state,
    ovenWidth = Math.min(0.59, w * 0.3),
    ovenLeft = w * 0.23 - ovenWidth / 2,
    ovenRight = ovenLeft + ovenWidth;
  return (
    <>
      {island ? (
        <Cupboard
          object={object}
          w={w}
          h={top - 0.04}
          d={d - 0.035}
          material={body}
          frame={frame}
        />
      ) : (
        <>
          <group position={[(-w / 2 + ovenLeft) / 2, 0, 0]}>
            <Cupboard
              object={object}
              w={w / 2 + ovenLeft}
              h={top - 0.04}
              d={d - 0.035}
              material={body}
              frame={frame}
              operable={false}
            />
          </group>
          <group position={[(w / 2 + ovenRight) / 2, 0, 0]}>
            <Cupboard
              object={object}
              w={w / 2 - ovenRight}
              h={top - 0.04}
              d={d - 0.035}
              material={body}
              frame={frame}
              operable={false}
            />
          </group>
        </>
      )}
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
          <Tap object={object} x={sinkX} y={top} z={-d * 0.36} scale={h / 1.18} material={frame} />
          <FixtureWater
            object={object}
            position={[sinkX, top + (0.22 * h) / 1.18, -d * 0.36 + (0.15 * h) / 1.18]}
            length={(0.22 * h) / 1.18 + 0.12}
          />
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
          <CookerHob x={w * 0.23} y={top + 0.007} depth={d} />
          <CookerFlames object={object} top={top} />
          <Solid
            size={[ovenWidth, top * 0.5, 0.025]}
            at={[w * 0.23, top * 0.43, -d * 0.4]}
            color="#171b1c"
          />
          {[top * 0.18, top * 0.68].map((y) => (
            <Solid
              key={y}
              size={[ovenWidth, 0.025, d * 0.85]}
              at={[w * 0.23, y, 0]}
              color="#171b1c"
            />
          ))}
          {[-1, 1].map((side) => (
            <Solid
              key={side}
              size={[0.018, top * 0.5, d * 0.85]}
              at={[w * 0.23 + (side * ovenWidth) / 2, top * 0.43, 0]}
              color="#171b1c"
            />
          ))}
          {[-2, -1, 0, 1, 2].map((rail) => (
            <Solid
              key={rail}
              size={[0.005, 0.006, d * 0.66]}
              at={[w * 0.23 + rail * ovenWidth * 0.16, top * 0.34, 0]}
              material={frame}
            />
          ))}
          <FixtureMotion
            objectId={object.id}
            open={open}
            position={[w * 0.23, top * 0.18, d / 2 - 0.002]}
            axis="x"
            amount={openableAngles.oven}
          >
            <Solid
              size={[ovenWidth, top * 0.5, 0.028]}
              at={[0, top * 0.25, -0.014]}
              color="#141a1d"
              roughness={0.16}
              metalness={0.4}
            />
            <Solid
              size={[ovenWidth * 0.85, top * 0.29, 0.005]}
              at={[0, top * 0.22, 0.0015]}
              color="#273237"
              metalness={0.35}
              roughness={0.09}
            />
            <FixtureControl
              object={object}
              capability="openable"
              label={open ? 'Close oven' : 'Open oven'}
              position={[0, top * 0.47, 0.045]}
            >
              <Solid size={[0.47, 0.021, 0.028]} at={[0, top * 0.47, 0.018]} material={frame} />
            </FixtureControl>
          </FixtureMotion>
          {[0, 1, 2, 3].map((knob) => (
            <FixtureControl
              key={knob}
              object={object}
              capability="cooker"
              burner={knob}
              label={`${cooker?.powered && cooker.heat > 0 && cooker.burners[knob] ? 'Extinguish' : 'Ignite'} ${['front left', 'front right', 'back left', 'back right'][knob]} burner`}
              position={[w * 0.23 + (knob - 1.5) * 0.14, top * 0.79, d / 2 + 0.05]}
            >
              <group
                position={[w * 0.23 + (knob - 1.5) * 0.14, top * 0.79, d / 2 - 0.0125]}
                rotation={[
                  0,
                  0,
                  cooker?.powered && cooker.heat > 0 && cooker.burners[knob]
                    ? -0.8 - cooker.heat
                    : 0,
                ]}
              >
                <mesh rotation={[Math.PI / 2, 0, 0]}>
                  <cylinderGeometry args={[0.028, 0.028, 0.025, 20]} />
                  <primitive object={frame} attach="material" />
                </mesh>
                <Solid size={[0.005, 0.015, 0.002]} at={[0, 0.012, 0.014]} color="#d7c6a0" />
              </group>
            </FixtureControl>
          ))}
        </>
      )}
    </>
  );
}
