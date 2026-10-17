# Refloor

## Product

Describe a house, generate its editable 3D structure, open the entrance door and explore.
Users can move, rotate, replace, recolour and remove furniture, operate TVs, lights and
doors, and save or undo changes. Multi-storey houses require connected stairs, landings,
floor openings and usable walking routes.

## Implementation order

1. Shared scene model and reversible commands.
2. Geometry, collision descriptions and navigation derived from that model.
3. Browser rendering, movement, editing and object behaviours.
4. Node API, Astra/Z3 generation, MongoDB persistence and optional Redis/BullMQ jobs.

Meshy is optional for custom assets. Catalogue furniture must remain usable when a
custom-asset request fails. Hosting selection is deferred.

## Scene contract

- JSON schema version 1, distances in metres, angles in radians and right-handed Y-up coordinates.
- Floor and room footprints are axis-aligned rectangles in the building's X/Z plane.
- Object X/Z positions describe footprint centres in that plane. Object Y is its bottom
  offset above the owning floor's finished surface. World Y adds the floor elevation.
- Wall offsets measure distance from the wall start. Door sills are zero; windows have
  explicit sill heights. Slabs extend below each floor's finished elevation.
- Entity IDs are unique throughout a building, including walls, openings and stairwells.
- Staircases reference adjacent storeys and an upper-floor opening covering their footprint.
- Furniture replacement preserves instance identity, room, floor and transform.

## Edit contract

An edit carries an ID, timestamp, expected revision and one or more typed commands.
Commands run against a private copy. Validation must succeed before returning an accepted
building. Failed batches do not alter the caller's document. Successful batches increment
the revision once and produce inverse commands for undo.

Revision fingerprints cover canonical scene content excluding the counter. Undo checks
the current content, validates restoration and replays the recorded forward commands.
Counters continue increasing through undo and redo. The later persistence layer must
compare the expected revision atomically and enforce unique edit IDs.

TV, light and door commands currently change their validated scene state. Browser video
playback, lighting and hinge animation belong to the browser behaviour runtime and are
not yet implemented. Media sources accept HTTP(S) URLs or explicit `asset:` references;
the later backend must apply its own network-fetch policy before retrieving a URL.

## Validation boundaries

Scene validation currently covers schema correctness, references, unique identities,
room/floor bounds, room overlap, wall openings, rotated object bounds and stairwell links.
It does not yet establish furniture-to-furniture collision, door swing clearance,
stair tread/headroom geometry or navigation reachability. Those checks belong to the
geometry engine and must pass before a generated scene is accepted for exploration.

The Z3 experiment's 44 bounded cases establish solver feasibility, not an unrestricted
house generator or a tested browser walkthrough. Real stair colliders and walking
controllers must be tested together before upstairs navigation is considered complete.
