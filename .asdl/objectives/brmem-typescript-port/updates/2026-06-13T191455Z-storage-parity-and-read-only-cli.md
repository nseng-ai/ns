# Storage Parity and Read-Only CLI Rows Completed

## Summary

Subsequent branch evidence after the first TypeScript `brmem` slice completed the package-boundary, storage-parity, and read-only-operation roadmap rows.

The TypeScript package now has the durable shape required for the Objective: `ts/packages/brmem` package metadata, curated exports, a Clinkr CLI shell, a package-local `BrmemGateway`, constructor-state fake gateway, and a real git-backed gateway. The read-only public operations `get`, `check`, and `list` are implemented with scenario coverage for human and JSON behavior, exit codes, branch/namespace resolution, and historical reads.

The storage seam now has explicit Python↔TypeScript parity coverage in `ts/packages/brmem/test/gateways/python-parity.test.ts`. The probes cover Python-written Base/named/nested Entries read and listed by TypeScript, TypeScript-written workflow Namespace Entries read and checked by Python, and TypeScript key-glob copy preserving Python-readable destination Entries.

## Objective Impact

The roadmap now treats these rows as complete:

- Define the TypeScript migration boundary and package shape for `brmem`.
- Port the git-ref storage layer and prove cross-language parity.
- Port read-only operations: `get`, `check`, `list`.

This update supersedes the earlier first-slice follow-up that said explicit Python↔TypeScript parity probes still needed to be added. That earlier update remains immutable historical context; the current branch evidence adds the dedicated parity probes and the temporary CI Python/`uv` dependency needed to run them while the Python reference remains in-repo.

The core storage-parity risk is partially de-risked, but it remains relevant for later public CLI surfaces. Future rows should add new parity probes only where `put`, `delete`, `copy`, `export`, or `exec resolve-prompt` expose behavior not already covered by the package-local storage seam.

Validation evidence: local branch diff against `master`; Graphite parent `master`; PR #1439 corroborates the same branch file set. Branch validation evidence includes the TypeScript package/workspace checks recorded in the first-slice update, plus the current branch commits that add Python parity coverage and review fixes.

## Follow-Ups

- Implement the public write command surfaces next, starting with `put` and `delete`; the gateway has write foundations, but the public CLI still intentionally returns `not_implemented` for write/export/prompt paths.
- Keep the temporary Python/`uv` setup in the TypeScript CI job only while the Python parity oracle exists; remove it when `packages/brmem` is retired and the parity tests are deleted.
- Continue preserving the no-consumer-rewire boundary: existing TypeScript consumers remain parked follow-up work until native `brmem` is TypeScript-default.
