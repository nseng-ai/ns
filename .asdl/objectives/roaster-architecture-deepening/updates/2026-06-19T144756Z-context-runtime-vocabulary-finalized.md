# Context/Runtime Vocabulary Finalized

## Summary

Candidate 3's API vocabulary was refined one more time on branch `roaster-context-runtime-vocabulary-refactor`: `runCli()` now creates or accepts a full `RoasterContext` containing raw gateway dependencies, `cwd`, `env`, optional `signal`, and CLI I/O, then derives the operation-facing `RoasterRuntime` with `createRoasterRuntime(context)`. Review and publish operation handlers depend on `RoasterRuntime`, so they keep the work-shaped capability surface while test support can provide a complete fake roaster context.

Evidence considered: Graphite parent `rename-roaster-run-scoped-context`; branch commit `709dc6e2d`; local branch diff against that parent; PR #1837 file and commit evidence showing the context/runtime split, fake-context rename, and scenario/unit test updates. Validation was not rerun during this Objective update.

## Objective Impact

The Objective still treats candidate 3 as shipped. The durable wording now matches current ground truth: `RoasterContext` is the full CLI context and `RoasterRuntime` is the narrow operation-facing interface. The prior `RoasterGateways` / `RoasterCliContext` terminology remains historical provenance in older updates but is no longer the current API shape.

Candidate 4 remains the only unresolved roadmap item.

## Follow-Ups

- Use `RoasterContext` for complete CLI context construction, dependency injection, and fake setup.
- Use `RoasterRuntime` for operation handlers and publication workflow code that should not see raw process or gateway details.
- Continue with candidate 4: verify whether `RoasterFailure` structured fields should be consumed or removed.
