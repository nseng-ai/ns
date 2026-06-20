# Reopened for Dev Command Namespace Consolidation

## Summary

The Objective was closed after the landing-surface slice, but active command-surface cleanup continued immediately afterward. The visible status commands `/worktree-status`, `/brmem-status`, and `/gt-status` were pruned while preserving automatic status-line refresh through extension lifecycle hooks. The remaining local development/source-control Pi commands are now being treated as one cluster: `/cp`, `/newbr`, `/submit`, `/gh:land`, and `/gt:land-stack`.

The user selected and then locked `/dev:*` as the namespace for that cluster: all commands in the local development/source-control cluster should move under `dev:`. The separate convention question for existing `dev-` prefixed skills is parked in Branch Memory rather than blocking this Pi command cleanup.

The user also identified additional repo-owned workflow surfaces that should be categorized before the Objective closes again: planned-branch commands (`/write-plan`, `/create-planned-branch`, `/impl-planned-branch`), Branch Memory handoff commands (`/brmem-handoff`, `/brmem-pickup-handoff`), and branch retrospective / `aretro` surfaces (`/skill:branch-retro` and related evidence-collection paths). The `branch-retro` naming question remains open: it may want to be named after `aretro` now that the CLI is the deterministic evidence boundary.

This update reopens the Objective by removing the closure marker and deleting the active `## Closure` section from `objective.md`. The prior completion evidence remains available in the historical updates and commit history, but the Objective is no longer complete until the `/dev:*` command-surface slice and remaining workflow-family categorization are implemented or explicitly dispositioned, documented, inventoried, and validated.

## Objective Impact

Closure was premature because the local development/source-control command cluster is still being reorganized and the adjacent planned-branch, handoff, and retrospective surfaces still need explicit categorization. The Objective now includes `/dev:*` namespace consolidation and remaining workflow-family categorization as closure-critical work, with follow-up inventory and validation required after the migration/disposition slice.

The previous landing and Objective-stack surface work remains completed. The new open work is narrower: consolidate the checked-in Pi adapter/command surface for the local dev/source-control cluster, categorize the adjacent workflow families, update tests and docs, and record fresh discovery evidence.

## Follow-Ups

- Finalize the exact subcommand names under the locked `/dev:*` namespace before implementation.
- Implement one consolidated project-local adapter extension for the selected namespace.
- Remove or replace the separate `.pi/extensions/cp.ts`, `newbr.ts`, `submit.ts`, `gh.ts`, and `gt.ts` discovery adapters after the consolidated adapter is ready.
- Categorize planned-branch commands, Branch Memory handoff commands, and branch retrospective / `aretro` surfaces as renamed, namespaced, retained as-is, or intentionally skill/CLI-centered.
- Decide whether `/skill:branch-retro` should remain named for the human-facing retrospective workflow or be renamed/reframed around the `aretro` CLI.
- Update tests, docs, and user-facing rerun strings for the new command names.
- Re-run focused tests, TypeScript checks, Pi RPC inventory, dprint, and `git diff --check` after the implementation slice.
