import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

type Chunk = { file: string; imports?: string[]; isEntry?: boolean };
const root = new URL('../client/dist/', import.meta.url),
  manifest = JSON.parse(await readFile(new URL('.vite/manifest.json', root), 'utf8')) as Record<
    string,
    Chunk
  >,
  initial = new Set<string>();
function visit(key: string) {
  if (initial.has(key)) return;
  const chunk = manifest[key];
  assert(chunk, `Missing bundle chunk: ${key}`);
  initial.add(key);
  chunk.imports?.forEach(visit);
}
Object.entries(manifest)
  .filter(([, chunk]) => chunk.isEntry)
  .forEach(([key]) => visit(key));
let bytes = 0,
  gzip = 0;
for (const key of initial) {
  const chunk = manifest[key]!;
  assert(
    !/world|rapier|exterior|house-options/.test(key),
    `The prompt eagerly loads 3D code: ${key}`,
  );
  const content = await readFile(new URL(chunk.file, root));
  bytes += content.length;
  gzip += gzipSync(content).length;
}
assert(gzip < 230_000, `Prompt JavaScript exceeds 230 kB gzip: ${gzip}`);
const physics = Object.values(manifest).find((chunk) => /physics-world-.*\.js$/.test(chunk.file));
assert(physics, 'The physics module must load separately');
assert(
  (await stat(new URL(physics.file, root))).size < 400_000,
  'Physics JavaScript embeds too much data',
);
const wasm = Object.values(manifest).find((chunk) => chunk.file.endsWith('.wasm'));
assert(wasm, 'Rapier WebAssembly must be an independently cached asset');
console.info(
  `Prompt JavaScript: ${bytes.toLocaleString()} bytes / ${gzip.toLocaleString()} gzip; external physics: ${fileURLToPath(new URL(wasm.file, root))}`,
);
