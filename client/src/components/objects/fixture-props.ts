import type { Material } from 'three';
import type { SceneObject } from '@refloor/scene';

export type FixtureProps = {
  object: SceneObject;
  body: Material;
  frame: Material;
};
