# TypeScript brmem copy CLI slice

## Summary

Implemented the public TypeScript `brmem copy` operation in `ts/packages/brmem`. The standalone TypeScript CLI now routes `copy` to a real operation instead of the `not_implemented` placeholder, while `export` and hidden `exec resolve-prompt` remain explicitly out of scope.

The copy operation preserves the accepted public contract for this slice: exactly one copy scope (`--base` or `--namespace`), `--namespace base` as the Base Namespace alias, required `--from-branch` / `--to-branch`, `--key-glob`, `--overwrite`, `--dry-run`, Python-compatible JSON field names (`source_ref`, `destination_ref`, `source_sha`), Copy Conflict failures before mutation, source-SHA preflight through `checkEntry`, and final mutation through the existing gateway `copyEntries` seam.

Added scenario coverage for help/schema output, Base Namespace human output, named Namespace JSON envelopes, `--namespace base`, scope and value validation failures, empty source and zero glob matches, conflict non-mutation, late `copy_conflict` mapping to public `destination_conflict`, full-snapshot overwrite, key-glob overwrite that preserves non-matching destination Entries, `foo/*` matching nested keys while not matching sibling prefixes, dry-run non-mutation, lower-level copy gateway failures, source-SHA preflight failure, and RealGitBrmemGateway dry-run/overwrite ref evidence.

## Validation Evidence

Passed:

- `pnpm --dir ts/packages/brmem run check`
- `pnpm --dir ts/packages/brmem run test`
- `pnpm --dir ts run check`
- `pnpm --dir ts exec vitest run --config vitest.config.ts packages/clinkr/test packages/brmem/test`

Attempted full TypeScript workspace tests:

- `pnpm --dir ts run test` — failed in existing `packages/asdl-dev/test/scenario/preview-url-cli.test.ts` cases because `asdl-dev cp` is currently reported as `unknown command 'cp'`. The failures are outside the brmem package and not caused by this copy slice.

## Objective Impact

The combined roadmap row `Port copy and export` is now marked `[~]`: public TypeScript `copy` is implemented and validated, but `export` remains pending and the row must not be marked complete until export is implemented and validated.

## Follow-Ups

- Implement the public TypeScript `brmem export` operation in a later slice.
- Keep `exec resolve-prompt`, wrapper/skill cutover, Python fallback deletion, and TypeScript consumer rewiring out of this slice until their own roadmap rows are selected.
