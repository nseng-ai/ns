# Subsumed into pr-address-typescript-port

## Summary

This Objective was closed on 2026-06-10 as intentionally subsumed into `pr-address-typescript-port`, in the same consolidation that absorbed `pr-address-ts-thermo-review-followups`. The record was created deliberately as a standalone, possibly-duplicative record; its planned "post-merge reconciliation" row is satisfied by this consolidation rather than by a later merge-time pass.

The PR 1–3 rows moved to the survivor's payload/reference-consolidation group: the shared XOR-source resolver in `json-input.ts`, the single reference-validation/diagnostics rule (which also resolves the duplicated `stackPlanReferenceShapeSchema` and part of the survivor's canonical-contracts row), the declarative `loadOperationPayload` per-operation payload spec, and the stdin-edge documentation plus scenario pin.

## Objective Impact

Dispositions decided with the closure:

- Parked #5b (spec-driven generation of option allowlists and `--json-schema` documents from the payload spec) dissolves into the clinkr shell migration under `ts-cli-foundation` rather than landing standalone.
- The eventual `loadOperationPayload` lift decision (clinkr first-class vs package-local) is owned by `ts-cli-foundation`'s payload-home decision row; the survivor keeps the spec design clinkr-compatible (snake_case keys, `--<key>-reference` derivation) in the meantime.

Active tracking for all of this record's scope now lives in `.asdl/objectives/pr-address-typescript-port/`; the original review findings here remain historical provenance.

## Follow-Ups

- Track the payload/reference rows in `pr-address-typescript-port`'s sequenced roadmap.
- Track the payload-home decision in `ts-cli-foundation`.
