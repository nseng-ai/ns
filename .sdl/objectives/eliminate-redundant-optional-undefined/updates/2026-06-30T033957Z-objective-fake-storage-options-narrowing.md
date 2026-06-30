# Objective Fake Storage Options Narrowing

## Summary

Narrowed the `@sdl/objective` fake-storage helper option cluster in `ts/packages/objective/src/fake-storage.ts`.

The scoped `@sdl/objective` inventory from `rg -n "\\?:[^\\n;=]*\\| undefined" ts/packages/objective --glob '*.ts'` had 31 hits before editing, including 10 removable outer optional-property declarations in `FakeObjectiveRecordOptions` and `FakeObjectiveStorageGatewayOptions`. After the slice, `fake-storage.ts` has no `?: ... | undefined` hits and the scoped package inventory is 21 hits.

Changed fields:

- `FakeObjectiveRecordOptions.objectiveMd`, `.roadmapMd`, and `.orientationMd` now preserve `null` as the explicit missing-file sentinel while dropping redundant explicit `undefined`.
- `FakeObjectiveRecordOptions.updates` and `.isClosed` are omission-only helper fields.
- `FakeObjectiveStorageGatewayOptions.files`, `.directories`, `.records`, `.failures`, and `.unreadableFiles` are omission-only helper fields.

Construction paths already treated absence and explicit `undefined` the same via `??`, `!== undefined`, and `=== true`; no producer normalization was needed.

Validation passed:

- `pnpm --dir ts run check`
- `pnpm --dir ts run test -- objective`
- `pnpm --dir ts run fmt:check`
- `pnpm --dir ts run lint`

## Objective Impact

This advances the standing cleanup row by removing redundant explicit `undefined` from internal fake/test-helper option shapes where present-key `undefined` has no domain, compatibility, input, or external-schema meaning.

Reusable classification: fake storage helper option bags can be narrowed when constructors default with `??` and callers use omission for absent setup; keep `null` when the helper intentionally uses it as a distinct sentinel for a missing fake file.

Preserved/deferred `@sdl/objective` categories remain public API/context/dependency shapes, branch-attribution tuning options, command/status callback surfaces, and runner-subagent telemetry fixtures because those are separate semantic clusters or compatibility/input-like surfaces.

## Follow-Ups

Future `@sdl/objective` slices should classify the remaining 21 scoped hits separately instead of sweeping them mechanically. In particular, telemetry usage fixtures and public context/API option bags need their own compatibility or boundary analysis before any narrowing.
