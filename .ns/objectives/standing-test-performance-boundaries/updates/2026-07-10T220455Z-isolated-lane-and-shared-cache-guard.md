# Isolated lane and shared-cache guard

## Summary

The TypeScript test topology now distinguishes integration boundaries from shared-cache isolation
boundaries. Tests whose subject genuinely requires ambient Vitest module state or process-global state
belong under `test/isolated/` and run through `just ts-test-isolated` with Vitest `isolate: true`.
Default, integration, and TypeScript style guard tests retain the faster shared-cache posture and are
protected by source guards against the narrow operation family that can contaminate another file.

The isolated lane is explicit rather than hidden: it has its own non-draft PR CI job and is not included
in the default `just` entrypoint. Contributors must run `just ts-test-isolated` when changing isolated
tests, their subjects, lane configuration, or shared-state guard behavior.

## Objective Impact

This slice adds a reusable boundary lesson to the standing Objective: integration and isolation answer
different questions. Real Git, sqlite, subprocess, dynamic runtime, and similar adapter coverage belongs
in integration. A fake-backed test can instead require isolation because import binding, module cache,
process listeners, or singleton lifecycle is the behavior under test. Isolation is the last containment
step after injection, explicit env/cwd, manual time, supported auto-restored stubs, or an owned lifecycle
seam—not a general slow-test lane or a way to silence a guard.

The shared-cache posture is now guarded by these durable identifiers:

- `NS_TS_BAN_SHARED_TEST_MODULE_STATE`
- `NS_TS_BAN_SHARED_TEST_FAKE_TIMERS`
- `NS_TS_BAN_SHARED_TEST_PROCESS_MUTATION`
- `NS_TS_BAN_SHARED_TEST_GLOBAL_LISTENERS`
- `NS_TS_BAN_SHARED_TEST_SINGLETON_STATE`

The broader lesson is that lane globs alone cannot protect an `isolate: false` performance contract.
Once an inventory identifies a narrow, statically recognizable contamination vocabulary, pair the
explicit escape lane with adversarial guard tests and diagnostics that point back to the preferred seam.

## Evidence

### Baseline

The supplied pre-change default-suite baseline was:

- 477 files passed
- 4802 tests passed
- 5.32s duration

The initial inventory found:

- three files using module mocks;
- six files using `vi.useFakeTimers`, plus `vi.useRealTimers` cleanup occurrences;
- direct `process.env` mutations;
- one process-global listener case; and
- one Graphite singleton-worker lifecycle file.

### Final lane shape and validation

The expected final lane shape was observed:

- `just ts-test-isolated`: four files / 13 tests passed;
- `just ts-test-typescript-style-guard`: one file / 139 tests passed;
- isolated execution: `just ts-test-isolated`;
- CI: a separate `typescript-isolated` job; and
- default validation: isolated tests deliberately omitted from `just`.

Targeted dprint checking also passed for the changed documentation and Objective files.

This evidence establishes explicit containment, discovery, and regression protection. It does **not**
claim a default-suite speedup: no comparable post-change default timing was supplied, and moving work to
an explicit lane is not itself evidence that total or default execution became faster.

## Follow-Ups

- Keep the isolated lane small. New guard hits should follow the remediation hierarchy in
  `ts/TESTING.md` before a file is moved.
- Continue reporting the isolated lane separately in CI; do not fold it into default `just` or hide it
  behind an environment switch.
- If a future slice claims speed, collect a comparable post-change default run and distinguish eliminated
  cost from cost shifted into integration or isolation.
