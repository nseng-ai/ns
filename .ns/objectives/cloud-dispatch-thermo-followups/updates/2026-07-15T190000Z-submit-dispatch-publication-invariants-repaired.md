# Submit and Dispatch Publication Invariants Repaired

## Summary

The ordinary Flow submit path now performs an early capability-free eligibility check, completes inventory and metadata amendments, then reacquires revision-fresh Graphite readiness immediately before primary submit. A primary submit semantic failure stops before any follow-up stack-update publication. The cohesive ordinary-command transport preparation and presentation policy moved into `submit-transport-preparation.ts`, leaving `submit.ts` at 819 formatted lines.

Local prompt dispatch now uses one final source gate for both already-current and newly published sources. The gate runs after semantic anchor-name selection and availability probing, immediately before anchor push, and rechecks repository identity, branch, expected HEAD, clean worktree, dispatch preflight, and exact remote tip. Later anchor-push, anchor-PR, trigger, and run-stamp failures preserve completed Git or Graphite publication evidence in human and machine output.

## Objective Impact

This repairs publication invariants in the downstream source-publication feature that consumes the extracted dispatch-client seam. It does not close or alter any remaining thermo-review roadmap row. Anchor-name create-only/lease hardening remains explicitly deferred.

Validation passed locally: focused Flow/Vercel/package-boundary tests, TypeScript typecheck, lint, formatting, style guard, all 6,556 default tests, all 189 integration tests, all 16 isolated tests, and the full `just` baseline. No live Graphite submit, Git push, PR mutation, Vercel deployment, Workflow trigger, or dispatch was performed or claimed.

## Follow-Ups

- Keep anchor-name TOCTOU hardening separate from this invariant repair.
- Preserve the final pre-anchor source gate when plan and handoff dispatch reuse the local client.
- Continue the remaining thermo rows independently.
