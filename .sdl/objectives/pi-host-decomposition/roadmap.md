# Roadmap

## Work

- [x] Inventory the `@sdl/pi` host boundary and classify every feature area into a decomposition lane.
  - Build the current map from `ts/packages/hosts/pi/src/`, `ts/packages/hosts/pi/test/`, package exports, package dependencies, `.pi/extensions/*.ts` discovery adapters, and reverse imports.
  - Classify each area as Pi runtime/neutral helper, Pi-native standalone tool, or vertically integrated capability mirror.
  - Evidence: `updates/2026-06-27-pi-host-boundary-inventory.md` records every current top-level source-area classification, package export/dependency and discovery-adapter cross-checks, known `context-profiler` reverse-import seam types, candidate order, and a tentative package-location convention.

- [~] Extract `context-profiler` as the reference Pi-native package slice.
  - Execute as one sequential Graphite stack when possible, defaulting to these independently reviewable branches:
    1. `pi-host-decomp/helper-seams`: complete in local branch evidence — neutral display-width/scroll helpers and LM JSON parsing now live behind intentional `@sdl/pi/terminal/layout` and `@sdl/pi/models/lm-json` helper subpaths, with PR preview, context-profiler, and thermo-council imports repointed and focused tests passing.
    2. `pi-host-decomp/context-profiler-package`: complete in local branch evidence — `context-profiler` source and focused tests moved to provisional `ts/packages/pi-tools/context-profiler/` as `@sdl/pi-context-profiler`; the project-local adapter imports the new package source; package imports use curated `@sdl/pi/...` helper/runtime subpaths; focused parity coverage moved with the package; and `@sdl/pi` source no longer imports the extracted package.
    3. `pi-host-decomp/context-profiler-recipe`: if the extraction validates, record the package recipe and final reference-slice convention in relevant package context/Objective prose; if the extraction disproves the provisional convention, record the safer disposition instead.
  - Resolve known reverse imports before the package move: PR preview views consume render helpers, `thermo-council` consumes LM JSON parsing, and Pi parity registration consumes the context-profiler parity record.
  - The parity seam must stay acyclic. Prefer moving extracted-package parity contribution to the project-local discovery adapter or another contribution point where `@sdl/pi` does not import `@sdl/pi-context-profiler`; keep `parity.test.ts` or an equivalent focused test proving live registrations and metadata still match.
  - Move source and tests using the repo's separate `test/` directory convention; preserve Pi command registration/parity behavior through a dependency direction that keeps the extracted package stacked on `@sdl/pi`.
  - Evidence: no non-context-profiler host source imports `src/context-profiler/*`; focused tests for context-profiler, helper seams, affected PR/thermo views, and parity behavior pass; `just ts-check` and `just ts-guard` confirm no type or package-cycle regression.

- [ ] Record the reference extraction recipe and apply it to the next obvious Pi-native tool candidates.
  - Use the `context-profiler` result to document how Pi-native tool packages should consume host helpers, own tests, expose registration or parity surfaces, and avoid host→tool dependency inversion.
  - Apply the recipe to `grill` and `thermo-council` unless inventory evidence shows a different first follow-on candidate.
  - Evidence: each moved or dispositioned tool has a clear package-boundary decision and preserved user-visible Pi behavior.

- [ ] Disposition `runner-subagents` and `terminal` with runtime-boundary evidence.
  - Determine whether each is a standalone Pi-native feature package, a neutral Pi runtime/helper surface that should remain in `@sdl/pi`, or a split between runtime primitives and feature presentation.
  - Do not extract runtime infrastructure merely to reduce LOC; extract only if the package boundary is deep, acyclic, and easier for future agents to understand.
  - Evidence: each area has either an extraction PR/slice or a durable disposition explaining why it remains in the host and which neutral exports are intentional.

- [ ] Thin vertically integrated capability mirrors without confusing them with Pi-native tools.
  - Inspect Handoff, Branch Context, PR feedback, Objective, and Plans-adjacent Pi surfaces for remaining capability-specific decisions in the host.
  - Repoint Pi shells toward owning Capability APIs/packages where the seam already exists; when the owning capability needs a migration, update or spawn the appropriate capability Objective instead of creating a Pi-stacked tool package.
  - Evidence: each major capability mirror has a recorded status: thin shell complete, delegated to capability work, or accepted Pi presentation-only residue.

- [ ] Rebaseline `@sdl/pi` exports, context language, and decomposition guidance.
  - Ensure package exports describe intentional neutral helper/runtime surfaces rather than accidental feature-domain entrypoints.
  - Update relevant context or architecture prose once the package convention is proven; report and fix stale path language through the appropriate context/objective workflow.
  - Evidence: future agents can tell where to put a new Pi-native tool versus a capability mirror, and the final package graph remains acyclic.

## Parked

- Dynamic arbitrary Pi discovery for all SDL extension commands.
- Packaging or marketplace semantics for third-party Pi extensions.
- Migrating standalone non-Pi tools such as `packagechk`, `vibechk`, `areg`, or `aretro`.
- Broader `sdl-extension-architecture` completion work such as deleting `@sdl/domain-primitives-transitional`, except where a Pi mirror directly blocks host decomposition.
