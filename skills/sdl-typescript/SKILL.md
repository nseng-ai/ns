---
name: sdl-typescript
description: "TypeScript overlay for sdl-tools. Use when editing or reviewing TS in this repo: tsconfig baseline, pnpm/Vitest/oxlint/oxfmt/tsgo commands, relative .ts imports, workspace subpath exports, exactOptionalPropertyTypes spread idiom, and the `as unknown as` hard ban."
references:
  - references/internal-import-alternatives
---

# sdl-typescript

Follow `typescript-style` for how TypeScript code reads. This skill is the sdl-tools project overlay:
toolchain, compiler baseline, import conventions, and local bans.

Load this after `typescript-style` whenever the task touches TypeScript in this repository.

## Toolchain baseline

- Package manager: pnpm 11 in `ts/`.
- Runtime: Node 24.12 or newer.
- Dependency governance: pnpm catalog plus Syncpack via `just ts-deps-check`.
- Tests: Vitest 4 via `pnpm --dir ts run test` or `just ts-test`.
- Development typecheck: native TypeScript preview / `tsgo` only, via `pnpm --dir ts run check` or `just ts-check`.
- Formatting: oxfmt via `pnpm --dir ts run fmt:check` / `just ts-format-check`; autofix with `pnpm --dir ts run fmt` / `just ts-format-fix`.
- Linting: oxlint via `pnpm --dir ts run lint` / `just ts-lint`; autofix with `pnpm --dir ts run lint:fix` / `just ts-lint-fix`.
- Repo Markdown/TOML formatting remains dprint via `dprint check` / `just dprint-check`; autofix with `just dprint-fix`.

## Compiler baseline

`ts/tsconfig.json` is intentionally strict and strip-only. Treat these settings as the project contract:

- `target: "ES2024"`
- `lib: ["ES2024"]`
- `strict: true`
- `noUncheckedIndexedAccess: true`
- `exactOptionalPropertyTypes: true`
- `allowImportingTsExtensions: true`
- `verbatimModuleSyntax: true`
- `isolatedModules: true`
- `erasableSyntaxOnly: true`
- `noEmit: true`
- `skipLibCheck: true`
- `moduleDetection: "force"`
- `noFallthroughCasesInSwitch: true`
- `noImplicitOverride: true`
- `noUncheckedSideEffectImports: true`
- `noUnusedLocals: true`
- `noUnusedParameters: true`
- `forceConsistentCasingInFileNames: true`

The unused-local and unused-parameter flags are deliberately stricter than many WIP workflows. Prefer
small, complete changes that leave no dead scaffolding.

## Import convention

- Intra-package imports are relative and include the explicit `.ts` suffix:
  `../failures.ts`, `./models.ts`.
- Cross-package imports use curated workspace package exports, for example
  `@sdl/core/primitives`, `@sdl/core/exec`, and `@sdl/clinkr/raw`.
- Do not deep-import another package's `src/` tree.
- Do not add root-only barrels that hide ownership. Prefer explicit subpath exports for public package
  surfaces.

The `#`-subpath import alternative is documented in
`references/internal-import-alternatives.md`; it is not the current standard and should not be migrated
opportunistically.

## Optional properties under `exactOptionalPropertyTypes`

When conditionally including an optional property, use object spread to omit the key entirely when the
value is `undefined`:

```ts
const options = {
  cwd: request.cwd,
  ...(request.env === undefined ? {} : { env: request.env }),
};
```

This is intentional. Do not copy rules from projects that ban this pattern unless they also share
sdl's `exactOptionalPropertyTypes` contract. Under this setting, `{ env: undefined }` is not equivalent
to omitting `env`.

Use these type shapes deliberately:

- `foo?: T` means omission is the state; if the key is present, the value is a real `T`.
- `foo: T | undefined` means the key is part of the shape, but the value may be unavailable.
- `foo?: T | undefined` means callers may omit the key or explicitly provide/forward `undefined`; reserve
  it for options, input, override, and compatibility bags where that distinction is meaningful.

Review guidance:

- For domain, context, result, and durable record objects, question `?: T | undefined` unless explicit
  `undefined` is a meaningful present-key state.
- If construction code conditionally omits the field with object spread, prefer `foo?: T`.
- If every consumer expects the property to exist and checks the value, prefer `foo: T | undefined`.
- Do not turn this into a blanket ban: option/input bags can legitimately accept explicit `undefined`.

## Time seams

Production SDL TypeScript should not hand-roll raw timers. Use `Clock` from `@sdl/core/clock` for wall-clock reads, `TimerScheduler` / `systemTimerScheduler` from `@sdl/core/timers` for scheduling, cancellation, and awaited delays, `unrefTimerScheduler` from `@sdl/pi/shared/timers` for Pi host background timers, and `createManualClock()` / `createManualTimerScheduler()` from `@sdl/core/testing` in default tests. The TypeScript style guard rejects raw production `setTimeout`, `setInterval`, `clearTimeout`, `clearInterval`, and `node:timers/promises` imports outside timer adapters/tests.

## Hard bans enforced by TypeScript style guard tests

The repository TypeScript style guard tests run adversarial self-review cases and enforce these uniquely
greppable rules through `just ts-test-typescript-style-guard`:

- `SDL_TS_BAN_AS_UNKNOWN_AS`: `as unknown as T` is banned everywhere in TypeScript, including tests. It
  launders the type instead of modeling the fixture or boundary honestly.
- `SDL_TS_BAN_IMPORT_ALIAS_FOR_FIRST_PARTY`: first-party import aliases are banned for relative imports,
  `@sdl/*` workspace packages, and project-local aliases such as docs-site `@/`. Preserve source names so
  `rg SymbolName` remains reliable. Third-party import aliases are allowed when used consistently.
- `SDL_TS_BAN_EMPTY_INTERFACE_EXTENDS`: empty `interface X extends Y {}` aliases are banned. Use
  `type X = Y` unless the interface adds real members.
- `SDL_TS_BAN_RAW_PRODUCTION_TIMERS`: raw production timers are banned outside timer adapter modules and tests. Use `Clock`, `TimerScheduler`, and `unrefTimerScheduler` seams instead.

Review-only hard ban: `SDL_TS_BAN_IMPORTED_BINDING_LOCAL_ALIAS` means do not work around alias bans with
`const LocalName = ImportedName`; use the first-party source name or a third-party import alias. This is
not enforced mechanically because legitimate constants can share the same AST shape.

Preferred fixes for unsafe casts and empty aliases:

- build a complete typed object;
- add a small typed `make*` fixture helper;
- derive the type from the source of truth;
- add a narrow runtime assertion at the boundary;
- isolate a single library-forced cast with a comment only when the external type truly requires it;
- replace empty interface-extension aliases with direct `type` aliases.

Run the TypeScript validation gates before declaring TypeScript work done:

```bash
just ts-deps-check
just ts-format-check
just ts-lint
just ts-check
just ts-test
just ts-test-integration
just ts-test-typescript-style-guard
```
