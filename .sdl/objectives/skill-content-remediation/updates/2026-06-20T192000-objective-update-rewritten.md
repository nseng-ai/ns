# Objective Update Rewritten

## Summary

Rewrote `skills/objective-update/SKILL.md` as the next Objective-family remediation slice. The rewrite preserved the existing frontmatter, stayed single-file, avoided sibling Objective skill edits, and reduced the always-loaded body from 192 to 160 lines.

The extract-contract-then-diff gate was applied before accepting the rewrite. The contract checklist covered invocation intent, exactly-one Objective selection, archive and closed-record handling, landed-state semantics, fail-soft evidence collection, Graphite/GitHub/base rules, slug path-integrity checks, immutable Semantic Updates, Closure Gate auto-close semantics, mutation boundaries, stop/ask cases, and final response fields. All items are present verbatim or rephrased in the rewritten skill. An independent contract review found one minor consolidation-routing softening; the wording was fixed so consolidation/merge/subsumption requests explicitly stop being ordinary `objective-update` and route to the `objective` skill's consolidation guidance.

Validation passed: `git diff --check`, `areg check`, and `just dprint-check`.

## Objective Impact

The high-reach `objective-update` remediation target is complete. Repeated invariants around selection, slug identity, immutable update history, repo evidence, Closure Gate behavior, stop/ask handling, and verification now live under co-located sections rather than being restated across required-shape, workflow, stop, and verify blocks.

No reference file was added because the target debt was duplication rather than an oversized branch-specific block. No sibling Objective skills were edited. Existing Semantic Updates were not modified.

## Follow-Ups

Continue the remaining value-adjusted sequence with the `objective-create` body rewrite unless a higher-value remediation slice is explicitly selected first.
