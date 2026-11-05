import { Component, useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal, useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { clone } from 'three/examples/jsm/utils/SkeletonUtils.js';
import {
  MathUtils,
  MeshStandardMaterial,
  Mesh,
  OrthographicCamera,
  Quaternion,
  Scene,
  SphereGeometry,
  Vector3,
} from 'three';
import type { Bone, Group } from 'three';
import { useProject } from '@/shared/scene/scene-store';
import { useExperience } from '@/shared/scene/experience-store';
import { useNavigation } from '@/shared/navigation/navigation-store';
import { useCapture } from '@/shared/scene/capture';
import { handScale, interactionHand, showInteractionHand } from '@/shared/editor/interaction-hand';

const fingers = ['thumb', 'index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'];
const segments = [
  'metacarpal',
  'phalanx-proximal',
  'phalanx-intermediate',
  'phalanx-distal',
  'tip',
];
const axis = new Vector3(1, 0, 0);

class HandBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  override render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function FirstPersonHand() {
  const size = useThree((state) => state.size);
  return showInteractionHand(size.width, size.height) ? (
    <HandBoundary>
      <HandMesh />
    </HandBoundary>
  ) : null;
}

function HandMesh() {
  const source = useGLTF('/models/interaction/hand-right.glb'),
    size = useThree((state) => state.size),
    group = useRef<Group>(null),
    scene = useMemo(() => new Scene(), []),
    camera = useMemo(() => new OrthographicCamera(0, 1, 1, 0, 0.1, 2000), []),
    bend = useRef(0);
  const { model, joints, material, cuff, sleeve, buttons, nail, nailGeometry } = useMemo(() => {
    const model = clone(source.scene),
      material = new MeshStandardMaterial({ color: '#a16e50', roughness: 0.78, metalness: 0 }),
      cuff = new MeshStandardMaterial({ color: '#ece8df', roughness: 0.9, metalness: 0 }),
      sleeve = new MeshStandardMaterial({ color: '#202b36', roughness: 0.96, metalness: 0 }),
      buttons = new MeshStandardMaterial({ color: '#131a22', roughness: 0.65, metalness: 0 }),
      nail = new MeshStandardMaterial({ color: '#b78e78', roughness: 0.65, metalness: 0 }),
      nailGeometry = new SphereGeometry(1, 12, 8);
    model.updateMatrixWorld(true);
    const wrist = model.getObjectByName('wrist')!;
    const joints: { bone: Bone; rest: Quaternion; finger: number; segment: number }[] = [];
    fingers.forEach((finger, index) => {
      let parent = wrist;
      segments.forEach((segment, part) => {
        const bone = model.getObjectByName(`${finger}-${segment}`) as Bone | undefined;
        if (!bone) return;
        parent.attach(bone);
        joints.push({ bone, rest: bone.quaternion.clone(), finger: index, segment: part });
        parent = bone;
      });
    });
    model.traverse((object) => {
      if ('isMesh' in object) {
        const mesh = object as Mesh;
        mesh.material = material;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.frustumCulled = false;
      }
    });
    for (const { bone, segment, finger } of joints) {
      if (segment !== 3) continue;
      const plate = new Mesh(nailGeometry, nail);
      plate.position.set(0, finger === 0 ? 0.006 : 0.005, -0.0055);
      plate.scale.set(finger === 4 ? 0.0032 : 0.004, 0.0005, 0.005);
      bone.add(plate);
    }
    return { model, joints, material, cuff, sleeve, buttons, nail, nailGeometry };
  }, [source]);
  useEffect(
    () => () => {
      for (const finish of [material, cuff, sleeve, buttons, nail]) finish.dispose();
      nailGeometry.dispose();
    },
    [material, cuff, sleeve, buttons, nail, nailGeometry],
  );
  const rotation = useMemo(
    () =>
      new Quaternion()
        .setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 6)
        .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 0, 1), Math.PI))
        .multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -Math.PI / 2)),
    [],
  );
  const curl = useMemo(() => new Quaternion(), []);
  useFrame(({ gl }, delta) => {
    const project = useProject.getState(),
      nav = useNavigation.getState(),
      capture = useCapture.getState();
    if (
      !group.current ||
      !showInteractionHand(size.width, size.height) ||
      useExperience.getState().stage !== 'ready' ||
      project.mode === 'orbit' ||
      nav.panelOpen ||
      nav.mapOpen ||
      capture.pending ||
      capture.capturing
    )
      return;
    bend.current = MathUtils.damp(
      bend.current,
      interactionHand.pressed ? 1 : 0,
      22,
      Math.min(delta, 0.05),
    );
    for (const { bone, rest, finger, segment } of joints) {
      const amount =
        segment === 0 || segment === 4
          ? 0
          : finger === 0
            ? (segment === 1 ? 0.12 : 0.18) + bend.current * 0.15
            : finger === 1
              ? 0.16 + bend.current * (segment === 1 ? 0.65 : 0.8)
              : segment === 1
                ? 0.55
                : segment === 2
                  ? 0.85
                  : 0.4;
      bone.quaternion.copy(rest).multiply(curl.setFromAxisAngle(axis, -amount));
    }
    camera.right = size.width;
    camera.top = size.height;
    camera.position.z = 1000;
    camera.updateProjectionMatrix();
    group.current.position.set(
      interactionHand.x * size.width,
      130 * handScale(size.height) - interactionHand.y + bend.current * 5,
      0,
    );
    group.current.scale.setScalar(1100 * handScale(size.height));
    group.current.rotation.z = MathUtils.degToRad(interactionHand.turn - 14 - bend.current * 4);
    const autoClear = gl.autoClear;
    gl.autoClear = false;
    gl.clearDepth();
    gl.render(scene, camera);
    gl.autoClear = autoClear;
  }, 1.5);
  return createPortal(
    <>
      <hemisphereLight args={['#ffffff', '#a6abb3', 1]} />
      <directionalLight position={[-200, 450, 650]} intensity={1.8} />
      <group ref={group}>
        <group quaternion={rotation}>
          <primitive object={model} />
          <mesh position={[0.035, 0.12, 0.009]} scale={[0.65, 1, 1]} material={material}>
            <cylinderGeometry args={[0.035, 0.027, 0.1, 24]} />
          </mesh>
          <mesh position={[0.035, 0.079, 0.009]} scale={[0.72, 1, 1]} material={cuff}>
            <cylinderGeometry args={[0.035, 0.034, 0.018, 24]} />
          </mesh>
          <mesh position={[0.035, 0.181, 0.009]} scale={[0.78, 1, 1]} material={sleeve}>
            <cylinderGeometry args={[0.048, 0.039, 0.19, 24]} />
          </mesh>
          {[0.116, 0.13, 0.144].map((height) => (
            <mesh
              key={height}
              position={[0.067, height, 0.026]}
              rotation={[0, 0, Math.PI / 2]}
              material={buttons}
            >
              <cylinderGeometry args={[0.0033, 0.0033, 0.0018, 12]} />
            </mesh>
          ))}
        </group>
      </group>
    </>,
    scene,
  );
}
