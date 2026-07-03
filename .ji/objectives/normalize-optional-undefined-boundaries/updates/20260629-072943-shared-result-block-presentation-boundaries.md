# Shared Result Block Presentation Boundaries

## Summary

The shared result-block presentation slice is complete. The selected primary files now have zero `?: T | undefined` hits for the targeted internal presentation fields, down from 20 hits before the slice:

- `ts/packages/infra/cli-theme/src/result-block.ts`
- `ts/packages/ccc/src/autoslot-presentation.ts`
- `ts/packages/capabilities/flow/src/autoslot-presentation.ts`
- `ts/packages/capabilities/flow/src/land-stack/land-presentation.ts`
- `ts/packages/capabilities/slot/src/operations/destructive-presentation.ts`
- `ts/packages/handoff/src/operations/destructive-presentation.ts`

The tightened fields are `body`, `guidance`, and `cwd` on the shared `@sdl/cli-theme` result-block inputs and the direct Flow/CCC/slot/handoff facades. Slot destructive presentation callsites that previously passed `string | undefined` detail bodies now conditionally omit `body` instead of forwarding explicit `undefined`.

Validation evidence: `pnpm --dir ts run check` passed, and `pnpm --dir ts run test -- --run ts/packages/infra/cli-theme/test/result-block.test.ts ts/packages/ccc/test/autoslot-presentation.test.ts ts/packages/ccc/test/land-presentation.test.ts` passed.

## Objective Impact

This completes the result-block and presentation-model roadmap row for the direct shared result-block slice. Internal presentation records in this callstack now model absence by omission after construction, while rendering behavior remains unchanged.

The broader candidate rebaseline row remains partial: this update records before/after evidence for the selected presentation slice, but the Objective still needs final counts and preserved/deferred rationale across the remaining clusters.

Preserved/deferred categories remain unchanged for this slice: option/input/override/deps/config bags, test fixture builders/fakes, external payload mirrors, meaningful `null` cases, and unrelated lifecycle/gateway/diagnostics surfaces were intentionally left out of scope.

## Follow-Ups

- Continue with the focused Flow submit transcript/result pass.
- Keep the final inventory/rationale row open until the remaining clusters have updated counts and explicit compatibility/deferred rationale.
