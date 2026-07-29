# Source CLI Shim Subprocess Split

## Summary

Split the shared source CLI shim subprocess smokes out of the default TypeScript lane for the `areg`/`aretro` source-shim family.

The implementation added a small pure renderer core for `ts/scripts/render-cli-shim.mjs`. Default tests now exercise renderer semantics without real subprocesses: token replacement, shell quoting of adversarial checkout paths, fallback-mode defaulting/validation, unrendered-token absence, and byte-for-byte checked-in `skills/branch-retro/scripts/aretro-run` drift detection. Real `node` renderer execution and real `bash` syntax/runtime smoke coverage now live in package-local integration tests under `ts/packages/areg/test/integration/` and `ts/packages/aretro/test/integration/`.

No generated runner/template output changed, so `skills/branch-retro/scripts/aretro-run` was not regenerated. No speedup is claimed from this update; the durable claim is cost placement and coverage retention.

## Objective Impact

This completes the shell/source-shim subprocess candidate called out by the prior rebaseline. It reinforces the Objective heuristic that tiny script installers can often use a pure core plus a thin CLI adapter rather than a broad process or filesystem gateway.

Coverage and placement evidence:

- `rg -n 'node:child_process|spawnSync\(' ts/packages/areg/test/unit/source-cli-shim.test.ts ts/packages/aretro/test/unit/source-cli-runner.test.ts` returned no matches.
- Default Vitest discovery lists the pure `areg` and `aretro` unit tests only.
- Integration Vitest discovery lists `source-cli-shim-runtime.test.ts` and `source-cli-runner-runtime.test.ts`.
- Focused default and integration tests passed, as did `just ts-format-check`, `just ts-lint`, `just ts-check`, `just ts-test`, `just ts-test-integration`, `just ts-deps-check`, and `just ts-guard`.

The roadmap now treats the source-shim subprocess smokes as completed and leaves the `areg` real-filesystem gateway suite as a later classification candidate.

## Follow-Ups

- Do not treat source-shim subprocess smokes as pending in the next default-suite rebaseline.
- Classify `ts/packages/areg/test/gateways/real-gateways.test.ts` separately before moving it; temp filesystem use alone may not justify integration placement.
