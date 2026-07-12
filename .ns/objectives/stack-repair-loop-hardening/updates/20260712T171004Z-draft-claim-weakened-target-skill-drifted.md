# Planning-session draft claim weakened; target skill edited on trunk

## Summary

Verified rebaseline at trunk HEAD. All roadmap rows remain `[ ]`, and every deliverable is
still outstanding at `c1cb8d5d3`: `skills/code-fix-gh-stack/SKILL.md` still carries each
target defect (`## Purpose` at line 12, the `resolve conflicts carefully` no-op, and the
un-rephrased "Do not" negation sentences); `ns address exec branch-pr-checks` still
returns only `branch`/`status`/`target`/`counts`/`checks` per entry
(`BranchPrChecksFoundEntry`, `PrCheckEntryPayload`) with no head-commit push time,
stale/fresh classification, unresolved-thread counts, or per-PR status; and no
`pr-check-log`-style command exists anywhere in the repo.

Two corrections against the prior record:

- The roadmap's claim that a "reviewed draft exists from the 2026-07-08 planning session"
  is unverifiable: searches of the repo, Branch Memory (`brmem list --all-branches`), and
  handoffs found no such draft. The row now states the draft is not preserved and that
  the row's requirement list is the surviving spec.
- The target skill has drifted on trunk since the last refresh: commit `1a059cd04`
  (2026-07-11) rewrote the inventory step to use `ns slot gt exec stack-branches
  --format json` for topology and narrowed `gt ls` to human confirmation. This does not
  deliver any part of the interim rewrite, but it reinforces the existing risk that the
  rewrite must start from the current trunk file, not the planning-era text.

Provenance: objective-refresh basis target=c1cb8d5d3 from=trunk-HEAD

## Objective Impact

- Roadmap row 1 reworded: the draft-exists claim is weakened to "not preserved; the
  requirement list is the surviving spec," and the row notes the trunk-side inventory-step
  edit (`1a059cd04`). No scope, completion criteria, assumptions, or open questions
  changed; `objective.md` is untouched. The `graphite-stack-exec-consolidation` boundary
  cited in Non-Goals remains valid (`closed.md` present), and the stack-view data-layer
  assumption remains supported (`snapshot-schema.ts`, `check-logs.ts`, `graphql.ts` all
  present under `ts/packages/internal/pi-tools/src/stack-view/`).

## Follow-Ups

- None new. The interim skill rewrite (now spec-driven from the roadmap row, not a saved
  draft) and the `branch-pr-checks` JSON field contract remain the next actionable work.
