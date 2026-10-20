import { openableAngles } from '@refloor/scene';
import { FurnitureSolid as Solid } from '@/components/scene/furniture-solid';
import { FixtureControl } from '@/components/objects/fixture-control';
import { FixtureMotion } from '@/components/objects/fixture-motion';
import type { FixtureProps } from '@/components/objects/fixture-props';

export function Refrigerator({ object, body, frame }: FixtureProps) {
  const { width: w, height: h, depth: d } = object.dimensions;
  const open = object.behaviours.find((value) => value.kind === 'openable')?.state.open ?? false;
  return (
    <>
      <Solid size={[w, h - 0.08, 0.035]} at={[0, h / 2, -d / 2 + 0.018]} material={body} />
      {[-1, 1].map((side) => (
        <Solid
          key={side}
          size={[0.035, h - 0.08, d]}
          at={[side * (w / 2 - 0.018), h / 2, 0]}
          material={body}
        />
      ))}
      {[0.065, h * 0.31, h * 0.57, h * 0.79, h - 0.05].map((y) => (
        <Solid
          key={y}
          size={[w - 0.07, 0.02, d - 0.08]}
          at={[0, y, -0.01]}
          color="#e5e9e3"
          roughness={0.24}
        />
      ))}
      <Solid size={[w - 0.07, h - 0.12, 0.015]} at={[0, h / 2, -d / 2 + 0.045]} color="#e5e9e3" />
      {[
        { height: h * 0.68, y: h * 0.64 },
        { height: h * 0.26, y: h * 0.16 },
      ].map((door, index) => (
        <FixtureMotion
          objectId={object.id}
          key={index}
          open={open}
          position={[w / 2 - 0.015, door.y, d / 2 - 0.025]}
          axis="y"
          amount={openableAngles.fridge}
        >
          <Solid
            size={[w - 0.025, door.height, 0.035]}
            at={[-w / 2 + 0.015, 0, 0]}
            material={body}
          />
          <Solid
            size={[w - 0.075, door.height - 0.05, 0.014]}
            at={[-w / 2 + 0.015, 0, -0.025]}
            color="#e5e9e3"
          />
          <FixtureControl
            object={object}
            capability="openable"
            label={open ? 'Close refrigerator' : 'Open refrigerator'}
            position={[-w * 0.85 + 0.015, 0, 0.05]}
          >
            <Solid
              size={[0.025, door.height * 0.45, 0.022]}
              at={[-w * 0.85 + 0.015, 0, 0.014]}
              material={frame}
            />
          </FixtureControl>
          {index === 0 && (
            <Solid
              size={[w * 0.23, 0.075, 0.005]}
              at={[-w * 0.3 + 0.015, h * 0.16, 0.022]}
              color="#1b292c"
              roughness={0.1}
            />
          )}
        </FixtureMotion>
      ))}
      {open && (
        <pointLight
          position={[0, h * 0.8, 0]}
          color="#e1efff"
          intensity={0.25}
          distance={1.4}
          decay={2}
        />
      )}
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
