# Trunk Rebaseline After the July 2026 Workspace Reorganization

## Summary

A trunk-mode `objective-refresh` re-verified this record against `master` HEAD
on 2026-07-03 and rebaselined it around one material landed change: the July
2026 workspace reorganization, which happened outside this Objective and moved
or merged most of the packages the `references/*.md` findings name.

What changed in the repo since the last updates (2026-07-01):

- `ts/packages/` was regrouped into `infra/{brmem,clinkr,core}`,
  `capabilities/*`, `capability-kit`, `hosts/{pi,jicc}`, `kernel`,
  `local/pi-tools`, and `tools/*`. Former standalone `exec`, `cli-runtime`,
  `cli-theme`, `time`, and `test-kit` packages now live under
  `infra/core/src/*`; `git`, `github`, `graphite`, and `cmux` under
  `capability-kit/src/*`; the `@local-pi-tools/*` sub-packages became one
  `@internal/pi-tools` package; `sdlcc` was renamed `jicc`; `worktree-status`
  moved into `hosts/pi/src/worktree-status`; `capabilities/land` was absorbed
  into `capabilities/flow/src/land`.
- The first-party CLI was renamed `sdl` → `ji` and the repo state root
  `.sdl` → `.ji`; the roaster review now lives at
  `.ji/reviews/code-smell-roaster/review.md`.

Verification result: every previously recorded fixed helper was probed by
symbol and found present on trunk. Four survive under new names after the
reorg — `formatCommandFailure` → `formatInlineCommandFailure`
(`hosts/jicc/src/command-runner.ts`), `openNewCmuxTarget` →
`buildOpenNewCmuxEntry` (`hosts/jicc/src/stack-map.ts`),
`addDirectEntryCommand` → `pushDirectEntryCommand`
(`kernel/src/extensions/discovery.ts`), and the `PiLaunchThinkingLevel` /
`PiLaunchModelInfo` aliases were removed entirely in favor of the canonical
`ThinkingLevel` / `ModelInfo` in `capability-kit/src/cmux/types.ts`. The
remaining open local-pi-tools findings were re-probed individually and all six
are still real (pr-feedback-watch god-file + duplication, grill and
thermo-council god-files, pr-previews modal-chrome duplication,
runner-subagents duplicate progress-widget formatter).

`objective.md` was rebaselined (review path, `ji` command names in Runner
Policy, post-reorg package mapping in Assumptions and Risks, current god-file
paths, narrowed Open Questions with established sub-slice practice) and
`roadmap.md` was corrected (re-mapping notes on the three open rows, renamed
helpers annotated, remaining open findings enumerated on the local-pi-tools
row). No checkbox states changed: infra, capabilities, and local-pi-tools
remain `[~]`; all other clusters remain `[x]`.

Provenance: objective-refresh basis target=5668ac5630b2bab397ef85b9e4cfe4d5cd84c420 from=trunk-HEAD

## Objective Impact

No findings were fixed, disposed, or routed by this refresh; the open/done
shape is unchanged. The durable change is that the record no longer describes
the pre-reorg package layout or the retired `sdl` command surface: runners
picking up the remaining infra/capabilities/local-pi-tools rows must re-map
reference paths to the new layout (the roadmap rows now carry the mapping), and
the Runner Policy commands (`ji branch-context exec from-plan
--branch-creation graphite`, `ji flow submit --no-restack`,
`/objective:autopilot`) were re-verified against the live autopilot extension
and flow submit CLI.

## Follow-Ups

- Continue the remaining open sub-slices per `roadmap.md`: infra graphite /
  cli-runtime / cli-theme / time / test-kit (at their post-reorg homes), the
  remaining capabilities flow/slot/land findings, and the six remaining
  local-pi-tools findings.
- When picking up an `infra` or `capabilities` slice, re-check
  `ts-cli-core-structural-cleanup`'s open rows for overlap, per the Objective's
  ownership-overlap risk.
