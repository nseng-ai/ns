# CLI surface pinning suites written for all four CLIs; help-byte fixtures stale vs `--runtime`

## Summary

Scenario suites pinning current CLI behavior now exist for all four migration targets (local branch diff against Graphite parent `clinkr-v1-framework`; PR #1223 corroborates the same file set):

- `ts/packages/plans/test/scenario/cli.test.ts` (new): top-level help/`-V` bytes, unknown-command stderr, bare/unknown `exec` dispatch, inline-equals rejection, duplicate `--format` precedence, byte-exact `list`/`exec write`/`exec resolve` JSON and human output, input-exclusivity and path-validation failure bytes.
- `ts/packages/planned-branch/test/scenario/cli.test.ts` (extended): a "CLI surface pinning" block adding `-V` bytes, inline-equals rejection for `create`, last-duplicate-flag-wins, byte-exact create success JSON, flag order independence, and `load-plan` positional placement/duplicate errors.
- `ts/packages/asdl-dev/test/scenario/preview-url-cli.test.ts` (extended): top-level help bytes, absence-of-version-flag pinning, inline `--branch=value` support, compact preview-url JSON failure bytes.
- `ts/packages/pr-address/test/scenario/cli.test.ts` (extended): top-level help/`-V` bytes, machine-envelope `--format` detection rules (inline `--format=json` not recognized; first flag wins), and indent-2 `ensure_ascii` machine envelope bytes.

These pin both the user-facing surface (help, exit codes, parse-failure channels, flag quirks) and the exact legacy `--format json` shapes that each command's `legacyMachine` hook must reproduce after migration.

A small adjacent fix landed on the same branch: the pr-address shim wrapper test used a wrong option name (`outsideCheckout` → `isOutsideCheckout`), which broke `tsc --noEmit`; fixed.

## Objective Impact

- Roadmap row "Pin current CLI behavior with scenario tests where coverage is missing" moved to `[~]`, not `[x]`: the help-byte fixtures in the new surface-pinning blocks were captured against pre-`--runtime` help text, while the `--runtime` diagnostic option (commit `124226f9`, "Add `--runtime` diagnostic option to all CLIs") is already an ancestor of this branch. Verification: per-package Vitest runs fail — 4 tests in `plans`, 3 in `planned-branch`, 5 in `asdl-dev`, 3 in `pr-address` (15 total), all the same root cause (stale `Usage:` line / missing `--runtime` row in expected help bytes). Typecheck (`tsc --noEmit`) passes across the workspace; the failures are fixture-content-only.
- The correct resolution is to refresh the fixtures to current help output: `--runtime` is intended, durable CLI surface that the clinkr migrations must preserve (clinkr-generated help will need to carry it or the divergence must be called out explicitly per the no-contract-redesign non-goal).
- Everything else in the new suites passes; the JSON-envelope and flag-quirk pins are trustworthy migration baselines as-is.

## Follow-Ups

- Refresh the stale help-byte fixtures in the four surface-pinning test blocks to include `--runtime`, re-run the four package Vitest suites green, then mark the roadmap row `[x]`. This should happen on this branch before PR #1223 merges.
- When migrating each CLI to clinkr, account for `--runtime` as part of the preserved surface (it is now byte-pinned).
