# Execution-Ready Stack Plan

## Summary

Clarified `planned-branch-ts-cli` from a broad extraction idea into an implementation-ready Objective for `objective-stack-impl`:

- narrowed `@asdl/planned-branch` to a publishable local/workspace package while parking actual npm publication/release automation;
- defined the hidden CLI exec contract for `write-plan-file`, `resolve-plan`, `create`, and `load-plan`;
- made the model-free package boundary explicit, with slug derivation remaining in Claude/Pi harness layers;
- expanded the storage rename and Pi command rename to include cmux/status launch paths; and
- added `## Definition of Progress` plus `## Runner Policy` with an expected three-branch implementation stack.

## Objective Impact

The Objective is now suitable for a confirmed `objective-stack-impl` run. The remaining active roadmap is intentionally three reviewable slices: package/core/CLI extraction, Pi+cmux refactor, and Claude skills/docs/final validation. No open question blocks implementation; human browsing commands and actual npm release automation are parked.

## Follow-Ups

- Run `objective-stack-impl planned-branch-ts-cli` from a clean worktree and preview the three-slice stack before branch creation.
- During the final validation slice, search for stale `brmem-plans`, `~/.asdl/plans`, `/create-planned-branch`, and `/impl-planned-branch` references and leave only intentional historical/transition prose.
