# SDL Objective extension and top-level binary retirement

## Summary

Objective now has a canonical SDL command-system surface under `sdl objective ...`.

The slice added a checked-in project SDL extension at `.sdl/extensions/objective/` and package-owned Objective SDL command modules under `ts/packages/objective/src/sdl/`. The SDL surface exposes human commands `list`, `check`, and `archive`, plus hidden grouped exec helpers as `sdl objective exec list-candidates`, `sdl objective exec read-objective`, and `sdl objective exec runner-subagent-usage`.

The top-level package binary policy is deliberate retirement: `ts/packages/objective/package.json` no longer declares `bin.objective`. The package command face remains exported as `@sdl/objective/command-face` for tests/adapters, but repo-owned skill/prose instructions now name `sdl objective ...`.

## Objective Impact

The roadmap row `SDL Objective execution / vanilla extension integration` is complete.

Evidence from the repo root:

- `./ts/node_modules/.bin/sdl objective --help` shows `Usage: sdl objective [options] [command]` and lists `archive`, `check`, and `list`.
- `./ts/node_modules/.bin/sdl objective list --help` shows `Usage: sdl objective list [options]` with Objective list flags.
- `./ts/node_modules/.bin/sdl objective list --minimal` rendered Objective records from `.sdl/objectives`.
- `./ts/node_modules/.bin/sdl objective list --minimal --format json` returned a Clinkr JSON envelope with `status: ok`, `exitCode: 0`, and `data.records`.
- `./ts/node_modules/.bin/sdl objective exec read-objective --help` shows `Usage: sdl objective exec read-objective [options] [slug]`.
- `./ts/node_modules/.bin/sdl objective exec read-objective objective-capability-extension --format md` rendered `# Objective \`objective-capability-extension\``.
- `./ts/node_modules/.bin/sdl objective exec list-candidates --format json` returned a Clinkr JSON envelope with `status: ok`, `exitCode: 0`, and candidate records.
- `node -e 'const p=require("./ts/packages/objective/package.json"); if (p.bin?.objective) process.exit(1)'` passed, proving `bin.objective` is absent.
- `rg "@sdl/pi" ts/packages/objective/src ts/packages/objective/package.json`, `rg "@sdl/pi/objectives" ts/packages`, and `rg "@sdl/ccc" ts/packages/hosts/pi/src ts/packages/hosts/pi/package.json` produced no matches.

Validation passed during the slice:

- `pnpm --dir ts --filter @sdl/objective check`
- `pnpm --dir ts --filter @sdl/objective test`
- `pnpm --dir ts --filter @sdl/sdl check`
- `pnpm --dir ts --filter @sdl/sdl test`
- `pnpm --dir ts exec vitest run --config vitest.integration.config.ts packages/sdl/test/integration/objective-extension-cli.test.ts`
- `pnpm --dir ts --filter sdl-sdk check`
- `pnpm --dir ts --filter @sdl/ccc check`
- `pnpm --dir ts --filter @sdl/ccc test`
- `pnpm --dir ts --filter sdlcc check`
- `pnpm --dir ts --filter sdlcc test`
- `pnpm --dir ts --filter @sdl/pi check`
- `pnpm --dir ts --filter @sdl/pi test`
- `just ts-format-check`
- `just ts-lint`
- `just ts-check`
- `just ts-deps-check`
- `just ts-guard`
- `just ts-test`
- `just`

## Follow-Ups

- If users still need a temporary compatibility shim for the retired top-level `objective` binary, that should be a new explicit compatibility decision; this slice intentionally removed the package binary.
