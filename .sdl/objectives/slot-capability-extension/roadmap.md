# Roadmap

## Work

- [x] Introduce checkout Peer API and migrate in-process checkout consumers off CLI JSON parsing.
  - Evidence: `@sdl/slot/api` provides current and named branch checkout; CCC checkout orchestration and SDLCC stack-map cmux activation now use the Slot Peer API (`SlotClient`) for in-process composition instead of parsing checkout JSON from a subprocess.

- [x] Define Slot command-face strategy.
  - Updated decision: `sdl slot ...` is the only supported Slot CLI surface. `@sdl/slot` remains the implementation and Peer API owner, while SDL mounts the command tree and supplies the canonical `sdl()` shell wrapper for parent-shell navigation. Standalone `slot` executable, shell, completion, and install surfaces are removed rather than shimmed.

- [x] Decide and migrate `sdl slot gt` Peer API needs.
  - Disposition: keep structured stack facts (`sdl slot gt exec stack-branches` / `stack-map-branches`) as hidden command-face surfaces by default; keep mutating `sdl slot gt free-stack` command-only; keep `sdl slot gt up/down` human navigation command-only. Promote a Peer API only when a concrete in-process consumer proves the need.

- [x] Remove remaining CLI/deep sibling dependencies from orchestration packages.
  - Classification: CCC checkout/autoslot/cmux dispatch and SDLCC stack-map workspace checkout use the Slot Peer API because they compose checkout into in-process orchestration and tests; SDLCC stack-map model loading, Pi PR stack-feedback discovery, CCC dispatch dry-run previews, and land-stack managed-slot cleanup use the supported `sdl slot ...` command face because they are agent/human command workflows or explicit subprocess command executions; no remaining deep `@sdl/slot/src/...` imports were found in the inspected orchestration/runtime packages.
  - Cleanup evidence: stale user-facing references to standalone `slot ...` were rewritten to `sdl slot ...` where the inventory found them; PR #2131 removed SDLCC's `sdl slot checkout --format json` activation subprocess and JSON parsing path.

- [x] Document Slot vocabulary/context and above-SDK boundary.
  - Evidence: `ts/packages/capabilities/slot/CONTEXT.md` now defines Slot Pool/Record/Inventory, Slot Repo Context, Slot Checkout Target, Slot Command Face, Slot Peer API, checkout side-effect policy, parent-shell navigation, Slot Shell Mount, and `sdl slot gt` helper terms; `CONTEXT-MAP.md` now lists Slot as a present context and updates relationship/ambiguity wording to the current `sdl slot ...` command-face and Peer API boundary.
