import { z } from 'zod';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { materialSchema } from '@refloor/scene/material';
import type { Material } from '@refloor/scene/material';
import { idSchema } from '@refloor/scene/primitives';

export const siteSurfaceSlotSchema = z.enum([
  'paving',
  'kerb',
  'plinth',
  'window-trim',
  'door-trim',
  'canopy',
  'parapet',
  'roof-trim',
]);
export type SiteSurfaceSlot = z.infer<typeof siteSurfaceSlotSchema>;
export const siteMaterialsSchema = z
  .partialRecord(siteSurfaceSlotSchema, materialSchema)
  .refine(
    (materials) => Object.keys(materials).length > 0,
    'Provide an exterior material override',
  );
export const siteSurfaceSnapshotSchema = z.strictObject({
  id: idSchema,
  slot: siteSurfaceSlotSchema,
  material: materialSchema.nullable(),
});

const finish = (
  color: string,
  roughness: number,
  metalness = 0,
  textureId: string | null = null,
): Material => ({ color, roughness, metalness, textureId, opacity: 1 });
const defaults: Record<SiteSurfaceSlot, Material> = {
  paving: finish('#a6a699', 0.92),
  kerb: finish('#aaa99b', 0.9),
  plinth: finish('#b7b7aa', 0.9),
  'window-trim': finish('#424c4a', 0.45, 0.4),
  'door-trim': finish('#c6aa7b', 0.62, 0, 'wood-floor'),
  canopy: finish('#555c59', 0.5, 0.25),
  parapet: finish('#d1d0c4', 0.9),
  'roof-trim': finish('#555c59', 0.5, 0.3),
};
export const siteSurfaceLabels: Record<SiteSurfaceSlot, string> = {
  paving: 'Compound paving',
  kerb: 'Compound kerbs',
  plinth: 'Façade plinth',
  'window-trim': 'Window trim',
  'door-trim': 'Door trim',
  canopy: 'Entrance canopy',
  parapet: 'Roof parapet',
  'roof-trim': 'Roof trim',
};
type SiteAppearance = {
  id: string;
  siteMaterials?: z.infer<typeof siteMaterialsSchema> | undefined;
};
export function siteSurfaceId(building: Pick<SiteAppearance, 'id'>, slot: SiteSurfaceSlot) {
  const root =
    building.id.length > 96
      ? `house-${bytesToHex(sha256(new TextEncoder().encode(building.id)))}`
      : building.id;
  return `${root}/surface/${slot}`;
}
export function siteSurfaceSlot(building: Pick<SiteAppearance, 'id'>, id: string) {
  return siteSurfaceSlotSchema.options.find((slot) => siteSurfaceId(building, slot) === id) ?? null;
}
export function siteSurfaceMaterial(building: SiteAppearance, slot: SiteSurfaceSlot): Material {
  return building.siteMaterials?.[slot] ?? defaults[slot];
}
export function defaultSiteMaterial(slot: SiteSurfaceSlot): Material {
  return structuredClone(defaults[slot]);
}
export function siteSurfaceSnapshots(building: SiteAppearance) {
  return siteSurfaceSlotSchema.options.map((slot) => ({
    id: siteSurfaceId(building, slot),
    slot,
    material: building.siteMaterials?.[slot] ? structuredClone(building.siteMaterials[slot]) : null,
  }));
}
