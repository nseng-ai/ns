# TypeScript brmem delete CLI slice

## Summary

Implemented the public TypeScript `brmem delete` operation in `ts/packages/brmem`. The command now routes to a real operation instead of the `not_implemented` placeholder, validates through the shared Entry request resolver, deletes through the existing gateway seam, wraps missing-key gateway errors in the stable public `No Entry to delete` message, and renders Python-compatible human success lines.

Added fake-driven scenario coverage for success output, success JSON fields, missing-key human/JSON failure, sibling preservation, Base Namespace behavior and `--namespace base` normalization, validation failures, explicit-branch behavior under detached HEAD, omitted-branch detached HEAD failure, eager `--json-schema`, and non-key gateway failure mapping. `copy`, `export`, and hidden `exec resolve-prompt` remain explicitly unimplemented.

Validation passed:

- `pnpm --dir ts/packages/brmem run check`
- `pnpm --dir ts/packages/brmem run test`
- `pnpm --dir ts exec vitest run --config vitest.config.ts packages/clinkr/test packages/brmem/test`

## Objective Impact

This completes the roadmap row `Port write operations: put and delete`. TypeScript brmem now has both write operations covered by the package CLI and tests while preserving the established git-ref storage seam and public CLI contract boundaries. The write row is marked `[x]` in `roadmap.md` with evidence for `delete` behavior and validation.

## Follow-Ups

- Continue with the next roadmap row: `copy` and `export`.
- Keep `exec resolve-prompt`, wrapper/skill cutover, Python fallback retirement, and TypeScript consumer rewiring out of this completed slice until their own roadmap rows are selected.
