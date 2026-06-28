# Roadmap

## Work

- [x] Inventory current Aretro capability boundary and consumers.
  - Policy: direct execution after preview for read-only inventory and tracking updates.
  - Evidence to collect: package exports/bin in `ts/packages/aretro/package.json`; command implementation in `src/cli.ts`; injectable seams in `src/context.ts`, operations, sessions, and payload modules; tests; docs in `docs/aretro.md`; `branch-retro` skill/runner usage; and repo-wide imports/invocations of `@sdl/aretro`, `aretro exec`, or any SDL/Pi/CCC Aretro surface.

- [x] Decide the supported command-face strategy.
  - Policy: steer-first before changing public command naming or compatibility.
  - Decision: hard-cutover to the SDL command face. `sdl aretro exec collect-evidence` and `sdl aretro exec read-evidence-detail` are mounted through the project-local Aretro SDL extension; the standalone `aretro` bin/shim and `just install-aretro` recipe are retired. The `branch-retro` skill now calls the SDL command face, while Aretro domain logic remains package-owned.

- [x] Decide and implement the Capability API disposition.
  - Policy: steer-first for the durable API decision; direct execution after preview for mechanical export/test updates once decided.
  - Decision: command-face-only. No `@sdl/aretro/api` subpath was added because no in-process consumer exists. The package export map exposes only explicit SDL command module subpaths and no broad root export.

- [x] Align Aretro domain core and tests with gateway-/source-injected capability rules.
  - Policy: direct execution after preview for fake-driven refactors that do not change evidence semantics.
  - Evidence: SDL command modules create real gateways/sources at the command edge through `@sdl/capability-kit`, then reuse the existing injected Aretro operation context. Package tests still use in-memory git/session fakes, and the kernel integration test proves SDL extension mounting without reading real operator session logs.

- [x] Refresh docs/context and parent Objective tracking.
  - Policy: direct execution after preview for docs/tracking; steer first for terminology that changes public product meaning.
  - Evidence: Aretro docs, package README, `branch-retro`, Pi cleanup docs, `CONTEXT-MAP.md`, this child roadmap, and the parent `sdl-extension-architecture` roadmap now state the final command/API boundary and preserve the evidence-vs-judgment split.

## Parked

- New Aretro evidence kinds or semantic retrospective recommendations in the deterministic CLI.
- Registry publication or checkout-free distribution changes.
- Dynamic Pi mirrors or presentation-host UX for Aretro unless a concrete user workflow requires it.
- Shared session/payload/evidence foundations outside `@sdl/aretro` before a second consumer proves reuse.
