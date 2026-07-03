# Time Package Folded Into Core Topology Circle

## Summary

The first distribution-first package consolidation pilot folded the standalone `@sdl/time` workspace package into explicit `@sdl/core` subpaths:

- concrete system adapters now live at `@sdl/core/time`;
- manual clock/timer fakes now live at `@sdl/core/time/testing`;
- the old `ts/packages/infra/time` package directory was deleted rather than kept as a compatibility shim;
- runtime consumers were repointed from the retired package to the new core subpaths and their package manifests no longer declare `@sdl/time`.

The architecture topology overlay was updated so the report can render source topology circles separately from published/workspace packages. Circles are discovered from source layout (`src/*.ts` as the package root circle plus `src/<component>/` as component circles), inherit the enclosing package tier for now, and carry their enclosing package as the node color key. This preserves a visible `@sdl/core/time` topology circle even though `time` is no longer a standalone package.

## Objective Impact

This is the first concrete proof point for the Objective's distribution-first direction: small infra does not automatically require a separate published package. Package distribution and topology granularity are now decoupled in code: package manifests remain normal npm package manifests, while the report/guard layer can reason about smaller source circles.

## Follow-Ups

- Use the updated topology report and guard as the basis for the next small-infra package triage slice.
- Continue deciding package-vs-circle boundaries case by case; this update does not imply that customer-shipped capabilities or heavy gateway backends should be folded into `@sdl/core`.
