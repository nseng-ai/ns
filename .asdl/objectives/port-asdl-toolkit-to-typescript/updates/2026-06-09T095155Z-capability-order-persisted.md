# Capability Order Persisted

## Summary

The umbrella Objective now records the default capability port order:

1. `pr-address`
2. Branch Memory / `brmem`
3. Handoff / `handoff`
4. Objectives / `objective`
5. `asdl-dispatcher` / `dispatcher`
6. Roaster / review workflows
7. Slots / `slot`
8. Vibe check / `vibechk`
9. Branch retrospectives / `aretro`

`aretro` is intentionally last so retrospective and evidence-analysis work benefits from mature git, Graphite, command-runtime, and evidence payload foundations. `asdl-dispatcher` is promoted from parked pending evidence to unstarted/in-scope because coding-task dispatch is strategically important for future agent orchestration, even though the current Python package is thin.

## Objective Impact

This changes sequencing guidance without changing the first vertical slice: `pr-address` remains first. The roadmap now says future selection should follow the persisted order while still allowing fresh integration-leverage evidence to revise the sequence when materially justified.

The migration ledger now treats `asdl-dispatcher` as an in-scope unstarted capability rather than a parked candidate.

## Follow-Ups

- Create the `pr-address` subobjective first.
- When `pr-address` is complete, select `brmem` unless new evidence strongly justifies changing the persisted order.
- Keep `aretro` last unless its evidence-gathering surface becomes a dependency for earlier ports.
