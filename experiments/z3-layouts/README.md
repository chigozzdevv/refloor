# Refloor: Z3 in Node feasibility probe

This is a reproducible geometry experiment, not the Refloor application.

## Run

From the repository root, install the locked dependencies with `pnpm install --frozen-lockfile`,
then run `pnpm typecheck` and `pnpm test:solver`. The probe uses TypeScript 7.0.2 and
z3-solver 5.3.1. Its latest Node version and timings are recorded in `results.json`.

`probe.ts` builds constraints through the actual Z3 Node bindings. `validate.ts`
checks decoded numeric geometry independently and does not import Z3.
`results.json` records the latest execution, timing, assumptions and example outputs.

## Recorded result

44/44 solver cases passed: 33 valid solutions and 11 deliberate rejections.
Three additional output-corruption checks passed. TypeScript checking passed.
The latest local initialization and solver timings are recorded in `results.json`.
These measurements are not service latency or AI generation benchmarks.

- 24 one-, two- and three-bedroom floor plans with variable dimensions and room order.
- Two impossible house sizes rejected.
- Nine furniture cases: free placement in two room sizes, an impossible room,
  an existing arrangement, moving a TV, replacing a table while preserving the other
  items, and rejecting an oversized table, a blocked route and a through-wall move.
- Four two-storey plans with aligned stairwell reservations.
- Five invalid multi-storey configurations rejected: missing, shifted or too-small
  floor opening; misaligned stairwells; insufficient configured headroom.
- Independent checks reject a narrow doorway, furniture blocking the route and a
  shifted stair opening even when those numeric outputs bypass the solver.

All dimensions use a 10 cm horizontal grid. The numeric path checker assumes a
30 cm walker radius, 10 cm wall thickness and 90 cm door openings. Furniture cases
reserve a 100 cm through route and approaches to interaction points. These are
experimental product assumptions, not a building-code certification.

## What this establishes

Z3 runs in Node without Python and can solve the constrained cases above. Decoded
floor plans tile their rectangular footprints without overlapping rooms. A separate
grid flood fill checks reachability through actual door gaps. Furniture cases check
both overlap and routes to item interaction points. Untouched furniture identities,
dimensions and positions are checked after the successful edits.

The two-storey cases coordinate both floor plans, a U-stair reservation, flight and
landing dimensions, a full stairwell floor opening, and analytic head-clearance
samples. Floor-local reachability and the aligned stair connection are checked.

## Limits

- Floor plans currently use one explicit family: two room rows and a corridor spine.
  Swapping room order and changing dimensions is not unrestricted architecture generation.
- Furniture placement is a separate four-item living-room probe. This does not
  establish a fully furnished, navigable multi-storey house.
- The stair result checks reservations and analytic geometry, not constructed mesh
  topology, physical stair traversal, railings, door swing or a browser controller.
- No Astra or Meshy requests, browser rendering, TV playback, MongoDB writes or
  Redis/BullMQ jobs were run. No aesthetic evaluation or device performance claim is made.
- The solver has a five-second per-check budget. In the eventual application,
  timeout/unknown must preserve the current scene and produce a recoverable failure.
  A real timeout was not induced in this probe.

## Proposed functional flow and acceptance gates

The following is the implementation contract to validate next, not completed work.

1. Show the entrance door with the house-description input. Generate a structured
   building specification: floor count, room requirements, connections, style and
   supported object behaviours. Validate this data before planning geometry.
2. Choose a supported layout family. Solve dimensions, doors, routes and stair
   connections. Independently validate the solution; reject or revise an impossible
   request within a bounded retry budget. Preserve any existing working house.
3. Construct visible geometry, collision shapes and navigation from the same building
   model. Check spawn points, doors, every room, object interaction points and both
   ends of each staircase. Load the essential catalogue assets before entry.
4. Allow dragging the entrance handle, with click/tap and keyboard alternatives.
   Enter the generated house only after the geometry and collision world are ready.
5. Explore with desktop movement/look controls and mobile movement/look controls.
   Selecting an item releases look capture and exposes Move, Rotate, Colour, Replace
   and Remove without resetting the user's viewpoint. Resume walking on dismissal.
   Offer a floor selector in the overview/cutaway design mode.
6. Preview a furniture move immediately. Validate bounds, collisions, door clearance,
   usable routes, interaction approaches and the player's current space before
   accepting it. Refresh affected collision/navigation state with the accepted edit.
   Appearance and power-state changes do not require a new floor-plan solve.
7. Execute TV video playback, light switching/dimming and hinged door motion through
   supported behaviours attached to object IDs. Show a tap-to-enable-sound control
   if the browser blocks audible playback. Handle video load/play errors visibly.
8. Send language edits through the same validation path as pointer edits. Preserve
   unrelated objects. Ask for object disambiguation when multiple targets match.
   Structural changes, including moving stairs, require rebuilding and validating
   the affected building structure before acceptance.
9. Save accepted scene revisions in MongoDB. Compare the expected revision on update
   so an old request cannot overwrite a newer edit. Provide undo and save/reload checks.
   If jobs are needed, keep retry-safe BullMQ stages and one solver instance per isolated
   worker; do not share a live Z3 context across concurrent jobs.
10. Keep catalogue furniture usable while optional custom-asset jobs run. Check model
    bounds, materials and collision proxies before replacing a preview. A failed Meshy
    request must leave the current item usable. Discard results for removed/replaced items.

Before calling upstairs reliable, execute automated up/down traversal through actual
stair and slab colliders, then test doors, item dragging, audio activation and save/reload
in the browser on desktop and a touch device. Include blocked routes, rapid successive
edits, failed assets and stale background results in those tests.

## Sources checked

- [Official Z3 TypeScript/Node bindings](https://github.com/Z3Prover/z3/blob/master/src/api/js/PUBLISHED_README.md)
- [Rapier character controller](https://rapier.rs/docs/user_guides/javascript/character_controller/)
- [MongoDB atomic updates and expected-value filters](https://www.mongodb.com/docs/manual/core/write-operations-atomicity/)
- [BullMQ retry-safe jobs](https://docs.bullmq.io/patterns/idempotent-jobs)
- [Browser media autoplay rules](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay)
- [Meshy plans](https://www.meshy.ai/pricing): the free web plan lists 100 monthly
  credits, 10 Meshy 6 Lite downloads, CC BY 4.0, and no API access.
- [Meshy API pricing](https://docs.meshy.ai/en/api/pricing): prepaid API credits.

Pricing was checked on 2026-10-17. No Meshy account or promotional API credit was tested.
