# Roaster review execution and same-session findings recording migrated to SDL command face

The review-execution slice is implemented through the SDL extension command face without removing the standalone `roaster` binary commands.

## What changed

- Added `sdl roaster review run <key>` via the project-local Roaster extension manifest and package shim.
- Added hidden automation command `sdl roaster exec record-findings` using the existing dynamic `exec-<name>` hidden-group convention.
- Added optional full-payload `stdin` to `SdlExtensionApi` and threaded the real SDL CLI reader into selected command execution. This is deliberately minimal and separate from Clinkr interactive confirmation stdin (`readStdinLine`).
- Threaded `ctx.stdin` into the Roaster SDL runtime adapter so stdin-consuming Roaster commands keep the standalone JSON payload contract.
- Added a narrow Roaster API/domain seam for same-session findings recording: `recordSameSessionFindings()` and `createRoasterClient(...).recordFindings(request)`. It returns domain outcomes rather than exposing `ClinkrExit` through the Capability API.
- Preserved standalone `roaster review run` and `roaster exec record-findings`; `exec publish-findings` remains unmigrated for the next steer-first row.

## Compatibility evidence

- Review logs still use Branch Memory namespace `roaster` and keys under `reviews/<review-key>/...`.
- `review run` still preserves result data when review-log writing fails and reports the same resolved model/profile/base-ref/changed-path progress on stderr.
- `record-findings` still reads JSON findings from stdin and reports malformed stdin as `review_execution_invalid_json`.
- SDL tests are fake-backed: no real model-backed Roaster review, no real Branch Memory write, and no GitHub publication.

## Validation

- `pnpm --dir ts --filter @sdl/roaster run check`
- `pnpm --dir ts --filter @sdl/sdl run check`
- `just ts-format-check`
- `pnpm --dir ts --filter @sdl/roaster run test -- packages/roaster/test/unit/api.test.ts packages/roaster/test/unit/record-findings.test.ts packages/roaster/test/scenario/review-cli.test.ts packages/roaster/test/scenario/exec-cli.test.ts`
- `pnpm --dir ts --filter @sdl/sdl run test -- packages/sdl/test/scenario/roaster-extension-cli.test.ts`

## Follow-up

`roaster exec publish-findings` remains the next steer-first disposition row because it is the GitHub write-capable publication boundary and currently has raw-command semantics.
