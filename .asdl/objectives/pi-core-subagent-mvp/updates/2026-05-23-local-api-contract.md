# Local API Contract Added

## Summary

The first local implementation slice added a child-session contract module in `ts/packages/pi-extensions/src/run-child-session.ts` and a focused consumability test in `ts/packages/pi-extensions/test/run-child-session.test.ts`.

The module exports the local public TypeScript surface for terminal statuses, failure statuses, terminal tool definitions, child-session options, progress, terminal capture metadata, and the `ChildSessionResult` union. It also exports `runChildSession(pi, ctx, options)` as the package-local helper contract.

The helper intentionally returns a deterministic `error` result with a not-implemented diagnostic. This proves the callable signature and result-union shape without pretending that child process execution, JSONL parsing, terminal runtime injection, or provider/model behavior exists yet.

After review, stable npm-style package exports/subpaths are explicitly out of scope for this slice. The current consumers are repo-local extension modules/tests, and no real parent-facing runtime consumer exists yet, so source-local imports are acceptable until a consumer proves a need for package wiring.

Evidence: local branch diff against Graphite parent `add-local-run-child-session-api-contract` adds only the contract module and its tests. Verification passed for the targeted package test/check and the TypeScript workspace test/check. No real provider/model calls were made.

## Objective Impact

PR 1's local type/helper surface is now materially complete:

- `ts/packages/pi-extensions` exposes local public child-session contract types.
- Local extension code can import and call the helper/type surface without Pi core changes.
- The helper contract remains extension-layer/package-local and does not add `ctx.runChildSession()` or modify `ExtensionCommandContext`.
- Terminal result metadata is shaped around tool name, optional tool call id, mapped terminal status, and validated input; no public terminal `details` contract was introduced.
- Progress and `sessionFile?: string` remain minimal and optional so later child process/session discovery slices can fill them in.

The roadmap now marks the PR 1 type surface, helper contract, consumability test, Objective update, targeted validation items, and package/export wiring decision complete. Package/plugin wiring for PR 1 is resolved by explicit deferral: do not add stable npm-style exports, subpaths, or new Pi resource wiring until the first real repo-local parent-facing extension consumer exists. Actual subprocess execution, JSONL parsing, child runtime extension injection, terminal capture behavior, progress UI, docs, and first-consumer proof remain for later PRs.

The exact helper-signature open question is narrowed: the initial local contract is `runChildSession(pi, ctx, options)`, while future slices may still decide whether to add an ergonomic factory or wrapper around that function.

## Follow-Ups

- Implement the child process runner and JSON event parser with fake-driven tests.
- Revisit package/export wiring only when a real parent-facing local extension consumer needs a stable package subpath rather than source-local imports.
- Implement injected child terminal-capture runtime behavior before treating `completed` or `blocked` as real runtime outcomes.
- Keep later Objective updates limited to the behavior that each PR actually lands.
