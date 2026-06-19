# Run-Scoped Context Terminology Adopted

## Summary

Candidate 3 terminology was tightened again: the operation-facing roaster interface now uses run-scoped context vocabulary. `RoasterContext` is the run-scoped context used by handlers, `RoasterGateways` is the raw adapter/dependency group, and `createRoasterContext(gateways, environment)` creates the handler-facing interface for one CLI invocation.

Evidence considered: review feedback rejecting the prior vocabulary, local source/test rename evidence, targeted roaster tests, and TypeScript check.

## Objective Impact

The Objective still treats candidate 3 as shipped. The semantic shape remains the same: raw gateway interfaces stay intact, while handlers see work-shaped methods that already carry `cwd`, `env`, and optional `signal` through the run-scoped context.

## Follow-Ups

- Prefer `RunEnvironment`, `Gateways`, and `Context` for future roaster terminology.
- Avoid adapter-wrapper type names that encode implementation mechanics in roaster interfaces.
