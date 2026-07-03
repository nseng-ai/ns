# Flow Model Generation Helper

## Summary

A5 now has a thin flow-local model generation helper. `.sdl/extensions/flow/src/shared/model-generation.ts` owns command-facing wiring from `SdlExtensionApi` to the package-owned generation helpers: changes summaries route through `draftChangesSummary()`, and checkpoint messages route through `prepareCheckpointMessage()` with the flow-selected checkpoint model.

The helper deliberately does not own prompts, validation, or repair policy. Those remain behind the existing internal-migration exports and re-export shims in `text-generation.ts` and `text-helpers.ts`.

## Objective Impact

This completes A5 for the flow shared-code track:

- `changes`, `cp`, and `autobranch` no longer wire model generation directly from command files.
- `shared/text-generation.ts` and `shared/text-helpers.ts` remain package re-export shims.
- Submit-failure interpretation stays command-local by design because it is a one-shot terminal failure summary, not the checkpoint/changes validate-or-repair path.
- Submit's checkpoint path remains package-owned through `runCheckpointIfPending` and is not refactored by this row.
- No public `@sdl/sdl/sdk` surface was added.

Validation/evidence collected:

- Focused unit coverage was added for the new helper, including changes model selection, checkpoint model selection, and checkpoint repair delegation.
- Stale-call searches confirmed the target command files consume the new helper and submit-failure interpretation remains local to `submit.ts`.

## Follow-Ups

A6 still needs the Graphite/stack-ops ownership decision. A7 still needs CCC delegation boilerplate cleanup. The broader docs/context readiness-matrix refresh remains a later row; this update only records the A5 implementation boundary.
