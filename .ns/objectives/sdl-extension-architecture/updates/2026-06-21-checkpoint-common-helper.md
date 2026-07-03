# Checkpoint Common Helper

## Semantic Update

`prepareCheckpointMessage` now lives in a dedicated extension-owned shared helper module at `.sdl/extensions/shared/checkpoint-message.ts`.

`cp`, `autobranch`, and `submit` import checkpoint message preparation from that helper. The cleanup removes the dead local checkpoint prompt/validation/diff-compaction blocks from `cp` and `autobranch`, and removes the dead bundled checkpoint message prompt/validation helpers from `submit` while leaving the generated submit workflow artifact otherwise intact.

This was an intentional common-helper step, not a public SDL SDK promotion. `@sdl/sdl/sdk`, `ts/packages/sdl/src/sdk.ts`, and `ts/packages/sdl/src/sdk-module-loader.ts` remain unchanged for checkpoint preparation. Public SDK promotion can be reconsidered later if the shared helper shape proves stable and author-facing.

## Remaining Liability

`submit.ts` is still a bundled/generated-style artifact. It now uses the shared checkpoint message helper for live message preparation, but broader submit debundling and package-owned checkpoint flow cleanup remain separate work.
