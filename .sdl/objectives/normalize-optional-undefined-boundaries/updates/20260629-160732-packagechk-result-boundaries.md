# Packagechk Result Boundaries

## Summary

Tightened the `@sdl/packagechk` registry check result metadata model so internally constructed absent metadata is represented by omitted keys instead of explicit `undefined` values.

Targeted evidence:

- Before: `RegistryCheckResult` had 3 metadata fields typed as `?: T | undefined` (`packageUrl`, `latestVersion`, `description`).
- After: `RegistryCheckResult` has 0 targeted `?: T | undefined` metadata fields; the fields are now omission-only optional properties.
- Packagechk-wide optional-undefined grep now reports only the scenario support dependency/options bag, not packagechk source result models.

## Objective Impact

This advances the active “Clean small internally constructed diagnostics/result models” row for the packagechk slice. `RegistryCheckResult` is a result model constructed by packagechk constructors/gateways, and construction already used conditional object spreads to omit absent metadata. The model now matches that runtime behavior.

Preserved/deferred boundaries:

- Registry parser helpers still return `string | undefined` when external JSON fields are absent or malformed.
- `buildMetadata` keeps required input properties with `string | undefined` values as the parser-to-domain normalization seam, then emits omitted optional metadata keys.
- CLI/Zod result schemas remain a serialization boundary; the schema transform normalizes optional parser output back into `RegistryCheckResult` so internal data keeps omission-only semantics.
- Test support dependency/options bags remain outside this result-model slice.

Validation run:

```bash
pnpm --dir ts/packages/tools/packagechk run check
pnpm --dir ts/packages/tools/packagechk run test
```

Both passed.

## Follow-Ups

Continue the active diagnostics/result-model row with the remaining named areas: kernel command/extension diagnostics, areg replacement info, and check-count `hasMore` models. Do not treat packagechk parser, CLI schema, or test option surfaces as unresolved packagechk result-model debt.
