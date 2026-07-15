# Cloud-execution references reorganized by topic

## Summary

The Objective's operational references had accumulated around sessions and incidents:
one setup field guide, one chronological Vercel report, and one cross-boundary steel-thread
findings draft each repeated deployment, credentials, debugging, and runtime facts.

The references are now organized by stable living topics under
`references/README.md`:

- setup and preflight;
- deployment contract;
- credentials and trust;
- Workflow and Sandbox runtime;
- anchor and landing;
- Pi runner;
- debugging and observability.

`dispatch-live-evidence.md` is the append-only ledger of witnessed deployments, runs, PRs,
commits, bounded claims, and resulting contract changes. The Vercel deployment feedback
report remains chronological and vendor-facing. The old integration field-guide path is a
compatibility pointer for immutable records that already cite it.

## Maintenance rule

When new evidence arrives:

1. append the witnessed fact and its limits to the evidence ledger;
2. update exactly one owning living topic reference;
3. update the canonical README only for user-visible behavior;
4. update the roadmap only for sequencing/status;
5. create a Semantic Update only for a decision, direction, or material status transition;
6. update the Vercel report only for vendor behavior.

Evidence records what happened; topic references state what is currently true. Historical
observations are corrected through explicit supersession rather than silent rewrite.

## Objective impact

- The canonical `README-draft.md` remains the user-facing contract.
- `objective.md`, `orientation.md`, and `roadmap.md` now point setup work at the topical
  procedure and record the completed Workflow probes plus the bounded first dispatch result.
- Stale prototype guidance in the old field guide no longer competes with the adopted
  Workflow-supervisor architecture.
- Future setup-skill work has one ordered procedure and explicit topic owners instead of an
  omnibus session narrative.
