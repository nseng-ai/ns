# Per-skill remediation method is now from-scratch rewrite

## Summary

Decided the per-skill remediation method for every ≥5 target: a **from-scratch
rewrite** of each `SKILL.md` using the `writing-great-skills` skill as the sole
authoring authority, preserving 100% of behavior. This supersedes the earlier surgical
approach (verbatim disclosure-move + recap-deletion as two separate passes). The
motivation: a clean rewrite collapses duplication and discloses oversized blocks as a
*byproduct*, and additionally buys clarity / LM-friendliness that surgical edits left on
the table — answering the standing question of whether this Objective only shortens
skills or also improves their wording. It does both, but only where a rewrite forces
the wording; "improve clarity" is not an independent freehand license.

Behavior preservation is an **operational gate**, not an intention:
**extract-contract-then-diff**. Before rewriting a skill, enumerate its behavioral
contract — trigger conditions, ordered steps, stop/ask conditions, output shapes, safety
rules, CLI invocations. After rewriting, diff the new `SKILL.md` against that contract
line-by-line, then run `areg check` and verify every disclosed-reference pointer
resolves. A rewrite that cannot be shown to preserve the contract does not ship.

Decision inputs (this session): authority = `writing-great-skills` only; behavior check
= extract-contract-then-diff; record the method change before any skill edits.

## Objective Impact

- `objective.md` Thesis: added a "Per-skill method (decided 2026-06-20)" paragraph
  naming the from-scratch-rewrite method and the contract-diff gate; noted it supersedes
  the surgical approach and leaves systemic #1/#2/#3 unaffected.
- `objective.md` Scope: the per-skill ≥5 bullet now reads as a from-scratch rewrite
  against `writing-great-skills` (duplication collapse + disclosure fall out of it)
  rather than separate surgical passes.
- `objective.md` Assumptions: added — a behavior-preserving rewrite yields better
  clarity/LM-friendliness than surgical edits, *because* it is gated by
  extract-contract-then-diff; not yet exercised (the first rewrite tests it).
- `objective.md` Risks: added — from-scratch rewrite is the highest behavior-drift
  method (can silently drop a stop-condition, soften a safety rule, reorder steps, shift
  a trigger; no test suite to catch it); mitigation is the load-bearing
  extract-contract-then-diff gate plus `areg check` and pointer resolution.
- `roadmap.md`: collapsed the `[~]` "disclosure surgery" row and the `[ ]` "duplication
  collapse" row into a single `[~]` "from-scratch rewrite of each ≥5 skill" row. All
  prior per-target debt notes are retained as per-target rewrite focus. Row stays `[~]`:
  `objective-stack-impl` is already remediated under the prior surgical method (kept as
  done); the remaining targets are pending rewrite.

No change to what any skill *does* — this is a method decision, not implementation.
Systemic #1/#2/#3 remain complete and untouched.

## Follow-Ups

- First rewrite target: `branch-context-impl` (STOP-contract disclosure) — exercises and
  thereby validates both the new assumption and the contract-diff gate.
- Resolve the standing Open Question on `python-fake-driven-testing` (consolidate the
  11-file reference tree vs. only sharpen pointers) before rewriting that target.
- Decide whether `objective-stack-impl` warrants a retro-rewrite under the new method or
  stays as-is (already disclosed, behavior-preserving).
