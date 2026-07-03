# Stack Address Skill Helper Path

## Summary

`skills/internal-pr-stack-address/SKILL.md` has been simplified around the stack-native helper sequence now available on the current base. The normal stack-address workflow now requires `stack-feedback-prep`, `stack-feedback-plan`, fresh `stack-feedback-prep --include-resolved`, `stack-feedback-diff-current`, `build-stack-resolve-thread-payloads`, and `resolve-thread-batch` instead of carrying manual fallback orchestration in the always-loaded skill text.

The skill keeps the safety gates explicit: full-stack scope by default, strict open-PR coverage, clean-worktree preflight, validated classification and stack planning, approval gates, committed fixes and checks before mutation, helper-owned pre-mutation drift comparison, helper-built payload validation, helper-mediated GitHub mutation, `(pr_number, thread_id)` stack review-thread decisions, and no push/submit by default.

Verification: `just dprint-check` and `git diff --check` passed for the Markdown changes.

## Objective Impact

This completes the roadmap slice to simplify `internal-pr-stack-address` around the stack-native helper path. Future stack-address runs should no longer ask agents to manually reconstruct per-PR `plan-feedback` wrappers from a merged stack plan or manually compare current feedback drift before mutation.

The Objective remains open because closure still requires a representative fixture, dry run, or live PR-addressing run with PR-level feedback, unresolved inline threads, discussion comments, and at least two batch types.

## Follow-Ups

- Exercise the improved stack-address flow on representative evidence before closing the Objective.
- Keep `stack-feedback-diff-current` as a local comparison helper: live fetching belongs to `stack-feedback-prep`, and GitHub mutation belongs to `resolve-thread-batch`.
