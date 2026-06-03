# Review Skill Routing Rubric

## Summary

The Objective now records how to choose between `improve-codebase-architecture`, `thermo-nuclear-code-quality-review`, or both for each landed architecture cluster.

The durable rubric is:

- Use `improve-codebase-architecture` when the main question is what Module, Interface, Seam, Adapter, locality, or leverage should exist.
- Use `thermo-nuclear-code-quality-review` when the main question is whether the implementation is structurally too messy: giant files, spaghetti conditionals, wrong-layer logic, casts/optionality, or missed code-judo simplification.
- Prefer architecture first, then thermo-nuclear review. Architecture chooses the battlefield; thermo-nuclear review pressure-tests implementation quality.
- Exception: when a cluster is obviously dominated by giant messy files or ad-hoc conditionals, a quick thermo-nuclear scan may reveal a deletion/restructuring move before deeper interface design.

Per-cluster routing was added to the roadmap. The default `both` path applies to cmux, Pi CLI lifecycle, Graphite/source-control mutation UX, and slot operation occupancy. Handoffs and saved-plan/dispatch identity start architecture-first with targeted thermo only if implementation complexity appears. Agent resource ontology starts architecture-only unless a code-heavy slice emerges.

## Objective Impact

This update sharpens the execution method for every roadmap item without changing the cluster ordering. It reduces the risk that future sessions either over-apply the thermo-nuclear review before naming a seam, or over-apply architecture review without catching local code-judo simplifications in implementation-heavy clusters.

The Objective now has a repeatable assessment standard for each independent item before implementation or parking decisions are made.

## Follow-Ups

- When starting each roadmap item, confirm the recorded review mode still fits after inspecting the first concrete files.
- If a skill route changes for a cluster, record the reason in that cluster's Semantic Update or parked rationale.
