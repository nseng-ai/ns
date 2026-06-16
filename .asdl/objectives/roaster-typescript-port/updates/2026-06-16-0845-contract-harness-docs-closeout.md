# Contract, Harness, and Docs Closeout Landed

## Summary

The remaining closeout work for the TypeScript roaster port is implemented. `roaster review run --format json` now emits a single JS-native camelCase result data contract with one findings home and no nested findings `payload`. Roaster-owned publication parsing now strict-parses the exact success contract, the explicit failed-envelope fallback path, and the bare inline-posting result contract; tests reject old nested and snake_case success shapes.

The harness cleanup is also landed: `FakeHarnessGateway` uses the shared record/map normalization helper, and the harness concerns are split into dedicated prompt, diff-cap, output, and gateway modules with tests importing helpers from their canonical modules.

The install/docs closeout is landed without editing ADRs. The repo now has `just install-roaster`, docs-site install/tooling pages describe the TypeScript source shim instead of `uv tool install roaster` or `asdl roaster`, `AGENTS.md` no longer uses deleted Python roaster paths as canonical examples, and `CONTEXT-MAP.md` now treats roaster as `ts/packages/roaster` / `@asdl/roaster`.

Verification: `pnpm --dir ts --filter @asdl/roaster run test`, `pnpm --dir ts --filter @asdl/roaster run check`, `pnpm --dir ts run test`, `pnpm --dir ts run check`, `just docs-check`, and `just dprint-check` passed. Stale-reference greps were reviewed: remaining matches are valid TS package paths, generic Python plugin documentation, request/prompt snake_case fields that are not the review-run success data contract, or negative regression tests.

## Objective Impact

This completes the final active non-parked roadmap work. The publication contract regression is de-risked, the harness module boundary cleanup is complete, and Python-era documentation/install drift no longer blocks closure. The earlier CI cutover and Python deletion evidence remains valid, and the current closeout diff supplies the final contract/docs validation evidence.

The Objective is ready to close as completed. The parked TS plugin-mounting decision remains intentionally out of active scope because TS roaster ships standalone-only unless a later product decision revives plugin mounting.

## Follow-Ups

- If a future product decision revives TypeScript umbrella/plugin mounting, track it as separate work rather than reopening this completed port Objective.
- Keep ADR edits out of this closeout; any future ADR refresh should be a separate documentation/design-history task.
