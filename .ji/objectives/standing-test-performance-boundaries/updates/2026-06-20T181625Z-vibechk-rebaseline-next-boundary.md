# Vibechk Real-Git Move and Next Boundary Rebaseline

## Summary

Moved the `@asdl/vibechk` real-Git `run` smoke out of the default TypeScript lane and into the documented TypeScript integration lane. The fast default suite retains fake-driven `vibechk run` coverage for bundle writing, run IDs, result-branch naming, checkout restoration through `FakeGitGateway`, no-change behavior, dirty-workdir rejection, and walking-skeleton `run`/`show`/`diff` behavior.

Post-migration discovery showed the moved test is absent from the default lane and present under `packages/vibechk/test/integration/run-command-real-git.test.ts` in the integration lane. No speedup timing was measured, so the durable claim is cost placement: the real Git repository setup and `RealGitGateway` smoke are now excluded from default discovery/execution and retained in integration.

A read-only rebaseline of default TypeScript tests found the next clearest boundary family in `ts/packages/asdl-core/test/exec.test.ts`: default-path tests spawn real Node child processes, exercise stdin/stdout/stderr, timeout/kill behavior, startup errors, and small real timer delays around the core `runCommand` adapter. Those are meaningful adapter smokes, but they match the Objective's subprocess/runtime-boundary heuristic better than inert temp-directory fixture tests.

## Objective Impact

This confirms the current migration pattern still works for package-local real-adapter smokes: keep fake-driven behavior in default tests, move the retained real boundary to `test/integration`, and prove placement with Vitest list commands.

The rebaseline row remains open but now has a concrete recommended next slice: split `asdl-core` real child-process `runCommand` coverage from `test/exec.test.ts` into an integration test while leaving pure presentation/normalization helpers in the default suite. Candidate ranking from this sweep:

- Strong next slice: `ts/packages/asdl-core/test/exec.test.ts` real subprocess and timer-backed `runCommand` tests.
- Plausible later slice: shell/source-shim smoke tests in `ts/packages/areg/test/unit/source-cli-shim.test.ts` and `ts/packages/aretro/test/unit/source-cli-runner.test.ts`, which use `spawnSync` with `node`/`bash`.
- Plausible later slice: `ts/packages/areg/test/gateways/real-gateways.test.ts`, a large real-filesystem/symlink gateway suite that may need finer classification before moving because many cases are inert fixture inspection rather than external runtime boundaries.
- Lower priority / likely default-acceptable: roaster gateway tests using temp directories with scripted command executors and in-memory git; they exercise filesystem fixture parsing but not real Git or subprocess boundaries.
- False positives: Graphite/sqlite strings in CCC/SDL tests that are scripted fake command protocols, plus temp directories used only as inert fixture roots and manual timer tests using `@asdl/core/testing`.

## Follow-Ups

- Recommended next bounded slice: migrate the real child-process `runCommand` adapter coverage from `ts/packages/asdl-core/test/exec.test.ts` into `ts/packages/asdl-core/test/integration/`, preserving default tests for pure formatting, normalization, command presentation, and manual-timer seams.
- Before moving the `asdl-core` slice, classify whether timeout behavior should remain as a real integration smoke only or also gain a fake scheduler/default-path assertion for adapter-independent timeout planning.
- Do not treat temp-directory use alone as an integration leak; continue distinguishing inert filesystem fixtures from real subprocess, real Git, sqlite, or wall-clock boundaries.
