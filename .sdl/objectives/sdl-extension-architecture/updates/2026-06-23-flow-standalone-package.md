# Semantic Update: Flow Commands Moved to Package-Owned Extension Implementation

## Change

The grouped SDL flow command implementation moved out of `.sdl/extensions/flow/src/**` and into a first-class TypeScript workspace package, `ts/packages/flow` (`@sdl/flow`). The checked-in `.sdl/extensions/flow` directory remains the current project-local SDL discovery surface, but its command entry files are now thin adapters that re-export per-command package modules such as `@sdl/flow/commands/cp`.

## Architecture evidence

- `@sdl/flow` owns command implementations and direct command behavior tests.
- `.sdl/extensions/flow/package.json` remains the manifest-based project-local adapter surface for the current SDL loader.
- `@sdl/sdl` remains the kernel/discovery/loading owner and does not depend on `@sdl/flow` as a package dependency.
- SDL loader support for the source checkout is limited to narrow `@sdl/flow/commands/*` jiti aliases for the checked-in adapter layer; this does not implement general `node_modules` package discovery or installer behavior.
- Direct behavior tests moved to `ts/packages/flow/test/scenario`, while SDL package tests retain kernel/unavailability/generic extension loading coverage plus a small integration smoke for real `.sdl/extensions/flow` adapter loading.

## Boundary result

This advances the extension architecture from project-local implementation ownership toward publishable-style first-party extension packages while preserving the current command-discovery contract. Future npm package discovery, installation, dynamic Pi mirror discovery, and publishing remain out of scope.
