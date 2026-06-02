# areg init Preflight Evidence

## Summary

The first roadmap row is complete. `areg init` now has explicit scenario coverage for the safer preflight/planning/apply contract: successful initialization, prompt behavior, malformed managed markers before install, path-shape validation before install, `areg.json` preservation/replacement semantics, and non-destructive behavior when `npx skills add` fails.

The production implementation already performed the required planning before external installation and deferred local prose/config writes until after `npx skills add` succeeded, so this pass added evidence-focused tests rather than source churn.

Verification passed:

- `uv run pytest packages/areg/tests/scenario/test_init_project.py packages/areg/tests/scenario/test_cli_preconditions.py -q`
- `uv run pytest packages/areg/tests -q`
- `just`

## Objective Impact

The first roadmap row is marked complete. The `areg.json` decision is now explicit for `init`: unknown keys are preserved, and `agents` is replaced with the requested agent list.

This de-risks the review concern around silent config overwrite for the first row without introducing a new prompt/force CLI path. The Objective assumptions now record that this row covers predictable local validation and npx-install failure states, not arbitrary OS-level rollback after installation.

## Follow-Ups

- Symlink/canonical path hardening remains in the next roadmap row.
- Broader gateway/fake cleanup for `NpxSkills` filesystem side effects remains in a later roadmap row.
- Typed lockfile validation and migrated skill documentation cleanup remain separate roadmap work.
