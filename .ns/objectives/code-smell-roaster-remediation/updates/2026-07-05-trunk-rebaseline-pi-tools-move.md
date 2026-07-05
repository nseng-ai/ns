# Trunk Rebaseline: pi-tools Package Move and infra Grouping Correction

## Summary

A trunk-mode `objective-refresh` re-verified this record against `master` HEAD
on 2026-07-05, after the `ji`→`ns` cutover and the subsequent `@nseng-ai`
package-rename commit landed on trunk. The record's durable narrative, scope,
completion criteria, risks, and open questions were all re-probed and confirmed
current; two stale package-path tokens were corrected.

What changed since the 2026-07-03 rebaseline:

- The consolidated pi-tools package moved from `ts/packages/local/pi-tools` to
  `ts/packages/internal/pi-tools`. `git ls-files` finds zero tracked files
  under `ts/packages/local/pi-tools` and the package (name still
  `@internal/pi-tools`) at `ts/packages/internal/pi-tools`. Every remaining
  open local-pi-tools finding file was re-probed and is still present at the
  new location: `thermo-council/orchestrator.ts` (612 lines),
  `pr-feedback-watch/feedback-watch/controller.ts` (821 lines),
  `grill/extension.ts` (550 lines), `pr-previews/preview-checks-view.ts`
  (512 lines), and `runner-subagents/presentation.ts` (72 lines).
- The tracked `infra` grouping is `infra/{brmem,clinkr,foundation}`, not
  `infra/{brmem,clinkr,core}`: only `brmem`, `clinkr`, and `foundation` carry a
  tracked `package.json` under `ts/packages/infra/`; `infra/core` is an
  untracked working-tree leftover. This aligns the grouping sentence with the
  already-correct detail claim that `exec`, `cli-runtime`, `cli-theme`, `time`,
  and `test-kit` live under `infra/foundation/src/*`.

Other claims were spot-verified and hold on trunk: the renamed fixed helpers
(`formatInlineCommandFailure` in `hosts/nscc/src/command-runner.ts`,
`buildOpenNewCmuxEntry` in `hosts/nscc/src/stack-map.ts`,
`pushDirectEntryCommand` in `kernel/src/extensions/discovery.ts`, and the
canonical `ThinkingLevel`/`ModelInfo` in `capability-kit/src/cmux/types.ts`),
the `capability-kit/src/graphite/status.ts` open finding (441 lines), the
remaining `infra/foundation/src/{cli-runtime,cli-theme,time,test-kit}`
sub-areas, `capabilities/flow/src/land` (from the absorbed `capabilities/land`),
and `worktree-status` under `hosts/pi/src/worktree-status`. The `ji`→`ns`
CLI/state-root rename was already captured; the later `@nseng-ai` rename did not
move any path this record names (the pi-tools package kept its `@internal`
scope, and the kernel fold left `kernel/src/extensions/discovery.ts` in place).

Provenance: objective-refresh basis target=8fdc6f50661d8df81024bbcce3c722fb7411441d from=trunk-HEAD

## Objective Impact

No findings were fixed, disposed, or routed by this refresh, and no checkbox
state changed: `infra`, `capabilities`, and `local-pi-tools` remain `[~]`; all
other clusters remain `[x]`. The durable change is that runners picking up the
remaining `local-pi-tools` findings must use the `ts/packages/internal/pi-tools`
path, not `ts/packages/local/pi-tools`, and the `infra` grouping now names its
real tracked packages. The Objective remains open with the same remaining work.

## Follow-Ups

- Continue the remaining open sub-slices per `roadmap.md`: `infra` graphite
  (`capability-kit/src/graphite`) / cli-runtime / cli-theme / time / test-kit
  (`infra/foundation/src/*`), the remaining `capabilities` flow/slot/land
  findings, and the five remaining `internal/pi-tools` findings.
- When picking up an `infra` or `capabilities` slice, re-check
  `ts-cli-core-structural-cleanup`'s open rows for overlap, per the Objective's
  ownership-overlap risk.
