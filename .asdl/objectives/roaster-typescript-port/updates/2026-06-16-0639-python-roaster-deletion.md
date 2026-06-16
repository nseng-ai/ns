# Python Roaster Deletion Landed

## Summary

The green TS roaster workflow evidence gate has been satisfied, and the Python `packages/roaster` implementation has been removed from the Python workspace. GitHub Actions run `27610014374` (`https://github.com/dagster-io/asdl-tools/actions/runs/27610014374`) succeeded on the `roaster-ts-review-exec-cutover` PR branch; its discover job installed the TS workspace and its review matrix jobs ran `pnpm --dir ts exec roaster review run`, `post-inline-findings`, `format-findings-comment`, and `post-findings-comment` successfully.

This deletion branch removes `packages/roaster`, removes Python workspace/build/test/publish references from `pyproject.toml`, `uv.lock`, and `justfile`, deletes the Python roaster plugin smoke test, and preserves the workflow YAML contract assertions in `tests/scenario/test_roaster_workflow.py`.

Verification: `pnpm --dir ts --filter @asdl/roaster run test`, `pnpm --dir ts --filter @asdl/roaster run check`, `uv lock`, and focused Python scenario tests for the workflow/plugin surfaces passed. The targeted stale Python-package grep found no remaining `packages/roaster`, workspace-source, publish-package, or Python import references outside `ts/**`.

## Objective Impact

This completes the runtime/build/test deletion slice for the Python roaster package and de-risks the CI cutover ordering: Python deletion now follows a green real-PR TS roaster workflow run instead of preceding it.

The Objective is not closed yet because broader documentation references still need a deliberate cleanup pass. A wider `roaster` grep still finds documentation/domain references that are not part of the runtime deletion slice, including Python-package-path examples in `AGENTS.md`, a deleted-package context entry in `CONTEXT-MAP.md`, and docs-site installation text that still describes `uv tool install roaster` / `asdl roaster` surfaces.

## Follow-Ups

- Clean up stale Python-era documentation references in `AGENTS.md`, `CONTEXT-MAP.md`, and docs-site roaster installation/tooling pages without deleting TS roaster docs/ADRs that remain valid.
- Re-run documentation formatting/checks after that docs cleanup.
- Close the Objective once documentation drift is resolved and no active non-parked roadmap work remains.
