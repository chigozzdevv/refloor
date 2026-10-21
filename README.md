# Refloor

Describe a home, walk into it, redesign it naturally and teach it how to behave.
Refloor generates editable 3D houses with GPT-6 Luna, validated geometry and working interactions in the browser.

`@refloor/scene` validates building documents and applies atomic, reversible commands.
`@refloor/engine` compiles those documents into meshes, colliders and walking routes,
then checks furniture placement, door clearance and stair access. The client renders
parameter-based starting homes with physical materials, scanned furniture, HDR daylight,
shadows and cutaway views. The Node API stores projects and reversible
edit history in MongoDB. Shared houses accept individual, guarded commands and broadcast accepted changes over Socket.IO. GPT-6 Luna interprets house descriptions; Z3 solves room layouts,
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

The test runner uses one worker so solver and walking regressions keep their existing time limits without competing WebAssembly workloads.

For the project API, copy `.env.example` to `.env`, then run `pnpm db:dev` and
`pnpm dev:server` in separate terminals. The database command starts a real, single-node
MongoDB replica set on port 27018 with persistent files in `.local/mongodb`. On first
use, its launcher downloads the official MongoDB binary. API tests launch an isolated
replica set and remove its temporary database after testing. Production requires a
configured MongoDB replica set or sharded cluster; standalone MongoDB cannot provide
the transactions used by project revisions.

Set `OPENAI_API_KEY` in the root `.env` to enable generation. `OPENAI_MODEL` is
`gpt-6-luna`; there is no fallback to another model. The first-visit screen has a centered
description field over the blurred current house. Submit with the paper-plane button or Enter
(Shift+Enter adds a line). Generation shows real job stages, opens the saved result automatically,
reveals its paved compound, then approaches the entrance. Reduced-motion preferences skip the
animated approach; a skip button is also available. A failed job keeps the description and previous
house available. Choose a validated starting house without generating.
Completed houses also appear in saved spaces.
Reloading or returning opens the current house directly, restoring its camera, floor, walking
position, lighting and overview target. Older drafts without a saved view open at the entrance.
Reloading an active generation resumes its saved job rather than submitting another request.
New house opens the prompt without moving the player; Back to your house restores the prior view.
New prompts start with an editable brick bungalow whose entrance opens into a furnished parlor/dining room; bedrooms, kitchen and bathroom open directly from it without a passage. Stereo speakers share the TV soundtrack and its sound controls.
Pending requests keep their own text.
Before generation or a starting house replaces the current draft, its latest contents are saved
to MongoDB. A failed save keeps the current house open and prevents replacement.
The API key stays on the server. Responses use Structured Outputs with storage disabled and
no automatic provider retries. Generation allows 6,000 output tokens and 90 seconds;
editing allows 4,800 output tokens and 25 seconds.
Generation results use a dedicated worker channel, isolated from Node's dependency-watch
messages. Internal failures are logged on the server; job status exposes readable failure
messages rather than raw schema diagnostics.

Generation supports rectangular houses with one or two storeys and L-shaped flat-roof bungalows, 14–20 m width,
9–24 m depth in 0.1 m increments, two to eight rooms per floor and twelve rooms total.
Unspecified width follows the programme and circulation; Z3 solves depth and room allocation.
Choose a central hall with balanced wings or a wider public wing, or a daylit side gallery
with rooms spanning the other side. Galleries can run left or right; stairs can sit towards
the front or rear. Living-hub bungalows use a central living or living/dining room as their circulation, with a direct front entrance and doors into every adjoining room. This layout needs at least two enclosed rooms, a separate kitchen when requested, and enough width for furnishing and clear routes.
The entrance follows the circulation layout. Two-storey homes reserve a
shared stairwell, upper-floor opening and landing access. Living, dining and kitchen can
share one open room in any combination; bedrooms, bathrooms and workspaces stay enclosed.
L-shaped plans reserve a 2.8 m open rear-right corner. Its exterior walls, courtyard glazing,
floor and roof cutout, parapets, map and collision checks use the same footprint. This shape
supports central-hall and living-hub circulation; upstairs, side-gallery and gable combinations
are rejected explicitly. Generated seating retains a clear aisle beside accent chairs.
Room uses persist for zoned furnishing and completion of missing essentials. Public zones sit side by side when wide
enough and follow one another in narrower rooms, without internal partitions. Windows
follow room use; standard or generous glazing changes actual window sizes and counts in
public rooms while retaining high bathroom privacy windows.
Unsupported requests and layouts that fail validation return an error rather than a
substitute starting home.
Generation checks each opening fixture's physical clearance before returning the house;
regression journeys also verify room access while each fixture is open.
Design specifications coordinate wall and upholstery colours, oak or walnut joinery, brass
or black hardware, plaster/brick/marble exterior finishes and asphalt/metal roofing. They apply
to actual materials and fittings. Furniture uses the shipped catalogue: kitchens include a sink, hob, oven and refrigerator;
bathrooms include a basin, toilet and shower; workspaces include a desk; bedrooms include
a bed and wardrobe. Fittings support the household capabilities described below; custom
generated meshes remain to be added.
This is an editable spatial prototype, not construction plans.

