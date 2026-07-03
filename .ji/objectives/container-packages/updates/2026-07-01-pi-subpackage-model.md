# Pi-subpackage model replaces the capability-pi container

User decision after exploring how Node approximates Python extras: a capability
with a Pi surface owns a **`pi` subpackage** (exported `./pi`) instead of a
separate `*-pi` published package — "a pi extra on each capability" rather
than two packages per capability. The proposed `@sdl/capability-pi`
consolidation container is dropped.

Mechanics (recorded in `objective.md` Scope and the inventory):

- `@sdl/pi` becomes an **optional peer dependency** (`peerDependenciesMeta:
  { optional: true }`, plus a devDependency for types/tests) of capabilities
  with a `pi` subpackage. CLI consumers importing the capability's `api`
  subpath never resolve the host; `.pi/extensions/*` adapters import
  `<capability>/pi` inside a running Pi host.
- Guard rule: only the `pi` subpackage may import `@sdl/pi`. Helpers useful to
  a capability's core belong in `@sdl/core`, not a pi package.
- The neutral `@sdl/pi/...` helpers consolidate as an `@sdl/pi` `kit`
  subpackage — the import surface for capability `pi` subpackages.
- `@sdl/pi` must continue to depend on no capability (keeps the optional-peer
  edge one-directional; the deliberately broken pi ↔ ccc cycle stays broken).
- The recorded "capability never depends on `@sdl/pi`" boundary (e.g. the
  Objective Capability Dependency Boundary) refines to "capability runtime
  core never imports `@sdl/pi`; only its `pi` subpackage may, as optional
  peer" — reconciled in the vocabulary slice.

Census effects:

- `@sdl/flow-pi` → `sdl-flow/pi`; `@sdl/handoff-pi` → `@sdl/handoff/pi`;
  `@sdl/objective-pi` → `@sdl/objective/pi`; `@sdl/ccc-pi` → `@sdl/ccc/pi`;
  `@sdl/branch-context-pi` → `@sdl/branch-context/pi`.
- The `pi` unit pushes handoff, objective, ccc, and branch-context to exactly
  four units — over the threshold, so all four flip from standalone to
  containers.
- The `capability-pi` tier retires (code becomes `pi` subpackages inside
  `capability`-tier containers).
- Local Pi tools are Pi-native, not capability shells — their 7 → 1
  consolidation container stands and is now the only new package.
- Revised census: **44 → 23 top-level** (12 containers + 11 standalone),
  ~52–55 subpackages.

Still awaiting at approval: the local Pi tools container name, borderline
`aretro`/`roaster` calls, and CLI bin ownership for folded packages.
