# `areg init` preflight/write-plan flow landed

## Summary

The `areg init` preflight/planning/apply rework (roadmap Work item #1) has landed on the default branch via commit `a2086b45` ("Refactor `init_project` to build a write plan before executing side effects, preserving unknown `areg.json` keys and failing fast before `npx` install", 2026-06-01), which was not previously recorded in this Objective.

`init_project` now builds a complete `InitPlan` of all file writes (modeled with `TextWritePlan`/`TextFilePlan` dataclasses, including `create_parent` directory handling) before executing any side effect or running `npx`. Local validation errors — malformed managed blocks, invalid/non-object `areg.json` — are caught up front and abort the command without touching the filesystem or invoking `npx`. If `npx skills add` fails, no files are written. Existing `areg.json` unknown keys are preserved by merging the managed `agents` field into the existing object rather than overwriting the whole file.

Evidence now includes `packages/areg/tests/scenario/test_init_project.py` coverage for:

- malformed agents/Claude managed blocks before install, including doubled-start, doubled-end, and end-before-start marker variants, with `fake_npx.invocations == []`;
- invalid and non-object `areg.json` before install;
- path-shape preflight failures for wrong-type `asdl.toml`, `AGENTS.md`, `CLAUDE.md`, `.claude`, and `.claude/settings.local.json` before install;
- config preservation/replacement semantics for existing project config;
- non-destructive `npx skills add` failure, including preservation of pre-existing planned files; and
- successful initialization plus prompt/`--yes`/`--no-append` variants.

Evidence basis: landed commit `a2086b45` (confirmed an ancestor of `origin/master`) plus local branch diff against Graphite parent `master` for the expanded scenario-evidence slice. PR #802 corroborates the same file set. Verification: targeted areg suites and full `just` were recorded as passing for the scenario-evidence slice.

## Objective Impact

- Roadmap Work item #1 (`areg init` preflight/planning/apply flow) remains `[x]`; its evidence line now points at the landed `InitPlan` flow and the expanded scenario tests.
- Open Question on whether existing `areg.json` unknown keys should be preserved by default is resolved: preserved by default (no explicit force/yes path required for the merge).
- The corresponding risk ("the wrong `areg.json` default could surprise users") is recorded as resolved via preserve-by-default behavior.
- No other roadmap rows changed: the additional scenario-evidence slice does not advance the path-hardening, boundary-model, lockfile, skill-docs, or strict-review-rerun rows.

## Follow-Ups

- None for item #1. Remaining Objective work (path/symlink hardening, boundary model, lockfile validation, skill docs reconciliation, strict-review rerun) is unaffected and still open.
