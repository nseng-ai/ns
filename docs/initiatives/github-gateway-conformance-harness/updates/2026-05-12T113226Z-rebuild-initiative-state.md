# Initiative State Reset to Current Conventions

## Summary

The initiative state was rebuilt into durable planning documents: `initiative.md` carries thesis, scope, constraints, invariants, completion criteria, and open questions, while `roadmap.md` carries the ordered work state.

That curation found no checked-in fixture contract or live conformance spine in the branch snapshot being curated, so the durable plan reset to the artifact-backed sequence beginning with the fixture and runtime configuration contract.

## Roadmap Context

This is curation rather than GitHub conformance implementation. It reset the roadmap to an evidence-based work order: define the fixture/runtime contract, provision the canonical repository, establish the opt-in live spine, prove read-only parity, add mutation coverage, wire CI, and then add operational maintenance.

## Initiative Impact

Future updates should treat roadmap status as a claim that needs checked-out evidence. Work areas should move only when the corresponding docs, tests, commands, fixture identities, or validation results exist in the repository state being curated.

The durable initiative now emphasizes explicit repository targeting, small runtime configuration, persistent scenario fixtures, per-run mutation ownership, setup-vs-semantic failure classification, and the `asdl_core.gh` stdlib-only boundary.

## Follow-Ups

- Start implementation from the fixture and runtime configuration contract.
- Keep roadmap movement tied to durable artifacts and validation, not branch intent.
- Record future progress as state deltas before refreshing `initiative.md` or `roadmap.md`.
