# List-candidates slice completed

## Summary

The TypeScript `objective` package now includes the hidden `objective exec list-candidates` command used by skill and Pi selection surfaces.

The command reuses active checkout inventory, emits only active open Objective records, excludes closed and archive-root records, renders default output as `slug<TAB>status` rows, and preserves the JSON machine shape `records: [{slug, status}]` inside the Clinkr envelope. Focused scenario and unit tests cover TSV output, JSON shape, open filtering, closed/archive exclusion, hidden exec help visibility, and the fact that this command does not need git dirty facts.

Parent-side validation passed:

- `pnpm --dir ts --filter @asdl/objective run check`
- `pnpm --dir ts --filter @asdl/objective run test`
- `pnpm --dir ts run check`

## Objective Impact

The roadmap row for `objective exec list-candidates` is now complete. The TypeScript package now covers the read-objective and candidate-selection hidden command surfaces that skills and Pi wrappers depend on for deterministic Objective selection and inspection.

A minor rendering note remains: empty candidate output currently renders as a newline through the TypeScript Clinkr path. This did not block the slice because the durable consumer contract is the JSON record shape and TSV row format for present candidates.

## Follow-Ups

- Continue with full `objective list` branch attribution and richer human/Markdown rendering.
- Preserve the established candidate JSON shape when caller/install cutover later points the standalone `objective` command at the TypeScript package.
