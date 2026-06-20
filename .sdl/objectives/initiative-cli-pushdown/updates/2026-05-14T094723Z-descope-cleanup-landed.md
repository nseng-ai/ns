# Descope Cleanup Landed

## Summary

The two remaining roadmap follow-ups from the 2026-05-14 `tracking-gate-facts` descope are done on `validate-initiative-steelthread`. The reduced steelthread (two commands: `initiative exec list` and `initiative exec read-initiative`) is now consistent across the shipped surface, the skill/doc delegation, and the scenario tests.

Skill and doc revisions (the residue of cherry-pick `64977cb1`):

- `skills/initiative/SKILL.md` Tracking Gate paragraph dropped the `initiative exec tracking-gate-facts <slug-or-path> --base-ref <ref> --format md` line and now states that changed-path evidence and materiality remain skill/agent responsibilities in v1.
- `skills/initiative/SKILL.md` Non-goals bullet inventories `initiative exec list` and `initiative exec read-initiative` only; "changed paths" was dropped from the facts list. The "do not parse Markdown headings, roadmap checkboxes, or prose meaning in CLI code" guard is intact.
- `docs/initiative-system.md` operations summary lists `(list, read-initiative)`; the `initiative-next` section now shows only closed-initiative filtering under Shipped CLI and moves the two Tracking Gate items back under Future CLI pushdown candidates; the Tracking Gate section restores the "deterministic git comparison ... left as future CLI work" wording; the Future CLI Pushdown Principle list flips the `Report changed-path facts` and `Collect read-only Tracking Gate evidence` entries back to `_(future.)_`.
- `skills/initiative-next/SKILL.md` had no stale reference to revise; the cherry-pick had not reached it.

Scenario-test revisions (the residue of commit `598105c8`):

- Removed the `tracking-gate-facts` assertions and help-subcommand check from `test_initiative_exec_is_hidden_but_invocable`.
- Removed nine `test_initiative_exec_tracking_gate_*` functions and the `_invoke_tracking_json` / `_invoke_tracking_md` / `_empty_tracking_data` / `_empty_tracking_buckets` helpers. The 2026-05-14 descope update had under-counted the coupled tests as five.
- Removed now-unused imports: `DetachedHead`, `GitCommandFailure`, `GitPathChange` from `asdl_core.git.types`, `FakeGitGateway` from `asdl_core.git.testing`, and `InitiativeCliContext` from the never-shipped `asdl_initiatives.context` module.

Verification:

- `uv run pytest packages/asdl-initiatives/tests tests/scenario/test_plugins.py`: 31 passed.
- `just`: ruff, ruff format, dprint, ty, and `uv run pytest -n auto --ignore-glob='*/integration/*'` (1535 passed) all green.

## Initiative Impact

`roadmap.md`:

- The skill/doc delegation item flips from `[~]` to `[x]` because the only remaining caveat — `tracking-gate-facts` presented as shipped — is now resolved.
- The "Validate the reduced steelthread (two commands only)" item flips from `[ ]` to `[x]` with the test-suite verification above as evidence.
- Every item under `## Work` is now `[x]`. The `## Parked` list is unchanged; deferred Tracking Gate work remains parked with the dropped branch as its starting point.

`initiative.md`:

- Open Questions are updated to record that the on-branch in-place revision choice is now decided (rather than carried to a follow-up PR).
- The Thesis, Scope, Out-of-scope, Completion Criteria, and Assumptions/Risks already reflected the descoped two-command steelthread after the 2026-05-14 descope update; no further durable narrative change was needed here.

This Initiative is now ready for `initiative-close`. The CLI-creep risk is materially reduced for v1 because the shipped surface contains only filesystem-fact commands and the umbrella skill's explicit no-Markdown-parsing guard is intact.

## Follow-Ups

- Run `initiative-close` for `initiative-cli-pushdown` once this branch lands on `master`.
- When closing, decide whether deterministic Tracking Gate evidence collection should be promoted into a follow-on Initiative or left dormant in `## Parked`.
- Treat the two earlier 2026-05-14 updates (`updates/2026-05-14T004058Z-skill-and-doc-audit-landed.md` and `updates/2026-05-14T012636Z-steelthread-validated.md`) as superseded by `updates/2026-05-14T093556Z-tracking-gate-facts-descoped.md` and this update; do not cite their PR-5-done / steelthread-validated claims as current.
