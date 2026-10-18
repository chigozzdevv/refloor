# @refloor/engine

Deterministic building geometry, collision descriptions, placement validation and
navigation derived from `@refloor/scene`. No renderer, database or model call is needed.

## Public API

- `compileBuilding(document, options?)`: parse a scene and produce geometry. Compilation
  alone does not establish collision clearance or reachability.
- `validateBuilding(document, options?)`: compile and require enclosure, clearance and
  reachability checks to pass. Failures throw `EngineError` with entity-specific issues.
- `validatePlacement(document, edit, options?, player?)`: execute a real reversible scene
  edit, validate the result and optionally check a floor-level player position. Failures
  preserve the original document.
- `buildNavigation(compiled, policy?)`: construct a bounded graph with adaptive samples
  at obstacles, door centres and stair landings.
- `entrancePoints(navigation)`: return interior approach positions at exterior doorways,
  sorted by elevation. These are useful entry points for floor navigation.
- `findPath(navigation, from, to)`: return world-space points, length, stair IDs and closed
  door IDs, or `null` when either endpoint or the route is inaccessible.
- `isWalkable`, `checkEnclosure`, `checkClearance` and `checkReachability`: individual
  inspection functions for callers that need structured diagnostics.

Navigation endpoints contain `floorId` and a world-space `position` at that floor's
finished elevation. Stair edges contain intermediate 3D points. `nearestNode` and
`reachableNodes` are also exported for graph queries.

## Geometry contract

Distances are metres, yaw is radians and coordinates are right-handed Y-up. Mesh
vertices are local; apply `part.collider.position` and `part.collider.rotation` to
render a part. Indices, outward normals and metre-scaled UVs are included. Cuboid
collider sizes are full extents; physics adapters must divide them by two when an
API expects half extents. Roof mesh colliders use the same local vertices and transform.

Walls contain real door and window cutouts. Door leaves rotate around their declared
hinge, and `doors` records the hinge, signed opening angle and current state. Slabs
extend down from the finished floor surface and exclude upper stairwell openings.
Straight and U-shaped stairs contain solid treads, a turn landing where applicable,
supported floor approach areas and a bidirectional route. Positive stair heading
rotates local +Z towards world +X; heading zero ascends along +Z.

`surfaces` describes slab, tread and landing tops. A surface footprint rotates around
its centre by `rotation`; its elevation is already in world coordinates. These are
geometric records, while the navigation graph handles stair transitions explicitly.
`instances` retains furniture asset IDs, materials, behaviours and stable identity;
their collision proxies are oriented boxes. Asset loading and dimension fitting belong
to the browser catalogue pipeline.

## Door policies

The default `openable` graph ignores door leaves and includes required closed door IDs
in a route. It establishes that rooms can connect once doors are operated. Before
movement, apply the door commands, recompile and find a path with the `current` policy,
which respects the actual leaf positions. Opening a door changes its collision shape
and can change the available route. The browser must animate the same hinge and update
its physics world; the engine does not animate anything.

## Supported envelope

- Axis-aligned rectangular floors and rooms, with floor finishes assigned throughout
  every supported slab region. Interior walls may have arbitrary horizontal directions.
- Storeys share a footprint; an upper slab's underside meets the lower ceiling.
  Exterior enclosure checks require full-height walls around each floor perimeter.
- Straight or U-shaped stairs at multiples of 90 degrees, with enough run, width,
  landing depth, headroom and an upper opening covering their module.
- A flat or gable roof over the highest floor. Offset storeys and stepped roof systems
  fail explicitly instead of leaving lower rooms uncovered.

The default walker has radius 0.3 m, height 1.75 m, maximum step 0.2 m, minimum tread
0.25 m, headroom 1.9 m and clearance 0.02 m. These settings describe the application
walker, not structural engineering or regulatory compliance. Navigation is sampled
and bounded; a runtime character controller remains responsible for continuous motion.
Mesh colliders use conservative bounds for clearance checks, while Rapier receives
their actual triangles. Furniture support beyond owning-floor bounds and stairwell
voids, physical asset silhouettes, railings and load-bearing calculations are outside
this package's validation.

Defaults cap compilation at 10,000 geometry parts and object instances combined and
navigation at 40,000 candidate nodes. A separate node/collider work limit prevents
oversized graph construction. Numerical features at or below 0.000001 m are rejected
or merged when subdivision boundaries coincide within that tolerance.

## Verification

Tests exercise generated meshes, openings, door hinges, collision and placement
rejection, sealed rooms, reachable object positions and cross-floor paths. Rapier tests
walk a capsule up and down straight and U-shaped stairs, including perpendicular
headings and an odd riser count, then follow complete entrance-to-upstairs routes after
opening the required doors. A separate Node process imports the built public package
without a TypeScript loader or alias resolver.
