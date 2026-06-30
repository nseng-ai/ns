# Slot Context and Gateway Option Narrowing

## Summary

Narrowed a Slot-focused internal option/helper slice so present-key `undefined` is no longer part of omission-only contracts:

- `createRealSlotContext` and `slotContextExtensions` now use `caps?: Caps`, `extensions?: Readonly<Record<string, unknown>>`, `formatPrompt?: ConfirmationPromptFormatter`, `stderr?: (text: string) => void`, and `shouldWriteCdDirective?: boolean`.
- Slot real gateway helper options now omit redundant explicit `undefined` for `execApi`, `coreGit`, `allowFailure`, and `operation`.
- `SlotCommandRunOptions.env` was classified as an environment-map passthrough and converted to `ExplicitUndefined<"env-map", NodeJS.ProcessEnv>` rather than left as a raw optional-undefined property.
- Two construction sites now omit optional keys with conditional spread instead of passing present `undefined`: Slot extension `stderr` and Pi PR feedback envelope `shouldAllowFailureData`. The Pi PR feedback helper also narrowed its local `allowFailureData` option while fixing full TypeScript validation fallout from the existing exact-optional-property contract.

Scorecard:

- Repo-wide scope `ts`: raw optional-undefined properties `418 -> 403`; typed explicit-undefined contracts `82 -> 83`; legacy preserve markers `0 -> 0`; undefined-normalization/check lines `2317 -> 2319`.
- Touched scope `ts/packages/capabilities/slot/src/context.ts`, `ts/packages/capabilities/slot/src/extension.ts`, `ts/packages/capabilities/slot/src/gateways/command.ts`, `ts/packages/capabilities/slot/src/gateways/repository.ts`, `ts/packages/capabilities/slot/src/gateways/pr.ts`, `ts/packages/hosts/pi/src/pr/extension.ts`: raw optional-undefined properties `16 -> 1`; typed explicit-undefined contracts `5 -> 6`; legacy preserve markers `0 -> 0`; undefined-normalization/check lines `17 -> 19`.

The remaining touched-scope raw property is a separate Pi PR feedback option not part of the Slot gateway/context slice.

## Objective Impact

This advances the continuous cleanup row by removing redundant raw optional-undefined from Slot internal context and gateway option bags while preserving deliberate explicit-undefined categories. The semantic claim is that the narrowed Slot helper fields use omission/defaulting only; present-key `undefined` has no separate domain behavior. Environment-map passthrough remains explicit with `ExplicitUndefined<"env-map", ...>`, and existing Slot DI/default seams using `ExplicitUndefined<"di-seam", ...>` were preserved.

Validation evidence:

- `pnpm --dir ts run check` passed.
- `pnpm --dir ts exec vitest run packages/capabilities/slot/test/gateways/real-repository-gateway.test.ts packages/capabilities/slot/test/gateways/real-pr-gateway.test.ts packages/capabilities/slot/test/scenario/gc-cli.test.ts` passed.
- `pnpm --dir ts exec vitest run packages/hosts/pi/test/pr-download-feedback.test.ts` passed.
- `just ts-format-check` passed.
- `just ts-lint` passed.

## Follow-Ups

- Preserve `ExplicitUndefined<"env-map">` for environment maps and `ExplicitUndefined<"di-seam">` for dependency-injection seams when explicit present-key `undefined` intentionally selects a loose/default boundary.
- The remaining Slot raw candidates in diagnostics, shell cd-directive, planning/inventory, and Graphite payload tests should be classified in separate coherent slices rather than batched with this gateway/context cleanup.