The client proxies `/api` to `http://127.0.0.1:3001` during development and preview.
If that port is occupied, set another server `PORT` and pass its URL with
`REFLOOR_API_URL=http://127.0.0.1:3002 pnpm dev` (or `pnpm preview`).
Local origins include both `localhost` and `127.0.0.1` on ports 5173 and 4173.
Set `CLIENT_ORIGINS` to the exact frontend addresses for a deployment.

`pnpm check` runs formatting, linting, type checking, compiled-package and domain tests.
It also checks every shipped asset against the manifest's size and SHA-256 checksum,
including the local buffer and texture dependencies referenced by furniture models.
It also checks the production bundle: prompt JavaScript stays below 230 kB gzip, renderer
modules remain deferred, and physics ships as separate JavaScript and WebAssembly assets.
`pnpm build` emits packages and the production client to their `dist` directories.
`pnpm test` builds the workspace and runs its tests. `pnpm preview` serves a completed
production build locally. Development and standalone type checking build shared packages
first, so a fresh checkout does not depend on existing build output.

## Browser journeys

`client/test/browser/journeys.ts` runs against the approved CUA tab API using normal controls.
It imports generated house files, enters through the handle, visits rooms through the map,
checks for usable next actions, operates the refrigerator through chat, uses stairs and returns
outside. Separate helpers cover undo, redo and exporting the actual project for state assertions.

After building, run `pnpm --filter @refloor/server browser:serve` and
`REFLOOR_API_URL=http://127.0.0.1:4317 pnpm --filter @refloor/client preview --port 4318`.
The API uses a random disposable MongoDB database, a separate session cookie and no AI provider.
Stopping it removes only that test database. Compile the driver with
`pnpm exec tsc --ignoreConfig client/test/browser/journeys.ts --outDir /tmp/refloor-browser --target ES2023 --module ESNext --skipLibCheck`,
then import its emitted module in CUA, bind a tab at `http://127.0.0.1:4318/`, call `startHouse(tab)` once,
and run `runHouseJourney(tab, absoluteFixturePath, parsedFixture, report)` for the generated
L-shaped, open-plan and two-storey files in `client/test/fixtures`. The steps can also run separately.
`pnpm --filter @refloor/server browser:fixtures` regenerates the validated L-shaped fixture.
These browser journeys are separate from `pnpm check`; physical phone testing remains separate.

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
`shared/ai` contains the HouseAI provider and house prompt, and `shared/planning` contains
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

