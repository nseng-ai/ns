# Graphite Fake/Test Helper Options Narrowing

## Summary

Narrowed a cohesive `@sdl/graphite` fake/test-helper cluster from explicit-undefined optional properties to omission-only optional properties.

Scoped inventory:

- Before: `rg -n '\?:[^\n;=]*\| undefined' ts/packages/infra/graphite/src/testing/stack.ts ts/packages/infra/graphite/test/status.test.ts` found 12 candidates.
- After: the same scoped inventory found 0 candidates.

Changed fields:

- `ts/packages/infra/graphite/src/testing/stack.ts`: `FakeGraphiteStackGatewayOptions.parent`, `children`, `trunk`, `stack`, and `stackGraph`.
- `ts/packages/infra/graphite/test/status.test.ts`: `FakeGraphiteMetadataDbAccess` helper options `exists` and `responses`; `branchRow` fixture fields `parentBranchName`, `children`, and `validationResult`; `loadWithFake` helper options `currentBranch`, `liveBranches`, and `branchLookup`.

## Objective Impact

This advances the standing cleanup loop with a review-substantive package-local test/fake helper slice. The semantic claim is that present-key `undefined` has no distinct domain or compatibility meaning for these fields: constructors/helpers already use `??` defaults or direct optional fixture passthrough, so omission and explicit `undefined` behave identically.

Preserved/deferred categories: production Graphite runtime/dependency option surfaces with `env`, `signal`, timeout, worker, or gateway injection fields were not narrowed in this slice; those remain compatibility/input/dependency bags requiring separate semantic justification.

Validation:

- `pnpm --dir ts --filter @sdl/graphite test` passed.
- `pnpm --dir ts --filter @sdl/graphite run check` passed.
- `just ts-format-check` passed.
- `pnpm --dir ts --filter @sdl/graphite run lint` was attempted but skipped as unavailable because `@sdl/graphite` has no package-level `lint` script.

## Follow-Ups

Continue selecting package/subsystem clusters rather than one-off syntactic edits. Runtime Graphite option/dependency surfaces should remain deferred unless a future slice can split or prove a stricter internal boundary without tightening caller-facing compatibility bags.
