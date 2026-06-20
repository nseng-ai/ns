# Subsumed into ts-cli-foundation

## Summary

This Objective was closed on 2026-06-10 as intentionally subsumed into `ts-cli-foundation`, the consolidated record for the shared TypeScript CLI layer (it also absorbs `ts-clinkr-commander`).

Shipped under this record before closure: the `@asdl/core` package with `primitives`, the unified `exec` subprocess runtime (adopted by 7 packages), and `brmem-cli`.

Two of this record's open rows were superseded rather than carried over: the "CLI scaffolding layer" row is superseded by shipped `@asdl/clinkr` v1 (clinkr is the scaffolding layer), and the "Result type and tri-state envelope" row is superseded by the clinkr `legacyMachine` decision — uniform envelope adoption and negative/failure classification are now umbrella debt (`port-asdl-toolkit-to-typescript/migration-debt.md` entries 1–4).

## Objective Impact

This record is no longer the active owner of the shared TS foundation work. The live rows — shared git gateway, Zod boundary validation, asdl-dev public surface, scenario-test harness, and umbrella reconciliation — moved to `.asdl/objectives/ts-cli-foundation/`. The thesis, scope, roadmap, and historical updates here remain immutable provenance.

## Follow-Ups

- Continue all shared-TS-layer planning and tracking in `ts-cli-foundation`.
- Do not reopen this record; if new foundation-layer scope appears, add it to the survivor.
