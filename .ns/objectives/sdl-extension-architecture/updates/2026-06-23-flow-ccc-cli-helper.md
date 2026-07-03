# Flow CCC CLI Helper

## Summary

A7 completes the CCC CLI delegation cleanup for the project-local flow extension. The repeated command-local adapter pattern in `land`, `autoslot`, and `pull-trunk` now lives in `.sdl/extensions/flow/src/shared/ccc-cli.ts`.

The helper owns only the shared SDL-extension-to-CCC mechanics:

- translate CCC runner exec options into SDL extension exec options;
- accumulate runner stdout/stderr while forwarding durable output through `ctx.stdout`/`ctx.stderr`;
- optionally forward exec live output through `ctx.onOutput` for commands that already had that behavior;
- map numeric CCC runner exit codes into SDL `ok(...)` / `failed(...)` results with command-provided fallback messages.

Command-specific input construction remains in each command file.

## Objective Impact

This marks A7 complete for the flow shared-code track. The three flow commands now share a narrow flow-local CCC CLI helper while preserving lower-package delegation:

- `land` still delegates to `runLandCli` from `@sdl/ccc/land`, still builds `--yes` / `--dry-run` raw args locally, and still passes confirmation and live-output/status hooks when available.
- `autoslot` still delegates to `runAutoslotCli` from `@sdl/ccc/autoslot`, with `env` and parsed slug args kept in the command file.
- `pull-trunk` still delegates to `runTrunkPullCli` from `@sdl/ccc/trunk-pull` as the minimal no-argument wrapper.

No public `@sdl/sdl/sdk` surface was added, no CCC runner contract was reshaped, and the A6 Graphite ownership decision remains untouched.

## Evidence

Implementation evidence:

- `.sdl/extensions/flow/src/shared/ccc-cli.ts` exports `runFlowCccCli()` as the flow-local helper for shared CCC CLI I/O/result mapping.
- `.sdl/extensions/flow/src/commands/land.ts`, `.sdl/extensions/flow/src/commands/autoslot.ts`, and `.sdl/extensions/flow/src/commands/pull-trunk.ts` import the helper and no longer carry their own `let stdout = ""` / `let stderr = ""` accumulation blocks.
- `ts/packages/sdl/test/unit/extension-shared-ccc-cli.test.ts` covers success/failure fallback mapping, durable stdout/stderr forwarding, timeout/cwd exec-option translation, and optional live-output forwarding.
- The existing land scenario remains the command-level guard for `sdl flow land` confirmation behavior.

## Follow-Ups

- Keep the remaining submit validation/readiness work separate; this helper does not change submit orchestration.
- Leave broader docs/context readiness refresh to the later Objective row.
- Do not promote this helper into the public SDL SDK unless future cross-extension evidence proves a real author API need.
