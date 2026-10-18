# Refloor

Refloor is a browser studio for furnishing and exploring editable 3D houses.
The planned generation workflow will turn house descriptions into the same validated
building documents.

`@refloor/scene` validates building documents and applies atomic, reversible commands.
`@refloor/engine` compiles those documents into meshes, colliders and walking routes,
then checks furniture placement, door clearance and stair access. The client renders
parameter-based starting homes with physical materials, scanned furniture, HDR daylight,
shadows and floor-by-floor cutaway views. The Node API stores projects and reversible
edit history in MongoDB. Prompt generation remains to be built.

## Requirements

- Node.js 24, pinned to 24.19.0 in `.node-version`.
- pnpm 12.3.4, pinned in `package.json`.

## Development

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm check
```

For the project API, copy `.env.example` to `.env`, then run `pnpm db:dev` and
`pnpm dev:server` in separate terminals. The database command starts a real, single-node
MongoDB replica set on port 27018 with persistent files in `.local/mongodb`. On first
use, its launcher downloads the official MongoDB binary. API tests launch an isolated
replica set and remove its temporary database after testing. Production requires a
configured MongoDB replica set or sharded cluster; standalone MongoDB cannot provide
the transactions used by project revisions.

`pnpm check` runs formatting, linting, type checking, compiled-package and domain tests.
`pnpm build` emits packages and the production client to their `dist` directories.
`pnpm test` builds the workspace and runs its tests. `pnpm preview` serves a completed
production build locally. Development and standalone type checking build shared packages
first, so a fresh checkout does not depend on existing build output.

## Structure

- `packages/scene`: shared scene schemas, commands, capabilities and revisions.
- `packages/engine`: geometry, collision bounds, placement checks and navigation.
- `packages/catalogue`: typed furniture assets, dimensions, behaviours and finishes.
- `packages/blueprints`: validated, parameter-based furnished starting homes.
- `packages/contracts`: shared, validated project API requests and responses.
- `client`: React/Three.js browser studio. `pnpm dev` starts its local preview.
- `server`: Fastify/Node API, MongoDB transactions and private browser sessions.

The server follows the feature layout: `features/houses` owns house routes,
controllers, services, schemas, models and repositories; `features/edits` owns commands,
transactional revision storage and undo/redo. `features/sessions` handles private browser
sessions. HTTP handlers stay in controllers, database queries stay in repositories, and
services apply the scene and engine rules. `shared/config`, `shared/database` and
`shared/http` hold infrastructure. `app.ts` wires dependencies and routes; `server.ts`
starts the API process. Generation and asset workers will be added with their working
implementations.

Workspace packages use scoped `@refloor/*` imports. Each package's self imports
resolve through its package exports after compilation; source aliases are configured
for TypeScript and tests. The browser uses `@/` for app-local imports; the Node server
uses `@refloor/server/*` so compiled imports resolve without a runtime alias loader.

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
TV controls play the included clip or a compatible direct video URL on the 3D screen;
power, mute and volume update the actual media player. Light controls update fixture
emission, intensity, colour and cached local shadows in high quality mode.

Project files export/import the complete editable building. Import validates geometry,
access and supported assets before replacing the open scene. Accepted changes save
automatically to one browser-local draft; a corrupt saved draft remains available for
recovery download. Browser drafts are local; saved API projects are stored in MongoDB.
New spaces can use one or two storeys, widths 11.5–16 m and depths 9.5–14 m.

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
materials, change room floor finishes, and set door, TV or light state. An edit carries an ID, timestamp, expected
revision and typed commands. Failed batches preserve the original document; successful
batches increment its revision once and record inverse commands. Replacement preserves
instance identity, room, floor and transform.

Revision fingerprints cover canonical scene content excluding the counter. Undo checks
the current content and validates restoration. The API atomically compares expected
revisions and enforces unique edit IDs.

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
and updates their physics colliders while they move. TV playback reports loading,
playing, blocked autoplay and source failures. Media
sources accept HTTP(S) URLs or `asset:` references. The API stores approved source references
and never fetches remote video; the browser plays them directly.

## Project API

`POST /api/sessions` creates an HTTP-only browser-session cookie. Projects belong to
that session; there are no accounts or cross-device project discovery yet. Session
tokens are stored as hashes and expire after 30 days. Export a project file for a
portable copy. Use HTTPS in production and configure exact `CLIENT_ORIGINS`.

- `POST /api/projects`: create a validated building with a unique `requestId`.
- `GET /api/projects?limit=20&cursor=…`: list the session's projects with cursor pagination.
- `GET /api/projects/:id`: load a complete editable building.
- `PUT /api/projects/:id`: save a snapshot with `requestId`, `expectedVersion` and `building`.
- `POST /api/projects/:id/edits`: apply `{ edit, player }` through the shared placement engine.
- `POST /api/projects/:id/undo` or `/redo`: restore history using `id`, `at`, `expectedRevision`
  and an optional player position (`null` when absent).
- `GET /api/health`: database readiness.

Snapshot saves compare document versions and preserve building identity. Typed edits
compare scene revisions. Both reject stale writes with HTTP 409 and commit changes and
request receipts in one transaction. Repeating a request returns its original accepted
version; reusing its ID for different content fails. Receipts also return the current
project, which may be newer than the accepted request. Undo/redo retains up to 50 active
steps and persists across API restarts. A snapshot replaces that active command history.
Invalid geometry, unsupported assets and changes that block a supplied player are rejected.

## Next implementation

Build Astra/Z3 generation and connect saved API projects to the browser. Redis/BullMQ is optional for background
jobs, and Meshy is optional for custom furniture. Catalogue assets must remain usable
when custom generation fails. Hosting selection is deferred.
