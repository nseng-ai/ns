# Roadmap

## Work

- [ ] Restore hosted capability resolution through one shared policy.
  - Flow submit/cp and objective list should resolve `Caps` from the command host/IO context, treating callback or override sinks as non-interactive, and falling back to `resolveProcessCaps()` only for direct terminal CLI execution.
  - Evidence: targeted flow, objective, and clinkr capability tests cover Pi-style callback sinks and direct CLI fallback.

- [ ] Guarantee flow stream cleanup on failures.
  - Introduce `runPhaseStream(...)`/`runStream(...)` ownership or wrap the current submit/cp streaming sections so sink stop and cursor restore happen in `finally` when core work throws.
  - Evidence: a forced-throw test proves cleanup happens after a mid-stream failure.

- [ ] Resolve and codify non-TTY title/header behavior.
  - Prefer minimal append-only output unless Pi widget/callback evidence requires an intentional first title line.
  - Align stale integration/scenario expectations with the chosen behavior.

- [ ] Remove or archive the disposable CLI north-star harness.
  - Delete `ts/scratch/cli-northstar` from live source unless there is an active named reason to keep it.
  - Preserve durable design decisions in prose only if needed.

- [ ] Split `phase-stream.ts` responsibilities after the functional blockers are fixed.
  - Separate phase-state transitions, lifecycle start/stop, transcript/tail buffering, and TTY/non-TTY renderer strategy.
  - Consolidate duplicated checkpoint phase specs between submit and cp where practical.

- [ ] De-brittle flow command tests from exact formatting.
  - Command scenarios should assert progress/event semantics and meaningful output facts.
  - Clinkr theme/status-line tests should own exact glyph, spacing, color, and frame expectations.

## Parked

- [ ] Standardize progress stream destination policy if the stream semantics seam is touched; the current report notes non-TTY progress is coupled to stderr.
- [ ] Add lint/import-boundary enforcement for clinkr core/theme/stream boundaries if the current canary coverage proves insufficient.
- [ ] Consider a separate Thermo product Objective only if follow-up review rounds need durable state or first-class `/thermo-council` UX beyond pasted review guidance.
