import { z } from 'zod';
import { SceneError } from '@refloor/scene/errors';

const keySchema = z
  .string()
  .min(1)
  .max(160)
  .refine((key) => !['__proto__', 'prototype', 'constructor'].includes(key));
export const propertyPathSchema = z
  .array(z.union([keySchema, z.strictObject({ key: z.enum(['id', 'kind']), value: keySchema })]))
  .min(1)
  .max(16);
export const propertyValueSchema = z.discriminatedUnion('exists', [
  z.strictObject({ exists: z.literal(false) }),
  z.strictObject({ exists: z.literal(true), value: z.json() }),
]);
export const propertyChangeSchema = z.strictObject({
  path: propertyPathSchema,
  value: propertyValueSchema,
  index: z.number().int().nonnegative().optional(),
});
export const propertyPatchSchema = z.strictObject({
  path: propertyPathSchema,
  before: propertyValueSchema,
  after: propertyValueSchema,
  index: z.number().int().nonnegative().optional(),
});
export const propertyGuardSchema = z.strictObject({
  path: propertyPathSchema,
  value: propertyValueSchema,
});
export type PropertyPath = z.infer<typeof propertyPathSchema>;
export type PropertyValue = z.infer<typeof propertyValueSchema>;
export type PropertyChange = z.infer<typeof propertyChangeSchema>;
export type PropertyPatch = z.infer<typeof propertyPatchSchema>;
export type PropertyGuard = z.infer<typeof propertyGuardSchema>;

function entry(value: unknown, key: PropertyPath[number]): unknown {
  if (typeof key === 'string')
    return value && typeof value === 'object' && Object.hasOwn(value, key)
      ? (value as Record<string, unknown>)[key]
      : undefined;
  return Array.isArray(value)
    ? value.find(
        (item: unknown) =>
          item &&
          typeof item === 'object' &&
          (item as Record<string, unknown>)[key.key] === key.value,
      )
    : undefined;
}
export function readProperty(input: unknown, path: PropertyPath): PropertyValue {
  let value = input;
  for (const key of path) value = entry(value, key);
  return value === undefined
    ? { exists: false }
    : { exists: true, value: structuredClone(value) as z.infer<ReturnType<typeof z.json>> };
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object')
    return `{${Object.entries(value)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}
export const sameProperty = (a: PropertyValue, b: PropertyValue) => canonical(a) === canonical(b);
export const propertyKey = (path: PropertyPath) => canonical(path);
export function propertiesMatch(input: unknown, guards: PropertyGuard[]) {
  return guards.every((guard) => sameProperty(readProperty(input, guard.path), guard.value));
}
export function writeProperty(input: unknown, change: PropertyChange) {
  const path = propertyPathSchema.parse(change.path);
  if (
    !['objects', 'floors', 'roof', 'stairs', 'rules', 'siteMaterials', 'name'].includes(
      String(path[0]),
    )
  )
    throw new SceneError('INVALID_TARGET', 'This property cannot be restored');
  let parent = input;
  for (const key of path.slice(0, -1)) {
    const child = entry(parent, key);
    if (!child || typeof child !== 'object')
      throw new SceneError('INVALID_TARGET', 'The item containing this property no longer exists');
    parent = child;
  }
  const key = path.at(-1)!;
  if (!parent || typeof parent !== 'object')
    throw new SceneError('INVALID_TARGET', 'This property no longer exists');
  if (typeof key === 'string') {
    if (Array.isArray(parent))
      throw new SceneError('INVALID_TARGET', 'Arrays require a stable item identity');
    if (change.value.exists)
      (parent as Record<string, unknown>)[key] = structuredClone(change.value.value);
    else delete (parent as Record<string, unknown>)[key];
  } else {
    if (!Array.isArray(parent))
      throw new SceneError('INVALID_TARGET', 'This collection no longer exists');
    const index = parent.findIndex((item: Record<string, unknown>) => item[key.key] === key.value);
    if (change.value.exists) {
      if (index < 0)
        parent.splice(
          Math.min(change.index ?? parent.length, parent.length),
          0,
          structuredClone(change.value.value),
        );
      else parent[index] = structuredClone(change.value.value);
    } else if (index >= 0) parent.splice(index, 1);
  }
}
export function diffProperties(before: unknown, after: unknown): PropertyPatch[] {
  const patches: PropertyPatch[] = [];
  function visit(a: unknown, b: unknown, path: PropertyPath, index?: number) {
    if (canonical(a) === canonical(b)) return;
    if (Array.isArray(a) && Array.isArray(b)) {
      const items = [...a, ...b] as unknown[];
      const key = (['id', 'kind'] as const).find(
        (candidate) =>
          items.length &&
          items.every(
            (item) =>
              item &&
              typeof item === 'object' &&
              typeof (item as Record<string, unknown>)[candidate] === 'string',
          ),
      );
      if (key) {
        const ids = new Set([...a, ...b].map((item: Record<string, string>) => item[key]!));
        for (const id of ids)
          visit(
            a.find((item: Record<string, string>) => item[key] === id),
            b.find((item: Record<string, string>) => item[key] === id),
            [...path, { key, value: id }],
            Math.max(
              0,
              (a.some((item: Record<string, string>) => item[key] === id) ? a : b).findIndex(
                (item: Record<string, string>) => item[key] === id,
              ),
            ),
          );
        return;
      }
    } else if (
      a &&
      b &&
      typeof a === 'object' &&
      typeof b === 'object' &&
      !Array.isArray(a) &&
      !Array.isArray(b)
    ) {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (!path.length && key === 'revision') continue;
        visit((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], [
          ...path,
          key,
        ]);
      }
      return;
    }
    patches.push({
      path,
      before:
        a === undefined
          ? { exists: false }
          : { exists: true, value: structuredClone(a) as z.infer<ReturnType<typeof z.json>> },
      after:
        b === undefined
          ? { exists: false }
          : { exists: true, value: structuredClone(b) as z.infer<ReturnType<typeof z.json>> },
      ...(index === undefined ? {} : { index }),
    });
  }
  visit(before, after, []);
  return patches;
}
export function restorationChanges(
  input: unknown,
  patches: PropertyPatch[],
  restore = false,
): PropertyChange[] {
  const expected = restore ? 'before' : 'after',
    destination = restore ? 'after' : 'before';
  if (!patches.every((patch) => sameProperty(readProperty(input, patch.path), patch[expected])))
    throw new SceneError(
      'REVISION_CONFLICT',
      'A later edit changed the same property. Undo that edit first.',
    );
  return patches.map((patch) => ({
    path: patch.path,
    value: patch[destination],
    ...(patch.index === undefined ? {} : { index: patch.index }),
  }));
}
