# Created by consolidating asdl-core-ts and ts-clinkr-commander

## Summary

This record was created on 2026-06-10 by consolidating two open Objectives, `asdl-core-ts` and `ts-clinkr-commander`, both now closed as intentionally subsumed here.

The consolidation resolved three concrete overlaps:

- **Dual claim on the umbrella row.** Both parents claimed `port-asdl-toolkit-to-typescript`'s "minimal TS migration scaffold" / "internal JS/TS clinkr foundation" rows as their realization. One record now owns that layer.
- **Scaffolding/envelope conflict.** asdl-core-ts's open "CLI scaffolding layer" row duplicated what shipped `@asdl/clinkr` v1 already is, and its "Result type and tri-state envelope" row contradicted the settled clinkr `legacyMachine` decision (umbrella `migration-debt.md` entry 1 defers uniform envelope adoption to the end-of-migration burn-down). Resolution: clinkr owns everything command-shell-shaped; the scaffolding row is superseded, and envelope/Result adoption is parked under the umbrella's debt ledger (entries 1–4).
- **Three-way JSON-input ownership.** Payload/JSON-input loading had three candidate homes (clinkr first-class, pr-address package-local via `loadOperationPayload`, or asdl-core's shared JSON loader). This record now owns the decision row, with a recorded recommendation of clinkr-first-class and pr-address as proving consumer, coordinated with `pr-address-typescript-port`'s absorbed payload-spec rows.

What each parent had already shipped stays recorded in its closed record: `ts-clinkr-commander` shipped `@asdl/clinkr` v1 (full design per the 2026-06-10 grilling), CLI-surface pinning suites for all four CLIs, and the `plans` migration; `asdl-core-ts` shipped the `@asdl/core` package with `primitives`, the unified `exec` runtime (adopted by 7 packages), and `brmem-cli`.

Roadmap provenance: this record's roadmap carries only the live rows from both parents; completed rows and their evidence remain in the closed parents' roadmaps as history.

## Objective Impact

This is the record's creation event. Active tracking for the shared TS CLI layer (clinkr migrations, git gateway, Zod boundary validation, asdl-dev public surface, test-harness consolidation, payload-home decision, umbrella reconciliation) now lives here and only here.

## Follow-Ups

- Both closed parents (`.asdl/objectives/asdl-core-ts/`, `.asdl/objectives/ts-clinkr-commander/`) are preserved as historical provenance; consult them for design rationale and shipped-work evidence.
- Update the umbrella `port-asdl-toolkit-to-typescript` rows to point here (tracked as a roadmap row).
- Coordinate the pr-address shell migration and payload-home decision with `pr-address-typescript-port`, which absorbed the pr-address quality-remediation and payload-reference records in the same consolidation.
