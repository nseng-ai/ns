# Roadmap

## Work

- [x] Inventory current Aretro capability boundary and consumers.
  - Policy: direct execution after preview for read-only inventory and tracking updates.
  - Evidence to collect: package exports/bin in `ts/packages/aretro/package.json`; command implementation in `src/cli.ts`; injectable seams in `src/context.ts`, operations, sessions, and payload modules; tests; docs in `docs/aretro.md`; `branch-retro` skill/runner usage; and repo-wide imports/invocations of `@sdl/aretro`, `aretro exec`, or any SDL/Pi/CCC Aretro surface.

- [ ] Decide the supported command-face strategy.
  - Policy: steer-first before changing public command naming or compatibility.
  - Decision needed: keep standalone `aretro exec ...`, mount an SDL command face such as `sdl aretro ...`, or use a documented transition. The decision must preserve the `branch-retro` evidence boundary and keep Aretro domain out of the SDL kernel.

- [ ] Decide and implement the Capability API disposition.
  - Policy: steer-first for the durable API decision; direct execution after preview for mechanical export/test updates once decided.
  - Decision needed: add curated `@sdl/aretro/api` only if a concrete in-process consumer needs typed Aretro behavior. Otherwise record command-face-only as the current disposition and avoid presenting broad package-root exports as a peer API.

- [ ] Align Aretro domain core and tests with gateway-/source-injected capability rules.
  - Policy: direct execution after preview for fake-driven refactors that do not change evidence semantics.
  - Target: command shells build real gateways/sources at the edge; core evidence/payload/session behavior accepts injected dependencies; ordinary tests use fakes and do not read real operator logs or external services.

- [ ] Refresh docs/context and parent Objective tracking.
  - Policy: direct execution after preview for docs/tracking; steer first for terminology that changes public product meaning.
  - Evidence: Aretro docs/context state the final command/API boundary, the evidence-vs-judgment split remains clear, and `sdl-extension-architecture` records Aretro as completed or deliberately dispositioned.

## Parked

- New Aretro evidence kinds or semantic retrospective recommendations in the deterministic CLI.
- Registry publication or checkout-free distribution changes.
- Dynamic Pi mirrors or presentation-host UX for Aretro unless a concrete user workflow requires it.
- Shared session/payload/evidence foundations outside `@sdl/aretro` before a second consumer proves reuse.
