# Payload consolidation and contract typing

Semantic update for the Group 2 consolidation and canonical-contract work in the `pr-address` TypeScript port.

- Moved embedded/reference XOR input resolution into `json-input.ts` and migrated `stack-feedback-plan`, `stack-feedback-diff-current`, and `build-stack-resolve-thread-payloads` onto the shared resolver.
- Deleted the shallow `stack_plan` / `current_prep` reference-shape schemas. Reference-backed stack plan/current prep inputs now receive the same downstream validation as embedded inputs; `--prep-reference` remains schema-validated because embedded `prep` is schema-typed at the same boundary.
- Added package-local `loadOperationPayload` with snake_case-key-derived `--<key>-reference` options, centralized payload/reference resolution, and the documented stdin edge for fully reference-backed diff inputs.
- Strengthened contract typing around payload manifests and finalization: manifest builders now accept gateway-domain feedback types, `finalizeRun` returns a typed `FinalizeRunResult`, and redundant post-boundary parses were removed from the touched helpers.
- Replaced the `mode as ResolutionMode` cast in resolve-thread payload construction with an explicit guard.
- Roadmap rows completed in this group: shared XOR resolver, one reference-validation rule, declarative payload spec, stdin edge pin, and canonical contract typing work covered by this stack.

Validation evidence captured during implementation:

- `pnpm --dir ts/packages/pr-address run check`
- `pnpm --dir ts/packages/pr-address run test`
- `pnpm --dir ts exec vitest run --config vitest.config.ts packages/pr-address/test/scenario/json-schema-routes.test.ts`
