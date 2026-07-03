# Branch Context and Plans Error Modeling

## Summary

Remediated the remaining generic error-collapse wrappers for `branch-context` and `enriched-plan`/Plans CLIs. The package-local handlers no longer route all thrown errors through `runClinkrCommand("branch-context-error" | "plans-error", ...)`; they now emit command/domain-level kebab-case `errorType` values with structured recovery `data.code`.

Plans changes include:

- `saved-plan-list-failed`, `saved-plan-write-failed`, and `saved-plan-resolution-failed` operational failure types.
- `usageError(...)` for invalid saved-plan slugs and invalid `--stdin` / `--content-file` input mode.
- Structured `negative(...)` data for latest-plan semantic misses: `code` plus `directoryPath`.

Branch Context changes include:

- Operation-specific failure types: `branch-context-create-failed`, `branch-context-load-failed`, `branch-context-attach-failed`, `branch-context-list-failed`, `branch-context-check-failed`, and `branch-context-delete-failed`.
- Structured load-selection recovery data for ambiguous plans, unsupported keys, no supported plan entries, requested key misses, and saved-plan fallback failures.
- `usageError(...)` for invalid branch-context slug and attach source-mode mistakes.
- Kebab-case normalization for serialized Branch Context attach/namespace codes.

## Objective Impact

Area (c) `errorType` discipline is complete for the non-parked generic-wrapper gap called out by audit row 12. The earlier casing migration handled snake_case/kebab-case consistency; this slice handled the deferred deeper modeling for Branch Context and Plans.

Current-source reconciliation for the active Branch Context / Plans row is also complete. Broader final reconciliation, if desired before objective closure, should be a close-read/checklist pass rather than a known implementation gap.

Validation run:

```bash
pnpm --dir ts exec vitest run packages/plans/test/scenario/cli.test.ts packages/branch-context/test/scenario/cli-entry-ops.test.ts packages/branch-context/test/scenario/cli-surface.test.ts
just ts-format-check
just ts-lint
just ts-check
```

All commands passed after formatter fix.

## Follow-Ups

- No known non-parked Branch Context / Plans generic-wrapper residue remains.
- A final objective close-out pass may update or annotate the historical audit matrix more broadly, but row 12 is remediated in current source.
