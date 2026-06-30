# Roadmap

## Work

- [x] Split relocated land-stack tests into Flow-owned focused files.
  - Policy: direct execution after preview for code/test moves. Preserve coverage and keep imports relative to Flow internals only from Flow tests.
  - Delivered: deleted the catch-all `ts/packages/capabilities/flow/test/unit/land-stack.test.ts` and moved coverage into `land-stack-helpers.test.ts`, `land-stack-pr-facts.test.ts`, `land-stack-command-scenarios.test.ts`, `land-stack-topology-guards.test.ts`, and `land-stack-snapshot.test.ts`. The command-scenario cluster intentionally remains large enough to preserve behavior mechanically; use it to shape the later fake-driven seam.
  - Evidence: Flow package tests and check pass; `just ts-format-check`, `just ts-lint`, and `just ts-check` pass; searches show CCC continues to consume Flow through `sdl-flow/api` and does not import private Flow land-stack internals.

- [ ] Decompose Flow land command shells from land-stack domain orchestration.
  - Policy: direct execution after preview for internal module splits that preserve public command/API behavior.
  - Target: make `src/land.ts` own CLI/Pi command shell adaptation and result presentation, while `src/land-stack.ts` delegates meaningful phases to smaller Flow-owned modules instead of carrying the whole workflow narrative.
  - Evidence: `sdl-flow/api` remains stable; Flow/CCC land tests pass; module sizes and imports show clearer ownership boundaries.
  - Progress: chunked stack landing coordination now delegates to `src/land-stack/chunked-landing.ts`; single-plan stack landing now delegates to `src/land-stack/single-plan-landing.ts`; shared pre-merge/failure presentation lives in `src/land-stack/landing-coordination.ts`; post-landing `--free` slot cleanup now delegates to `src/land/post-landing-slot-cleanup.ts`. `src/land.ts` still owns isolated single-PR fast-path landing and PR parsing/loading.

- [ ] Introduce a fake-driven land-stack domain seam.
  - Policy: preview and then execute one bounded seam; ask first if the proposed seam changes public behavior, command names, or `sdl-flow/api` shape.
  - Target: replace brittle argv-scripted coverage for at least one important land-stack path with injected gateways/collaborators and in-memory fakes. Shape the seam from current tests rather than inventing a broad abstraction up front.
  - Evidence: new fake-driven tests cover a meaningful preflight/plan/merge/cleanup behavior; command-shell adapter remains the only layer that knows raw `exec`/`SdlExtensionApi` details for that path.

- [ ] Resolve CCC-era naming residue in Flow.
  - Policy: direct execution for clearly internal test/temp/helper names; steer first before changing persisted refs, user-visible strings, or recovery instructions.
  - Target: inventory `ccc` names under Flow; rename safe internal residue; document or deliberately preserve durable compatibility names such as backup-ref namespaces when needed.
  - Evidence: inventory search recorded; safe renames landed; any preserved `ccc` names have explicit rationale in code comments, context, or an Objective update.

- [ ] Add Flow package context and refresh map/root wording.
  - Policy: direct execution after preview for context/docs; keep glossary style and do not rewrite historical Objective updates.
  - Target: create or refresh `ts/packages/capabilities/flow/CONTEXT.md` and update `CONTEXT-MAP.md` so Flow's command face, Capability API, domain-core ownership, land-stack ownership, submit/autobranch boundaries, and CCC consumer boundary are explicit.
  - Evidence: context docs pass formatting; future-facing wording no longer says CCC owns Flow land/autobranch internals.

- [ ] Final API/export cleanliness rebaseline.
  - Policy: direct execution after preview once structural slices have landed.
  - Target: verify `sdl-flow/api` and `sdl-flow/package.json` stayed narrow after deeper refactors; close any accidental helper leaks.
  - Evidence: searches for removed Flow subpaths and helper exports are clean; targeted package checks and relevant repo guard checks pass; closure or final update records the evidence.

## Parked

- Public SDK promotion for Flow helpers. Keep Flow-specific policy in Flow unless another capability proves a cross-extension author need.
- Dynamic Pi mirror discovery for Flow commands. Static `/sdl:flow:*` mirrors remain the current architecture.
- A broader Graphite/GitHub capability design. This Objective may introduce Flow-owned gateways/collaborators, not a new generic capability.
- Persisted backup-ref namespace migration away from `refs/ccc/...`; consider only with an explicit compatibility/migration plan.
