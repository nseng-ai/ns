# `branch-pr-checks` JSON contract defined

## Summary

The pre-implementation machine contract is now durable in
`references/branch-pr-checks-json-contract.md`. It preserves mapping `status` as
`found | missing | ambiguous` and adds a separate `pr_status` using stack-view's exact
`draft | checks-failing | unresolved | ready | no-pr` vocabulary. Pending checks may
coexist with `ready`; consumers still inspect counts and entries to decide whether checks
have settled.

The contract defines tri-state check freshness against the genuine head-commit push time,
with missing or invalid timestamp evidence classified as `unknown`; only fresh or unknown
failing checks make the current head `checks-failing`. It also defines exact
pending-only recognition of `Graphite / mergeability_check` as visible trailing work,
complete check-context and review-thread pagination on every successful found entry, and
all-or-failure behavior for malformed or failed continuation pages.

## Objective Impact

The contract-definition roadmap row is complete. The stack-view backend decision is also
complete: edge evidence from `flow-pi-tier` requires promoted stack-view to consume the
enriched Address backend rather than retain duplicate GraphQL facts. The Objective's two
contract-level Open Questions are therefore recorded as resolved, while the runtime
implementation/testing row remains open.

The next concrete slice is to implement and test the enrichment across capability-kit
GitHub query/schema/gateway pagination, the Address Capability API outcome vocabulary, PR
Address core payload derivation, the real Zod command result schema, fake gateway fixtures,
unit tests, scenario tests, and the package README once behavior ships.

## Follow-Ups

- Verify that GitHub exposes a genuine head-commit push timestamp; do not substitute
  authored or committed time.
- Implement complete check-context and review-thread pagination with command/gateway
  failure on any incomplete continuation.
- Keep the contract's additive field names, precedence, examples, and exact Graphite
  recognition synchronized with the implementation tests.
