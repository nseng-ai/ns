# Slot Fake Gateway Options Narrowing

## Summary

Narrowed Slot fake gateway option/result-builder optional fields from explicit-undefined optional properties to omission-only optional properties:

- `ts/packages/capabilities/slot/src/gateways/fakes/command.ts`: `FakeSlotCommandGatewayOptions.resultsByCwd`, `FakeSlotCommandGatewayOptions.defaultResult`
- `ts/packages/capabilities/slot/src/gateways/fakes/pr.ts`: `FakePrSummaryOptions.state`, `FakePrSummaryOptions.url`, `FakePrSummaryOptions.headRefName`, `FakeSlotPrGatewayOptions.prsByBranch`, `FakeSlotPrGatewayOptions.lookupFailures`, `FakeSlotPrGatewayOptions.batchLookupFailure`, `FakeSlotPrGatewayOptions.closeFailures`
- `ts/packages/capabilities/slot/src/gateways/fakes/repository.ts`: all `FakeSlotRepositoryGatewayOptions` customization fields, preserving `gitCommonDir?: string | null` so meaningful `null` remains distinct from omission/default

Scoped inventory command:

```bash
rg -n "\\?:[^\\n;=]*\\| undefined" ts/packages/capabilities/slot/src/gateways/fakes -C 2
```

Before editing, the scoped inventory found 24 hits under `ts/packages/capabilities/slot/src/gateways/fakes`. After editing, it found 0 hits.

## Objective Impact

This advances the standing optional-undefined cleanup loop with a coherent Slot fake-gateway slice. These first-party fake/test-support option bags model omission-only customization knobs; their constructors already treated explicit `undefined` the same as omission via `??` defaults, direct optional assignment to internal state, or an explicit `options.gitCommonDir === undefined ? "/repo/.git" : options.gitCommonDir` check. No construction path used present-key `undefined` as a semantic state.

The slice deliberately avoided real Slot gateway contracts, CLI/user-facing options, dependency/environment/process shapes, and unrelated candidate clusters. It also preserved `null` for `gitCommonDir` because `null` means no git common dir while omitted means use the fake default.

Validation passed:

- `pnpm --dir ts run check`
- `pnpm --dir ts run test -- --run ts/packages/capabilities/slot/test`
- `just ts-format-check`
- `just ts-lint`

## Follow-Ups

Continue treating first-party fake-builder option bags as good omission-only candidates when construction evidence shows defaults are omission-based, but preserve real gateway contracts and environment/process records unless a normalized internal boundary justifies narrowing them.
