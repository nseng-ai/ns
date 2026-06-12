# Group 1 parity and test hardening

Semantic update for the Group 1 `pr-address` TypeScript port work.

- Landed the CLI parity correction for `--format`: `--format json` and `--format=json` now select JSON machine-envelope output through one parser in `cli.ts`, and the option is stripped before managed operation handlers run.
- Landed strict decimal-integer parsing for managed CLI integer arguments that previously accepted JavaScript numeric spellings such as `1e2`, `0x10`, and `12.5`. The TypeScript path now rejects those forms as invalid requests instead of accepting JavaScript coercions.
- Strengthened real-adapter tests for scripted `RealPrAddressGitHubGateway` / `RealPrAddressGitGateway` behavior: lookup miss vs command failure, GraphQL error payloads, `comments.nodes` defaults, non-numeric IDs, and restructured-file line parsing.
- Added known-mismatch coverage for the `json-schema-parity.ts` comparator so the parity harness is proven capable of failing on property, required-set, enum, and nested type drift.
- Deliberately dropped fixture regeneration, drift detection, and provenance stamps from this Objective per the 2026-06-12 planning decision; Objective completion criteria and the test-hardening roadmap row now reflect the narrower test-hardening scope.

Validation evidence captured during implementation:

- `pnpm --dir ts/packages/pr-address run check`
- `pnpm --dir ts/packages/pr-address run test`
