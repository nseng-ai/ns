# Status, Recovery, and Documentation

## Summary

The extension now includes `/stack-status` for read-only recovery diagnostics and improves `/stack-run` resume behavior. Status reports the canonical plan locator/hash, Objective slug, ordered planned branches, per-branch git/ledger/handoff/completion state, first incomplete branch, dirty worktree state, missing artifact warnings, plan hash drift, invalid ledgers, and Graphite parent mismatches or unavailable tracking.

`/stack-run` can now resume a first-incomplete branch that already exists when the branch has a valid pointer ledger matching the canonical plan hash. In that case it checks out the existing branch and starts a fresh session instead of trying to recreate the branch. Plan/ledger hash drift fails closed.

The README now documents the v1 plan frontmatter format, example body, Branch Memory namespaces and key derivation, pointer-ledger contract, done/blocked tool semantics, recovery/status behavior, and v1 limitations.

## Objective Impact

PR 5's roadmap row is complete as landed-state evidence: recovery/status/docs and diagnostics are present, and the full v1 workflow is documented. The roadmap work items for this Objective are now all complete, but the Objective remains open pending explicit closure direction.

Validation: full `just`.

## Follow-Ups

- Ask whether to close the Objective, leave it open for review, or add follow-up hardening slices.
- Parked hardening remains available for future work: mechanical closeout verification, checked-in schemas, branch repair flows, richer UI, and gated PR submission.
