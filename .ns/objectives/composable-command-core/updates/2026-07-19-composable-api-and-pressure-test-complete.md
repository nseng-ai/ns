# Semantic Update: composable API and no-`ClinkrIo` pressure test complete

## Summary

The raw-or-clinkr composable command API and its first hosted steel thread are complete on the current stack. `@nseng-ai/sdk/command` exposes `defineCommand` and directly branded `clinkr(...)` runs; descriptor validation and the ns CLI recover clinkr metadata for selected-command routing, completions, typed execution, interactions, and semantic progress events. Capability Kit materializes the first-party house context without adding capability dependencies to the SDK.

The no-`ClinkrIo` pressure test also holds for the delivered surface: bounded searches find no `ClinkrIo` imports in the new SDK command modules, first-party command materialization, or migrated `flow cp` command. The SDK phase renderer returns frames to clinkr's stream sink, forwards complete synthetic settlement events to live hosts, and restores terminal state even when final rendering fails.

- PR #3787: Hoist Phase Rendering to the SDK CLI Host Edge — current open PR completes the renderer hoist, raw-or-clinkr collapse, context-free completion binding, and renderer cleanup hardening; repository validation passes on the branch.

## Objective Impact

The roadmap rows for shipping the composable command API and establishing the no-`ClinkrIo` pressure test are complete in landed-state tracking. The architectural assumptions survived the cp steel thread without creating a parallel parser/framework or leaking `ClinkrIo` into author-facing code.

The Objective now moves from platform construction to the deliberate Flow gradient. `changes` remains the smallest next proof: it should exercise Git, model policy, text generation, typed result output, and progress events before the broader `pull-trunk` and `submit` migrations.

## Follow-Ups

- Port `flow changes` and record its before/after size and glue delta.
- Preserve the clean command-library boundary; do not add command-specific services to the SDK bundle.
- Use the later `submit` port to settle matrix rendering and the ambient filesystem/current-directory boundary.
