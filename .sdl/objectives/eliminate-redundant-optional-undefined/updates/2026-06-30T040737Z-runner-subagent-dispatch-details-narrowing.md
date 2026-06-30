# Runner Subagent Dispatch Details Narrowing

## Summary

Narrowed the runner-subagents dispatch details helper option fields from explicit-undefined optional properties to omission-only optional properties, and normalized the direct callsite to omit `requestedModel` when no model override was supplied:

- `ts/packages/local-pi-tools/runner-subagents/src/extension.ts`: `dispatchRunnerSubagentDetails` option `requestedModel`
- `ts/packages/local-pi-tools/runner-subagents/src/extension.ts`: `dispatchRunnerSubagentDetails` option `curatedContext`
- `ts/packages/local-pi-tools/runner-subagents/src/extension.ts`: `dispatchRunnerSubagentDetails` callsite now uses a conditional spread for `requestedModel`

Scoped inventory command:

```bash
rg -n "\\?:[^\\n;=]*\\| undefined" ts/packages/local-pi-tools/runner-subagents/src ts/packages/local-pi-tools/runner-subagents/test -C 2
```

Before editing, the scoped inventory found 3 hits: the two helper option fields above plus the preserved exported `RunnerSubagentOptions.model` input field in `extension-api.ts`. After editing, the scoped inventory found 1 hit: the preserved `RunnerSubagentOptions.model` input/options surface.

## Objective Impact

This advances the standing optional-undefined cleanup loop with a small, coherent runner-subagents internal helper slice. `dispatchRunnerSubagentDetails` already builds the returned `DispatchRunnerSubagentDetails` object with omission-only spreads:

- `...(options.requestedModel === undefined ? {} : { requestedModel: options.requestedModel })`
- `...(options.curatedContext === undefined ? {} : { curatedContext: options.curatedContext })`

The output shape already uses omission-only fields, and the helper has no meaningful present-key `undefined` state for these inputs. The direct callsite now mirrors that semantic claim by omitting `requestedModel` when `input.model` is absent rather than forwarding a present-key `undefined`. The slice deliberately preserved `RunnerSubagentOptions.model?: string | undefined` because it is an exported caller input/options surface for model override forwarding.

Validation passed:

- `pnpm --dir ts run check`
- `pnpm --dir ts run test -- --run ts/packages/local-pi-tools/runner-subagents/test`
- `just ts-format-check`
- `just ts-lint`

## Follow-Ups

Continue preserving exported API input/options fields such as `RunnerSubagentOptions.model` unless a future slice introduces a normalized internal boundary or stronger evidence that explicit `undefined` is not part of the compatibility contract.
