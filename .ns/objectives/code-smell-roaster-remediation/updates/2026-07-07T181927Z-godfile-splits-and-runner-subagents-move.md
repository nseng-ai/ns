# God-File Splits Landed and Runner-Subagents Package Move

## Summary

A trunk-HEAD refresh (target 9fa6a502d) reconciled the record's summary notes
with landed work and one further package move:

- Three of the four large Divergent Change god-files the record still listed as
  "still pending" are now split/fixed on trunk, each with a recorded fixed
  sub-slice: `internal/pi-tools/src/grill/extension.ts` (now ~120 lines, commit
  `c46efe574`), `internal/pi-tools/src/thermo-council/orchestrator.ts` (now
  ~275 lines, commit `ad4d101e2`), and `capability-kit/src/graphite/status.ts`
  (now a ~90-line re-export surface, commit `a16b2bc29`). Only
  `pr-feedback-watch/feedback-watch/controller.ts` (~790 lines) remains a
  partially-reduced god-file after its event-journal seam extraction.
- The infra row header still listed `graphite` as an open sub-area even though
  its Divergent Change finding was fixed in the capability-kit Graphite status
  sub-slice; open infra sub-areas are now cli-runtime, cli-theme, time,
  test-kit.
- `runner-subagents` has been extracted out of `@internal/pi-tools` into its own
  `@nseng-ai/ns-pi-subagents` extension package at
  `ts/packages/extensions/ns-pi-subagents/src/runner-subagents/`. The one open
  runner-subagents finding — the unused duplicate progress-widget formatter
  `formatRunnerSubagentProgressWidgetLines` in `presentation.ts` — is still
  real at the new path (only its own test references it; production uses
  `widget.ts`'s `formatRunnerSubagentActivityWidgetLines`).
- Corrected a filename slip in the grill fixed entry: the legacy select/editor
  and inline-outcome module is `execution.ts`, not `legacy-execution.ts`.

No behavior claims were changed and no findings were re-dispositioned; this
refresh only corrected stale status/path notes against ground truth.

## Objective Impact

- roadmap.md: infra and local-pi-tools row-header "remaining" notes rewritten
  to match landed fixes and the runner-subagents path move; grill fixed-entry
  filename corrected.
- objective.md: Risks god-file list, Assumptions example, Assumptions reorg
  mapping, and Open Questions updated so the only remaining large god-file is
  `pr-feedback-watch/feedback-watch/controller.ts`.
- The three active clusters (infra, capabilities, local-pi-tools) remain `[~]`;
  no checkbox state was flipped and no finding count changed.

## Follow-Ups

- local-pi-tools remaining: finish the pr-feedback-watch controller god-file
  (polling-strategy / status-presenter / runner-discovery seams) and remove the
  unused `formatRunnerSubagentProgressWidgetLines` duplicate in
  `ns-pi-subagents/src/runner-subagents/presentation.ts`.
- infra remaining: cli-runtime, cli-theme, time, test-kit sub-areas under
  `infra/foundation/src/*`.
- capabilities cluster (`[~]`) was not re-counted against
  `references/capabilities.md` this refresh; verify remaining findings at pickup.

Provenance: objective-refresh basis target=9fa6a502d from=trunk-HEAD
