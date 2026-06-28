# Update: Dynamic completion hooks with Slot branch proof

Implemented a small command-owned dynamic completion provider API across Clinkr, the SDL SDK bridge, and the SDL resolver.

Evidence:

- `@sdl/clinkr` now preserves synchronous static completion (`completeClinkrWords`, `ClinkrGroup.complete`) and adds an async path (`completeClinkrWordsAsync`, `ClinkrGroup.completeAsync`) that appends provider candidates to static candidates and dedupes.
- Dynamic providers receive Clinkr completion context (`current`, `previous`, command `args`, and `positionalIndex`) plus the command context; provider failures are captured so static candidates remain available.
- `sdl-sdk` exposes `completionProvider` on `SdlCommand`; the kernel validates it, bridges it to Clinkr only for the selected command, awaits async completion in `sdl completion exec resolve`, and keeps resolver stdout candidate-only with exit code 0 on provider failure.
- `sdl slot checkout` and `sdl slot co` now complete local branches from `SlotRepositoryGateway.listLocalBranches()` for both branch and base positionals without performing checkout/create/delete mutations.

Validation run:

- `pnpm --dir ts --filter @sdl/clinkr test`
- `pnpm --dir ts --filter @sdl/kernel test`
- `pnpm --dir ts --filter @sdl/slot test`
- `just ts-check`
- `just ts-format-check`
- `just ts-lint` (existing warnings only)

Limits retained:

- Branch completion is local branches only; remote refs are out of scope.
- No file/directory helper API or shell-specific rich metadata was added.
- The newline shell resolver still renders candidate values only and drops descriptions.
