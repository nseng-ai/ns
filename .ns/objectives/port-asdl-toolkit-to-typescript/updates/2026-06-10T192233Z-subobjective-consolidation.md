# Subobjective consolidation: ts-cli-foundation and pr-address ownership

## Summary

On 2026-06-10 the umbrella's subobjective family was consolidated to remove overlapping ownership:

- `asdl-core-ts` and `ts-clinkr-commander` — which both claimed this umbrella's "minimal TS migration scaffold" / "JS/TS clinkr foundation" rows and had begun to conflict on scaffolding/envelope ownership — were closed as subsumed into a new merged subobjective, `ts-cli-foundation`. It owns `@asdl/clinkr`, `@asdl/core`, and the migration of the four core CLIs onto them.
- `pr-address-ts-thermo-review-followups` and `payload-reference-generalization` were closed as subsumed into `pr-address-typescript-port`, so all `ts/packages/pr-address` work sequences in one roadmap (with the clinkr shell migration coordinated from there but owned by `ts-cli-foundation`).
- Separately, `landed-architecture-review-umbrella` closed as complete (all five child records created and themselves closed).

## Objective Impact

- The "Define the minimal TS migration scaffold" and "Begin the internal JS/TS clinkr foundation incrementally" rows are now `[~]` with evidence pointing at `ts-cli-foundation`: `@asdl/clinkr` v1 built, `@asdl/plans` migrated, and `@asdl/core` `primitives`/`exec`/`brmem-cli` landed; remaining work is tracked in the subobjective.
- The parked "Exact public API shape and package identity for JS/TS clinkr" item is resolved and removed from Parked: `@asdl/clinkr` + `@asdl/core`, both repo-private. The corresponding open question is marked resolved in `objective.md`.
- The migration-debt ledger is unchanged; entries 1–4 now also serve as the parking ground for the former asdl-core-ts envelope/Result row.

## Follow-Ups

- Foundation tracking continues in `.asdl/objectives/ts-cli-foundation/`; pr-address tracking continues in `.asdl/objectives/pr-address-typescript-port/`.
- When `ts-cli-foundation` completes, progress the two `[~]` rows here to `[x]` with its closure evidence.
