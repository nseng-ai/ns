# Vibechk Default-Lane Timing Evidence

## Summary

A follow-up targeted timing sample measured the `@asdl/vibechk` default test command after the real-Git `run` smoke moved to the integration lane. This supersedes the earlier same-branch note that no speedup timing had been measured; that earlier update remains historical provenance.

## Performance evidence

- Measured command: `vitest run --config vitest.config.ts packages/vibechk/test`
- Baseline timing: parent commit `769fcdd86`, 6 samples after warmup: mean `1.111s`, median `0.990s`, min `0.976s`, max `1.550s`; samples `1.550s`, `1.183s`, `0.976s`, `0.978s`, `0.978s`, `1.001s`.
- Post-change timing: branch commit `0eedb3641`, 6 samples after warmup: mean `0.679s`, median `0.666s`, min `0.607s`, max `0.859s`; samples `0.859s`, `0.607s`, `0.666s`, `0.668s`, `0.609s`, `0.667s`.
- Repetition/noise notes: small local sample on the same machine; `hyperfine` was unavailable, so timing used a Python `time.perf_counter()` loop. The baseline ran in a temporary detached worktree at `769fcdd86` with dependency links to the current checkout's already-installed `node_modules`; that worktree was removed after measurement.
- Cost handling: the change shifts the real Git repository setup and `RealGitGateway` smoke out of the default lane and into the explicit TypeScript integration lane; it does not remove the coverage.
- Coverage retention: default fake-driven `vibechk run` tests still cover bundle writing, run IDs, result-branch naming, checkout restoration through `FakeGitGateway`, no-change behavior, dirty-workdir rejection, and walking-skeleton `run`/`show`/`diff`; the real-Git smoke is retained under `ts/packages/vibechk/test/integration/run-command-real-git.test.ts`.

## Objective Impact

The vibechk slice now has measured targeted default-lane evidence, not just placement evidence. The timing sample supports the Objective's heuristic that real Git repository setup in default-path scenario tests can have a measurable local cost even when the package test suite is otherwise small.

This does not close the standing Objective. It strengthens the evidence for the completed vibechk slice and keeps the recommended next bounded slice unchanged: classify and migrate the real child-process `runCommand` adapter coverage in `ts/packages/asdl-core/test/exec.test.ts` while preserving default-path behavior coverage for pure presentation and adapter-independent logic.

## Follow-Ups

- Use this update, rather than the earlier no-timing note, when citing vibechk performance evidence.
- For the next `asdl-core` subprocess slice, capture comparable before/after timing if claiming a default-suite speedup.
