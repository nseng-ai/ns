# Skill file landed on trunk; stacking risk resolved

## Summary

Verified rebaseline at trunk HEAD. The `code-fix-gh-stack` skill file the interim rewrite
targets has landed on trunk: `skills/code-fix-gh-stack/SKILL.md` is committed at
`4c30d67fa` ("Add Graphite/GitHub stack repair skill"), an ancestor of HEAD, delivered by
PR #3283 (headRef `fix-the-stack-skill`, merged 2026-07-09T10:50:58Z). The objective was
authored assuming this file was still in an unmerged PR #3283 inside the extension-descriptor
stack, requiring the rewrite to stack on that tip.

Ground truth at HEAD `a814ebe365b9164fdcd31c3cf09c681be670c4f0` also confirms no rewrite has
landed: the shipped skill still carries every target defect — a `## Purpose` section, the
`resolve conflicts carefully` no-op under the amend step, and un-rephrased negation
sentences. The `ns address exec branch-pr-checks` enrichment is likewise absent: the current
`BranchPrChecksFoundEntry`/`PrCheckEntryPayload` payload exposes per-check timestamps
(`started_at`/`completed_at`) and check-run vs status-context `kind`, but no head-commit push
time, stale/fresh classification, unresolved-thread counts, or per-PR status. No
`pr-check-log`-style command exists. All roadmap rows remain `[ ]`, consistent with this.

Provenance: objective-refresh basis target=a814ebe365b9164fdcd31c3cf09c681be670c4f0 from=trunk-HEAD

## Objective Impact

- Reworded the Risks bullet and the first roadmap row: the interim rewrite now branches from
  trunk normally instead of stacking on the extension-descriptor stack, and the
  stack-rebase-conflict concern is cleared. No scope, completion criteria, or open questions
  changed. The `graphite-stack-exec-consolidation` boundary cited in Non-Goals remains valid
  (that objective is closed; `closed.md` present).

## Follow-Ups

- None new. The interim skill rewrite and the `branch-pr-checks` enrichment remain the next
  actionable roadmap work, now unblocked from any stacking constraint.
