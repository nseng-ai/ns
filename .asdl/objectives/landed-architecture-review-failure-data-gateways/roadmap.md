# Roadmap

## Work

- [x] Re-baseline the failure-as-data and gateway-extraction inventory against current master.
      Evidence: completed 2026-06-09 against master `e9062814`; full inventory in `updates/2026-06-09-1423-rebaseline-failure-data-and-gateway-inventory.md`. All seed sites located and characterized; `HandoffUsageError`/`CustomCliUsageError`/`RuntimeResultParseError` confirmed removed; new sites since 2026-06-05 captured (`@asdl/plans` package with duplicated `GitResult` shapes, Python provenance/checkpoint unions, `asdl-core` pure-boundary extraction wave); no reversals of the trend found.
- [ ] Run `improve-codebase-architecture` over the inventoried sites to name, split, or reject a shared failure/boundary contract.
      Review mode: architecture first; add `thermo-nuclear-code-quality-review` only if a concrete code-heavy slice emerges. Resolve whether failure-as-data and gateway conventions are one contract or two.
      Input inventory: the 2026-06-09 re-baseline update, especially its shape observations — four coexisting TS discriminant idioms, the `@asdl/plans`/`@asdl/planned-branch` `GitResult` duplication, the `machine-envelope.ts` throw-vs-data divergence, and the asdl-core-vs-areg Python split.
- [ ] Record the decision: adopt a documented convention (choose its home, write the authoritative artifact, optionally demonstrate it on one targeted exemplar slice) or park with do-not-re-suggest rationale.
      Evidence: the artifact or parking rationale exists; targeted validation passed for any exemplar code change.

## Parked

None.
