# Run Context Facade Shipped

## Summary

Candidate 3 now has branch-local shipped evidence. The `bind-roaster-run-context-facade` branch preserves raw `RoasterContext` as the adapter/dependency container and adds `bindRoasterContext()` to create a per-invocation `RoasterRunContext` from `{ cwd, env, signal }`. `runCli()` binds the raw context at execution time, `RoasterCliContext` is flat, review operations call work-shaped bound gateway methods, and `publishFindings()` now receives a bound GitHub-capable context plus semantic publication options instead of carrying ambient execution fields.

Evidence considered: Graphite parent `roaster-dto-schema-type-unification`; current working-tree diff for candidate 3; stale-term checks for `ctx.context`, `ctx.cwd`, `ctx.env`, and `githubOptions()`; targeted roaster scenario/unit tests including the new facade-forwarding unit test; full TypeScript deps, format, lint, check, legacy check, test, and guard gates.

## Objective Impact

The roadmap marks candidate 3 complete. The Objective narrative now treats environment binding as shipped depth rather than pending architecture work. The cancellation decision is resolved: optional `CliDeps.signal` belongs in the same bound run environment as `cwd` and `env`, and the facade forwards it to raw gateways that already accept cancellation.

The over-binding risk is de-risked by binding at `runCli` time rather than inside `createRealRoasterContext()`, so real/fake adapter construction remains independent from argv/runtime facts. Candidate 4 is now the only unresolved work item.

## Follow-Ups

- Continue with candidate 4: verify whether `RoasterFailure` structured fields are consumed or intentional forward-room, then deliberately shrink or deepen the failure seam.
- Keep raw gateway tests focused on adapter isolation; use the bound facade as the CLI/operation-facing interface.
