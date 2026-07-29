# Adopt End-to-End Pi Adapter PRs

## Summary

The Objective's implementation strategy is corrected: remaining Pi adapter extractions will land as end-to-end package boundaries, not as independently reviewable API-only precursors. Each PR must include any curated extension API promotion it needs, create and wire the corresponding `pi-ns-*` host package, move the complete Pi implementation and tests, migrate discovery/parity/consumers, and remove the old extension-owned Pi surface.

The current PR is repurposed from command-metadata-only work into the complete `@nseng-ai/pi-ns-handoffs` extraction. The Branch Context precursor code is removed from that PR; a separate follow-up PR will perform the complete `@nseng-ai/pi-ns-branch-context` extraction. The earlier Handoffs and Branch Context API-precursor updates remain immutable historical records, but their proposed independently landable state is superseded by this decision.

## Objective Impact

This replaces the remaining additive sequencing assumption with coherent per-adapter landing units. Handoffs API metadata still belongs on `@nseng-ai/handoffs/api`, but it lands atomically with moving all Handoffs Pi behavior to `@nseng-ai/pi-ns-handoffs` and deleting Handoffs' `/pi` surface. Branch Context keeps its existing Pi ownership until its own end-to-end extraction PR can perform the equivalent cutover.

The change reduces transitional ambiguity: reviewers evaluate one complete ownership transition per PR, and trunk does not rest in a state that advertises both a promoted API contract and an intentionally retained source-of-truth Pi surface for a future extraction. The Objective remains open because Branch Context, Flow, Herdr, internal Pi-native extractions, and final structural guards are still outstanding.

## Follow-Ups

- Complete and land the current `@nseng-ai/pi-ns-handoffs` extraction PR with focused and repository-wide validation.
- Create a separate `@nseng-ai/pi-ns-branch-context` extraction PR that atomically promotes required API contracts, moves all Pi implementation/tests/discovery/parity, migrates consumers, and removes Branch Context's `/pi` surface.
- Apply the same end-to-end landing rule to remaining Flow and Herdr adapter extractions; do not create independently landable API-only precursor PRs.
