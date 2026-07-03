# SDL Shell Completion Proving Consumer

## Summary

Added the first SDL-facing shell completion slice. `sdl completion bash`, `sdl completion zsh`, and `sdl completion fish` now print shell setup scripts that dynamically call hidden `sdl completion exec resolve` instead of embedding static command snapshots.

The hidden resolver is handled before normal command dispatch so completion stdout is the shell protocol: newline-delimited candidate values only, with descriptions intentionally omitted for this slice. Clinkr owns the reusable shell script renderer and newline candidate formatter; SDL kernel owns the built-in `completion` command group plus extension catalog, selected-command loading, and diagnostics policy.

## Objective Impact

This completes/substantially advances the SDL proving-consumer row and advances the shell bridge row for bash, zsh, and fish setup generation. Dynamic/custom runtime completion providers remain out of scope.

Lazy-extension behavior is preserved for this slice:

- top-level resolver completion builds candidates from catalog metadata and does not eager-load command modules;
- selected-command option completion imports only the selected command before building the Clinkr tree;
- selected broken command loads report on stderr and return no candidate stdout with shell-friendly exit code 0;
- unrelated malformed/throwing extension modules are not loaded for unrelated resolver completions and do not corrupt resolver stdout.

## Evidence

Implemented files:

- `ts/packages/infra/clinkr/src/completion.ts`
- `ts/packages/infra/clinkr/src/index.ts`
- `ts/packages/kernel/src/cli.ts`
- `ts/packages/kernel/src/operations/completion.ts`
- `ts/packages/infra/clinkr/test/completion.test.ts`
- `ts/packages/kernel/test/scenario/completion-cli.test.ts`

Validation run:

- `just ts-format-fix`
- `just ts-format-check`
- `just ts-lint` (passes with existing unrelated warnings)
- `just ts-check`
- `just ts-test`
- `just dprint-check`
- `cd ts && pnpm --filter @sdl/clinkr test`
- `cd ts && pnpm --filter @sdl/kernel test`

## Remaining Work

- Full user-facing completion docs remain for the Objective docs row.
- Dynamic/custom runtime value providers are still parked for a later design decision.
- Manual interactive shell smoke testing can be recorded separately if performed; CI coverage is deterministic script/resolver contract testing only.
