# Slot Test Helper Options Narrowing

## Summary

Narrowed the slot capability test helper option bags so omission-only fields no longer accept explicit present-key `undefined`:

- `ts/packages/capabilities/slot/test/support/run-scenario.ts`: removed redundant `| undefined` from all 12 `ScenarioRunOptions` optional properties (`git`, `gt`, `pr`, `cwd`, `stdin`, `confirmations`, `env`, `repo`, `clipboardResult`, `command`, `canEmitAnsi`, `caps`).
- `ts/packages/capabilities/slot/test/scenario/gt-exec-cli.test.ts`: removed redundant `| undefined` from 9 local helper fields across `QuiescenceScenarioOptions` and `StackMapScenarioOptions` (`stack`, `git`, `gt`, `rows`, `diagnostics`, `repo`). The one construction path that previously passed `repo: options.repo` now conditionally omits `repo` when absent.

Scoped candidate count for the two target files went from 19 to 0 for `?: ... | undefined` matches.

Validation passed:

- `pnpm --dir ts exec vitest run packages/capabilities/slot/test/scenario/gt-exec-cli.test.ts`
- `pnpm --dir ts run check`

## Objective Impact

This advances the standing cleanup loop with a cohesive helper-only `slot` test slice. The semantic claim is that these scenario option bags use omission as the absent state; explicit present-key `undefined` is not domain data, public compatibility, or an external schema mirror. Constructors and helper functions already read the properties through optional access, defaults, `??`, or conditional spreads.

Reusable finding: when narrowing a test helper option bag under `exactOptionalPropertyTypes`, also inspect helper-to-helper forwarding. If a property is forwarded as `field: options.field`, replace it with an omission-preserving spread before narrowing the target type.

## Follow-Ups

Deferred/preserved categories remain:

- Runtime slot context creation options in `ts/packages/capabilities/slot/src/context.ts`, which involve environment, caps, extensions, and prompt/interaction compatibility surfaces.
- Public SDK/command option surfaces under `ts/packages/sdl-sdk/*`.
- Reusable fake gateway option types such as slot gateway fakes and `@sdl/graphite/testing`, which are broader fake-builder inputs rather than local scenario-only helper bags.
- Integration/real-backend payload mirrors and `null | undefined` cases where external or domain meaning may be present.
