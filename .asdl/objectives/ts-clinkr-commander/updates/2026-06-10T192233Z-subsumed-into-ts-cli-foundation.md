# Subsumed into ts-cli-foundation

## Summary

This Objective was closed on 2026-06-10 as intentionally subsumed into `ts-cli-foundation`, the consolidated record for the shared TypeScript CLI layer (it also absorbs `asdl-core-ts`).

Shipped under this record before closure: `@asdl/clinkr` v1 per the 2026-06-10 design grilling, CLI-surface pinning suites for all four CLIs, and the `plans` migration with its feed-forward clinkr corrections.

This record and `asdl-core-ts` both claimed the umbrella's "JS/TS clinkr foundation" row, and asdl-core-ts's open scaffolding/envelope rows had begun to conflict with shipped clinkr decisions. The consolidation gives the layer one owner.

## Objective Impact

Active tracking moved to `.asdl/objectives/ts-cli-foundation/`: the remaining clinkr migrations (`planned-branch`, `asdl-dev`, the `pr-address` CLI shell with legacy-fallback preservation) and the umbrella-update row. The payload/JSON-input open question moved there as a decision row (recommendation: clinkr-first-class, pr-address as proving consumer), coordinated with `pr-address-typescript-port`, which absorbed `payload-reference-generalization` in the same consolidation.

The historical updates here — including the v1 design decisions and the payload-reference overlap note — remain immutable provenance.

## Follow-Ups

- Continue migration and payload-home tracking in `ts-cli-foundation`.
- The planted reconciliation note in `updates/2026-06-10T170322Z-payload-reference-generalization-overlap.md` is discharged by this consolidation.
