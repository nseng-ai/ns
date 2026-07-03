# Areg Real Gateway Split

## Summary

Non-project `@sdl/areg` real gateways were split from `ts/packages/tools/areg/src/real-gateways.ts` into focused private modules under `ts/packages/tools/areg/src/gateways/`:

- `host-gateway.ts`
- `github-gateway.ts`
- `npx-skills-gateway.ts`
- `skillx-workspace-gateway.ts`
- `prompt-gateway.ts`

`real-gateways.ts` remains the compatibility import surface and continues to own `RealAregProjectGateway`, project filesystem/path-safety helpers, skill-kind spec resolution, and init/skill-kind mutation-policy logic.

Validation run:

- `pnpm --dir ts --filter @sdl/areg test`
- `just ts-format-check`
- `just ts-lint`
- `just ts-check`

`just ts-format-fix` was run after the initial format check reported mechanical formatting issues in touched TypeScript files.

## Objective Impact

The `@sdl/areg` god-file row is partially advanced. `real-gateways.ts` no longer owns unrelated host, GitHub, npx, prompt, and skillx workspace gateway implementation bodies, while public imports through `./real-gateways.ts` remain valid.

The broader row remains open because project gateway decomposition, project filesystem extraction, and init/skill-kind mutation-policy collapse are still outstanding.

## Follow-Ups

- Extract `RealAregProjectGateway` and/or project filesystem helpers into focused project-gateway/project-fs modules.
- Collapse the init/skill-kind mutation-policy fork to data while preserving current precedence and error semantics.
- Consider extracting pure skill-spec resolution classification if fake divergence remains after project-gateway decomposition.
