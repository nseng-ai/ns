# Final Rebaseline and Closure

## Summary

Completed the final package-tier/import-guard/docs/context rebaseline for the Flow Capability Layer Cleanup Objective and prepared closure.

Verified current package state:

- `sdl-flow` remains tier `capability` and owns submit, PR-description, Graphite-submit, and autobranch workflow policy.
- `@sdl/capability-kit` remains tier `capability-kit` and exports `./gateway-result` as shared capability result/error substrate.
- `@sdl/core` and `@sdl/graphite` remain tier `neutral-infra`; neither exports stale submit subpaths.
- `@sdl/autobranch` is absent from package manifests and lockfile state.
- Kernel module-loader aliases no longer map `@sdl/core/submit`, `@sdl/graphite/submit`, or `@sdl/autobranch/*`.
- TypeScript style-guard/package-tier configuration treats `sdl-flow` and `@sdl/capability-kit` as active graph/tier members and no longer carries obsolete `@sdl/autobranch` graph membership.

Docs/context rebaseline:

- `CONTEXT-MAP.md` now states that Flow owns submit/PR-regeneration/Graphite-submit/autobranch workflow policy, `@sdl/graphite` owns neutral Graphite mechanics, and `@sdl/capability-kit` owns shared capability substrate.
- `ts/packages/infra/graphite/CONTEXT.md` now describes Graphite as owning neutral command/metadata mechanics, not submit/autobranch orchestration policy.
- Parent Objective `sdl-extension-architecture` current-state rows were rebaselined so they no longer describe Flow as delegating to `@sdl/core/submit`, `@sdl/graphite/submit`, or `@sdl/autobranch` as active ownership surfaces.

## Stale Edge Searches

The required live package-specifier search was rerun:

```bash
rg -n '@sdl/core/submit|@sdl/graphite/submit|@sdl/autobranch' \
  ts/package.json ts/pnpm-lock.yaml ts/packages docs CONTEXT.md CONTEXT-MAP.md .sdl/objectives \
  -g '!**/updates/**'
```

Remaining hits are historical/stale-marked provenance in unrelated Objectives, current Objective scope/completion prose, or parent tracking text explicitly saying the old subpaths were deleted. No live package manifest, lockfile, kernel alias, package export map, or TypeScript import edge remains for the old ownership surfaces.

Targeted package/alias checks also verified no stale submit/autobranch specifiers in `ts/packages/kernel/src/sdk/module-loader.ts`, `ts/packages/kernel/test/unit/sdk-module-loader.test.ts`, `ts/package.json`, or `ts/pnpm-lock.yaml`.

## Validation

- `pnpm --dir ts exec vitest run --config vitest.integration.config.ts packages/infra/core/test/integration/typescript-style-guard.test.ts` passed.
- `just dprint-check` passed.
- `just ts-format-check` passed.
- `just ts-lint` passed with pre-existing kernel-test warnings only.
- `just ts-check` passed.
- `just ts-deps-check` passed.

## Objective Impact

The final roadmap row is complete. All completion criteria for this child Objective are satisfied: Flow owns the moved domain policy, Capability Kit owns only shared capability substrate, neutral infra no longer exposes the moved submit/autobranch ownership surfaces, CCC consumes Flow behavior through curated Flow APIs/exports rather than the deleted package subpaths, and package/docs/guard state matches the final boundary.

The Objective is closure-ready and is closed by adding `closed.md` plus the closure note in `objective.md`.
