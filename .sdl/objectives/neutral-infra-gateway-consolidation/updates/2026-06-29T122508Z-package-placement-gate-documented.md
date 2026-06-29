# Package-Placement Gate Documented

## Summary

The upfront package-placement assessment landed as its own documentation deliverable before any gateway migration code. ADR 0019 (`docs/adr/0019-gateway-real-implementation-placement-gate.md`) refines ADR 0018: the four buckets still decide *which tier* a `@sdl/core` export belongs to, but ADR 0019 adds a multi-factor gate for *which concrete package* owns a large real implementation once the `@sdl/core` door is gone.

The gate weighs complexity/maintenance weight, reusable host/runtime/library value, dependency/cycle pressure, Capability Kit size impact, and consumer semantics — explicitly not a raw LOC threshold. It defines five allowed outcomes: `capability-kit-owned`, `kit-interface-standalone-real`, `sdk-provided`, `runtime-harness`, and `deferred-exception`. ADR 0019 carries a per-domain assessment table covering `git`, `exec`, the GitHub family, `graphite`, `cmux`, the SDK-provided services, `cli-entry`, the precise filesystem/env helpers, the mixed modules (`model-slug`, `machine-envelope`, `@sdl/core/testing`), and the `brmem-cli` exception — with current home, size, consumer count, chosen target pattern, concrete next home, old door(s) to delete, and risk/cycle notes per row. Table sizes and consumer counts were re-verified against live repo state during authoring.

ADR 0018 now cross-references ADR 0019 in its Status, and `CONTEXT.md`'s Extension Layering paragraph notes the placement-gate refinement.

## Objective Impact

This adds an architecture deliverable ahead of the open `git`/`exec`/GitHub/graphite-cmux/SDK-service/runtime-harness relocation rows. It does not check off a roadmap row by itself; rather, it gives every subsequent relocation slice a pre-judged target package decision and preserves ADR 0018's hard invariant that the old `@sdl/core` door is deleted in the same atomic slice as the consumer repoint.

Key decisions recorded in ADR 0019:

- Large/complex real adapters (`git` ~1233 LOC, GitHub PR-feedback ~1304 LOC, `exec` ~461 LOC, `github-pr-status` ~563 LOC) lean toward `kit-interface-standalone-real` so Capability Kit stays a seam/fake/light-adapter substrate rather than a real-adapter package.
- `graphite` (~1784 LOC, kernel depends on it) and `cmux` (~883 LOC) are cycle-sensitive; default to keeping them standalone unless the dependency graph proves a fold-in is safe.
- `exec`'s `ExecResult`/formatting types and `temp-files`' `withTemporaryFile` need a stable `sdl-sdk`/kit boundary because `sdl-sdk/src/execution.ts` re-exports them today.
- `deferred-exception` defers only the *final home* of an already-relocated real implementation, never the `@sdl/core` door deletion.

## Follow-Ups

- Start each relocation slice (`git`, then `exec`, then GitHub, then graphite/cmux, then SDK-provided services, then runtime harness/residual) from ADR 0019's table; re-check the gate for a domain only where placement is not already settled.
- The migration code slices remain for separate stacked branches; this branch (`neutral-infra-gateway-placement-gate`) delivered only the assessment.
- Keep existing Semantic Updates immutable; record any change to the placement decision in a new update and, if it changes the architecture decision, a refining ADR.
