# Graphite Slicing-Mechanics Survey Findings

## Summary

The Graphite slicing-mechanics survey (research row) was completed as the first
autonomous Objective Runner step, on branch `stack-smush-graphite-slicing-survey`
(commit `640f137`, stacked on `add-stack-smush-autonomous-policy`). The artifact is
`references/graphite-slicing-mechanics-survey.md`: every claim carries an
[observed]/[source]/[doc] evidence marker; observations were made on gt 1.8.6 in
offline scratch repositories, with no remote contact.

Key findings:

- **Slicing is pure metadata.** A linear run becomes a tracked stack via
  `git branch <name> <boundary-sha>` + `gt track --parent` bottom-up — no rebase, no
  conflicts, SHAs unchanged; `gt restack` confirms a no-op. `gt fold --stack --keep`
  is the exact inverse (collapses the stack, preserves individual commits and SHAs),
  so repackaging = collapse + re-slice is structurally cheap locally.
  `RealGraphiteBranchGateway.trackBranch` already wraps the core invocation.
- **`gt split` is a dead end for agents**: `--by-commit` is interactive-only;
  `--by-file` re-partitions content by pathspec and discards commit messages. A
  deterministic slicing CLI push-down is mandatory, not an optimization.
- **Concatenation joins work as the resolved run-building contract assumes**:
  `gt move --onto` (or `git rebase --onto` + `gt track`) appends disjoint branches as
  contiguous blocks in call order; a join conflict exits non-destructively with
  standard rebase recovery, matching conflict-as-falsified-disjointness.
- **Span squash and feedback absorption are covered**: `gt squash -m` is explicit,
  non-interactive, and auto-restacks; `gt absorb` routes staged hunks to the correct
  downstack commits across multiple branches in one shot; `gt modify -c --into`
  appends feedback commits mid-stack without switching branches.
- **Flow fits**: submit's default downstack scope suits submitting a packaged stack
  from its tip; `gt submit` silently skips empty branches, so packaging must never
  emit an empty slice. Gaps for the packaging skill: no slice operation, no
  concatenation-join command, no selective span squash, no PR-fate story for
  re-slicing, no decision/span labeling writer.

## Objective Impact

The "Graphite can express packaging" assumption is now **supported for all local
mechanics** with observed evidence; the unproven remainder is the remote/PR half (PR
fate under fold, review threads, CI across re-slice), which concentrates on the
already-elevated repackaging-chaos risk and its prototype row. The survey row is
checked off, unblocking **Packaging mechanics design** — that grilling row is ready
for a live session with the survey's gaps list as its agenda. `objective.md`'s
assumption prose was updated to the verdict.

## Follow-Ups

- Hold the packaging-mechanics-design live session (grilling; now unblocked), using
  the survey's proposed push-downs (slice-at-boundaries, ordered concatenation-join,
  selective span squash, decision/span labeling) as the agenda.
- The three remaining agent-alone task rows (narration convention, CCC dispatch
  proposal, ratification-surface proposal) are unchanged and runnable as further
  autonomous steps.
- The repackaging prototype row now explicitly owns observing PR/review-thread/CI
  fate under fold and re-slice against a real remote.
