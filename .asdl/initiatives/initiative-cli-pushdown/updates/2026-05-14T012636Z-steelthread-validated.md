# Steelthread Validated

## Summary

PR 468 (`validate-initiative-steelthread`) closes the final roadmap item by filling the small set of unasserted Markdown renderer and error-handling branches across the three shipped `initiative exec` commands and re-running the repository suite green. Five scenario tests were added in `packages/asdl-initiatives/tests/scenario/test_initiative_cli.py`; no source files under `packages/asdl-initiatives/src/asdl_initiatives/exec/` changed.

### Per-command coverage map after PR 468

- `initiative exec list`
  - JSON contract: absent root, empty root, mixed open/closed sorting, missing required files, direct-Markdown update counting, non-directory entry filtering — all covered by tests landed in PR 3.
  - Markdown renderer: header presence, counts table, per-row formatting — covered by `test_initiative_exec_list_format_md` in PR 3.
  - Error envelopes: none (the command has no negative or failure arms by design).

- `initiative exec read-initiative`
  - JSON contract: missing slug, path-shaped slug rejection, absent record, complete open record, closed record, incomplete record, raw-Markdown omission — covered by tests landed in PR 4.
  - Markdown renderer: raw initiative/roadmap/sorted updates and missing-file notes already covered by PR 4; the empty-`updates/` directory note (`_No direct update Markdown files found._`, `read_initiative.py:195`) is newly covered by `test_initiative_exec_read_markdown_empty_updates_dir_note` in PR 468.
  - Error envelopes: `missing_slug` and `invalid_slug` envelopes covered by PR 4; `not_found` envelope covered by PR 4.

- `initiative exec tracking-gate-facts`
  - JSON contract: missing `--base-ref`, invalid selection, bucket classification across selected/other/non-initiative paths and across working-tree/index/committed sources, detached-HEAD branch facts — covered by tests landed in PR 5.
  - Markdown renderer: header presence, branch backtick rendering, counts table, path-evidence table already covered by PR 5; the empty-evidence note (`_No path evidence found._`, `tracking_gate_facts.py:131`), the failure-rendering branch in `_render_branch` (`failure (<message>)`, `tracking_gate_facts.py:447`), and the `(<path>, missing, open)` selected-Initiative header branch are newly covered by `test_initiative_exec_tracking_gate_markdown_empty_evidence_note`, `test_initiative_exec_tracking_gate_markdown_current_branch_failure`, and `test_initiative_exec_tracking_gate_markdown_selected_initiative_missing` in PR 468.
  - Error envelopes: `missing_base_ref` and `invalid_selection` covered by PR 5; the gateway-failure envelope produced by `_require_git_changes` (`exit_code=2`, `error_type="git_failed"`) is newly covered by `test_initiative_exec_tracking_gate_range_failure_returns_failure_envelope` in PR 468.

### Deliberately-accepted non-coverage

These branches were considered and intentionally left without dedicated assertions in this Initiative; they are recorded here so a future reviewer does not re-discover the question:

- `--format markdown` alias for the three exec commands. Already covered by `packages/asdl-core/tests/unit/clinkr/test_format_option_dispatch.py`; this is a clinkr framework concern, not an `initiative exec` contract.
- Default `--format` (no flag). Resolves to the `human` renderer, which delegates to the same Markdown renderer that `--format md` exercises; framework-level concern.
- Base-ref whitespace stripping in `tracking-gate-facts`. Behavior is one defensive normalization in `_clean_base_ref`; not part of the asserted contract.

### Verification on the PR 468 branch

- `uv run pytest packages/asdl-initiatives/tests`: 51 passed.
- `just`: ruff check, ruff format check, dprint check, ty check, and `uv run pytest -n auto --ignore-glob='*/integration/*'` (1577 passed) all green.
- Manual smoke against this repo:
  - `uv run initiative exec list --format md` lists both `brmem-handoff-workflow` and `initiative-cli-pushdown` correctly.
  - `uv run initiative exec read-initiative initiative-cli-pushdown --format md` renders header, file inventory, and raw Initiative Markdown.
  - `uv run initiative exec tracking-gate-facts initiative-cli-pushdown --base-ref master --format md` renders counts and path evidence with correct bucketing.

## Initiative Impact

The "Validate the full steelthread" roadmap item flips to `[x]` with PR 468 as evidence. The full `## Work` list under `roadmap.md` is now complete:

- PR 1 simplified the Initiative skill selection rules.
- PR 2 stood up the `asdl-initiatives` package and the hidden `exec` subgroup.
- PR 3 shipped `initiative exec list`.
- PR 4 shipped `initiative exec read-initiative`.
- PR 5 shipped `initiative exec tracking-gate-facts` (PR 466) plus the skill-and-doc delegation closeout (PR 467).
- PR 468 closed the steelthread-validation roadmap item.

The CLI-creep risk (fact collection drifting into Markdown interpretation) remains addressed by the umbrella skill's explicit prohibition; the steelthread-validation work did not modify any `exec` source files, so that boundary is intact. The "do we have unasserted renderer branches?" risk is now materialized as concrete test names rather than an open audit question.

This Initiative is ready for `initiative-close`. No further work is planned under `## Work`; remaining items live under `## Parked` and are deliberately deferred.

## Follow-Ups

- Run `initiative-close` for `initiative-cli-pushdown` once PR 468 lands on `master`.
- When closing, consider whether any of the parked items (`create-skeleton`, update-precheck/timestamp helpers, close-marker helpers, PR-tracking policy enforcement, structured Initiative data sources) should be promoted into a follow-on Initiative or left dormant.
