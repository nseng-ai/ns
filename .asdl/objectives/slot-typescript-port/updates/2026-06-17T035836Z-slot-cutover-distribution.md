# Semantic Update: slot TypeScript cutover distribution Phase A

## Summary

Completed the automated Phase A cutover work for making the TypeScript `@asdl/slot` package the default standalone `slot` install path:

- Added `just install-slot`, backed by the shared TypeScript source-shim renderer and `ts/packages/slot/src/cli.ts`.
- Routed `just install-tools` through `install-slot` and removed the editable uv install of `packages/asdl-slots` from that bundle.
- Kept stale uv-tool cleanup non-fatal and before shim rendering via `_uninstall-slot-uv-tool`, so cleanup cannot remove the final `~/.local/bin/slot` shim.
- Added temp-path scenario coverage for rendered source-shim behavior: slot CLI path rendering, enclosing-checkout precedence, canonical-checkout fallback, missing `ts/node_modules` install guidance, and missing checkout/canonical reinstall guidance.
- Ported the user-facing README to `ts/packages/slot/README.md` and updated installation, shell integration, CLI surface, and TypeScript-default wording.
- Reconciled the previously completed OS-coupled roadmap row after rechecking live code/test anchors for shell, completion, cd-directive suppression, and clipboard failure/skipped fields.

## Objective Impact

The TypeScript `slot` CLI is now the intended public default install path for automated repository tooling. `just install-tools` no longer installs `packages/asdl-slots` as the public `slot` tool, while `objective` remains an editable uv tool.

The Python fallback is deliberately still present in the workspace for rollback until manual install/shell parity is confirmed. The roadmap cutover row remains unchecked because user-owned real-shell parity is still pending; this update records automated Phase A evidence only.

## Manual Gate Before Phase B

Do not delete `packages/asdl-slots` or remove the Python `asdl.plugins` slot surface until the user confirms manual TypeScript shim and shell-wrapper parity. Suggested checks:

```bash
just install-slot
command -v slot
slot --version
slot shell show --shell zsh
slot completion show --shell zsh
```

For real shell behavior, source the wrapper in a throwaway shell/rc context, run a navigation command such as `slot goto -n 1` or `slot checkout <branch>` in a safe repo with slots configured, confirm the parent shell changes directory, and confirm `slot ... --format json` / `slot ... --json-schema` do not cd.

## Validation

Planned Phase A validation:

```bash
pnpm --dir ts/packages/slot run check
pnpm --dir ts/packages/slot run test
uv run pytest tests/scenario/test_ts_source_cli_shim.py
just dprint-check
```

Record the final pass/fail results in the implementation report.
