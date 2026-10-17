# Refloor

Refloor turns a house description into an editable, interactive 3D building in the browser.

The first implemented package, `@refloor/scene`, validates building documents and applies
atomic, reversible commands. It includes floor and room references, wall openings,
stairwell links, rotated object bounds, materials and device state. The browser,
geometry compiler and backend are subsequent implementation batches.

## Requirements

- Node.js 24, pinned to 24.19.0 in `.node-version`.
- pnpm 12.3.4, pinned in `package.json`.

## Development

```sh
pnpm install --frozen-lockfile
pnpm check
```

`pnpm check` runs formatting, linting, type checking, compiled-package and domain tests,
then the Z3 geometry experiment. `pnpm build` emits the scene package to its `dist`
directory. `pnpm test` builds it and runs the package tests.

## Structure

- `packages/scene`: shared scene schemas, commands, capabilities and revisions.
- `experiments/z3-layouts`: the existing Node/Z3 feasibility probe.
- `refloor.md`: implementation boundaries and the agreed product flow.

Workspace packages use scoped `@refloor/*` imports. The scene package's self imports
resolve through its package exports after compilation; source aliases are configured
for TypeScript and tests. New application code will use `@/` for app-local imports.

Tests execute the real implementation without mocked services or replacement modules.
Their input documents describe buildings and edits; no network or model inference is
needed for scene validation and command execution.
