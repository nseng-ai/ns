# Absorbed thermo-review and payload-reference records

## Summary

On 2026-06-10 this record absorbed two sibling Objectives that also edited `ts/packages/pr-address` on divergent branches: `pr-address-ts-thermo-review-followups` (TS-package quality remediation from the thermo-nuclear review) and `payload-reference-generalization` (payload/reference consolidation from the `stack-artifact-reference-payload-file-options` branch review). Both are now closed as intentionally subsumed; all work on the package sequences in this one roadmap.

Key decisions recorded with the absorption:

- **Sequencing gate:** the Python-reference-dependent rows (parity corrections, test hardening with fixture regeneration/provenance, canonical-contracts parity arbitration) MUST precede the endgame `python-deletion` branch. The thermo record's key insight — remediate while the Python reference is in-repo — is preserved as a hard guard note on that branch.
- **#5b disposition:** spec-driven generation of option allowlists and `--json-schema` documents from the payload spec dissolves into the clinkr shell migration (owned by `ts-cli-foundation`) rather than landing standalone, per the overlap note's own recommendation. Final ownership of `loadOperationPayload` is the `ts-cli-foundation` payload-home decision row.
- **Reconciliation discharged:** the three planted "reconcile later" rows/notes — the thermo record's reconciliation open question, the payload record's "post-merge reconciliation" roadmap row, and the clinkr record's payload-overlap note — are hereby discharged by this consolidation.

## Objective Impact

The roadmap's `## Work` section is restructured into explicitly sequenced groups: group 1 (Python-reference-dependent, before `python-deletion`), group 2 (payload/reference consolidation: shared XOR resolver, one validation rule, declarative payload spec, stdin-edge pin), group 3 (structural/dedup: dead-code sweep, operation-support layer, single operation table, required gateways, file decomposition, thread-decision engine, `stack-feedback-prep` split, test-scaffolding consolidation), and a coordination row for the clinkr shell migration owned by `ts-cli-foundation`. The Endgame Stack section is unchanged except the `python-deletion` guard.

Scope, Non-Goals, Completion Criteria, Assumptions and Risks, and Open Questions in `objective.md` absorbed the corresponding content from both records; the former cross-objective drift risks are dropped as resolved by the consolidation, and the clinkr-divergence risk (keep spec conventions snake_case and `--<key>-reference`-derived) is carried.

## Follow-Ups

- Coordinate the clinkr shell migration and payload-home decision with `ts-cli-foundation` (which consolidated `asdl-core-ts` + `ts-clinkr-commander` the same day).
- Both closed records (`.asdl/objectives/pr-address-ts-thermo-review-followups/`, `.asdl/objectives/payload-reference-generalization/`) remain historical provenance for the original review findings.
