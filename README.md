# Refloor

Refloor turns a house description into an editable, interactive 3D building in the browser.

`@refloor/scene` validates building documents and applies atomic, reversible commands.
`@refloor/engine` compiles those documents into meshes, colliders and walking routes,
then checks furniture placement, door clearance and stair access. The browser and
backend are subsequent implementation batches.

## Requirements

- Node.js 24, pinned to 24.19.0 in `.node-version`.
- pnpm 12.3.4, pinned in `package.json`.

## Development

```sh
pnpm install --frozen-lockfile
pnpm check
```

`pnpm check` runs formatting, linting, type checking, compiled-package and domain tests,
then the Z3 geometry experiment. `pnpm build` emits each package to its `dist`
directory. `pnpm test` builds both packages and runs their tests.

## Structure

- `packages/scene`: shared scene schemas, commands, capabilities and revisions.
- `packages/engine`: geometry, collision bounds, placement checks and navigation.
- `experiments/z3-layouts`: the existing Node/Z3 feasibility probe.
- `refloor.md`: implementation boundaries and the agreed product flow.

Workspace packages use scoped `@refloor/*` imports. Each package's self imports
resolve through its package exports after compilation; source aliases are configured
for TypeScript and tests. New application code will use `@/` for app-local imports.

Tests execute the real implementation without mocked services or replacement modules.
Their input documents describe buildings and edits; no network or model inference is
needed for these packages. Engine tests instantiate Rapier and walk a capsule through
the generated colliders, including entrance-to-upstairs routes, both stair types and
rotated flights. This verifies the geometry in a headless physics world; the browser
movement controls and visual experience are still to be built.
