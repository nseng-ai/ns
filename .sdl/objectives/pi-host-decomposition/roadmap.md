# Roadmap

## Work

- [x] Inventory the `@sdl/pi` host boundary and classify every feature area into a decomposition lane.
  - Build the current map from `ts/packages/hosts/pi/src/`, `ts/packages/hosts/pi/test/`, package exports, package dependencies, `.pi/extensions/*.ts` discovery adapters, and reverse imports.
  - Classify each area as Pi runtime/neutral helper, Pi-native standalone tool, or vertically integrated capability mirror.
  - Evidence: `updates/2026-06-27-pi-host-boundary-inventory.md` records every current top-level source-area classification, package export/dependency and discovery-adapter cross-checks, known `context-profiler` reverse-import seam types, candidate order, and a tentative package-location convention.

- [x] Extract `context-profiler` as the reference Pi-native package slice.
  - Execute as one sequential Graphite stack when possible, defaulting to these independently reviewable branches:
    1. `pi-host-decomp/helper-seams`: complete in local branch evidence — neutral display-width/scroll helpers and LM JSON parsing now live behind intentional `@sdl/pi/terminal/layout` and `@sdl/pi/models/lm-json` helper subpaths, with PR preview, context-profiler, and thermo-council imports repointed and focused tests passing.
    2. `pi-host-decomp/context-profiler-package`: complete in local branch evidence — `context-profiler` source and focused tests moved to provisional `ts/packages/pi-tools/context-profiler/` as `@sdl/pi-context-profiler`; the project-local adapter imports the new package source; package imports use curated `@sdl/pi/...` helper/runtime subpaths; focused parity coverage moved with the package; and `@sdl/pi` source no longer imports the extracted package.
    3. `pi-host-decomp/context-profiler-recipe`: complete in local branch evidence — `ts/packages/hosts/pi/CONTEXT.md` and `CONTEXT-MAP.md` now name the Pi-tool package convention, direct discovery-adapter registration shape, neutral helper dependency direction, and host→tool dependency ban.
  - Resolve known reverse imports before the package move: PR preview views consume render helpers, `thermo-council` consumes LM JSON parsing, and Pi parity registration consumes the context-profiler parity record.
  - The parity seam must stay acyclic. Prefer moving extracted-package parity contribution to the project-local discovery adapter or another contribution point where `@sdl/pi` does not import `@sdl/pi-context-profiler`; keep `parity.test.ts` or an equivalent focused test proving live registrations and metadata still match.
  - Move source and tests using the repo's separate `test/` directory convention; preserve Pi command registration/parity behavior through a dependency direction that keeps the extracted package stacked on `@sdl/pi`.
  - Evidence: no non-context-profiler host source imports `src/context-profiler/*`; focused tests for context-profiler, helper seams, affected PR/thermo views, and parity behavior pass; `just ts-check` and `just ts-guard` confirm no type or package-cycle regression; `updates/2026-06-27-context-profiler-recipe-recorded.md` records the recipe slice.

- [x] Apply the reference extraction recipe to the next obvious Pi-native tool candidates.
  - Use the `context-profiler` result to guide how Pi-native tool packages should consume host helpers, own tests, expose registration or parity surfaces, and avoid host→tool dependency inversion.
  - `grill` portion complete in local branch evidence — `@sdl/pi-grill` now owns the structured grill source, tests, package parity metadata, and direct discovery adapter, while stable surface constants remain behind neutral `@sdl/pi/grill/surfaces` and `@sdl/pi` does not import the extracted package.
  - `thermo-council` portion complete in local branch evidence — `@sdl/pi-thermo-council` now owns the council source, tests, package parity metadata, and direct discovery adapter; it depends on `@sdl/pi-runner-subagents` plus neutral `@sdl/pi/...` helper/runtime subpaths, and `@sdl/pi` does not import it.
  - Evidence: each moved or dispositioned tool has a clear package-boundary decision and preserved user-visible Pi behavior; `updates/2026-06-27-grill-package-extracted.md` and `updates/2026-06-28-runner-terminal-thermo-extraction.md` record the applied-recipe slices.

- [x] Disposition `runner-subagents` and `terminal` with runtime-boundary evidence.
  - `runner-subagents` is a split surface: `@sdl/pi-runner-subagents` owns the model-visible dispatch tool, curated context preparation, focused widget behavior, and package tests, while host-owned neutral `@sdl/pi/runner-subagents*` subpaths retain runtime/process/JSON-event/presentation helpers still consumed by the Pi runtime, investigate, thermo-council, and host runner tests.
  - `terminal` remains an intentional neutral `@sdl/pi/terminal/*` helper surface; extracting it would create broad consumer churn without improving dependency direction.
  - Evidence: `updates/2026-06-28-runner-terminal-thermo-extraction.md` records the dependency-direction checks, focused tests, and durable context update for both dispositions.

- [x] Thin vertically integrated capability mirrors without confusing them with Pi-native tools.
  - Handoff status: thin Pi shell complete; portable artifact lifecycle is owned by `@sdl/handoff` / `@sdl/handoff/api`, while Pi keeps tab/self/session/Claude launch and prompt presentation.
  - Branch Context + Plans status: thin Pi shell complete; saved-plan selection and branch-context creation/load/attach behavior flow through `@sdl/plans/api` and `@sdl/branch-context/api`, while Pi keeps slash-command parsing, status output, and implementation-session launch orchestration.
  - Objective status: thin Pi shell complete; Objective list/candidate/selection/picker behavior flows through `@sdl/objective/api`, while Pi keeps slash-command registration, completions, and skill invocation presentation.
  - PR feedback status: accepted Pi presentation-only residue plus delegated portable collection/mutation behavior; `pr-address` owns download/check/thread primitives through its command face and `@sdl/pr-address/api`, while Pi keeps editor prefill, TUI previews, stack prompt assembly, live watch state, and prompt injection. Future PR feedback thinning should be a focused `pr-address` Capability/API follow-up, not a Pi-tool package.
  - Evidence: `updates/2026-06-28-capability-mirror-rebaseline.md` records the capability-mirror status matrix and PR feedback disposition.

- [x] Rebaseline `@sdl/pi` exports, context language, and decomposition guidance.
  - Final host export language now describes the remaining package exports as intentional neutral/runtime/presentation families rather than accidental feature-domain entrypoints.
  - Pi-tool convention language covers `@sdl/pi-context-profiler`, `@sdl/pi-grill`, `@sdl/pi-runner-subagents`, and `@sdl/pi-thermo-council`; capability-mirror language records Handoff, Branch Context + Plans, and Objective as thin shells over Capability APIs, and PR feedback as accepted Pi presentation residue around `pr-address` rather than a Pi-tool candidate.
  - Evidence: future agents can tell where to put a new Pi-native tool versus a capability mirror, the final package graph remains acyclic, and `updates/2026-06-28-final-host-export-rebaseline.md` records the export/context audit.

## Parked

- Dynamic arbitrary Pi discovery for all SDL extension commands.
- Packaging or marketplace semantics for third-party Pi extensions.
- Migrating standalone non-Pi tools such as `packagechk`, `vibechk`, `areg`, or `aretro`.
- Broader `sdl-extension-architecture` completion work such as deleting `@sdl/domain-primitives-transitional`, except where a Pi mirror directly blocks host decomposition.
