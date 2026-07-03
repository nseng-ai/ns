# Consolidate Single Open Objective

## Summary

Created `eliminate-redundant-optional-undefined` as the single open Objective for optional-undefined follow-up work in this checkout.

The consolidation resolves ambiguity between three possible interpretations: reopening the closed `normalize-optional-undefined-boundaries` Objective, following the original five-PR branch-context plan literally from a branch that already contains unrelated cleanup, or adopting a separate hard-enforcement/allowlist Objective from a sibling branch. The active tracking decision is conservative: this Objective continues the closed normalization Objective's semantic process and tracks the current branch-local slice without adopting a blanket zero-count ban.

## Objective Impact

The current branch's in-flight cleanup is now tracked as one continuation/remediation slice covering packagechk metadata helpers, GitHub PR feedback fingerprint/status helpers, local pr-feedback-watch and preview/check models, and worktree-status presentation/internal cleanup.

At consolidation time, a scoped grep over the changed source areas reported 67 remaining `?: ... | undefined` matches: 30 in `infra/github`, 18 in `worktree-status/src`, 11 in `local-pi-tools/pr-feedback-watch`, and 8 in `local-pi-tools/pr-previews`; `tools/packagechk/src` had no remaining matches in that scoped inventory.

## Follow-Ups

- Complete or narrow the current branch-local cleanup slice.
- Record before/after counts, semantic claims, preserved/deferred categories, and validation evidence.
- Do not introduce another open optional-undefined Objective unless the scope changes materially, such as an explicitly approved hard guard/allowlist campaign.
