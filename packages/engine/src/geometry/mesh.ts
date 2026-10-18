import type { MeshData, Point3 } from '@refloor/engine/types';

function facesToMesh(faces: Point3[][]): MeshData {
  const mesh: MeshData = { positions: [], normals: [], uvs: [], indices: [] };
  for (const face of faces) {
    const a = face[0],
      b = face[1],
      c = face[2];
    if (!a || !b || !c) continue;
    const u = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z },
      v = { x: c.x - a.x, y: c.y - a.y, z: c.z - a.z };
    const cross = { x: u.y * v.z - u.z * v.y, y: u.z * v.x - u.x * v.z, z: u.x * v.y - u.y * v.x };
    const length = Math.hypot(cross.x, cross.y, cross.z),
      ul = Math.hypot(u.x, u.y, u.z);
    const n = { x: cross.x / length, y: cross.y / length, z: cross.z / length };
    const axis = { x: u.x / ul, y: u.y / ul, z: u.z / ul };
    const tangent = {
      x: n.y * axis.z - n.z * axis.y,
      y: n.z * axis.x - n.x * axis.z,
      z: n.x * axis.y - n.y * axis.x,
    };
    const offset = mesh.positions.length / 3;
    for (const p of face) {
      mesh.positions.push(p.x, p.y, p.z);
      mesh.normals.push(n.x, n.y, n.z);
      mesh.uvs.push(
        (p.x - a.x) * axis.x + (p.y - a.y) * axis.y + (p.z - a.z) * axis.z,
        (p.x - a.x) * tangent.x + (p.y - a.y) * tangent.y + (p.z - a.z) * tangent.z,
      );
    }
    for (let i = 1; i < face.length - 1; i++) mesh.indices.push(offset, offset + i, offset + i + 1);
  }
  return mesh;
}

export function boxMesh(size: Point3): MeshData {
  const x = size.x / 2,
    y = size.y / 2,
    z = size.z / 2;
  const p = (x: number, y: number, z: number): Point3 => ({ x, y, z });
  return facesToMesh([
    [p(-x, -y, z), p(x, -y, z), p(x, y, z), p(-x, y, z)],
    [p(x, -y, -z), p(-x, -y, -z), p(-x, y, -z), p(x, y, -z)],
    [p(x, -y, z), p(x, -y, -z), p(x, y, -z), p(x, y, z)],
    [p(-x, -y, -z), p(-x, -y, z), p(-x, y, z), p(-x, y, -z)],
    [p(-x, y, z), p(x, y, z), p(x, y, -z), p(-x, y, -z)],
    [p(-x, -y, -z), p(x, -y, -z), p(x, -y, z), p(-x, -y, z)],
  ]);
}

export function gableMesh(width: number, depth: number, height: number): MeshData {
  const x = width / 2,
    z = depth / 2;
  const p = (x: number, y: number, z: number): Point3 => ({ x, y, z });
  return facesToMesh([
    [p(-x, 0, z), p(x, 0, z), p(0, height, z)],
    [p(x, 0, -z), p(-x, 0, -z), p(0, height, -z)],
    [p(-x, 0, -z), p(x, 0, -z), p(x, 0, z), p(-x, 0, z)],
    [p(-x, 0, z), p(0, height, z), p(0, height, -z), p(-x, 0, -z)],
    [p(0, height, z), p(x, 0, z), p(x, 0, -z), p(0, height, -z)],
  ]);
}
