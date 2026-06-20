# Root `asdl exec` Disposition Resolved

## Summary

The remaining Python root `asdl exec` surface was resolved in the `resolve-root-asdl-exec-disposition` branch.

Fresh consumer sweeps found active `cmux-workspace-summary` callers in CCC sidebar code, the `ccc-sidebar` skill, and cmux/Pi docs; active `resolve-prompt` use in `/enriched-plan:save`; and no active higher-level caller for `gh review-threads` or `gh resolve-review-threads` beyond Python source/tests. After migration, the stale-command gate returns only an intentional retirement note for the former Python cmux command.

## Disposition

- `asdl exec cmux-workspace-summary` was replaced by TypeScript-owned `ccc exec cmux-workspace-summary` in `@asdl/ccc`. The command preserves the hidden deterministic contract: caller workspace resolution from `--workspace` / `CMUX_WORKSPACE_ID` / `CMUX_TAB_ID`, required title, nonblank description, default `pi-summary` status key, cmux rename/description/clear-status sequence, and JSON success/failure data with command-failure details.
- `/ccc:sidebar:objective-summary` now applies deterministic sidebar fields through `pi.exec("ccc", ["exec", "cmux-workspace-summary", ...])`. The PR/sidebar fallback skill and docs now instruct `ccc exec` instead of Python root `asdl exec`.
- `/enriched-plan:save` no longer calls `asdl exec resolve-prompt`. The TypeScript Pi extension resolves `.asdl/prompts/plans-write.md` from the current Git root, rejects symlinked `.asdl`, prompt directory, or prompt file paths, rejects empty content, and falls back to its built-in prompt body with the existing warning path.
- `asdl exec gh review-threads` and `asdl exec gh resolve-review-threads` were retired rather than ported because no active skill, Pi extension, or higher-level tool depended on them.
- The Python root `asdl` command remains only as the plugin-dispatcher/runtime diagnostic surface. The hidden root `exec` subgroup and its Python cmux, prompt-resolution, and GitHub review-thread modules were deleted, and root CLI scenario tests now assert that `asdl exec` is retired.

## Validation Evidence

- `uv run pytest tests/scenario/test_cli.py` passed before migration; after migration, `uv run pytest tests/scenario/test_cli.py tests/scenario/test_plugins.py` passed.
- Equivalent focused package gates passed through the repo pnpm configuration path: `corepack pnpm@11.8.0 --config.strict-dep-builds=false --config.verify-deps-before-run=false --dir ts --filter @asdl/ccc run test` and the matching `@asdl/pi-extensions` command.
- Full focused suites passed directly and through repo commands: `just ts-test` passed with 286 files / 2870 tests; `uv run pytest -n auto --ignore-glob='*/integration/*'` passed with 576 tests.
- Type/lint/format gates passed: `just ts-deps-check`, `just ts-guard`, `just ts-check`, `just ts-format-check`, `just ts-lint`, `just dprint-check`, `uv run ruff check`, `uv run ruff format --check`, and `uv run ty check`.
- Stale surface checks passed except for the explicit retirement note: `rg -n "asdl exec cmux-workspace-summary|asdl exec resolve-prompt|asdl exec gh review-threads|asdl exec gh resolve-review-threads|pi\\.exec\\(\\\"asdl\\\"|\\\"asdl\\\", \\[\\\"exec\\\"" ts skills docs tests src` returns only `docs/asdl-exec/cmux-workspace-summary.md` explaining the retired former command; review-thread grep returns no matches.

## Objective Impact

The final-cleanup row for root `asdl exec` disposition is now resolved: active callers no longer cross into `src/asdl_tools/**`, useful behavior has TypeScript ownership, unused GitHub review-thread operations are retired, and the remaining Python root package role is explicitly limited to the plugin dispatcher rather than hidden exec commands.
