# Flow Cleanup Child Completion

## Summary

The `flow-capability-layer-cleanup` child Objective completed its final rebaseline and closed.

Current boundary after the child cleanup:

- Flow owns submit, PR-description, Graphite-submit, and autobranch workflow policy under `sdl-flow` / Flow-owned internals.
- `@sdl/capability-kit` owns shared capability substrate such as gateway result/error helpers, not Flow domain policy.
- `@sdl/core` and `@sdl/graphite` retain generic or neutral protocol/mechanics responsibilities only; the old `@sdl/core/submit` and `@sdl/graphite/submit` export surfaces are gone.
- `@sdl/autobranch` is no longer an active package; autobranch behavior is Flow-owned.

Parent tracking was updated to mark earlier delegation descriptions as superseded by the child Objective. Remaining parent work is broader capability migration / clean-consumer conversion outside this child Objective.
