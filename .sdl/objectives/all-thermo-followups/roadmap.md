# Roadmap

## Work

Default stack shape for `objective-stack-impl`: keep this to one planned stack unless the first slice exposes a broader host API change. Use three reviewable slices by thesis: capability/lifecycle contract, phase-stream/scratch cleanup, then command-test hardening and parked follow-up decisions. Each slice should record Objective evidence if it lands meaningful progress; PR submission remains a separate explicit user action.

- [x] Slice 1: restore hosted capability resolution and stream lifecycle safety.
  - Flow submit/cp and objective list resolve `Caps` from command host/IO context, treating callback or override sinks as non-interactive, and falling back to `resolveProcessCaps()` only for direct terminal CLI execution.
  - `runPhaseStream(...)` owns submit/cp streaming lifecycle so sink stop and cursor restore happen in `finally` when core work throws.
  - Non-TTY behavior is codified as minimal append-only output, with no new title/header line required.
  - Evidence: targeted flow, objective, and clinkr capability tests cover Pi-style callback sinks and direct CLI fallback; a forced-throw test proves stream cleanup happens after a mid-stream failure; parent validation passed `pnpm --dir ts exec vitest run --config vitest.config.ts packages/infra/clinkr/test packages/capabilities/flow/test/unit/phase-stream.test.ts packages/objective/test/unit/list-objectives.test.ts packages/objective/test/scenario/list-objectives-cli.test.ts packages/capabilities/flow/test/scenario/cp-command.test.ts` and `just ts-check`.

- [x] Slice 2: simplify stream implementation and remove disposable scratch surface.
  - Deleted `ts/scratch/cli-northstar` from live source; no separate durable prose was needed because retained behavior is covered by clinkr/flow implementation and tests.
  - Split `phase-stream.ts` responsibilities across phase-state transitions, lifecycle start/stop, transcript/tail buffering, TTY/non-TTY rendering strategy, and shared phase specs.
  - Consolidated checkpoint phase specs between submit and cp via shared checkpoint phase definitions.
  - Evidence: parent validation passed `pnpm --dir ts exec vitest run --config vitest.config.ts packages/capabilities/flow/test/unit/phase-stream.test.ts packages/capabilities/flow/test/scenario/cp-command.test.ts packages/capabilities/flow/test/scenario/submit-command.test.ts` and `just ts-check`.

- [ ] Slice 3: move exact rendering assertions to the rendering layer.
  - Command scenarios should assert progress/event semantics and meaningful output facts.
  - Clinkr theme/status-line tests should own exact glyph, spacing, color, and frame expectations.
  - Decide whether the parked progress-destination and import-boundary notes should be addressed immediately or remain parked.

## Parked

- [ ] Standardize progress stream destination policy if the stream semantics seam is touched; the current report notes non-TTY progress is coupled to stderr.
- [ ] Add lint/import-boundary enforcement for clinkr core/theme/stream boundaries if the current canary coverage proves insufficient.
- [ ] Consider a separate Thermo product Objective only if follow-up review rounds need durable state or first-class `/thermo-council` UX beyond pasted review guidance.
