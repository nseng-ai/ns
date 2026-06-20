# PR 1 Core API Complete

## Summary

PR 1's additive core Gh API slice is complete. The local branch diff against Graphite parent `add-unified-pr-gateway-core-gh-api` expands the core PRGateway surface, adds PR-domain result types, populates `PRSummary.head_ref_oid`, moves real PR lifecycle/conversation behavior into `RealPRGateway`, expands `FakePRGateway`, and keeps the old IssueGateway path available for later migration PRs.

Verification: targeted core gateway tests passed; full `just` passed.

## Objective Impact

This marks roadmap PR 1 complete under landed-state semantics. The unified core boundary is now present for asdl-core while consumer packages can still use the old names until their migration PRs.

The implementation de-risks the core side of the most response-shape-sensitive work: tests cover PR discussion comment parsing, review creation author parsing, review-thread post-state parsing, `headRefOid` propagation into `PRSummary`, and guarded merge success/failure result semantics.

## Follow-Ups

- Start PR 2 by migrating `asdl-pr-address` from the old issue gateway path to the unified PRGateway.
- Resolve the open CLI-result naming question for review-thread mutations while updating `asdl-pr-address` scenario tests.
- Keep final deletion/docs cleanup parked until all production consumers have migrated.
