# ADR 0008: jiti for Loading User-Authored Extension Modules

## Status

Accepted

## Context

SDL lets users and checked-in migration extensions author command entries in TypeScript under `.sdl/extensions`. The installed `sdl` CLI must transpile and import those `.ts` modules at runtime — there is no build step on the user's side between writing an extension and running it.

Beyond transpilation, extension code imports the SDK via `sdl-sdk` (for example `defineExtension`, `z`). For the extension contract to work, those imports must resolve to the *same* SDK objects the host process already holds, not to a separate dependency copy resolved out of `.sdl/extensions`. Without shared identity, Zod schema checks and `instanceof`-style boundary checks across the host/extension seam fail.

jiti is used at exactly one site, `ts/packages/kernel/src/sdk/module-loader.ts` (called from `extension-loader.ts`). It is **not** the dev runner for the CLI itself, and live reload is not a requirement.

## Decision

Use jiti's static API (`jiti/static`) as the runtime loader for user-authored extension modules, configured in `createSdlJiti()` with:

- `virtualModules` — binds `sdl-sdk` to the exact SDK object in the host process, giving extensions host SDK identity instead of a resolved dependency copy.
- `alias` — redirects internal migration subpaths (e.g. `@sdl/kernel/context`) to this source tree for checked-in migration extensions, without exposing them in the public SDK virtual module.
- `moduleCache: false` — each load gets a fresh evaluation.

## Consequences

- Extensions can be authored in TypeScript and run by the installed CLI with no user-side build step.
- Host and extension code share SDK identity, so schema and boundary checks work across the seam.
- jiti is a runtime dependency of `@sdl/kernel`, not just a dev tool. Its presence is justified only as long as runtime TS extension loading with identity sharing is part of the product.

## Rejected Alternatives

- **Pre-compiled JS extensions + plain `import()`:** drops jiti entirely, but requires users to run a build step and provides no SDK-identity guarantee, which would have to be rebuilt by hand over a custom resolver.
- **esbuild/swc + custom resolver:** can transpile, but reimplements the `virtualModules` identity binding — the actual hard part — for no real gain.
