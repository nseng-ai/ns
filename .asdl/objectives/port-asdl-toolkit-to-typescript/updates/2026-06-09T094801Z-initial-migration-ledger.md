# Initial Migration Ledger

## Summary

The umbrella Objective now includes an initial lightweight migration ledger for the TypeScript port. The ledger classifies active or potentially active first-party capabilities as unstarted, TS-default, parked pending evidence, reference-source, or out of scope.

The first committed vertical slice remains `pr-address`. Existing TS-default surfaces include `asdl-dev`, Planned Branch, Pi/CCC runtime packages, and `ts-plans`. Python `asdl-core` is explicitly treated as a domain-contract reference source rather than a direct module map. `areg`, `packagechk`, and `asdl-dispatcher` are parked pending active-use or strategic-value evidence.

## Objective Impact

This completes the first roadmap item: establishing the initial migration ledger for active first-party capabilities. It narrows the next Objective move to creating the `pr-address` capability subobjective while preserving the umbrella policy that unclear capabilities need evidence before porting.

The ledger also resolves the initial open question about which capabilities are active enough to start tracking immediately versus parked pending evidence, replacing it with a narrower follow-up question about which parked entries should later be promoted.

## Follow-Ups

- Create the `pr-address` capability subobjective as the first production vertical slice.
- Refine parked ledger entries only when active-use or strategic-value evidence appears.
- Keep the ledger lightweight; detailed port design belongs in capability subobjectives.
