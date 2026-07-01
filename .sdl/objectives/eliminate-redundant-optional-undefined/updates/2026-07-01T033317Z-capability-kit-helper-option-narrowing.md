# Capability Kit Helper Option Narrowing

## Summary

Narrowed the remaining raw optional-undefined helper option declarations in `@sdl/capability-kit` to omission-only optional properties.

Changed fields:

- `ExecSdlCommandOptions.cwd`, `timeoutMs`, `onStdout`, and `onStderr` in `ts/packages/sdl-capability-kit/src/git.ts`.
- Private `CliExecOptions.cwd`, `CliExecOptions.timeout`, and `SdlCliExecAdapterOptions.onOutput` in `ts/packages/sdl-capability-kit/src/git.ts`.
- `SdlDomainCommandOptions.positionals`, `completionProvider`, `renderHuman`, and `renderMarkdown` in `ts/packages/sdl-capability-kit/src/sdl-command.ts`.
- `SdlClinkrInteractionOptions.formatMessage` in `ts/packages/sdl-capability-kit/src/sdl-context.ts`.

Construction-path evidence: existing `execSdlCommand`, `createSdlCliExecAdapter`, and `createSdlDomainCommand` builders already conditionally spread optional fields only when values are present; `createSdlClinkrInteraction` reads `formatMessage` with optional chaining and has no present-key `undefined` branch. Present-key `undefined` therefore had no helper-local domain meaning.

Scorecard:

| Scope | Metric | Before | After |
| --- | --- | ---: | ---: |
| `ts` | Raw optional-undefined properties | 35 | 23 |
| `ts` | Typed explicit-undefined contracts | 86 | 86 |
| `ts` | Legacy preserve markers | 0 | 0 |
| `ts` | Undefined-normalization/check lines | 2298 | 2298 |
| `ts/packages/sdl-capability-kit` | Raw optional-undefined properties | 12 | 0 |
| `ts/packages/sdl-capability-kit` | Typed explicit-undefined contracts | 13 | 13 |
| `ts/packages/sdl-capability-kit` | Legacy preserve markers | 0 | 0 |
| `ts/packages/sdl-capability-kit` | Undefined-normalization/check lines | 61 | 61 |

Validation:

- `pnpm --dir ts --filter @sdl/capability-kit test` passed.
- `pnpm --dir ts --filter @sdl/capability-kit check` passed.
- `just ts-format-check` passed.
- `just ts-lint` passed.

## Objective Impact

This removes a coherent package-level cluster of 12 redundant optional-undefined declarations from private capability-kit helper contracts without touching public SDK/kernel surfaces or external/env maps. The slice leaves the scoped package at zero raw optional-undefined properties while preserving the package's typed `ExplicitUndefined` contracts in `brmem-cli.ts`.

## Follow-Ups

Continue classifying the remaining repo-wide raw optional-undefined properties conservatively. Public SDK shapes, env maps, and compatibility/input declarations remain deferred unless a future slice introduces a normalized internal boundary or explicit `ExplicitUndefined` contract rationale.
