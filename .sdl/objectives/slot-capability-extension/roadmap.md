# Roadmap

## Work

- [x] Introduce checkout Peer API and migrate CCC checkout consumers off CLI JSON parsing.
  - Evidence: `@sdl/slot/api` provides current and named branch checkout, and CCC checkout orchestration now uses the Slot Peer API (`SlotClient`) for in-process composition instead of parsing checkout JSON from a subprocess.

- [x] Define Slot command-face strategy.
  - Updated decision: `sdl slot ...` is the only supported Slot CLI surface. `@sdl/slot` remains the implementation and Peer API owner, while SDL mounts the command tree and supplies the canonical `sdl()` shell wrapper for parent-shell navigation. Standalone `slot` executable, shell, completion, and install surfaces are removed rather than shimmed.

- [x] Decide and migrate `sdl slot gt` Peer API needs.
  - Disposition: keep structured stack facts (`sdl slot gt exec stack-branches` / `stack-map-branches`) as hidden command-face surfaces by default; keep mutating `sdl slot gt free-stack` command-only; keep `sdl slot gt up/down` human navigation command-only. Promote a Peer API only when a concrete in-process consumer proves the need.

- [x] Remove remaining CLI/deep sibling dependencies from orchestration packages.
  - Classification: CCC checkout/autoslot/cmux dispatch uses the Slot Peer API because it composes checkout into in-process orchestration and tests; sdlcc stack-map opening and model loading, Pi PR stack-feedback discovery, CCC dispatch dry-run previews, and land-stack managed-slot cleanup use the supported `sdl slot ...` command face because they are agent/human command workflows or explicit subprocess command executions; no remaining deep `@sdl/slot/src/...` imports were found in the inspected orchestration/runtime packages.
  - Cleanup evidence: stale user-facing references to standalone `slot ...` were rewritten to `sdl slot ...` where the inventory found them.

- [ ] Document Slot vocabulary/context and above-SDK boundary.
  - Add focused Slot context/docs when the migration needs durable terms beyond the existing ADR 0009 vocabulary.
