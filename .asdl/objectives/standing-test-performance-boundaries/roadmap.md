# Roadmap

## Work

- [~] Periodically migrate integration-style default tests into the right boundary layer.
  - Policy: autonomous runners may execute one bounded slice at a time when the candidate has clear slow/default-path integration-boundary evidence and an unambiguous coverage-retention path.
  - Guidance: classify the candidate first, add or strengthen fake-driven unit/scenario coverage, move retained real-boundary coverage to the integration lane, and record performance evidence when claiming a speedup. Prefer one boundary family per PR: runtime smoke, real Git, sqlite/Graphite metadata, worktree-status loader orchestration, or time/timer behavior. After each slice, update this standing Objective when implementation teaches a reusable lesson, invalidates guidance, or reveals a missing guardrail; lessons may add, remove, or edit Objective text, roadmap guidance, assumptions, risks, or Semantic Updates.
  - Evidence: targeted default tests and retained integration tests pass; performance evidence records measured command, baseline, post-change timing, repetition/noise notes, cost handling, and coverage retention. When files move, include default/integration file-list checks; when seams replace real fixtures, include boundary greps for stale real setup. Objective updates capture durable lessons rather than ceremonial run logs.
- [~] Rebaseline the remaining default suites for likely boundary leaks after the current TypeScript stack lands.
  - Policy: direct evidence-gathering and small unambiguous fixes are allowed; ask before proposing broad CI/configuration or convention changes.
  - Guidance: start with tests that create real repositories, spawn real CLIs, open sqlite/metadata fixtures, use real sleeps/timers, or hit backend/network adapters from unit/default paths.
  - Latest evidence: the vibechk real-Git migration rebaseline recommended `ts/packages/asdl-core/test/exec.test.ts` real child-process `runCommand` coverage as the next bounded slice; measured vibechk default-lane timing evidence lives in `updates/2026-06-20T182851Z-vibechk-default-lane-timing.md`.
- [ ] Extract repeated seam patterns into local conventions only after multiple slices prove the same shape.
  - Policy: steer first before adding broad shared APIs, repo-wide rules, or CI topology changes.
  - Guidance: prefer package-local seams until a cross-package pattern is proven; document stable patterns in the relevant testing docs. Keep cleanup follow-ups such as shared Vitest config, CI setup actions, or shared fake helpers separate from the semantic migration unless they are required to keep the migration readable.

## Parked

- [ ] Add an automated slow-test inventory or threshold gate.
  - Parked until manual periodic sweeps show which timing signal is stable enough to avoid noisy or misleading enforcement.