Geometry and persistence tests execute the real implementation. Their input documents
describe buildings, room programmes and edits; automated tests run the real Z3 solver,
Rapier and MongoDB without spending API credits. Transport race tests separately control
response timing to exercise stale responses and session replacement. Live GPT-6 Luna checks are
separate from `pnpm check`. Engine tests instantiate Rapier and walk a capsule through
the generated colliders, including entrance-to-upstairs routes, both stair types and
rotated flights. This verifies the geometry in a headless physics world. The browser
supports an animated entrance with a draggable handle, orbit and first-person views,
and evening lighting by default. The globe opens House with separate Chat and Tools tabs.
Tools groups exploration, furniture, saved actions, project files and appearance. Switching
tabs keeps the unsent house message, and hidden chat does not broadcast typing. History beside the globe provides labelled
changes with their item and room, undo, redo and restoration before an earlier edit. Completing furnishings runs
in a bounded browser worker, preserves the house layout, validates access and can be undone
as one change. It upgrades legacy fittings and adds room essentials where clear space permits.
The scene has no persistent inspector, left toolbar, floor buttons
or statistics overlays. Clicking a door or its handle starts a complete trip through it: approach, open, cross and settle inside.
Shift+click, right-click, or selecting it in overview opens door editing. Nearby appliance handles,
burner controls and tap/shower handles operate their device in walk mode; the remaining
item surfaces open editing. Clicking items, walls or floors opens a small chat anchored
beside it with a speech-bubble tail and a selection outline. Chat shows the latest exchange;
its history icon expands earlier messages. New messages appear immediately with a pending
indicator through scene completion, and rejected instructions return to the composer.
Shared edits that have been undone carry an undo indicator. Suggested text commands can
be collapsed with the help icon. There are no separate playback or sound action buttons. Selecting one fills the composer for review before sending. Unambiguous selected-device commands such as “turn on”, “open the tap”, “unmute the TV” and “set volume to 35%” execute locally through the same validated transaction, history and saved-rule system. Other requests use GPT-6 Luna; the server validates commands and placement,
and the client checks that the scene has not changed before applying them. Item chat
can only affect the selected entity; house chat can change finishes or devices across
the current building. Drag or swipe to look around, then select a floor ring to travel
to a clear spot. Navigation uses named room views, doorways and stair landings, updated after edits. Floor rings are useful standing views;
door handles show a small Click to open hint over a 44 px handle target, with subtle feedback on the metal lever, and stair rings mark the real steps. Up to three
separated floor/stair markers appear in the scene. The central destination row keeps reachable adjoining rooms available even when their doors are offscreen, with one action per doorway.
Private rooms name their main exit toward the hall or shared circulation space while retaining distinct connecting-room doors.
Walk to stairs leads to a safe same-floor approach when the flight is farther away; it changes to
upstairs or downstairs within a reachable 2 m approach. Both directions remain available during a mid-flight stop.
Walk to entrance leads from the entrance hall to its handle without opening the door; the handle performs the crossing.
Stair controls use fixed up/down icons. Entering the house keeps the camera facing inward instead of turning toward a side door.
The same walkthrough controller drives dots, door clicks and map trips. It turns before advancing,
opens the selected door immediately when its swing is safe, crosses using Rapier, and settles the camera
on a visible interaction ahead, excluding the door or staircase just crossed. Room views favour
cooker/tap counters, bathroom vanity or shower, beds, living-room TV/seating and workspace
desks over incidental tables. Combined living/kitchen rooms offer distinct views of both zones.
Object arrivals limit downward gaze while retaining clearance and line-of-sight checks;
old preferred table views cannot override a useful primary fixture. Door clicks stop just
inside the room, while room dots and map trips use room viewpoints.
The entrance is closed when its entrance view opens, including old saved open states. Its opening hint sits on the handle, with no floor-level opening button. The handle depresses before the leaf swings; the unobstructed animation completes in 0.4 seconds. Automatic closure runs after arrival.
Nearby clear door crossings use a direct, collision-checked route. Walking retains the edit validator's collision clearance; tight saved positions first move clear before opening a door. Engine navigation caches reuse openable topology only when compiled physical geometry and walker options match; changed door leaves still rebuild current-state routes. Stops stay outside door swings, and the controller replans when the building changes.
The compact map shows rooms, walls, doors, stairs and the current position; the expanded plan adds furniture. Door leaves follow their actual open or closed state. Click a room on either map to walk there; the small expand button opens the larger plan and its floor tabs. Compound routes connect the outside position to the entrance and continue through the house.
Choose a room on either floor to follow a validated walking route there.
Obstructing open leaves are closed only after moving clear of their swing. Tour-opened doors return to their original state after the player clears their swing. Explicit manual door changes are preserved; saved navigation-owned openings are recovered from edit history. Stair arrows handle the full climb or descent with one click;
the camera follows the turn and smooths changes in height. Stair alignment releases at each landing so held forward movement continues onto the floor; turning or moving sideways also gives control back immediately. Walking across a landing does not start another climb unless the person faces the flight. A centered, translucent stop icon appears during
travel; dragging, selecting an item or Escape also stops it. Losing focus releases manual input without silently cancelling a chosen tour. A stair
arrow can resume from the current step. House overview in the globe menu resets the
outside view; returning to Walk preserves the previous position and viewing direction
on that floor. On the translucent bottom-right pad, the four arrows and centre joystick move forward, backward, sideways and diagonally. Two separate buttons below rotate the camera. Movement and rotation support simultaneous touches. Stair actions use the actual landing and elevation: upstairs at the bottom, downstairs at the top, and both destinations if stopped mid-flight. Actions hide during travel, and the camera waits until it is near the destination in all three dimensions before turning towards its arrival view. Near a staircase, forward movement aligns with the steps and follows the climb while held; releasing stops it. Keyboard WASD and arrow keys remain available. The player physically
climbs the steps; floor state follows its elevation. Doors validate their full swing before edits and undo/redo, and walking waits briefly outside a nearby moving door. The entry arrival point stays clear of the entrance swing, and an already-open entrance offers Enter house.
The exterior overview shows every storey, exterior wall and the complete roof; the interior cutaway is used when focusing furniture. Window frames, floor bands, roof edges, entrance canopy, paving, planting and porch lighting derive from the actual building and entrance. The compound uses instanced block paving with a matching flat physical surface, curbs and planting. Door thresholds sit below the interior finish and interrupt the facade plinth, with matching walking colliders.
New houses include two editable floodlights, initially off, two powered warm up/down wall lanterns and two selectable planted stone boxes. Existing houses receive missing exterior fixtures as one undoable change; removed or undone fixtures stay removed after reload. Exterior objects use the same placement, device, material, history and saved-action system as indoor objects. Outdoor access is checked against the building and compound rather than requiring an indoor navigation node.
Click an exterior wall face to edit its finish independently from the inside; brick, marble, plaster and colour changes use real physical material maps. Roof selection supports bitumen and profiled metal finishes and colour changes. Original and previous finishes remain available to chat and undo. Generated roofs use the specified asphalt or metal finish; older programmes default to bitumen for flat roofs and metal for pitched roofs. Older placeholder roofs upgrade with the exterior fixtures while custom roof finishes are preserved. The overview fits the whole house at phone and desktop aspect ratios. Tour routes and the map cover the interior. The furniture library adds items into validated clear spaces.
Chat moves, rotates, resizes, recolours, replaces, removes and adds compatible catalogue items.
Spatial instructions can mount a TV above a sideboard, face a sofa towards it and add chairs
near a table in one atomic, undoable edit. The shared placement system respects floor, wall,
ceiling and tabletop supports, object dimensions, windows, doorways, stairs and the player.
The library uses the same placement and initially selects the occupied room. Chat also controls
televisions, lights, doors and supported household fixtures. Accepted edits
update collision geometry and support undo/redo (also Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z).
Chat stays busy through the committed scene frame, refreshed shadows and affected finite
animations. Running water and flames do not keep a completed command loading. Starting or changing TV playback waits for the actual playing state, reports blocked/failed playback, and times out safely if a source remains unavailable.
TV controls play the included clip or a compatible direct video URL on the 3D screen;
power, mute and volume update the actual media player. Sending a direct playback or unmute command supplies the browser gesture needed for audio; blocked playback can be retried through text.
Cinema mode switches off ceiling lights in the TV room, dims any lower accent lamps to 20% warm light, and preserves other rooms, exterior lights and the TV’s own settings. A powered TV adds a soft screen glow. “Whenever I turn on this TV, activate cinema mode” saves this preset against the TV power event, with effects included in the trigger’s undo transaction. Light controls update fixture
emission, intensity, colour and cached local shadows in high quality mode.
Cookers have four named burners with individual on/off, shared 0–100% heat and visible flames.
Tap and shower commands identify the component: “open the tap” starts water, while “open the oven”
opens the oven door on the same kitchen unit.
Lighting a named burner while the cooker is powered off selects only that burner. Starting
the whole cooker reuses its configured selection, or front-left when the selection is empty. Sink taps and showers have 0–100% flow, 10–60 °C temperature
state and visible streams. Whole-device starts preserve usable settings; zero heat/flow
returns to its normal starting level. Starting water preserves its temperature. Turning a
device off preserves settings. Kitchen units keep cooker, sink and oven states separate. Openable fittings animate their actual mechanism: oven door, refrigerator
doors, wardrobe/cabinet fronts, island storage or vanity/bedside drawers. Other kitchen
cupboard fronts do not inherit the oven action. Panels and clearance follow the item’s
current dimensions and rotation. Opening clearance checks the player, obstacles and access
routes; temporary movement reservations retain clearance until a closing panel finishes
its animation. These virtual interactions do not simulate food cooking,
thermodynamics or fluid accumulation, and do not control real appliances.
Geometry changes schedule shadow refreshes on rendered frames; paused tabs cannot expire
the refresh window, and animated doors and fittings refresh shadows through their movement.
Powered fixtures retain their illumination as the view changes. Only local shadow maps are budgeted,
prioritizing the occupied area and selected or newly powered fixtures. Paired wall-light beams share
that allocation. Unshadowed lights do not provide physical wall occlusion.
Colour-only scanned furniture edits preserve source texture, normal, roughness and metalness maps;
explicit finish replacements change the material. Bathroom mirrors reflect the rendered room in walk mode,
with bounded texture resolution and update rate. Roof exteriors retain their chosen finish above a neutral interior ceiling.
Beds use layered mattresses, padded headboards, pillow seams and draped fabric. Kitchen and bathroom
fittings have recessed joinery, separate stone worktops, curved taps, basins, appliance seams and shower
hardware. Furniture textures use metre-based UVs, with continuous coordinates across cut worktops.
New joinery uses [Poly Haven oak veneer](https://polyhaven.com/a/oak_veneer_01); worktops use
[ambientCG Marble 012](https://ambientcg.com/view?id=Marble012). Both are CC0 and shipped locally at
1K with source records and checksums in `client/public/manifest.json`. Countertops have their own
`top` material: changing one preserves cabinetry. Older projects without that slot remain valid and
receive it only when edited; undo restores the exact previous document.
Chat can restore a light's original power, brightness and illumination colour. Chat and typed edits enforce
brightness bounds of 0–200% of the catalogue default; legacy brighter values remain loadable
with capped rendering. Item chats show the selected item name and accept changes through text.

Saved actions are part of the building document. House chat can connect door or appliance
opens/closes, supported device power changes, room entry and object clicks to scene commands,
including multiple devices, furniture transforms and surface finishes. Door, openable and
power conditions can restrict a rule. Power events identify their capability, so starting a
kitchen sink cannot trigger a cooker rule on the same object; older single-device rules
remain compatible. The house menu lists rules, their actual triggers/actions, enable/disable switches
and removal. Edit a rule through language or test its actions, then undo the trial. Configuration changes use normal undo/redo and persist in browser drafts, exports
and MongoDB snapshots. Relative movement, rotation, brightness, volume, heat, flow and water
temperature resolve against current state on each trigger; device limits clamp at execution.
Named burner operations and ignition/start actions also resolve live settings rather than
capturing a device-state snapshot. Rules run locally without another model call. State triggers fire only on
actual changes, each rule fires at most once per transaction, and at most 100 commands execute
in one interaction. Chained effects are validated atomically against geometry, the player and light
tuning; invalid effects reject the interaction with a visible error. Undo/redo replays the recorded
commands without firing rules again. Removing an object also removes rules that depend on it,
and undo restores both. Existing houses without exterior fixtures remain valid. Timers, sensors,
real-world smart-home devices and arbitrary scripts are unsupported.

Each house keeps original item and surface properties, the latest 50 applied edit/undo/redo
transitions and 80 conversation turns. Item chat receives its original snapshot, up to 12 related
transitions and eight relevant turns, including clarifications and rejected requests. Follow-ups
resolve against this context and the current scene. Restoring an original or previous property
uses recorded values and passes normal placement checks; it preserves unrelated properties.
The context survives chat closure, browser refresh, saved project reopening and project export/import.
Older browser drafts recover available starting properties from their undo records.
Missing optional household capabilities attach through an undoable upgrade that preserves
existing IDs, materials, geometry and device states. If an original snapshot predates a new
capability, original restoration uses its declared catalogue baseline while leaving the
recorded snapshot unchanged. Full restoration retains those capabilities. Previous-property
restoration still requires an actual recorded value; upgrade undo removes the added state exactly.

History also stores up to six named designs. View a design from the current camera, then return to
the working arrangement with its undo, redo and conversation restored. Edited previews are saved
as recovery versions before switching away. Full collections, oversized payloads, occupied player
positions and blocked escape routes reject the switch without replacing the current design.
Snapshots contain buildings, not nested memory, and travel with browser drafts, project exports
and MongoDB saves. Save current view downloads a PNG of the rendered scene without interface overlays.

The garden follows the compound boundary with soil beds, shrubs, grasses, stone edging and trees
outside the walking area. Lawn, soil, stone and foliage are separate editable surface groups; individual
leaves are part of those groups. Instanced vegetation uses stable positions as density changes.
Ground detail fades with distance to reduce shimmer.
Paving switches between individual blocks and a filtered joint pattern according to projected size,
with hysteresis to avoid flicker. Both representations share the same editable finish.

First visits show a small rendered-house poster behind the prompt. The renderer and starter
previews load only when needed; an existing open scene stays available behind a new prompt.
Rapier uses a separately cached WebAssembly file rather than embedding base64 in JavaScript.
Hidden documents pause continuous rendering. Procedural cooker grates and burner caps share
two merged meshes; soft bedding has contoured pillows and stitched edges without extra draw calls.

Rendering caps drawing-buffer size and adjusts resolution after sustained slow frames, with slower
quality recovery. Native filtered PCF shadows remain active across viewport and quality changes.
Compact viewports use smaller shadow/reflection targets and SMAA instead of
multisampling. Adaptive resolution normally stops at DPR 1 on compact viewports and 0.85 on desktop;
hard pixel and device limits still apply. Sustained pressure also disables optional AO and bloom.
All powered fixtures retain illumination. Static sunlight shadows and mirror captures
are reused until their inputs change; flat window glazing and opal shades avoid a scene-refraction
pass. Architectural trim and structural triangles are batched by material while exterior surfaces
remain separately selectable. The house overview adapts its framing when the viewport changes,
preserving the viewing angle, pan and relative zoom.
Read-only frame cadence and renderer counts are available in the canvas `data-render-metrics`
attribute after warmup. These browser measurements include CPU, GPU and scheduling costs;
phone-sized desktop viewports do not establish physical iPhone GPU, thermal or touch performance.
Physical iPhone testing remains pending.

Existing doors and windows can move along their wall or change dimensions through chat. Compatible
axis-aligned internal partitions shared by two rectangular rooms can slide, updating both room bounds.
Geometry, mounted furniture, door swing, stairs, reachability and player clearance remain validated;
unsupported exterior, circulation and complex partition moves reject safely. Commands preserve
identities, materials and door state, support compound edits and record exact inverses for undo.

Exterior paving, kerbs, plinth, window/door trim, canopy, parapet and roof trim are independently
selectable surfaces with contextual chat and selection highlights. Colour, textured finishes and
original/previous restoration use stable surface identities. Optional overrides preserve older
documents and keep interior wall finishes separate from exterior cladding.

Project files export/import the complete editable building. Import validates geometry,
access and supported assets before replacing the open scene. Accepted changes save
automatically to one browser-local draft; a corrupt saved draft remains available for
recovery download. Browser drafts are local; saved API projects are stored in MongoDB.
The project menu saves snapshots, lists saved spaces and opens complete houses from the
API. It retains the saved project/version across reloads. Conflicting saves keep the
local draft and offer the latest saved version or a new copy. Editing remains immediate
in the browser; snapshot saves replace the server's active command history, while the
current browser undo/redo history saves atomically with the draft and survives refreshes
until another project is opened. History retains up to 50 changes within a 4 MB draft limit;
invalid history is discarded without replacing a valid house.
Original properties and chat context are saved independently of the active undo stack, including
MongoDB snapshots. Context-only changes also mark a saved space as changed.
The catalogue’s parameterized starting homes support one or two storeys, widths 11.5–16 m
and depths 9.5–14 m; prompt generation uses the limits above.

Rendering assets are self-hosted. `client/public/manifest.json` records their
source URLs, licences, authors, physical dimensions and checksums. The material
maps, HDR sky and four scanned furniture models are from [Poly Haven](https://polyhaven.com/license).
The TV plays a 36-second edited excerpt (06:16–06:52) from [Spring](https://studio.blender.org/projects/spring/pages/about/), © Blender Foundation | cloud.blender.org/spring, under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The excerpt is resized, letterboxed and converted to H.264/AAC, with attribution permanently visible in its lower bar. `asset:spring` is the current source; saved `asset:waterfall` references remain compatible with the included clip.

## Scene API

- `parseBuilding(input)`: validate a document and return a detached building.
- `applyCommands(building, edit)`: apply an atomic edit and return the building and revision.
- `undoRevision(building, revision, metadata)`: restore validated content while increasing
  the revision counter. Undoing that result provides redo.
- `getObjectCapabilities(object)`: derive supported editor and device actions.

Commands add, remove, move, rotate, resize or replace furniture, change object, interior wall,
exterior wall or roof materials, change room floor finishes, and control door, television,
light, cooker, water or openable state. Live ignition, water-start and relative device actions
resolve against current state. An edit carries an ID, timestamp, expected
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
  Exterior decor and lights may sit up to 0.25 m below that elevation on compound paving.
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

The engine supports rectangular houses with aligned storeys and flat-roof courtyard cutouts, adjoining slabs, full-height
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

Device commands update validated state with exact inverse commands. Successful static geometry checks are reused for matching geometry; every document still parses and compiles, door sweep and leaf checks run on every edit, and player occupancy remains checked. Changes to room footprints, collisions, fixture opening reservations or navigation settings invalidate reuse. Scanned furniture keeps its model and materials through unrelated state edits. Light primitives stay mounted at zero intensity when off, and the TV retains the same physical screen material, avoiding shader changes caused by light counts or switching screen material types. Door animation and entry use bounded elapsed time so low frame rates do not multiply their duration. Doors and openable
fittings animate their mechanisms and keep collision clearance through opening and closing. TV playback reports loading,
playing, blocked autoplay and source failures. Media
sources accept HTTP(S) URLs or `asset:` references. The API stores approved source references
and never fetches remote video; the browser plays them directly.

## Collaboration

Use the people icon beside History to share the current house. Enter a display name and
create a seven-day Editor or Viewer invitation. Invitations grant access to this house only;
the owner can revoke links, change member permissions or remove access. Removed members
can be reinstated from the collapsed Removed access list in People. Owners switch between
People and Invite tabs; invitation drafts remain available while switching tabs. Shared houses appear in Saved spaces.
Each visitor keeps their own camera, walking position and selection.

Selected furniture gets a coloured outline and a name pointer in other visitors’ views.
Typing previews follow the selected item, stay within the viewport and group people selecting
the same item. A compact activity indicator also covers off-screen and whole-house requests,
including the time spent applying the change. The map shows other walkers on their current floor.
Draft text is temporary and shared with the people currently in the house. Accepted edits
have a durable, authored history bubble with the instruction and time. Undo/restore attribution
is available from a small history icon, including for older and paginated activity.
Viewers can explore and operate navigation doors. Room-arrival actions require a valid player
position in that room; arbitrary object/device events, editing and rollback require Editor access.

The server checks the properties each command read before applying it in a MongoDB
transaction. Independent changes merge; a stale instruction affecting a changed property is
rejected. The journal, scene, conversational context and version commit together. Request IDs
make retries idempotent, and reconnecting reads the authoritative house and journal.
AI edits carry guards for their changed properties and referenced items, so unrelated updates
can merge without another model call. Local clarifications and failed requests survive shared
refreshes and reconnects without replacing authoritative transitions or other members’ turns.
Shared houses reject the older snapshot-save and whole-history undo endpoints.
Pending commands use separate browser recovery entries, so tabs cannot overwrite each other’s
queues. Recovery preserves command order and upgrades older outboxes. New edits pause while disconnected.
Leaving the house waits for pending edits. Shared history rolls back only the selected edit’s
changed properties, preserves unrelated later changes and rejects conflicting restorations.
Saved-action effects roll back together without firing the actions again.

Door swings and placement edits check all live walkers. Presence expires after disconnects;
it does not store a visitor’s camera or draft text in MongoDB. This implementation runs on one
API process, with up to 24 simultaneous visitors per house. Multiple API processes would need
a shared presence store and Socket.IO adapter before serving the same house.

## Project API

`POST /api/sessions` creates or renews an HTTP-only browser-session cookie. Session
tokens are stored as hashes and expire after 30 days. Collection recovery keys retain
access to saved spaces across expired sessions, browsers and devices. Create and download
a key from Project files → Collection recovery; creating another key invalidates the
previous key. Keys grant access to the collection and are stored only as hashes on the server.
Private spaces sync snapshots after a short idle delay. Shared spaces sync accepted commands immediately.
Connection errors and conflicting versions stop automatic writes until you retry or resolve them.
Export project files for portable copies. Use HTTPS in production and configure exact
`CLIENT_ORIGINS`. Project imports save the current draft before replacing it; a failed
preservation leaves the draft open.

- `POST /api/projects`: create a validated building with a unique `requestId`.
- `POST /api/sessions/recovery`: create or rotate the current collection's recovery key.
- `POST /api/sessions/recover`: restore collection access using `{ key }`, without replacing the current draft.
- `GET /api/projects?limit=20&cursor=…`: list the session's projects with cursor pagination.
- `GET /api/projects/:id`: load a complete editable building.
- `PUT /api/projects/:id`: save a snapshot with `requestId`, `expectedVersion` and `building`.
- `POST /api/projects/:id/edits`: apply `{ edit, player }` through the shared placement engine.
- `POST /api/edits/interpret`: interpret `{ requestId, building, target, message, view, player }`
  with GPT-6 Luna. Returns scoped, validated commands, their base revision and token usage. It
  does not write a project; the client applies the commands to its current draft and uses
  the private save flow or shared command endpoint. `target` contains an existing entity `kind` and `id`; `view` is the
  horizontal camera direction used for relative movement. Requests require a session,
  use a short provider timeout without automatic retries, and are limited to twenty per
  IP per minute. Changes still pass the engine and player-clearance checks.
- `POST /api/projects/:id/undo` or `/redo`: restore history using `id`, `at`, `expectedRevision`
  and an optional player position (`null` when absent).
- `POST /api/generations`: submit `{ requestId, prompt }` and receive a generation ID
  with HTTP 202. Reuse the same request ID and description after a connection failure.
- `GET /api/generations/:id`: session-private progress, error, model token usage and
  the saved `projectId` on completion. Open that project with the projects endpoint.
- `POST /api/collaboration/projects/:id/enable`: enable sharing with a display name and expected project version.
- `GET /api/collaboration/projects`: list houses this session can access through membership.
- `GET /api/collaboration/projects/:id`: load the authoritative shared house, permissions and latest history.
- `POST /api/collaboration/projects/:id/invites`: create a house-scoped Editor or Viewer link; append `/:inviteId/revoke` to revoke it.
- `POST /api/collaboration/join`: join with an invitation token and display name.
- `POST /api/collaboration/projects/:id/members`: change a member’s role or remove access.
- `POST /api/collaboration/projects/:id/edits`: submit commands, property guards, request metadata and optional chat context.
- `POST /api/collaboration/projects/:id/activity/:eventId`: roll back or restore one edit with a unique request ID.
- `GET /api/collaboration/projects/:id/activity?before=…`: paginate older durable history.
- `/api/live`: authenticated Socket.IO presence and committed-change notifications; the Vite proxy forwards WebSocket upgrades.
- `GET /api/health`: database readiness.

Snapshot saves compare document versions and preserve building identity. Typed edits
compare scene revisions. Both reject stale writes with HTTP 409 and commit changes and
request receipts in one transaction. Repeating a request returns its original accepted
version; reusing its ID for different content fails. Receipts also return the current
project, which may be newer than the accepted request. Undo/redo retains up to 50 active
steps and persists across API restarts. A snapshot replaces that active command history.
Invalid geometry, unsupported assets and changes that block a supplied player are rejected.
