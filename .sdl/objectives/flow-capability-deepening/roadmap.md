# Roadmap

## Work

- [x] Split relocated land-stack tests into Flow-owned focused files.
  - Policy: direct execution after preview for code/test moves. Preserve coverage and keep imports relative to Flow internals only from Flow tests.
  - Delivered: deleted the catch-all `ts/packages/capabilities/flow/test/unit/land-stack.test.ts` and moved coverage into `land-stack-helpers.test.ts`, `land-stack-pr-facts.test.ts`, `land-stack-command-scenarios.test.ts`, `land-stack-topology-guards.test.ts`, and `land-stack-snapshot.test.ts`. The command-scenario cluster intentionally remains large enough to preserve behavior mechanically; use it to shape the later fake-driven seam.
  - Evidence: Flow package tests and check pass; `just ts-format-check`, `just ts-lint`, and `just ts-check` pass; searches show CCC continues to consume Flow through `sdl-flow/api` and does not import private Flow land-stack internals.

- [ ] Decompose Flow land command shells from land-stack domain orchestration.
  - Policy: direct execution after preview for internal module splits that preserve public command/API behavior.
  - Target: make `src/land.ts` own CLI/Pi command shell adaptation and result presentation, while land-stack domain logic moves toward a standalone `ts/packages/capabilities/land` domain-core package rather than remaining only in smaller Flow-internal modules.
  - Evidence: `sdl-flow/api` remains stable; Flow/CCC land tests pass; module sizes and imports show clearer ownership boundaries.
  - Progress: chunked stack landing coordination now delegates to `src/land-stack/chunked-landing.ts`; single-plan stack landing now delegates to `src/land-stack/single-plan-landing.ts`; shared pre-merge/failure presentation lives in `src/land-stack/landing-coordination.ts`; submit/restack pre-merge maintenance lives in `src/land-stack/pre-merge-submit.ts`; shared pre-merge confirmation gating lives in `src/land-stack/pre-merge-confirmation.ts`; post-merge Graphite maintenance lives in `src/land-stack/graphite-maintenance.ts`; post-landing `--free` slot cleanup now delegates to `src/land/post-landing-slot-cleanup.ts`; isolated single-PR fast-path landing and PR parsing/loading now delegate to `src/land/isolated-fast-path.ts`. `src/land.ts` still owns command registration, CLI adapter/result-block wiring, top-level landing dispatch, upfront stack confirmation, and post-landing cleanup sequencing.
  - Design direction: `ts/packages/capabilities/land` is established as the land-domain core package for stack preflight/dry-run planning. Flow stays responsible for command registration, CLI/Pi presentation, mutation-heavy landing orchestration, and `sdl-flow/api` compatibility while adapting to `sdl-land` internally.

- [x] Introduce a fake-driven land-stack domain seam.
  - Policy: preview and then execute one bounded seam; ask first if the proposed seam changes public behavior, command names, or `sdl-flow/api` shape.
  - Delivered: added private capability package `sdl-land` with `./api` and `./testing` subpaths, stack-first land request/outcome/failure/result/preflight types, focused Git/Graphite/GitHub PR/worktree gateway vocabulary, and in-memory fakes.
  - Delivered: Flow stack preflight/dry-run planning now calls `sdl-land` internally through a Flow adapter while preserving `sdl-flow/api`, Flow presentation, CCC imports, public command names, and isolated fast-path behavior. Durable backup refs were later renamed in the CCC-era naming cleanup row.
  - Evidence: `sdl-land` fake-driven tests cover stack preflight planning; Flow/Land/CCC checks from the land-domain-core and adapter-helper updates passed; boundary searches showed CCC still consumes land through `sdl-flow/api`, no direct CCC `sdl-land` import was introduced, and `sdl-land` exports only `./api` plus `./testing`.

- [x] Resolve CCC-era naming residue in Flow.
  - Policy: direct execution for clearly internal test/temp/helper names; persisted backup refs were renamed under an explicit breaking plan with no compatibility shim/migration.
  - Delivered: renamed the Flow command-runner helper from `ccc-cli.ts` / `FlowCcc*` / `runFlowCcc*` to `flow-cli-runner.ts` / `FlowCli*` / `runFlowCli*`; renamed land backup refs from `refs/ccc/land-backup*` to `refs/sdl/flow-land-backup*`; corrected stale CCC ownership comments while preserving true CCC consumer-boundary language.
  - Evidence: boundary searches show no current `refs/ccc`, `ccc-cli`, `FlowCcc`, `runFlowCcc`, `createFlowCcc`, or stale CCC ownership phrases under Flow/Land current code/tests/docs; remaining CCC mentions are compatibility-consumer/boundary references.

- [x] Add Flow package context and refresh map/root wording.
  - Policy: direct execution after preview for context/docs; keep glossary style and do not rewrite historical Objective updates.
  - Delivered: added or refreshed `ts/packages/capabilities/flow/CONTEXT.md`, `ts/packages/capabilities/land/CONTEXT.md`, and `CONTEXT-MAP.md` relationships so Flow's command face, Capability API, land-domain core ownership, land-stack ownership, submit/autobranch boundaries, and CCC consumer boundary are explicit.
  - Evidence: direct `dprint check` for the touched context Markdown passed in the land-domain-core update; future-facing wording records Flow ownership and `sdl-land` extraction without making CCC the land/autobranch owner.

- [ ] Final API/export cleanliness rebaseline.
  - Policy: direct execution after preview once structural slices have landed.
  - Target: verify `sdl-flow/api` and `sdl-flow/package.json` stayed narrow after deeper refactors; close any accidental helper leaks.
  - Evidence: searches for removed Flow subpaths and helper exports are clean; targeted package checks and relevant repo guard checks pass; closure or final update records the evidence.

## Parked

- Public SDK promotion for Flow helpers. Keep Flow-specific policy in Flow unless another capability proves a cross-extension author need.
- Dynamic Pi mirror discovery for Flow commands. Static `/sdl:flow:*` mirrors remain the current architecture.
- A broader Graphite/GitHub capability design. This Objective may introduce Flow-owned gateways/collaborators, not a new generic capability.
