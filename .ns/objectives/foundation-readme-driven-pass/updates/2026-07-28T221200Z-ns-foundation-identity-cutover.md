# ns-foundation identity and architecture cutover

## Summary

The package formerly named `@nseng-ai/foundation` is hard-cut to `@nseng-ai/ns-foundation` at `ts/packages/public/infra/ns-foundation/`. The change preserves version, exports, implementation behavior, and the intentional runtime dependency on `@nseng-ai/clinkr`; there is no forwarding package, compatibility export, alias, or dual-name period.

ADR 0049 records the architectural interpretation: Clinkr is the lower, generally applicable CLI layer, while ns-foundation owns cohesive shared infrastructure and conventions for the ns product family below workflow-specific behavior. ADR 0032 remains immutable history, but its Foundation placement claims are superseded for ns-foundation. The package temporarily retains `ns.tier: "neutral-infra"`; taxonomy repair and reclassification are explicit deferred work rather than a semantic redefinition of Neutral Infra.

## Objective Impact

The identity/architecture correction is complete as an immediate prerequisite slice that did not need to wait for the Clinkr README dry run. Workspace consumers, generated lockfile links, release inventory and scenario fixtures, style/topology guards, reinvention canonicals, package-local tests, current skills, and live domain guidance now use the ns-foundation identity. Targeted package, style-guard, ns-dev release-workflow, reinvention-scanner, and package-boundary tests pass.

The Objective remains blocked only for its later README-driven work: the ns-foundation contract draft, implementation and caller audit, reconciliation, promotion, and subsequent package passes still await Clinkr's completed dry run and returned gate-calibration lessons.

## Follow-Ups

- Receive and synthesize the Clinkr dry run's process amendments before creating or running the ns-foundation README Subobjective.
- Keep module redistribution and export redesign outside this cutover; raise focused ownership proposals during or after the later contract audit.
- Repair package-tier vocabulary and classify ns-foundation under a fitting tier in separate architecture work.
