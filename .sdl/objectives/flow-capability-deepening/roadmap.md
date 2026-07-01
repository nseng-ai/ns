# Roadmap

## Work

- [x] Split relocated land-stack tests into Flow-owned focused files.
  - Policy: direct execution after preview for code/test moves. Preserve coverage and keep imports relative to Flow internals only from Flow tests.
  - Delivered: deleted the catch-all `ts/packages/capabilities/flow/test/unit/land-stack.test.ts` and moved coverage into `land-stack-helpers.test.ts`, `land-stack-pr-facts.test.ts`, `land-stack-command-scenarios.test.ts`, `land-stack-topology-guards.test.ts`, and `land-stack-snapshot.test.ts`. The command-scenario cluster intentionally remains large enough to preserve behavior mechanically; use it to shape the later fake-driven seam.
  - Evidence: Flow package tests and check pass; `just ts-format-check`, `just ts-lint`, and `just ts-check` pass; searches show CCC continues to consume Flow through `sdl-flow/api` and does not import private Flow land-stack internals.

- [x] Decompose Flow land command shells from land-stack domain orchestration.
  - Policy: direct execution after preview for internal module splits that preserve public command/API behavior.
  - Delivered: `src/land.ts` is now a command/CLI shell for registration, parse/help handling, idle/progress setup, command-stream wiring, and CLI result-block adaptation; semantic landing-shape dispatch and stack-mode confirmation live in private `src/land/landing-dispatch.ts`.
  - Delivered: `src/land-stack.ts` is now a small Flow-private stack façade for renderer registration, argument completion/parsing, stack execution setup, shape/plan routing, chunk dispatch, and top-level failure cleanup. Chunked/single-plan coordination, pre-merge confirmation and submit/restack maintenance, Graphite maintenance, isolated fast path, post-landing slot cleanup, preflight planning, and Flow/Land compatibility mapping each live behind narrower private modules.
  - Delivered: `ts/packages/capabilities/land` is established as the land-domain core package for stack preflight/dry-run planning. Flow remains responsible for command registration, CLI/Pi presentation, mutation-heavy landing orchestration, and `sdl-flow/api` compatibility while adapting to `sdl-land` internally.
  - Evidence: module-size/import rebaseline shows `src/land.ts` at 231 lines and `src/land-stack.ts` at 175 lines; boundary searches remain clean for private land-stack imports from CCC/Pi/host consumers and removed `sdl-flow/api` land-stack symbols; prior landing-dispatch validation passed Flow/CCC checks/tests plus repo TypeScript gates.

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

- [x] Final API/export cleanliness rebaseline.
  - Policy: direct execution after preview once structural slices have landed.
  - Target: verify `sdl-flow/api` and `sdl-flow/package.json` stayed narrow after deeper refactors; close any accidental helper leaks.
  - Delivered: removed land-stack implementation exports from `sdl-flow/api`, including `executeStackLanding`, parser/completion/renderer helpers, land-stack context/result types, and related API types; deleted the unused `ts/packages/ccc/src/land-stack.ts` shim without adding a replacement wrapper or package export.
  - Evidence: boundary searches are clean for removed Flow API land-stack symbols, external CCC/Pi/host consumers, private Flow land-stack imports from CCC/Pi/host packages, and `./land-stack` package exports; `sdl-flow` and `@sdl/ccc` checks/tests pass; `just ts-check`, `just ts-lint`, and `just ts-format-check` pass after formatter autofix.

## Parked

- Public SDK promotion for Flow helpers. Keep Flow-specific policy in Flow unless another capability proves a cross-extension author need.
- Dynamic Pi mirror discovery for Flow commands. Static `/sdl:flow:*` mirrors remain the current architecture.
- A broader Graphite/GitHub capability design. This Objective may introduce Flow-owned gateways/collaborators, not a new generic capability.
