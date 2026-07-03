# Review Cleanup Recorded

## Summary

The `aretro-typescript-cleanup-source-ref-sha256` branch and PR #1841 record a small post-parity TypeScript cleanup for `@asdl/aretro` against Graphite parent `aretro-evidence-parity-payload-cleanup`.

Changes:

- `ts/packages/aretro/src/sha256.ts` now routes SHA-256 prefixing through the shared `sha256Digest` primitive from `@asdl/core/primitives` instead of hand-rolling `node:crypto` hashing locally.
- `ts/packages/aretro/src/payloads/evidence-payload.ts` converts `SourceRefValue` from an object-shape type alias to a readonly interface.
- `ts/packages/aretro/src/payloads/store.ts` renames the exclusive payload-write ownership flag from `ownsPath` to `hasCreatedPath`, preserving cleanup semantics while making the boolean predicate clearer.

Verification:

- `pnpm --dir ts --filter @asdl/aretro run check` passed.
- `pnpm --dir ts --filter @asdl/aretro run test` passed.
- `pnpm --dir ts run fmt:check` passed.
- `pnpm --dir ts run lint` passed.
- `pnpm --dir ts run check` passed.
- `pnpm --dir ts run check:legacy` passed.
- `pnpm --dir ts run test` passed.

PR evidence: #1841 corroborates the same file set and cleanup scope.

## Objective Impact

This cleanup keeps the completed TypeScript parity and payload-detail work aligned with shared platform primitives and the TypeScript style rules without changing the evidence contract, adding evidence kinds, changing payload schemas, or weakening the privacy boundary.

The Objective remains open. The substantive remaining work is still Python retirement, root workspace/build/lock cleanup, stale-reference sweep, rollback/reference evidence, and then the umbrella TypeScript migration Objective/playbook update.

## Follow-Ups

- Continue with `aretro-ts-retire-python` when ready: remove the Python package fallback and active workspace wiring only after preserving rollback/reference evidence and confirming no required checkout-free/prod consumer remains.
- After Python retirement, update `.asdl/objectives/port-asdl-toolkit-to-typescript/` and the porting playbook with the final `aretro` cutover outcome and reusable lessons.
