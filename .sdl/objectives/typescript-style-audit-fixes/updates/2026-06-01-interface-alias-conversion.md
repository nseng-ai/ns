# Interface Alias Conversion Completed

## Summary

Converted the TypeScript package's named object-shape aliases from `type` to `interface` across `ts/packages/pi-extensions/src` and `ts/packages/pi-extensions/test`. The fresh AST baseline before editing matched the planned inventory: 404 type aliases total, including 268 direct object-literal aliases and 23 intersections for review.

After the conversion scan:

- direct object-literal aliases: 0;
- simple object-contract intersections converted to `interface extends`: 19;
- intentionally preserved intersection aliases: 4.

The preserved intersections remain `type` because they express utility or union composition rather than a plain object contract:

- `DevExtensionAPI`, an intersection of extension parameter utility extractions;
- `RunnerSubagentOptions`, an object base intersected with a mutually exclusive option union;
- two test-only `SentMessage` helpers based on `Parameters<...>`/indexed access plus local options.

## Objective Impact

This completes the roadmap row for object-shape and contract alias conversion. Public exported names remain stable, type-only imports/exports continue to work, and runtime behavior is unchanged. Union aliases, function aliases, helper aliases, and discriminated unions were intentionally left as `type`.

Validation passed:

- `bun run --cwd ts/packages/pi-extensions check`
- `bun run --cwd ts/packages/pi-extensions test`
- `just ts-check`
- `just ts-test`

## Follow-Ups

Continue with the remaining TypeScript style audit rows: harden untyped JSON/tool/runtime boundaries, rework expected failures toward returned data where callers branch on them, and clarify dependency-injection ownership around Node/Pi adapters.
