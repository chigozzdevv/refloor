# Refloor

Refloor turns a house description into an editable, interactive 3D building in the browser.

`@refloor/scene` validates building documents and applies atomic, reversible commands.
`@refloor/engine` compiles those documents into meshes, colliders and walking routes,
then checks furniture placement, door clearance and stair access. The client renders
parameter-based starting homes with physical materials, scanned furniture, HDR daylight,
shadows and floor-by-floor cutaway views. Prompt generation and the backend are still
to be built.

## Requirements

- Node.js 24, pinned to 24.19.0 in `.node-version`.
- pnpm 12.3.4, pinned in `package.json`.

## Development

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm check
```

`pnpm check` runs formatting, linting, type checking, compiled-package and domain tests.
`pnpm build` emits each package to its `dist` directory. `pnpm test` builds both packages
and runs their tests.

## Structure

- `packages/scene`: shared scene schemas, commands, capabilities and revisions.
- `packages/engine`: geometry, collision bounds, placement checks and navigation.
- `packages/catalogue`: typed furniture assets, dimensions, behaviours and finishes.
- `packages/blueprints`: validated, parameter-based furnished starting homes.
- `client`: React/Three.js browser studio. `pnpm dev` starts its local preview.

Workspace packages use scoped `@refloor/*` imports. Each package's self imports
resolve through its package exports after compilation; source aliases are configured
for TypeScript and tests. New application code will use `@/` for app-local imports.

Tests execute the real implementation without mocked services or replacement modules.
Their input documents describe buildings and edits; no network or model inference is
needed for these packages. Engine tests instantiate Rapier and walk a capsule through
the generated colliders, including entrance-to-upstairs routes, both stair types and
rotated flights. This verifies the geometry in a headless physics world. The browser
supports an animated entrance with a draggable handle, orbit and first-person views,
WASD/touch movement, collision-aware stairs, guided floor changes, surface/object
inspection, day/evening lighting and render-quality selection. The furniture library
adds items into validated clear spaces. Drag handles or exact coordinates move and
rotate furniture; the inspector replaces, removes and changes materials. Accepted edits
update collision geometry and support undo/redo (also Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z).

Rendering assets are self-hosted. `client/public/assets/manifest.json` records their
source URLs, CC0 licences, authors, physical dimensions and checksums. The material
maps, HDR sky and four scanned furniture models are from [Poly Haven](https://polyhaven.com/license).
The TV clip is [BMKME's CC0 waterfall video](https://commons.wikimedia.org/wiki/File:V8.webm).

## Scene API

- `parseBuilding(input)`: validate a document and return a detached building.
- `applyCommands(building, edit)`: apply an atomic edit and return the building and revision.
- `undoRevision(building, revision, metadata)`: restore validated content while increasing
  the revision counter. Undoing that result provides redo.
- `getObjectCapabilities(object)`: derive supported editor and device actions.

Commands add, remove, move, rotate, resize or replace furniture, change object or wall
materials, and set door, TV or light state. An edit carries an ID, timestamp, expected
revision and typed commands. Failed batches preserve the original document; successful
batches increment its revision once and record inverse commands. Replacement preserves
instance identity, room, floor and transform.

Revision fingerprints cover canonical scene content excluding the counter. Undo checks
the current content and validates restoration. The persistence layer must atomically
compare expected revisions and enforce unique edit IDs.

## Engine API

- `compileBuilding(document, options?)`: produce indexed meshes, colliders, surfaces,
  door hinges, stair connections and furniture asset instances.
- `validateBuilding(document, options?)`: compile and require enclosure, collision,
  clearance and reachability checks to pass. Failures throw entity-specific `EngineError` issues.
- `validatePlacement(document, edit, options?, player?)`: apply real scene commands and
  validate the result. The optional player check accepts a supported floor or stair-tread position.
- `buildNavigation(compiled, policy?)`: build a bounded graph with adaptive samples at
  obstacles, door centres and stair landings.
- `entrancePoints(navigation)`: return interior approach positions at exterior doorways.
- `findPath(navigation, from, to)`: return world-space points, length, stair IDs and required
  closed door IDs, or `null` when an endpoint or route is inaccessible.

`isWalkable`, `nearestNode`, `reachableNodes`, `checkEnclosure`, `checkClearance` and
`checkReachability` support individual queries. Compilation alone does not establish
that a building is clear or reachable; use `validateBuilding` before accepting it.

Navigation endpoints contain `floorId` and a world-space `position` at the floor's
finished elevation. Stair edges include intermediate 3D points. The default `openable`
policy ignores door leaves and reports required closed door IDs. Before movement,
apply the door commands, recompile and find a path using `current`, which respects
actual leaf positions. The browser must animate the same hinges and update its physics world.

## Scene and geometry contract

- Schema version 1, metres, radians and right-handed Y-up coordinates. Positive yaw
  rotates local +Z towards world +X. A heading-zero staircase ascends along +Z.
- Floors and rooms use axis-aligned rectangular X/Z footprints. Object X/Z positions
  are footprint centres; object Y is its bottom offset above the owning finished floor.
- Wall opening offsets measure from the wall start. Door sills are zero; windows have
  explicit sill heights. Slabs extend below finished floor elevations.
- IDs are unique across the building. Stairs reference adjacent storeys and an upper
  floor opening covering their module, with supported approach landings outside it.
  Flights and upper openings include railings with matching physics geometry.
- Mesh vertices are local. Apply `part.collider.position` and `part.collider.rotation`
  when rendering. Cuboid sizes are full extents; divide by two for physics half extents.
- Surfaces describe slab, tread and landing tops. Their footprints rotate around their
  centres; elevations are world-space. Furniture remains an asset instance with an
  oriented-box collision proxy; visual asset loading belongs to the browser catalogue.

## Current limits

The engine supports rectangular houses with aligned storeys, adjoining slabs, full-height
exterior enclosure, straight or U-shaped stairs at multiples of 90 degrees, and a flat
or gable roof. Unsupported storey offsets, insufficient stair dimensions, blocked routes
and resource-budget overflows fail explicitly.

The default walker has radius 0.3 m, height 1.75 m, maximum step 0.2 m, minimum tread
0.25 m, headroom 1.9 m and clearance 0.02 m. Navigation is sampled; the runtime controller
handles continuous motion and live collision updates. Mesh clearance checks use conservative
bounds. Defaults cap geometry parts and object instances at 10,000 combined, candidate
navigation nodes at 40,000, and node/collider work separately. Geometry uses a 0.000001 m
numerical tolerance. These are application constraints; structural engineering, regulatory
compliance, detailed asset silhouettes and arbitrary furniture support are outside
the current validation.

TV, light and door commands update validated state. The browser animates door hinges
and updates their physics colliders while they move. Playback and device controls are
the next integration. Media
sources accept HTTP(S) URLs or `asset:` references; the backend must enforce its network-fetch policy.

## Next implementation

Build the browser rendering, exploration, editing and behaviours, then the Node API,
Astra/Z3 generation and MongoDB persistence. Redis/BullMQ is optional for background
jobs, and Meshy is optional for custom furniture. Catalogue assets must remain usable
when custom generation fails. Hosting selection is deferred.
