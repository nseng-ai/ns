# Default Suite Rebaseline After Source-Shim Split

## Summary

Rebaselined the current default TypeScript test suite after the completed `asdl-core` and source-shim subprocess splits.

The previously parked `areg` real-filesystem gateway candidate was classified first. `ts/packages/areg/test/gateways/real-gateways.test.ts` remains in the default lane with 14 tests. Vitest discovery listed only that file's default tests, and focused timing over five post-warmup samples for `pnpm exec vitest run --config vitest.config.ts packages/areg/test/gateways/real-gateways.test.ts` was mean `0.729s`, min `0.715s`, max `0.738s`. Verbose Vitest reported the file at `211ms` total process duration and `32ms` in-test time, with individual tests at `0ms`-`8ms`.

Classification: most `areg` cases use inert temp filesystem fixtures for path-safety, symlink, local skill, settings, and cleanup behavior; Git behavior is injected with `InMemoryGitGateway`; GitHub and `npx skills` behavior is covered with scripted command runners; the skillx workspace case mutates only a fake local workspace through `MutatingNpxSkillsGateway`. The only real host-environment check is a tiny PATH lookup over a temp `bin/gh` file. This does not currently justify moving the `areg` suite to integration, because temp filesystem use alone is not an integration leak and no slow real subprocess, Git, sqlite, network, or wall-clock boundary is exercised by default.

A full default Vitest JSON run then passed and produced a slow-test inventory. The clearest next boundary candidate is `ts/packages/sdl-core/test/testing-export.test.ts`, specifically `temp git repo helper initializes a committed main branch`. That test calls `createTempGitRepo`, whose implementation runs real `git init`, `git config`, `git add`, and `git commit` through `spawnSync`. In the default run, that single test reported about `149.8ms`, and the file reported about `153.3ms`, making it a concentrated real-Git default-lane smoke. The default suite still has a cheap export-shape assertion for `createTempGitRepo`, so the real behavior smoke can likely move to an integration test without losing default-path package export coverage.

Other observed slow default files were mostly SDL project-local CLI scenario tests using scripted gateways and command-registry loading; they may deserve later performance work, but they are not as clean a real-boundary migration slice as the `@sdl/core/testing` temp Git helper.

## Objective Impact

This rebaseline parks `areg` as a non-actionable migration candidate for now and identifies the next bounded slice: move or split the `@sdl/core/testing` temp Git repo helper behavior smoke out of the default lane into the TypeScript integration lane, while keeping default export/import coverage for the testing subpath.

The finding reinforces the existing Objective rule that temp directories are not automatically integration, while real Git process setup remains a strong integration-boundary signal when it appears in the default suite.

## Follow-Ups

- Recommended next implementation slice: migrate the real `createTempGitRepo` behavior smoke from `ts/packages/sdl-core/test/testing-export.test.ts` into `ts/packages/sdl-core/test/integration/`, retaining default-lane export-shape coverage for `createTempGitRepo`.
- Capture before/after targeted timing for `pnpm exec vitest run --config vitest.config.ts packages/sdl-core/test/testing-export.test.ts` if claiming a default-suite speedup.
- Do not treat `ts/packages/areg/test/gateways/real-gateways.test.ts` as pending migration unless future evidence shows real subprocess, Git, sqlite, network, wall-clock, or meaningful slow default-lane cost.
