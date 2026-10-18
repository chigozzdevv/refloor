# Refloor

Refloor is a browser studio for generating, furnishing and exploring editable 3D houses.
Describe a house, generate it with GPT-6 Luna, then enter and edit the saved space.

`@refloor/scene` validates building documents and applies atomic, reversible commands.
`@refloor/engine` compiles those documents into meshes, colliders and walking routes,
then checks furniture placement, door clearance and stair access. The client renders
parameter-based starting homes with physical materials, scanned furniture, HDR daylight,
shadows and cutaway views. The Node API stores projects and reversible
edit history in MongoDB. Luna interprets house descriptions; Z3 solves room layouts,
and the engine validates the assembled building before it can be saved.

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

Set `OPENAI_API_KEY` in the root `.env` to enable generation. `OPENAI_MODEL` is
`gpt-6-luna`; there is no fallback to another model. In **New space**, enter a description,
choose **Generate my house**, then **Open generated house** when it is ready. The current
space stays editable while generation runs. Completed houses appear in saved spaces.
The API key stays on the server. Responses use Structured Outputs with storage disabled,
a 6,000-token output limit, a 90-second provider timeout and no automatic provider retries.

Generation currently supports rectangular houses with one or two storeys, 14–20 m width,
9–24 m depth in 0.1 m increments, two to eight rooms per floor and twelve rooms total. Unspecified dimensions
are solved from the programme. Rooms occupy two wings around a circulation hall; two-storey
homes reserve a shared stairwell, upper-floor opening and landing access. Living and dining
can share an open room; other uses currently need separate rooms. Unsupported requests
and layouts that fail validation return an error rather than a substitute starting home.
Furniture uses the shipped catalogue: kitchens include a sink, hob, oven and refrigerator;
bathrooms include a basin, toilet and shower; workspaces include a desk; bedrooms include
a bed and wardrobe. These fittings are editable models; device actions currently cover
televisions, lights and doors. Custom generated meshes remain to be added.
This is an editable spatial prototype, not construction plans.

The client proxies `/api` to `http://127.0.0.1:3001` during development and preview.
If that port is occupied, set another server `PORT` and pass its URL with
`REFLOOR_API_URL=http://127.0.0.1:3002 pnpm dev` (or `pnpm preview`).

`pnpm check` runs formatting, linting, type checking, compiled-package and domain tests.
It also checks every shipped asset against the manifest's size and SHA-256 checksum,
including the local buffer and texture dependencies referenced by furniture models.
`pnpm build` emits packages and the production client to their `dist` directories.
`pnpm test` builds the workspace and runs its tests. `pnpm preview` serves a completed
production build locally. Development and standalone type checking build shared packages
first, so a fresh checkout does not depend on existing build output.

## Structure

- `packages/scene`: shared scene schemas, commands, capabilities, revisions and API contracts.
- `packages/engine`: geometry, collision bounds, placement checks and navigation.
- `packages/catalogue`: furniture assets, dimensions, behaviours, finishes and validated starting homes.
- `client`: React/Three.js browser studio. `pnpm dev` starts its local preview.
- `server`: Fastify/Node API, MongoDB transactions and private browser sessions.
- `scripts/check-assets.ts`: verify the self-hosted rendering assets and their dependencies.

The client uses `app/app.tsx`, `app/routes.tsx` and `app/pages` for the studio shell and
entrance/house views. `components/entrance`, `components/scene`, `components/navigation`,
`components/editor`, `components/objects` and `components/ui` contain rendered controls.
`shared/refloor` owns HTTP communication, `shared/scene` owns scene state and persistence,
`shared/editor` owns editing state and commands, and `shared/navigation` and
`shared/behaviours` own movement, physics and object actions. Source filenames use
lowercase kebab case. Prepared models live in `client/public/models/furniture`, material
maps and environment textures in `client/public/textures`, and the TV clip in
`client/public/media/tv-demo.mp4`.

The server follows the feature layout: `features/houses` owns house routes,
controllers, services, schemas, models and repositories; `features/edits` owns commands,
transactional revision storage and undo/redo. `features/sessions` handles private browser
sessions. `features/generation` owns session-scoped generation jobs and its worker;
`shared/ai` contains the Luna provider and house prompt, and `shared/planning` contains
requirements, Z3 constraints, layout assembly and furniture placement.
HTTP handlers stay in controllers, database queries stay in repositories, and
services apply the scene and engine rules. `shared/config`, `shared/database` and
`shared/http` hold infrastructure. `app.ts` wires dependencies and routes; `server.ts`
starts the API process. Planning and initial validation run in a bounded Node worker
thread. The project service validates again before saving. MongoDB stores the queue and progress; Redis is
not required. Each API process handles one generation at a time, and an atomic database
claim prevents two processes from handling the same job. Interrupted in-flight jobs fail
after three minutes instead of replaying a potentially billed model request. Queued jobs
resume when a configured API starts. Generation records and prompts expire after one day;
completed houses remain in project storage. Each session can have one active job, and
submission is limited to six requests per IP per hour.

