import { BufferGeometry, Float32BufferAttribute } from 'three';
import type { MeshPart } from '@refloor/engine';

export function partGeometry(part: MeshPart): BufferGeometry {
  const geometry = new BufferGeometry(),
    { mesh, collider } = part;
  geometry.setAttribute('position', new Float32BufferAttribute(mesh.positions, 3));
  geometry.setAttribute('normal', new Float32BufferAttribute(mesh.normals, 3));
  const uv: number[] = [],
    c = Math.cos(collider.rotation),
    s = Math.sin(collider.rotation);
  for (let i = 0; i < mesh.positions.length; i += 3) {
    const px = mesh.positions[i] ?? 0,
      py = mesh.positions[i + 1] ?? 0,
      pz = mesh.positions[i + 2] ?? 0;
    const nx = mesh.normals[i] ?? 0,
      ny = mesh.normals[i + 1] ?? 0,
      nz = mesh.normals[i + 2] ?? 0;
    const x = px * c + pz * s + collider.position.x,
      y = py + collider.position.y,
      z = -px * s + pz * c + collider.position.z;
    const worldNx = nx * c + nz * s,
      worldNz = -nx * s + nz * c;
    if (Math.abs(ny) > 0.5) uv.push(x, z);
    else if (Math.abs(worldNx) > Math.abs(worldNz)) uv.push(z, y);
    else uv.push(x, y);
  }
  geometry.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geometry.setAttribute('uv1', new Float32BufferAttribute(uv, 2));
  geometry.setIndex(mesh.indices);
  if (part.exterior || ['slab', 'stair-tread', 'stair-landing'].includes(part.role)) {
    let start = 0,
      material = -1;
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const vertex = mesh.indices[i] ?? 0,
        next = part.exterior
          ? (mesh.normals[vertex * 3 + 2] ?? 0) * part.exterior.side > 0.5
            ? 1
            : 0
          : (mesh.normals[vertex * 3 + 1] ?? 0) > 0.5
            ? 0
            : 1;
      if (next !== material) {
        if (material !== -1) geometry.addGroup(start, i - start, material);
        start = i;
        material = next;
      }
    }
    if (material !== -1) geometry.addGroup(start, mesh.indices.length - start, material);
  }
  geometry.computeBoundingSphere();
  return geometry;
}
