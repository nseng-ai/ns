# Raw top-level Objective CLI eliminated

## Summary

The previous slice retired the `bin.objective` package binary but left the standalone
run-from-source CLI intact, so `objective` was still invokable: the installed
`~/.local/bin/objective` shim and the `just install-objective` recipe ran
`node ts/packages/objective/src/cli.ts` directly, and `ts/packages/objective/src/cli.ts`
remained a runnable `defineCli` entry exported as `@sdl/objective/command-face`. This
slice removes that surface entirely; the only Objective command surface is now
`sdl objective ...` through the checked-in extension.

Changes:

- Deleted `ts/packages/objective/src/cli.ts` and its `@sdl/objective/command-face`
  package export; dropped the `buildCli`/`runCli`/`VERSION`/`CliDeps` re-export from
  `ts/packages/objective/src/index.ts`. No first-party package imported these.
- Ported the one command never migrated to the extension — `load-orientations` — to the
  SDL surface as `sdl objective exec load-orientations`
  (`ts/packages/objective/src/sdl/commands/exec-load-orientations.ts` plus the
  `.sdl/extensions/objective/` manifest entry and re-export). All other commands were
  already on the extension.
- Removed the raw-CLI scenario harness (`test/support/run-scenario.ts`) and its eight
  `test/scenario/*-cli.test.ts` files, which exercised the deleted entry. Relocated the
  coverage that those tests uniquely held (`check`, `load-orientations`) into
  `ts/packages/sdl/test/integration/objective-extension-cli.test.ts`, which now also adds
  an `orientation.md` to the demo record and asserts `exec load-orientations` markdown and
  JSON output.
- Removed the `install-objective` recipe and dropped it from `install-tools` in
  `justfile`; deleted the installed `~/.local/bin/objective` shim.
- Repointed prose that still named the bare binary to `sdl objective ...`: `AGENTS.md`
  (the always-loaded `load-orientations` command and the standalone-CLI list),
  `skills/objective/SKILL.md`, `docs/objective-system.md`,
  `docs/pi/cmux-extension-pattern.md`, and `docs/retros/cli-surface-conformance-audit.md`.

## Objective Impact

Completes the deliberate-retirement policy for the top-level `objective` binary: it no
longer exists as an installed shim, a `just` install target, or a runnable package entry.

Evidence from the repo root:

- `command -v objective` resolves to nothing (shim removed; not on PATH).
- `ts/packages/objective/src/cli.ts` no longer exists.
- `./ts/node_modules/.bin/sdl objective exec load-orientations --format md` renders the
  active orientation Markdown with exit code 0.
- `./ts/node_modules/.bin/sdl objective exec load-orientations --help` shows
  `Usage: sdl objective exec load-orientations`.
- `rg "@sdl/objective/command-face|objective/src/cli" ts` produced no matches.

Validation passed:

- `just` (deps:check, ts-guard, fmt:check, lint, tsgo check, full Vitest suite —
  345 files, 3386 tests).
- `pnpm --dir ts exec vitest run --config vitest.integration.config.ts packages/sdl/test/integration/objective-extension-cli.test.ts` — 5 tests passed.

## Follow-Ups

- None required. Any future need for a bare `objective` shortcut would be a new explicit
  compatibility decision, not a regression of this retirement.
