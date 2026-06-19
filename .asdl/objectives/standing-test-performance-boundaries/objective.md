# Standing Test Performance Boundaries

## Thesis

Keep the repository's default test suites fast, deterministic, and suitable for frequent local use by repeatedly finding tests that exercise integration boundaries from unit/default-test locations, replacing their default-path coverage with fake-driven unit tests or scenario tests, and retaining representative real-adapter coverage in explicit integration-test locations.

This standing Objective exists because the current TypeScript stack proved a repeatable resolution pattern: real Git, sqlite, cold Node runtime, subprocess, and wall-clock behavior should not accidentally live in the fast/default lane. The fast lane should verify behavior through injected seams and fakes; the integration lane should intentionally preserve the real boundary smoke coverage.

## Scope

- Periodically inspect active test suites for slow or flaky default-path tests whose cost comes from real integration boundaries, including real Git repositories, Graphite metadata/sqlite fixtures, subprocess or CLI cold-start checks, filesystem-heavy setup, network/backend adapters, real sleeps, wall-clock timing, or other runtime boundaries.
- For each selected slice, preserve behavior coverage by adding or strengthening the appropriate default-path fake-driven unit tests or scenario tests before or while moving real-boundary coverage to integration tests.
- Move retained integration coverage to the suite's established integration location. For TypeScript packages, use `ts/packages/<package>/test/integration/**/*.test.ts` and the existing `pnpm --dir ts run test:integration` / `just ts-test-integration` lane. For Python packages, follow the package's `tests/integration/` convention when an analogous split is needed.
- Add or refine narrow testing seams when an existing production boundary makes default-path tests depend on real systems. Prefer explicit gateway injection, in-memory fakes, command/process/sqlite adapters, and existing `@asdl/core` `Clock` / `TimerScheduler` seams for TypeScript time-sensitive behavior.
- Record durable evidence when claiming performance improvement: measured command, baseline timing, post-change timing, repetition/noise notes, whether cost was eliminated or shifted to integration, and coverage retention.
- Keep documentation and conventions current when a repeated test-boundary pattern becomes broadly applicable.

## Non-Goals

- Do not remove real-adapter, runtime, or integration coverage merely to make the default suite faster.
- Do not move tests to integration without equivalent default-path behavior coverage when that behavior still belongs in the fast lane.
- Do not preemptively introduce broad shared abstractions, global clock overrides, lint rules, or test framework rewrites without concrete slow-test evidence.
- Do not treat every slow test as wrong; some scenario tests are legitimately user-facing default coverage if they remain deterministic and cheap.
- Do not make integration tests hidden behind environment variables or silently fold them back into default commands.
- Do not submit PRs, mutate GitHub, change external systems, publish packages, or deploy anything as part of this Objective unless a human explicitly requests that broader workflow.

## Completion Criteria

This is a standing Objective. It has no goal-met finish line. Close it when the standing goal is obsolete, superseded by another Objective, no longer worth maintaining, or intentionally abandoned by a human.

Retirement evidence should explain why periodic test-boundary maintenance is no longer useful or where the durable tracking moved.

## Definition of Progress

Progress is keepable when:

- A concrete default-path test-performance problem is identified from evidence such as slow-test timing, repeated local pain, flaky real-boundary setup, or inspection of tests that use real integration resources from unit/default locations.
- The selected slice preserves or improves behavioral confidence by adding fake-driven unit coverage, scenario coverage, or a documented integration smoke test at the right layer.
- Real-boundary tests that remain valuable are moved to or kept in an explicit integration lane with an intentional command.
- Any new production seam is narrow, named for the boundary it abstracts, injected at the relevant composition point, and covered by tests.
- Performance claims include before/after evidence and clearly distinguish default-suite speedup from cost shifted into the integration suite.
- The relevant targeted tests pass, and the chosen validation covers both the fast replacement coverage and the retained integration smoke coverage when applicable.

Do not keep changes that:

- Only hide, skip, or delete slow coverage without an equivalent confidence story.
- Make the default suite depend on new real services, sleeps, broad runtime setup, or hidden environment requirements.
- Introduce a generic abstraction without a concrete slow-test or determinism problem justifying it.
- Leave a moved test orphaned from the documented integration command.

Useful evidence includes:

- A short slow-test inventory or targeted timing sample for the candidate files.
- Boundary classification: unit/default behavior, scenario behavior, or integration behavior.
- File moves or new tests showing where coverage now lives.
- Timing before and after the slice, with noise notes.
- Validation commands for the affected default and integration tests.

## Runner Policy

This Objective is designed for autonomous small-slice pursuit under the boundaries below.

- Direct execution is allowed when a runner can choose one bounded test-boundary slice with clear evidence, preserve coverage, and validate it locally without changing external systems.
- Direct execution may edit production code only to add or use a narrow testing seam required to make the default-path coverage fake-driven and deterministic.
- Direct execution may move tests into established integration folders, add fake-driven unit or scenario tests, update package-local test docs, and write Objective updates when material progress or changed assumptions should be remembered.
- Steer or ask first before changing global test commands, CI topology, repository-wide testing conventions, public APIs, broad shared abstractions, or any behavior whose coverage-retention story is ambiguous.
- Steer or ask first before deleting coverage outright, weakening assertions materially, or treating a slow scenario test as integration-only when it is the sole user-visible behavior coverage.
- Validation before keeping work should include targeted default-path tests for the replacement coverage, targeted integration tests for retained real-boundary coverage when applicable, and the relevant package/workspace checks for the touched language when practical.
- Work may be left as a candidate plan instead of code when the seam design is unclear, the test's proper layer is ambiguous, validation is blocked by environment problems, or the slice would require broad convention or CI changes.
- External writes are out of scope by default: do not submit PRs, mutate GitHub issues or reviews, publish packages, deploy, or change external systems unless a human explicitly requests that workflow.

