# Pre-Merge Confirmation Helper Extracted

## Summary

PR #2545 follow-up review feedback identified duplicated pre-merge confirmation handling between submit/restack maintenance and managed-slot cleanup. Flow now has a shared private confirmation gate for those pre-merge maintenance paths:

- Added `ts/packages/capabilities/flow/src/land-stack/pre-merge-confirmation.ts` for `PreMergeConfirmation` and `confirmPreMergeMaintenance(...)`.
- Updated submit/restack maintenance and managed-slot cleanup to share prompt, non-interactive refusal, and cancellation behavior while keeping mutation-specific execution logic at each call site.
- Updated Flow-internal imports to use the new `PreMergeConfirmation` owner.
- Kept `sdl-flow/api`, Flow package exports, CCC consumption, public command names, and durable CCC-era refs unchanged.

Objective PR evidence:

- PR #2545: current PR “Extract Flow pre-merge submit and confirmation helpers” — advances land-stack decomposition by narrowing pre-merge maintenance ownership and aligning confirmation behavior across sibling responsibilities.

## Objective Impact

This continues the roadmap row “Decompose Flow land command shells from land-stack domain orchestration.” The row remains open because mutation-heavy merge-loop execution, backup refs, branch deletion/restack maintenance, broader `src/land.ts` shell cleanup, and final API/export rebaseline still need follow-up evidence before completion.

The review feedback also slightly de-risks the land-stack safety concern: shared confirmation infrastructure reduces drift between pre-merge guardrails without moving behavior into neutral infrastructure or widening `sdl-flow/api`.

## Follow-Ups

- Continue decomposing remaining Flow-owned land-stack merge-loop responsibilities only in bounded behavior-preserving slices.
- Keep future confirmation helpers Flow-private unless another capability proves a genuine cross-capability need.
- Re-run final API/export cleanliness checks after the remaining structural slices land.
