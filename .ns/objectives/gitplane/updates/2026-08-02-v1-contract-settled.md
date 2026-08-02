# Gitplane v1 Contract Settled

## Summary

The first README-driven-development pass is complete. Human grilling and the immediate pre-implementation refinement settled the user-facing v1 contract across package/CLI topology, multi-domain TypeScript configuration, recursive artifact boundaries, generic and classified identity, schema transitions, deterministic digests/revisions/events, operator-owned relational projections, gateway seams, reconciliation consistency, errors, SQLite responsibilities, and check-only CI support.

The most consequential correction to the originating proposal is that v1 reconciliation is deliberately non-transactional. It uses a deterministic cursor-tree-to-target-tree plan, independently durable idempotent writes, compare-and-set cursor advancement last, and explicit acceptance of partial visibility until a successful retry. V1 records immutable source-sequenced events but does not dispatch them. Target-table DDL remains operator-owned; Gitplane provides read-only `doctor` introspection and fails closed on incompatible writes.

## Objective Impact

`references/README-draft.md` and `references/SPEC-draft.md` are now precise enough to govern implementation. They fix `gitplane-artifact.json` as the recursive artifact marker, required canonical lowercase ULIDs, generic artifacts with optional one-way classification, recursive byte-framed SHA-256 digests, deterministic `gpr_` revision and `gpe_` event IDs, one target table per classified kind with composite `(source_id, artifact_id)` uniqueness, JSON Pointer/blob mappings, and linear-history reconciliation semantics. `references/v1-contract-design-report.md` preserves the original grilling rationale, rejected/deferred alternatives, and review invariants as a non-normative historical record; where it differs, the README and spec own the refined contract.

The CLI has four surfaces: config-free `artifact create`, stateless working-tree `check`, `reconcile`, and read-only `doctor`. One explicit TypeScript config selects exactly one source ID and artifact root; repositories with multiple domains select multiple configs explicitly. Package topology is two incubating packages: `@nseng-ai/gitplane` with an API-kind `/cli` subpackage using Clinkr's filesystem-first layout, and `@nseng-ai/gitplane-sqlite`. The package-skeleton roadmap slice is unblocked; no remaining user-facing decision blocks it.

## Follow-Ups

- Implement the package skeleton, core identities, package-local clock, gateways, fakes, local artifact creation, and Clinkr command topology against the settled README and spec.
- Treat exact TypeScript result names, private module layout, SQLite control-table names, and internal SQL shapes as implementation choices constrained by public conformance tests.
- Preserve parked upgrade seams for nonlinear history, concurrency leases, production stores, dispatch/outbox delivery, object storage, and aggregate multi-domain discovery without implementing them in v1.
