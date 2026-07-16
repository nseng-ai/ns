# LM-Backed Aggregation and Resolution Delivered

## Summary

The Reviews production core now accepts a schema-validated revision-range roster result and performs one LM-backed aggregation operation through a narrow injected gateway. The structured proposal partitions every source-attributed finding exactly once, preserves complete finding values and deterministic occurrence identity, records recommendation-conflict metadata, and proposes one `fix`, `fix-manually`, `reject`, or `defer` disposition per cluster.

The same Capability API operation supports model-assisted correction by accepting the prior structured result plus exact-membership `mustGroup` and `mustSeparate` constraints. Engineer decisions are applied deterministically after proposal validation: bulk confirmation confirms only unconflicted clusters, conflict clusters require an explicit complete-membership decision, and per-finding disposition accounting is derived from final cluster membership. Invalid requests, prior state, constraints, model resolution or invocation, structured output, and complete accounting fail the overall operation without a partial result.

## Objective Impact

This completes the production aggregation and manual-resolution roadmap slice while keeping Reviews a read-only producer capability. `@nseng-ai/reviews/api` exposes the iterative operation without adding a command, prompt interaction, checkpoint, Review log, GitHub publication, planned-PR construction, remediation execution, or checkout mutation. The repository model policy binds `reviews.aggregate` to the supported deep Reviews profile, while provider routing remains limited to the incumbent Claude Code and Codex harnesses.

Focused fake-driven schema, operation, gateway, structured-output, and API tests cover exact partitioning, duplicate occurrences, deterministic ordering, correction constraints, prior-result identity, conflict-safe bulk confirmation, explicit overrides, completeness states, defensive copying, read-only harness invocation, and typed failures. `just`, `just ts-test-integration`, and `just ts-test-isolated` passed on the implementation branch; the integration lane's first concurrent run timed out in an unrelated Pi cold-import smoke and passed on immediate isolated rerun.

## Follow-Ups

- Build the local command journey for explicit range and roster confirmation, correction and bulk-triage interaction, and an engineer-confirmed ordered planned-PR list.
- Exercise the complete production steelthread on representative changes before judging whether content-tuple membership or correction ergonomics need evidence-backed revision.
- Keep persistence, GitHub thread mutation, autonomous fixes, candidate branches, validation, and Flow submit/ship outside this completed producer slice.
