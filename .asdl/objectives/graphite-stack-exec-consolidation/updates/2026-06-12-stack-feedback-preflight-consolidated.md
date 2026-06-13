# Stack feedback preflight consolidated

Implemented the roadmap row "Consolidate stack-address preflight mechanics".

- Added `pr-address exec stack-feedback-preflight` as a Graphite-neutral TypeScript exec operation.
  - Input: `{"branches":[...]}` from stdin or `--branches-json`.
  - Behavior: maps branches to open PRs, fails closed on missing PR coverage before artifacts, writes a frozen `{"stack":[...]}` artifact, runs unresolved-only stack feedback prep, and returns full or compact output.
  - Compact output includes `mapping_summary`, `stack_reference`, `stack_summary_reference`, whole-stack `summary`, feedback-bearing `stack[]`, and `zero_feedback_prs[]`.
- Extended `stack-feedback-prep` with `--stack-reference <payload_path>` so drift and final verification can refetch the exact frozen stack without re-deriving mapping.
- Updated stack-address and pr-address skill references to use the new preflight path and reserve the lower-level `map-branch-prs` + manual stack JSON path for explicit partial-coverage overrides.
- Added TypeScript scenario coverage for preflight happy paths, zero-feedback stacks, missing coverage, validation failures, GitHub gateway failures, and lowest-PR-number branch tie-breaking; added prep reference-input coverage.

Validation evidence from implementation session:

- `pnpm --dir ts --filter @asdl/pr-address run check` passed.
- `pnpm --dir ts --filter @asdl/pr-address run test` passed.
- `pnpm --dir ts run test` passed.
- `just dprint-check` passed.

Parked follow-up: `--stdout-mode full|compact` remains repeated across stack feedback operations and is a candidate for a later Clinkr/managed-option consolidation.
