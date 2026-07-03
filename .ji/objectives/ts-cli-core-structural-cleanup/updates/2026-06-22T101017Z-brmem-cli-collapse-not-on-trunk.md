# brmem-cli Runner Collapse Is Not On Trunk (Corrective)

## Summary

Earlier update `2026-06-21T154404Z-brmem-cli-runner-collapse.md` recorded the
`@sdl/core/brmem-cli` runner collapse as present "in the current stack," with only
`readOptionalBrmemBooleanField` left to delete. Verification against trunk
(`master`, clean working tree) shows that stack has not reached trunk, so most of
that row's work is still pending here.

Trunk reality at reconciliation time:

- `ts/packages/sdl-core/src/brmem-cli.ts` still exports the full candidate
  framework: `resolveBrmemCommandCandidates`, `runBrmemCandidate`, and
  `runFirstAvailableBrmemCommand`. No single `runBrmem` runner exists.
- `ts/packages/ccc/src/worktree-status.ts` still carries its own
  `resolveBrmemCommandCandidates` + `runBrmemCandidate` loop.
- `readOptionalBrmemBooleanField` is still exported.
- Only `graphqlErrorsFromJson` is genuinely deleted on trunk (grep finds no
  occurrences).

The unmerged branch `origin/extract-brmem-cli-adapter-and-migrate-callers` *adds*
the candidate adapter seam rather than collapsing it, so it is not the source of
the recorded collapse.

## Objective Impact

The roadmap row stays `[~]`, but for the correct reason: `graphqlErrorsFromJson`
is removed, while the candidate-framework collapse, the `ccc/worktree-status.ts`
candidate-loop dedup, and the `readOptionalBrmemBooleanField` deletion are all
still open against trunk. `roadmap.md` evidence and the `objective.md`
Assumptions and Risks paragraph were rewritten to trunk reality (the prior text
overstated progress by treating an unmerged stack as landed). The `[x]` rows
(`defineCli` migration, `branch-context` in-process gateway migration) were
re-verified as genuinely landed on trunk and left unchanged.

## Follow-Ups

- Before implementing this row, confirm whether the unmerged collapse stack will
  land on trunk (then only `readOptionalBrmemBooleanField` remains) or whether
  the collapse must be (re)done directly against trunk to avoid conflicting work.
- Complete on trunk: introduce single `runBrmem`, remove the three candidate
  APIs, repoint `ccc/worktree-status.ts` at the single runner, delete
  `readOptionalBrmemBooleanField` and its focused tests, then run the TypeScript
  validation gates and flip the row to `[x]` with evidence.
