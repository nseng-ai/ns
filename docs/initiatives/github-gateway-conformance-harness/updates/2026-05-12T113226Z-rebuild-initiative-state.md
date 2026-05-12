# Initiative State Rebuilt

## Summary

The initiative documents were rebuilt as if freshly authored under the current checked-in initiative conventions. The durable initiative now separates purpose, scope, constraints, invariants, completion criteria, and open questions from the current roadmap state.

Repository discovery for this branch found no checked-in live conformance package and no checked-in fixture contract artifact, so the roadmap no longer treats fixture-contract or conformance-spine work as partially complete.

## Roadmap Context

This is initiative curation, not live conformance implementation. It resets the effective roadmap to:

- no completed conformance work areas in the current branch;
- no currently identified in-progress conformance work areas;
- fixture and runtime configuration contract as the first remaining work area.

## Initiative Impact

Future agents should select work from `Completed`, `In Progress`, `Remaining`, and `Parked` rather than legacy `Now`, `Next`, and `Later` sections. The rebuilt plan also separates the fixture repository contract, repository provisioning, opt-in live test spine, read-only parity slice, mutation coverage, CI wiring, and operational maintenance into reviewable artifact-backed work areas.

The durable plan now emphasizes explicit repository targeting, small runtime configuration, persistent scenario fixtures, per-run mutation markers, setup-vs-semantic failure classification, and the `asdl_core.gh` stdlib-only boundary.

## Follow-Ups

- Start with the fixture and runtime configuration contract.
- Do not mark fixture or live-spine work complete until the corresponding checked-in artifacts exist in the branch being curated.
- Record future implementation progress as new update files, then curate `roadmap.md` only when accumulated updates make the durable roadmap stale.
