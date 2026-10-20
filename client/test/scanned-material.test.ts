import { describe, expect, it } from 'vitest';
import { Color, DoubleSide, MeshPhysicalMaterial, Texture } from 'three';
import { getCatalogueEntry } from '@refloor/catalogue';
import { finishes } from '@refloor/catalogue/materials';
import { scannedMaterial } from '@/shared/scene/scanned-material';

function upholstery() {
  const source = new MeshPhysicalMaterial({
    color: '#c4bcaf',
    map: new Texture(),
    normalMap: new Texture(),
    roughnessMap: new Texture(),
    metalnessMap: new Texture(),
    aoMap: new Texture(),
    roughness: 0.73,
    metalness: 0.12,
    clearcoat: 0.18,
    side: DoubleSide,
  });
  source.name = 'modern_arm_chair_01_pillow';
  source.normalScale.set(0.85, 0.85);
  return source;
}

describe('scanned furniture appearance', () => {
  it('tints dark upholstery in linear space while retaining every PBR texture and parameter', () => {
    const entry = getCatalogueEntry('catalogue/chair'),
      original = entry.materials.body!,
      source = upholstery(),
      finish = new MeshPhysicalMaterial({ color: '#b64034' }),
      appearance = { ...original, color: '#b64034' },
      result = scannedMaterial(source, 'seat', entry, appearance, finish) as MeshPhysicalMaterial,
      reference = new Color(original.color),
      target = new Color(appearance.color);
    expect(result).not.toBe(source);
    expect(result.map).toBe(source.map);
    expect(result.normalMap).toBe(source.normalMap);
    expect(result.roughnessMap).toBe(source.roughnessMap);
    expect(result.metalnessMap).toBe(source.metalnessMap);
    expect(result.aoMap).toBe(source.aoMap);
    expect(result.roughness).toBe(source.roughness);
    expect(result.metalness).toBe(source.metalness);
    expect(result.normalScale.equals(source.normalScale)).toBe(true);
    expect(result.clearcoat).toBe(source.clearcoat);
    expect(result.side).toBe(source.side);
    expect(result.name).toBe(source.name);
    expect(result.color.r).toBeCloseTo((source.color.r * target.r) / reference.r);
    expect(result.color.g).toBeCloseTo((source.color.g * target.g) / reference.g);
    expect(result.color.b).toBeCloseTo((source.color.b * target.b) / reference.b);
    expect(source.color.equals(new Color('#c4bcaf'))).toBe(true);
    expect(finish.color.equals(new Color(appearance.color))).toBe(true);
    result.dispose();
    source.dispose();
    finish.dispose();
  });

  it('keeps timber and foliage materials separate from the editable upholstery or pot', () => {
    const chair = getCatalogueEntry('catalogue/chair'),
      plant = getCatalogueEntry('catalogue/plant'),
      source = upholstery(),
      finish = new MeshPhysicalMaterial({ color: '#336699' });
    source.name = 'modern_arm_chair_01_legs';
    const timber = scannedMaterial(
      source,
      'seat',
      chair,
      { ...chair.materials.body!, color: '#336699' },
      finish,
    ) as MeshPhysicalMaterial;
    expect(timber.color.equals(source.color)).toBe(true);
    expect(timber.map).toBe(source.map);
    source.name = 'potted_plant_02_pot';
    const foliage = scannedMaterial(
      source,
      'potted_plant_02_leaves',
      plant,
      { ...plant.materials.body!, color: '#336699' },
      finish,
    ) as MeshPhysicalMaterial;
    expect(foliage.color.equals(source.color)).toBe(true);
    expect(foliage.map).toBe(source.map);
    timber.dispose();
    foliage.dispose();
    source.dispose();
    finish.dispose();
  });

  it('replaces a deliberate finish and restores the source appearance without accumulating tints', () => {
    const entry = getCatalogueEntry('catalogue/chair'),
      source = upholstery(),
      finish = new MeshPhysicalMaterial({
        color: finishes.linen.color,
        map: new Texture(),
        normalMap: new Texture(),
        roughness: finishes.linen.roughness,
      }),
      replaced = scannedMaterial(
        source,
        'seat',
        entry,
        finishes.linen,
        finish,
      ) as MeshPhysicalMaterial,
      restored = scannedMaterial(
        source,
        'seat',
        entry,
        structuredClone(entry.materials.body!),
        finish,
      ) as MeshPhysicalMaterial;
    expect(replaced.map).toBe(finish.map);
    expect(replaced.normalMap).toBe(finish.normalMap);
    expect(replaced.roughness).toBe(finishes.linen.roughness);
    expect(replaced.side).toBe(source.side);
    expect(replaced.name).toBe(source.name);
    expect(restored.color.equals(source.color)).toBe(true);
    expect(restored.map).toBe(source.map);
    expect(restored.normalMap).toBe(source.normalMap);
    expect(restored.roughnessMap).toBe(source.roughnessMap);
    expect(restored.roughness).toBe(source.roughness);
    replaced.dispose();
    restored.dispose();
    source.dispose();
    finish.dispose();
  });

  it('keeps zero reference colour channels finite when recolouring', () => {
    const entry = structuredClone(getCatalogueEntry('catalogue/chair')),
      source = upholstery(),
      finish = new MeshPhysicalMaterial({ color: '#ffffff' });
    entry.materials.body!.color = '#000000';
    const result = scannedMaterial(
      source,
      'seat',
      entry,
      { ...entry.materials.body!, color: '#ffffff' },
      finish,
    ) as MeshPhysicalMaterial;
    expect(result.color.toArray().every(Number.isFinite)).toBe(true);
    result.dispose();
    source.dispose();
    finish.dispose();
  });
});
