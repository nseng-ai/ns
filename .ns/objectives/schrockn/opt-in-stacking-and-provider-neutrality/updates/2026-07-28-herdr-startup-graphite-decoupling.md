# Herdr startup Graphite coupling removed

## Summary

`@nseng-ai/herdr` no longer performs any Graphite work at Pi extension registration. Previously, `registerHerdrPiExtension` constructed `RealGraphiteBranchGateway`, ran `gt trunk --no-interactive` against `process.cwd()`, and threw before registering any command when trunk resolution failed — making Graphite an ambient startup dependency for all nine Herdr commands.

Durable behavior now:

- Registration constructs no Graphite gateway and issues no `gt` call; all eight base commands register even when `gt` is missing or unusable, and the optional Handoff command keeps its independent loading behavior.
- A Herdr-owned `HerdrTrunkBranchResolver` contract (`src/core/trunk-resolver.ts`) replaces the static `trunkBranch: string` on the shared Pi context. The Graphite-backed implementation lives at the Pi composition root (`src/pi/trunk-resolver.ts`), keeping gateway construction and provider result types out of core workflow code.
- Only the three implementation commands (`impl:prompt:space`, `impl:plan:space`, `impl:plan:tab`) resolve trunk, and only after invocation-time branch-basis selection chooses Local trunk; current-branch paths and direct resource commands never touch Graphite.
- The first successful resolution — using the invoking command's effective repository cwd — is cached for the extension lifetime, preserving the previous immutable-per-session trunk assumption. Failed resolutions are not cached: the failure is presented as a command-local error, stops that invocation before branch creation, Branch Memory writes, Slot checkout, or Herdr destination mutation, and a later trunk-selected invocation retries. Concurrent first lookups share one in-flight resolution.

Evidence: new tests prove registration with `gt` configured to fail registers the full base catalog with zero `gt` calls; an unrelated registered command (`space:new`) executes with any `gt` invocation treated as a test failure; current-branch implementation records zero resolver calls; trunk-selected implementation records the invocation cwd; resolver success caching, failure retry, thrown-error translation, and in-flight deduplication behave as specified; trunk-resolution failure produces no branch/attachment/Slot/Herdr mutation in prompt and plan workflows. Focused `@nseng-ai/herdr` typecheck/tests and repo validation (`just`, TypeScript gates, style guard) pass. Local branch `remove-herdr-startup-graphite-coupling` (implementation and tracking land together).

## Objective Impact

The first of the four named ambient Graphite couplings is gone, verified by tests that exercise Herdr registration and an unrelated command without Graphite available. `CONTEXT.md`'s Contextual implementation branch basis entry records the lazy lookup timing, extension-lifetime success cache, and retryable command-local failure. Branch creation remains Graphite-backed — this slice removes the startup coupling only and does not claim provider neutrality for Herdr. The orientation's "Herdr resolves Graphite trunk at startup" statement is now stale and re-derived; the active slice advances to the Objective Runner Graphite-tracking gate.

## Follow-Ups

- Caveat carried forward: the extension-lifetime cache means a later invocation from a different repository reuses the first successfully resolved branch name; per-repository caching was explicitly deferred as a future decision.
- Herdr's local-trunk branch creation still uses Graphite explicitly; provider selection for it belongs to the later `BranchCreationProvider` seam rows, not this slice.
