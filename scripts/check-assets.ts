import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

type AssetFile = { path: string; bytes: number; sha256: string };
type Manifest = { totalBytes: number; assets: { files: AssetFile[] }[] };
const publicDirectory = fileURLToPath(new URL('../client/public/', import.meta.url));
const manifest = JSON.parse(
  await readFile(resolve(publicDirectory, 'manifest.json'), 'utf8'),
) as Manifest;
const files = manifest.assets.flatMap((asset) => asset.files);
const checked = new Set<string>();
let bytes = 0;

for (const file of files) {
  assert(file.path.startsWith('/'), 'Asset paths must be absolute browser paths');
  const path = resolve(publicDirectory, `.${file.path}`);
  assert(path.startsWith(publicDirectory), `Asset escapes the public directory: ${file.path}`);
  assert(!checked.has(path), `Duplicate asset: ${file.path}`);
  checked.add(path);
  const content = await readFile(path);
  assert.equal(content.length, file.bytes, `Asset size changed: ${file.path}`);
  assert.equal(
    createHash('sha256').update(content).digest('hex'),
    file.sha256,
    `Asset checksum changed: ${file.path}`,
  );
  bytes += content.length;
  if (!path.endsWith('.gltf')) continue;
  const model = JSON.parse(content.toString('utf8')) as {
    buffers?: { uri?: string }[];
    images?: { uri?: string }[];
  };
  for (const entry of [...(model.buffers ?? []), ...(model.images ?? [])]) {
    if (!entry.uri || entry.uri.startsWith('data:')) continue;
    assert(!/^[a-z]+:/i.test(entry.uri), `Model refers to a remote asset: ${entry.uri}`);
    const dependency = resolve(dirname(path), decodeURIComponent(entry.uri));
    assert(
      dependency.startsWith(`${publicDirectory.replace(/\/$/, '')}${sep}`),
      'Model dependency escapes the public directory',
    );
    assert((await stat(dependency)).isFile(), `Missing model dependency: ${entry.uri}`);
    assert(
      files.some((file) => resolve(publicDirectory, `.${file.path}`) === dependency),
      `Model dependency is absent from the manifest: ${entry.uri}`,
    );
  }
}

assert.equal(manifest.totalBytes, bytes, 'Manifest totalBytes does not match the asset files');

console.info(`Verified ${checked.size} asset files (${bytes.toLocaleString('en-US')} bytes).`);
