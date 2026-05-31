# Dev Command Namespace Migration

## Summary

Consolidated the local development/source-control Pi command cluster under the locked `/dev:*` namespace.

New Pi command surface:

- `/dev:cp` replaces `/cp` for checkpoint commits.
- `/dev:autobranch` replaces `/newbr` for creating a Graphite branch from current uncommitted changes while generating both the branch name and checkpoint commit message.
- `/dev:submit` replaces `/submit` for guarded Graphite stack submission/update.
- `/dev:land` replaces `/gh:land` for package-tested single-PR GitHub squash landing.
- `/dev:land-stack` replaces `/gt:land-stack` for the Pi-only Graphite stack landing workflow.

Implementation changes:

- Added the consolidated project-local adapter `.pi/extensions/dev.ts`.
- Added the package aggregation module `ts/packages/pi-extensions/src/dev.ts`.
- Removed the separate project-local adapters `.pi/extensions/cp.ts`, `.pi/extensions/newbr.ts`, `.pi/extensions/submit.ts`, `.pi/extensions/gh.ts`, and `.pi/extensions/gt.ts`.
- Updated command constants, user-facing retry/rerun guidance, and registration tests for the new names.
- Updated `docs/pi/README.md` and `docs/agent-resource-catalog.md` to describe the consolidated `/dev:*` command family.

Fresh Pi RPC `get_commands` evidence after the change reports 71 visible commands total and 17 project extension commands. It includes `/dev:cp`, `/dev:autobranch`, `/dev:submit`, `/dev:land`, and `/dev:land-stack` from `.pi/extensions/dev.ts`. It reports zero `/cp`, `/newbr`, `/submit`, `/gh:land`, `/gt:land-stack`, `/land`, `/land-stack`, `/worktree-status`, `/brmem-status`, and `/gt-status` commands.

Verification: focused dev/submit/land/land-stack/autobranch tests passed; `just ts-check` passed; `just ts-test` passed; `just dprint-check` passed after formatting with `just dprint-fix`; `git diff --check` passed.

## Objective Impact

The `/dev:*` migration slice is resolved. The local development/source-control command cluster now has one project-local Pi discovery adapter and one consistent namespace, with no visible legacy aliases.

This de-risks the prior naming uncertainty around `/dev:*` by making the local Pi command namespace explicit while keeping the separate existing `dev-` skill naming decision parked. The `autobranch` name captures the distinctive behavior of the former `/newbr`: it derives a branch name and checkpoint commit message from current uncommitted changes.

The Objective remains open because the adjacent planned-branch, Branch Memory handoff, and branch retrospective / `aretro` surfaces still need explicit categorization before closure.

## Follow-Ups

- Categorize planned-branch commands, Branch Memory handoff commands, and branch retrospective / `aretro` surfaces as renamed, namespaced, retained as-is, or intentionally skill/CLI-centered.
- Decide whether `/skill:branch-retro` should remain named for the human-facing retrospective workflow or be renamed/reframed around the `aretro` CLI.
- After the remaining categorization slice, rerun the necessary inventory/validation and consider closure again.
