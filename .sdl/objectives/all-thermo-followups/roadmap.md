# Roadmap

## Work

Default stack shape for `objective-stack-impl`: keep this to one planned stack unless the first slice exposes a broader host API change. Use three reviewable slices by thesis: capability/lifecycle contract, phase-stream/scratch cleanup, then command-test hardening and parked follow-up decisions. Each slice should record Objective evidence if it lands meaningful progress; PR submission remains a separate explicit user action.

- [ ] Slice 1: restore hosted capability resolution and stream lifecycle safety.
  - Flow submit/cp and objective list should resolve `Caps` from the command host/IO context, treating callback or override sinks as non-interactive, and falling back to `resolveProcessCaps()` only for direct terminal CLI execution.
  - Introduce `runPhaseStream(...)`/`runStream(...)` ownership or wrap the current submit/cp streaming sections so sink stop and cursor restore happen in `finally` when core work throws.
  - Codify the non-TTY title/header contract, defaulting to minimal append-only output unless implementation evidence requires a title line.
  - Evidence: targeted flow, objective, and clinkr capability tests cover Pi-style callback sinks and direct CLI fallback; a forced-throw test proves stream cleanup happens after a mid-stream failure.

- [ ] Slice 2: simplify stream implementation and remove disposable scratch surface.
  - Delete `ts/scratch/cli-northstar` from live source unless there is an active named reason to keep it; preserve durable design decisions in prose only if needed.
  - Split `phase-stream.ts` responsibilities across phase-state transitions, lifecycle start/stop, transcript/tail buffering, and TTY/non-TTY renderer strategy.
  - Consolidate duplicated checkpoint phase specs between submit and cp where practical.

- [ ] Slice 3: move exact rendering assertions to the rendering layer.
  - Command scenarios should assert progress/event semantics and meaningful output facts.
  - Clinkr theme/status-line tests should own exact glyph, spacing, color, and frame expectations.
  - Decide whether the parked progress-destination and import-boundary notes should be addressed immediately or remain parked.

## Parked

- [ ] Standardize progress stream destination policy if the stream semantics seam is touched; the current report notes non-TTY progress is coupled to stderr.
- [ ] Add lint/import-boundary enforcement for clinkr core/theme/stream boundaries if the current canary coverage proves insufficient.
- [ ] Consider a separate Thermo product Objective only if follow-up review rounds need durable state or first-class `/thermo-council` UX beyond pasted review guidance.
