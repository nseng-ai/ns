# Fixture Contract Defines Harness Boundaries

## Summary

The fixture contract establishes the safety and configuration boundary for live GitHub conformance: tests target a deliberate repository, persistent scenario resources are cataloged as read-only fixtures, and mutating cases must use per-run ownership markers instead of touching shared fixtures.

This turns the fixture model from an open design area into a reviewable operating draft. It does not select the canonical repository, credential model, or real persistent fixture identities.

## Roadmap Context

This completes the roadmap area for defining the fixture and runtime configuration contract as a checked-in artifact. It also gives the opt-in live conformance spine and first read-only parity slice a concrete repository, authentication, preflight, and fixture-catalog model to build against.

Repository provisioning remains open: the contract is usable only after a real fixture repository and catalog entries are chosen.

## Initiative Impact

Future work should assume explicit repository selection, a checked-in persistent fixture catalog, read-only golden resources, mutation opt-in, and setup-vs-semantic-drift failure classification as the baseline harness model.

The initiative should continue to track the canonical repository, visibility, maintainer, credentials, and first fixture identities as unresolved operating decisions.

## Follow-Ups

- Choose or create the canonical conformance repository and decide its visibility, maintainer, and credential model.
- Replace placeholder fixture catalog entries with real persistent PR and issue scenario identities.
- Build and run the first read-only fake/real parity slice against the selected repository.