## Implementation Guidance

Use the closed `ts-fast-test-boundaries` stack as the implementation model for future slices.

Preferred PR shape:

1. **Establish or confirm the lane before moving coverage.** If a package or language lacks an explicit integration lane, create the command/config/documentation first and seed it with one representative moved smoke test. Verify with test-file listing commands that default tests exclude integration files and the integration command includes them.
2. **Migrate one boundary family per PR.** Good slice boundaries are cold runtime smoke tests, one package's real-Git adapter tests, one sqlite/Graphite metadata seam, one worktree-status loader family, or one timeout/timer seam. Avoid mixing unrelated packages and boundary types unless the shared seam already exists and the change is mechanically identical.
3. **Preserve confidence before claiming speed.** Move real-boundary tests only when default-path coverage keeps the same behavior contract through fakes, injected command/sqlite/process seams, scenario fakes, or existing manual time helpers. Keep a small integration smoke for the actual adapter/runtime boundary.
4. **Record the boundary proof in the PR.** Include the candidate inventory, the classification decision, default-vs-integration file-list checks when files moved, boundary greps for stale real fixtures, targeted default and integration validation, and before/after timing if claiming performance improvement.
5. **Expect a cleanup follow-up when the same test helpers repeat.** After several slices, it may be worth a separate small PR for shared Vitest config, GitHub Actions setup, or shared fake helpers. Keep that cleanup independent from the semantic migration when possible.

Useful seam patterns from the TypeScript stack:

- **Cold Node/runtime smoke:** if the test only proves package importability or CLI startup under real Node, a file move to `test/integration/` can be sufficient; do not invent fake coverage for behavior the smoke test never owned.
- **Real Git adapters:** default tests should usually inject a scripted command executor and assert command protocol, output parsing, and error mapping. Retain throwaway-repository coverage as a small integration smoke.
- **Graphite/sqlite metadata:** extract a domain-named DB-access seam that returns parsed domain rows/errors. Default tests fake the DB access and cover topology/schema/failure semantics; integration tests keep real sqlite schema/query compatibility.
- **Worktree-status orchestration:** bundle related loader dependencies into a named dependency object when multiple lifecycle tests need the same seam. Use queued fakes to assert behavior without creating temp repositories or metadata DBs.
- **Time and timeout behavior:** keep wall-clock reads (`Clock`) separate from one-shot timer scheduling (`TimerScheduler`). Default tests should advance `@asdl/core/testing` manual helpers rather than using sleeps, elapsed `Date.now()` assertions, or broad fake-timer state.
- **Temp directories are not automatically integration.** A temp directory used as an inert fixture or extension-loading workspace can remain in the default suite when no real adapter/runtime boundary is exercised.

Do not treat implementation as a simple file move. The highest-quality PRs in the stack changed production seams just enough to make default tests honest and deterministic, then retained adapter confidence elsewhere.

## Assumptions and Risks

Assumptions:

- The repository will continue to accumulate integration-style coverage in default test locations as packages evolve, so a standing maintenance Objective is more useful than one bounded cleanup pass.
- Most slow default-path tests can be resolved through a regular pattern: introduce or reuse a seam, assert default behavior with fakes, and retain a smaller real-boundary integration smoke test.
- TypeScript already has a documented default-vs-integration lane in `ts/TESTING.md`; Python package test layouts can use analogous `tests/unit`, `tests/scenario`, and `tests/integration` placement where needed.
- Local timing samples are good enough for directional evidence when commands, baseline, post-change timing, and noise limits are recorded honestly.
- Reviewable progress usually comes from a stack of small semantic PRs: lane/config, one boundary migration, another boundary migration, closure/update, then optional cleanup follow-ups.

Risks:

- Moving a test can reduce confidence if the fake-driven replacement does not assert the same contract or if the retained integration test no longer exercises the meaningful real boundary.
- Autonomous runs may overfit to speed and underweight coverage unless the coverage-retention rule stays explicit.
- Some tests mix user-visible scenario behavior with real adapter setup; splitting them may require production design work rather than a simple file move.
- Broad shared seams can become dumping grounds if added before multiple concrete call sites justify them.
- Performance wins can be overstated when a change merely shifts cost from the default suite into integration; updates must distinguish those cases.
- Broad cleanup PRs can obscure the test-performance story if they land in the same branch as a boundary migration; prefer follow-up cleanup branches unless the cleanup is necessary for the migration itself.

## Open Questions

- Should future periodic sweeps eventually use a standard slow-test inventory command or threshold? For now, continue selecting candidates from local timing plus code inspection, and keep the automated threshold idea parked until the signal is stable enough to avoid noisy enforcement.
