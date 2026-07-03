# Parent migration Objective promoted areg

## Summary

The parent `port-asdl-toolkit-to-typescript` Objective now records `areg` as an active out-of-sequence TypeScript migration slice instead of leaving it parked pending evidence.

Parent tracking changes made for this slice:

- Migration ledger marks `areg` as an active out-of-sequence subobjective.
- Planned capability order keeps the default `handoff` / `objective` sequence but records the explicit `areg` exception.
- Roadmap records the `areg` promotion as completed tracking work.
- Semantic Update `port-asdl-toolkit-to-typescript/updates/2026-06-14T210247Z-areg-promoted-out-of-sequence.md` names `areg-typescript-port` as the active capability slice and preserves the remaining sequence implications.

## Objective Impact

The first roadmap row for this Objective is complete. Future `areg-typescript-port` work can start with the contract inventory row without risking drift from the umbrella TypeScript migration ledger.

The parent Objective still treats the default post-`brmem` order as durable after this exception is resolved: when the `areg` slice completes or parks again, future work should deliberately resume or revise the remaining sequence instead of silently inheriting stale ordering prose.

## Follow-Ups

- Inventory current `areg` contracts before porting implementation.
- Feed reusable `areg` lessons back to the parent Objective only after concrete porting evidence proves them beyond this package.
