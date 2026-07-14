# Deliver Graphite Fact Helpers

## Summary

The two hidden Slot Graphite helpers are implemented and wired to their concrete
consumers. `restack-preflight` shares scoped Slot-conflict mechanics with quiescence
without absorbing snapshot/ref-drift behavior. `descendants-report` traverses arbitrary
named Graphite roots, gathers complete local comparison evidence through four workers,
and performs one best-effort PR batch.

## Objective Impact

Both roadmap rows and all completion criteria are satisfied. The real Git adapter owns
machine-oriented commit and numstat parsing, gateway fakes cover failures and partial PR
availability, and scenario tests cover scope, blocked states, forks, deterministic
ordering, binary statistics, complete subtrees larger than the worker pool, and
structured failures. The Pi wrapper now uses the full-scope command boundary, removing
its provisional Git-directory inspection. Workflow skills retain all scope, proposal,
authorization, conflict-resolution, rewrite, and submit judgment.

Validation passed: focused Slot gateway/scenario and Pi workflow tests, `just`,
`areg check`, both consumer `areg skill show` checks, direct `--json-schema` publication,
the bounded stale-procedure search, and `git diff --check`.

## Follow-Ups

- None required for this Objective.
