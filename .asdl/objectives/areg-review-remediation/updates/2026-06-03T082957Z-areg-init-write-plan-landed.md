# `areg init` preflight/write-plan flow landed

## Summary

The `areg init` preflight/planning/apply rework (roadmap Work item #1) has landed on the default branch via commit `a2086b45` ("Refactor `init_project` to build a write plan before executing side effects, preserving unknown `areg.json` keys and failing fast before `npx` install", 2026-06-01), which was not previously recorded in this Objective.

`init_project` now builds a complete `InitPlan` of all file writes (modeled with `TextWritePlan`/`TextFilePlan` dataclasses, including `create_parent` directory handling) before executing any side effect or running `npx`. Local validation errors — malformed managed blocks, invalid/non-object `areg.json` — are caught up front and abort the command without touching the filesystem or invoking `npx`. If `npx skills add` fails, no files are written. Existing `areg.json` unknown keys are preserved by merging the managed `agents` field into the existing object rather than overwriting the whole file.

Evidence (all in `packages/areg/tests/scenario/test_init_project.py` on the default branch):

- `test_init_malformed_agents_marker_errors_before_install` and `test_init_malformed_claude_marker_errors_before_install` assert `fake_npx.invocations == []` (malformed blocks error before install).
- `test_init_invalid_areg_json_errors_before_install` and `test_init_non_object_areg_json_errors_before_install` (invalid config errors before install).
- `test_init_preserves_existing_areg_json_unknown_keys` (config preservation semantics).
- `test_init_npx_failure_is_non_destructive` (partial-failure prevention: README untouched, no `areg.json`/`AGENTS.md`/`CLAUDE.md`/`.claude` settings written on `npx` failure).
- `test_init_initializes_existing_git_root` plus prompt/`--yes`/`--no-append` variants (successful initialization).

Evidence basis: landed commit `a2086b45` (confirmed an ancestor of `origin/master`) plus current default-branch source (`packages/areg/src/areg/init_project.py`) and tests. No PR or branch-diff evidence was required; the work is already on the default branch. Verification was inspection-only (git history + source/tests); the full test suite was not re-run for this tracking edit.

## Objective Impact

- Roadmap Work item #1 (`areg init` preflight/planning/apply flow) moved from `[ ]` to `[x]`; its evidence line now points at the landed `InitPlan` flow and the specific scenario tests.
- Open Question on whether existing `areg.json` unknown keys should be preserved by default is resolved: preserved by default (no explicit force/yes path required for the merge).
- The corresponding risk ("the wrong `areg.json` default could surprise users") is recorded as resolved via preserve-by-default behavior.
- No other roadmap rows changed: commit `a2086b45` touches only `init_project.py` and its scenario test, so it does not advance the path-hardening, boundary-model, lockfile, skill-docs, or strict-review-rerun rows.

## Follow-Ups

- None for item #1. Remaining Objective work (path/symlink hardening, boundary model, lockfile validation, skill docs reconciliation, strict-review rerun) is unaffected and still open.
