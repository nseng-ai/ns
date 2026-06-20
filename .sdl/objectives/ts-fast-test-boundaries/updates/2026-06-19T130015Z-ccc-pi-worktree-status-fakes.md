# CCC/Pi Worktree-Status Fake-Driven Split

## Summary

The CCC/Pi worktree-status slice now keeps sqlite and temp-Git setup out of the default TypeScript test path.

Default-path changes:

- `packages/ccc/src/worktree-status/graphite-metadata.ts` exposes a narrow `GraphiteMetadataDbAccess` seam for default tests while preserving the real sqlite CLI adapter as the runtime default.
- `packages/ccc/test/worktree-status-graphite-metadata.test.ts` uses fake DB access for missing DB, tracked/untracked branch metadata, schema mismatch, children parsing, sqlite-unavailable/read-failed mapping, and malformed row data; worker lifecycle coverage remains fake-driven through worker factories.
- `packages/ccc/test/worktree-status.test.ts` uses fake metadata/identity helpers instead of temp `.git` roots or sqlite metadata DB writes.
- `packages/pi-extensions/src/worktree-status.ts` accepts worktree-status-specific loader dependencies for identity, local status, GH status, identity-currentness, and footer branch reading.
- Pi extension worktree-status lifecycle tests use queued fake loader dependencies for rendering, activity, refresh, timer, and footer behavior instead of real temp repos.

Retained integration coverage:

- `packages/ccc/test/integration/worktree-status-fixtures.ts` owns the real sqlite/temp-Git helpers.
- `packages/ccc/test/integration/worktree-status-graphite-metadata.test.ts` retains real sqlite adapter coverage for a happy-path Graphite metadata DB, schema mismatch, and the copied current asdl-tools Graphite metadata fixture.

## Objective Impact

This partially completes the sqlite/worktree-status roadmap row for the CCC and Pi extension worktree-status default path. The default CCC/Pi worktree-status tests are now fake-driven at the Graphite metadata and Pi lifecycle seams, while representative real sqlite coverage remains intentionally runnable through the integration suite.

The broader roadmap row remains open because the separate slot real Git/Graphite gateway tests and the small sdl checkpoint-flow scenario were explicitly outside this slice and still need separate assessment.

Validation evidence:

- Targeted default Vitest passed for the six affected CCC/Pi files.
- `pnpm`/Vitest integration passed for `packages/ccc/test/integration`.
- Default and integration file-list checks confirmed integration files are excluded from default Vitest and included in the integration suite.
- Stale-fixture grep found no default CCC/Pi `makeGraphiteRepo`, `makeGitRepo`, `writeGraphiteMetadataDb`, `runSqliteStatements`, or `withTempRoot` usage. Remaining `.graphite_metadata.db` matches are inert constants/protocol strings, not default sqlite setup.
- Full default Vitest, full integration Vitest, formatting check, lint, `tsgo` check, legacy `tsc` check, Syncpack dependency check, and the no-`as unknown as` guard passed locally using installed binaries or `just` equivalents. The ordinary `pnpm --dir ts run ...` path still hits local ignored-build preflight unless dependency verification is disabled; comparable timing commands used `--config.verify-deps-before-run=false`.

Performance evidence:

- Baseline affected-default command measured at detached branch HEAD `b02ff4850`:
  - `/usr/bin/time -p corepack pnpm@11.8.0 --config.verify-deps-before-run=false --dir <baseline>/ts run test packages/ccc/test/worktree-status-graphite-metadata.test.ts packages/ccc/test/worktree-status.test.ts packages/pi-extensions/test/worktree-status.test.ts packages/pi-extensions/test/worktree-status-activity.test.ts packages/pi-extensions/test/worktree-status-refresh.test.ts packages/pi-extensions/test/worktree-status-refresh-timer.test.ts`
  - Result: 6 files / 77 tests; Vitest duration 1.59s; real time 2.76s.
- Post-change affected-default command in this branch with the same test-file selection and pnpm option:
  - Result: 6 files / 62 tests; Vitest duration 277ms; real time 0.97s.
- Retained integration cost:
  - `/usr/bin/time -p corepack pnpm@11.8.0 --config.verify-deps-before-run=false --dir ts run test:integration packages/ccc/test/integration`
  - Result: 1 file / 3 tests; Vitest duration 231ms; real time 0.76s.
- Repetition/noise notes: timings are single local samples with warm dependencies. A first attempt with plain `pnpm --dir ts run test ...` failed before tests due local `ERR_PNPM_IGNORED_BUILDS`; the comparable baseline/post commands disabled pnpm dependency verification to measure Vitest rather than dependency preflight.
- Cost handling: sqlite/temp-Git cost was shifted from the default CCC/Pi worktree-status path into explicit integration coverage, not deleted.
- Coverage retention: the integration tests retain real sqlite query/schema compatibility and copied Graphite metadata fixture parsing; default tests retain status semantics through typed fakes and worker factory fakes.

## Follow-Ups

- Assess the remaining slot real Git/Graphite gateway tests in a separate slice.
- Assess whether `packages/sdl/test/scenario/cp-cli.test.ts` still belongs in this Objective row or is already sufficiently fake-driven.
- If future measured integration cost becomes material, consider consolidating integration fixture cases without moving sqlite setup back into the default suite.
