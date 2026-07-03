# TypeScript brmem First Slice Implemented

## Summary

Created the first `@asdl/brmem` TypeScript implementation slice under `ts/packages/brmem`.

The package now has its own metadata, `check` and `test` scripts, curated exports, a `brmem` Clinkr CLI shell, pure Snapshot Ref / Entry Locator helpers, validation helpers, Python-compatible key-glob matching for durable cases, a semantic `BrmemGateway`, constructor-state `FakeBrmemGateway`, and a package-local `RealGitBrmemGateway` foundation.

The TypeScript CLI registers the visible public command tree (`put`, `get`, `delete`, `list`, `check`, `copy`, `export`) plus hidden `exec resolve-prompt`. The read-only `get`, `check`, and `list` operations are implemented. Write/export/prompt paths return explicit `not_implemented` failures so this slice does not silently imply public cutover readiness.

## Objective Impact

This advances the Objective from contract inventory into a working TypeScript package boundary and storage seam:

- `ts/packages/brmem` is included in the TS workspace and validates independently.
- Read-only CLI behavior covers structured JSON envelopes, exit codes, and Python-compatible public field names (`ref_name`, `head_sha`, `size_bytes`, etc.).
- Storage layout helpers preserve Base Namespace vs named Namespace Snapshot Refs and Entry Locator parsing/building.
- The real-git adapter implements read and write-capable storage foundations (`putEntry`, `deleteEntry`, `copyEntries`) with tests confined to throwaway temporary repositories.
- Scenario tests verify command shape, hidden `exec` discoverability boundary, not-implemented write command failures, and read-only operation envelopes.
- Compatibility bar used in this slice: exact exit codes and structured JSON field names/values, plus key human-output substrings/content-only behavior rather than byte-for-byte prose parity.

Validation evidence:

```bash
pnpm --dir ts/packages/brmem run check
pnpm --dir ts/packages/brmem run test
pnpm --dir ts run check
pnpm --dir ts run test
```

All four commands completed successfully. The full TS test run reported `167 passed` test files and `2042 passed` tests.

## Follow-Ups

- Add explicit Python↔TypeScript cross-language parity probes in the dedicated storage-parity row; this slice covered real-git behavior in throwaway repositories but did not shell out to the Python CLI.
- Revisit exact human-output prose and trailing-newline behavior during public cutover if wrappers or skills prove they depend on byte-for-byte output.
- Implement public write/export/prompt commands in later slices before changing installed `brmem` wrappers or skill invocation paths.
