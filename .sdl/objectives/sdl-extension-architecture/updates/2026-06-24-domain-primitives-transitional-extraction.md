# Domain primitives transitional extraction

## Summary

Created `@sdl/domain-primitives-transitional` as the disposable below-SDK holding pen for SDK-independent domain primitives previously exposed through `@sdl/sdl/*` internal workspace subpaths. The package exposes mirrored subpaths only:

- `@sdl/domain-primitives-transitional/checkpoint-flow`
- `@sdl/domain-primitives-transitional/checkpoint-message`
- `@sdl/domain-primitives-transitional/pending-worktree`
- `@sdl/domain-primitives-transitional/temp-files`
- `@sdl/domain-primitives-transitional/text-generation`
- `@sdl/domain-primitives-transitional/text-repair`

The old moved `@sdl/sdl/*` primitive exports were removed rather than shimmed. Workspace consumers in flow, CCC, Pi extensions, and the SDL SDK internals now import the transitional package directly where they need those primitives.

## Objective Impact

Phase 2 Step 3 is complete: the SDL kernel no longer owns the moved domain primitive implementations, and the transitional dependency is visible at each consumer import site. `@sdl/sdl/sdk` remains the public extension-author API; it reuses the moved text-generation implementation to preserve SDK behavior without restoring `@sdl/sdl/text-generation` as an internal primitive subpath.

## Follow-Ups

- Continue Phase 2 Step 4 child capability migrations so capability packages consume Peer APIs instead of transitional primitives where appropriate.
- Convert `ccc` into an orchestrator extension after the dependent capability Peer APIs exist.
- Delete `@sdl/domain-primitives-transitional` once capability migrations and CCC orchestration remove the remaining below-SDK domain primitive imports.

## Validation

- `pnpm --dir ts install --lockfile-only`
- `pnpm --dir ts run check`
- `rg '@sdl/sdl/(checkpoint-flow|checkpoint-message|pending-worktree|temp-files|text-generation|text-repair)' ts docs .sdl/objectives/sdl-extension-architecture`
- `rg './src/(checkpoint-flow|checkpoint-message|pending-worktree|temp-files|text-repair)\.ts|./src/sdk/text-generation\.ts' ts/packages/sdl/package.json ts/packages/sdl/src/sdk/module-loader.ts`
- `rg 'domain-primitives-transitional' ts docs .sdl/objectives/sdl-extension-architecture`
