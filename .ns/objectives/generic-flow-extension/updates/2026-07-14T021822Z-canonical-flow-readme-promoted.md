# Canonical Flow README promoted

## Summary

Promoted the README-driven adopter contract to
`ts/packages/capabilities/flow/README.md`. The canonical package document now combines
the settled external-adopter guidance with the useful dependency matrix and hidden exec
surface from the pre-existing package README. It documents the complete command inventory,
command-scoped Graphite/GitHub/Slots requirements, model selectors, pre-submit check and
failure-marker behavior, submit-only recovery, and the three supported extension points.
Package-relative links now resolve to the repository points guide.

The former `references/README-draft.md` is now a provenance pointer to the package README,
so the Objective no longer maintains a competing copy of the user contract.

## Objective Impact

The final substantive roadmap slice and README-driven-development loop are complete. All
completion criteria are evidenced: the adopter contract is promoted, submit checks and
consumer-configurable recovery are implemented, every repo-specificity audit finding is
resolved/documented/parked, and full repository validation passes. The Objective therefore
closes as completed; its retained orientation leaves the active load set through the
Closure Marker.

The durable rule that Flow customization routes through cataloged extension points already
lives in root `AGENTS.md`. The `flow-slots-opt-in` edge remains as provenance for the
dedicated optional-Slots follow-up and does not block this closure.

## Follow-Ups

- Keep `ts/packages/capabilities/flow/README.md` synchronized with future public Flow
  command, requirement, model, and extension-point changes.
- Continue the explicitly parked speculative surfaces only when their recorded trigger is
  demonstrated.
- Advance optional Slots decoupling under `flow-slots-opt-in`, not this closed Objective.
