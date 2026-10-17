# @refloor/scene

Shared building validation and reversible editing for Refloor. This package has no
database, network, rendering or filesystem dependencies.

## API

- `parseBuilding(input)` validates an unknown document and returns a detached building.
- `applyCommands(building, edit)` returns a validated building and its revision record.
- `undoRevision(building, revision, metadata)` restores content through validated inverse
  commands while increasing the revision counter. Undoing that result provides redo.
- `getObjectCapabilities(object)` derives supported editor and device actions.

Supported commands: add, remove, move, rotate, resize and replace an object; set an object
or wall material; set door, television or light state. Commands are strict discriminated
data records; arbitrary code execution is not a supported command.

All local source imports use `@refloor/scene/*`. The emitted ESM uses the same real
package export paths, so Node does not need a runtime alias loader.

The test suite checks invalid documents, atomic failure, stable identities, exact
undo/redo, serialization, revision conflicts and the compiled public API in a separate
Node process. Test documents are input data, not mocked implementations.

See `refloor.md` at the repository root for units, coordinates and spatial validation
boundaries. This package does not claim collision-free navigation or browser playback.
