import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, DoubleSide, Matrix4, Quaternion, Vector3 } from 'three';
import type { InstancedMesh, ShaderMaterial, Vector3Tuple } from 'three';
import type { SceneObject } from '@refloor/scene';
import { useRenderSettings } from '@/shared/scene/render-settings';

const noRaycast = () => undefined;

export function CookerFlames({ object, top }: { object: SceneObject; top: number }) {
  const state = object.behaviours.find((value) => value.kind === 'cooker')?.state;
  const active = state?.powered ? state.burners.filter(Boolean).length : 0;
  return (
    <>
      {state?.powered && state.heat > 0 && (
        <Flames object={object} top={top} heat={state.heat} burners={state.burners} />
      )}
      <pointLight
        position={[object.dimensions.width * 0.23, top + 0.12, 0]}
        color="#4f8bff"
        intensity={(state?.heat ?? 0) * active * 0.06}
        distance={1.5}
        decay={2}
      />
    </>
  );
}

function Flames({
  object,
  top,
  heat,
  burners,
}: {
  object: SceneObject;
  top: number;
  heat: number;
  burners: boolean[];
}) {
  const mesh = useRef<InstancedMesh>(null),
    balanced = useRenderSettings((value) => value.landscapeQuality === 'balanced'),
    count = balanced ? 10 : 16,
    active = burners.flatMap((enabled, index) => (enabled ? [index] : [])),
    matrix = useMemo(() => new Matrix4(), []),
    position = useMemo(() => new Vector3(), []),
    scale = useMemo(() => new Vector3(), []),
    rotation = useMemo(() => new Quaternion(), []);
  const material = useRef<ShaderMaterial>(null),
    cameraPosition = useMemo(() => new Vector3(), []),
    up = useMemo(() => new Vector3(0, 1, 0), []),
    uniforms = useMemo(() => ({ time: { value: 0 } }), []);
  useFrame(({ clock, camera }) => {
    if (!mesh.current) return;
    cameraPosition.copy(camera.position);
    mesh.current.worldToLocal(cameraPosition);
    if (material.current) material.current.uniforms.time!.value = clock.elapsedTime;
    active.forEach((burner, ring) => {
      const x = object.dimensions.width * 0.23 + (burner % 2 ? 0.14 : -0.14),
        z = burner < 2 ? 0.12 : -0.12;
      for (let tongue = 0; tongue < count; tongue++) {
        const angle = (tongue / count) * Math.PI * 2,
          pulse = 1 + Math.sin(clock.elapsedTime * 21 + tongue * 2.7 + burner) * 0.12,
          height = (0.018 + heat * 0.038) * pulse;
        position.set(
          x + Math.cos(angle) * 0.065,
          top + 0.024 + height / 2,
          z + Math.sin(angle) * 0.065,
        );
        scale.set(0.015 + heat * 0.007, height, 1);
        rotation.setFromAxisAngle(
          up,
          Math.atan2(cameraPosition.x - position.x, cameraPosition.z - position.z),
        );
        matrix.compose(position, rotation, scale);
        mesh.current!.setMatrixAt(ring * count + tongue, matrix);
      }
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <>
      <instancedMesh
        ref={mesh}
        args={[undefined, undefined, active.length * count]}
        raycast={noRaycast}
        frustumCulled={false}
      >
        <planeGeometry args={[1, 1]} />
        <shaderMaterial
          ref={material}
          uniforms={uniforms}
          transparent
          blending={AdditiveBlending}
          side={DoubleSide}
          depthWrite={false}
          toneMapped={false}
          vertexShader={`varying vec2 flameUv;
            void main() {
              flameUv = uv;
              gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
            }`}
          fragmentShader={`varying vec2 flameUv;
            uniform float time;
            void main() {
              float y = flameUv.y;
              float sway = sin(time * 18.0 + y * 11.0) * 0.025 * y;
              float x = abs(flameUv.x - 0.5 + sway);
              float width = mix(0.38, 0.035, y);
              float edge = 1.0 - smoothstep(width * 0.25, width, x);
              float height = smoothstep(0.0, 0.12, y) * (1.0 - smoothstep(0.55, 1.0, y));
              float core = (1.0 - smoothstep(0.0, 0.13, x)) * (1.0 - smoothstep(0.1, 0.65, y));
              vec3 blue = mix(vec3(0.025, 0.07, 0.9), vec3(0.1, 0.55, 1.0), y);
              gl_FragColor = vec4(mix(blue, vec3(0.45, 0.85, 1.0), core), edge * height * 0.78);
              #include <colorspace_fragment>
            }`}
        />
      </instancedMesh>
    </>
  );
}

export function FixtureWater({
  object,
  position,
  length,
  shower = false,
}: {
  object: SceneObject;
  position: Vector3Tuple;
  length: number;
  shower?: boolean;
}) {
  const state = object.behaviours.find((value) => value.kind === 'water')?.state;
  return state?.powered && state.flow > 0 ? (
    <Water position={position} length={length} flow={state.flow} shower={shower} />
  ) : null;
}

function Water({
  position,
  length,
  flow,
  shower,
}: {
  position: Vector3Tuple;
  length: number;
  flow: number;
  shower: boolean;
}) {
  const jets = useRef<InstancedMesh>(null),
    spray = useRef<InstancedMesh>(null),
    matrix = useMemo(() => new Matrix4(), []),
    translation = useMemo(() => new Vector3(), []),
    scale = useMemo(() => new Vector3(), []),
    rotation = useMemo(() => new Quaternion(), []),
    count = shower ? 24 : 6;
  useFrame(({ clock }) => {
    if (!jets.current || !spray.current) return;
    for (let index = 0; index < count; index++) {
      const angle = index * 2.39996,
        radius = shower ? Math.sqrt((index + 0.5) / count) * 0.095 : 0.0015,
        x = Math.cos(angle) * radius,
        z = Math.sin(angle) * radius,
        drop = ((clock.elapsedTime * (shower ? 1.1 : 1.8) + index * 0.137) % 1) * length;
      translation.set(x, -length / 2, z);
      scale.set((shower ? 0.0014 : 0.0035) * Math.sqrt(flow), length, 0.0018 * Math.sqrt(flow));
      matrix.compose(translation, rotation, scale);
      jets.current.setMatrixAt(index, matrix);
      translation.set(x + Math.sin(index * 3) * 0.008, -drop, z);
      scale.set(0.002, 0.012 + flow * 0.016, 0.002);
      matrix.compose(translation, rotation, scale);
      spray.current.setMatrixAt(index, matrix);
    }
    jets.current.instanceMatrix.needsUpdate = true;
    spray.current.instanceMatrix.needsUpdate = true;
  });
  return (
    <group position={position}>
      <instancedMesh
        ref={jets}
        args={[undefined, undefined, count]}
        raycast={noRaycast}
        frustumCulled={false}
      >
        <cylinderGeometry args={[1, 1, 1, 6]} />
        <meshStandardMaterial
          color="#aacdd8"
          transparent
          opacity={0.38 + flow * 0.15}
          roughness={0.13}
          metalness={0.05}
          depthWrite={false}
        />
      </instancedMesh>
      <instancedMesh
        ref={spray}
        args={[undefined, undefined, count]}
        raycast={noRaycast}
        frustumCulled={false}
      >
        <sphereGeometry args={[1, 5, 4]} />
        <meshBasicMaterial color="#deedf3" transparent opacity={0.55} depthWrite={false} />
      </instancedMesh>
      <mesh position={[0, -length + 0.004, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={noRaycast}>
        <ringGeometry args={[shower ? 0.08 : 0.018, shower ? 0.14 : 0.04, 24]} />
        <meshBasicMaterial color="#c7dce3" transparent opacity={flow * 0.2} depthWrite={false} />
      </mesh>
    </group>
  );
}