Workspace packages use scoped `@refloor/*` imports. Each package's self imports
resolve through its package exports after compilation; source aliases are configured
for TypeScript and tests. The browser uses `@/` for app-local imports; the Node server
uses `@refloor/server/*` so compiled imports resolve without a runtime alias loader.

Tests execute the real implementation without mocked services or replacement modules.
Their input documents describe buildings, room programmes and edits; automated tests
run the real Z3 solver and MongoDB without spending API credits. Live Luna checks are
separate from `pnpm check`. Engine tests instantiate Rapier and walk a capsule through
the generated colliders, including entrance-to-upstairs routes, both stair types and
rotated flights. This verifies the geometry in a headless physics world. The browser
supports an animated entrance with a draggable handle, orbit and first-person views,
and evening lighting by default. A globe icon opens house chat, view settings, furniture,
files and room furnishing completion. History beside the globe provides labelled session
changes, undo, redo and restoration before an earlier edit. Completing furnishings runs
in a bounded browser worker, preserves the house layout, validates access and can be undone
as one change. It upgrades legacy fittings and adds room essentials where clear space permits.
The scene has no persistent inspector, left toolbar, floor buttons
or statistics overlays. Clicking an item, wall, floor or door opens a small chat anchored
beside it with a speech-bubble tail and a selection outline. Luna interprets supported changes; the server validates commands and placement,
and the client checks that the scene has not changed before applying them. Item chat
can only affect the selected entity; house chat can change finishes or devices across
the current building. Drag or swipe to look around, then select a floor ring to travel
to a clear spot. Stops follow clear room viewpoints and routes between entrances,
doorways and stair landings, and update after edits. At most three separated markers
appear at once: floor rings are places to stand, named doorway arrows enter rooms,
and stair arrows change levels. Route stops face the next turn. Exit and stair dots
remain reachable at the viewport edge when their destination is out of view. The map
shows actual rooms, furniture, stairs and the current room, position and heading.
Choose a room on either floor to follow a validated walking route there.
Doorway trips open required doors before following a route through
the actual colliders. Stair arrows handle the full climb or descent with one click;
the camera follows the turn and smooths changes in height. A Stop button appears during
travel; dragging, selecting an item, Escape or leaving the tab also stops it. A stair
arrow can resume from the current step. House overview in the globe menu resets the
outside view; returning to Walk preserves the previous position and viewing direction
on that floor. Keyboard WASD and arrow keys remain available. The player physically
climbs the steps; floor state follows its elevation. The furniture library adds items into validated clear spaces.
Chat moves, rotates, resizes, recolours, replaces or removes compatible items and controls
televisions, lights and doors. Accepted edits
update collision geometry and support undo/redo (also Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z).
TV controls play the included clip or a compatible direct video URL on the 3D screen;
power, mute and volume update the actual media player. Light controls update fixture
emission, intensity, colour and cached local shadows in high quality mode.

Project files export/import the complete editable building. Import validates geometry,
access and supported assets before replacing the open scene. Accepted changes save
automatically to one browser-local draft; a corrupt saved draft remains available for
recovery download. Browser drafts are local; saved API projects are stored in MongoDB.
The project menu saves snapshots, lists saved spaces and opens complete houses from the
API. It retains the saved project/version across reloads. Conflicting saves keep the
local draft and offer the latest saved version or a new copy. Editing remains immediate
in the browser; snapshot saves replace the server's active command history, while the
current browser undo history remains available until another project is opened.
New spaces can use one or two storeys, widths 11.5–16 m and depths 9.5–14 m.

Rendering assets are self-hosted. `client/public/manifest.json` records their
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
- `POST /api/edits/interpret`: interpret `{ requestId, building, target, message, view, player }`
  with Luna. Returns scoped, validated commands, their base revision and token usage. It
  does not write a project; the client applies the commands to its current draft and uses
  the normal save flow. `target` contains an existing entity `kind` and `id`; `view` is the
  horizontal camera direction used for relative movement. Requests require a session,
  use a short provider timeout without automatic retries, and are limited to twenty per
  IP per minute. Changes still pass the engine and player-clearance checks.
- `POST /api/projects/:id/undo` or `/redo`: restore history using `id`, `at`, `expectedRevision`
  and an optional player position (`null` when absent).
- `POST /api/generations`: submit `{ requestId, prompt }` and receive a generation ID
  with HTTP 202. Reuse the same request ID and description after a connection failure.
- `GET /api/generations/:id`: session-private progress, error, model token usage and
  the saved `projectId` on completion. Open that project with the projects endpoint.
- `GET /api/health`: database readiness.

Snapshot saves compare document versions and preserve building identity. Typed edits
compare scene revisions. Both reject stale writes with HTTP 409 and commit changes and
request receipts in one transaction. Repeating a request returns its original accepted
version; reusing its ID for different content fails. Receipts also return the current
project, which may be newer than the accepted request. Undo/redo retains up to 50 active
steps and persists across API restarts. A snapshot replaces that active command history.
Invalid geometry, unsupported assets and changes that block a supplied player are rejected.

## Next implementation

Build prompt generation with a configurable OpenAI model and Z3 layout solving. Redis/BullMQ is optional for background
jobs, and Meshy is optional for custom furniture. Catalogue assets must remain usable
when custom generation fails. Hosting selection is deferred.
