# Canonical Contracts Slice Complete

## Summary

Completed the `thermo-followups/canonical-contracts` slice. `@asdl/branch-context` now owns the `/branch-context:impl` command formatting contract in `impl-command.ts`, including the default `plan.md` key elision rule. CCC and pi-extensions consume that canonical formatter instead of duplicating the command literal or formatting logic.

`session-artifact.ts` now exposes a discriminated `BranchContextOutputDetails` contract, a `buildBranchContextOutputMessage` helper for producers, and a canonical `findLatestBranchContextEvidence` helper with namespace filtering. CCC and pi-extension branch-context message producers are typed through the canonical builder while programmatic extraction remains intentionally limited to the `status: "success"` evidence variant.

CCC residue was cleaned in the same slice: stale branch-context selection inference was replaced with the canonical latest-evidence helper, plan-key literals moved to constants, and the up-and-impl launcher now carries a named target rather than loose branch/key plumbing where it matters.

## Objective Impact

The third roadmap branch is complete. The impl-command formatter and branch-context output-message contract now live in `@asdl/branch-context`, and both higher-level consumers depend on that canonical surface. This satisfies the Objective criteria for eliminating the duplicate `/branch-context:impl` literal/formatter and typing `presentBranchContextMessage` producers against the canonical details contract.

Validation evidence: `pnpm --dir ts run check && pnpm --dir ts run test` passed. Grep evidence found exactly one `/branch-context:impl` literal across TS source/test files, in the canonical branch-context impl-command module.

## Follow-Ups

Continue with `thermo-followups/extension-decomposition`: fix the status sequencing regression, split the Pi branch-context extension by command family, and move plans-domain code/tests to `@asdl/plans`.
