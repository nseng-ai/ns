# Roadmap

## Work

- [~] Derive and land slice: carry GitHub PR node IDs through land PR facts.
  - Reference reading: `flow-land-pr-node-id`. Plumbing that later GraphQL slices need; low risk.
  - Policy: implementation is direct execution once the user approves starting this slice.
  - Evidence: targeted tests and `just` pass; user dogfood declaration recorded here before the first risky slice lands.
  - Evidence (2026-07-06): implemented as uncommitted edits on `consolidate-flow-land-perf-objectives`; flow+ccc Vitest (573 tests) and full `just` pass; call counts unchanged (field-only addition). See `updates/20260706T040619Z-pr-node-id-slice-implemented.md`. Dogfood declaration outstanding.
- [ ] Derive and land slice: targeted trunk fetches replacing mid-loop Graphite refreshes.
  - Reference reading: `flow-land-trunk-fetch`. Changes loop behavior but not primitives; medium risk.
  - Evidence: before/after fake-backed scenario counts on linear-11/linear-25; user dogfood declaration recorded here.
- [ ] Design and derive slice(s): lease-based push and GraphQL PR base retarget replacing `gt submit`.
  - Reference reading: `flow-land-lease-push-retarget`. First risky slice; steer-first at design level — decide decomposition (may become multiple slices) and Graphite-metadata validation approach with the user before implementing. Lands only after the preceding slices are declared dogfooded; stays the only risky slice in flight until declared dogfooded itself.
- [ ] Design and derive slice: adopt GraphQL `mergePullRequest` with post-merge verification retained.
  - Reference reading: `flow-land-graphql-merge`, minus its verification removal. Steer-first at design level; parity coverage against `gh pr merge` semantics required. Lands only after the push/retarget slice is declared dogfooded.
- [ ] Decide post-merge verification: retain or remove, as its own slice.
  - Steer-first; decide only after the GraphQL merge path has real dogfood history. Either outcome is recorded with rationale.
- [ ] Record real large-stack wall-time evidence or explicitly park it.
  - Inherited from `flow-land-large-stack-performance`. Human-driven real run only; stack shape is an open question. Adapt the evidence approach from reference reading of `flow-land-perf-baselines` where useful.
- [ ] Disposition the inherited parked follow-up candidates.
  - Stale backup deletion, post-restack guard reads, optional descendant restack scope, merge-loop duplicate PR facts: for each, land as a slice under the same rules, or park/reject with rationale against current call counts.
- [ ] Reconcile results and documentation; delete the mined reference stack branches.
  - Inherits the predecessor's reconcile row: what improved (including its four landed optimizations), what stayed unchanged, which assumptions were disproven, what stays parked. Branch deletion is human-driven.

## Parked

- [ ] Numeric latency or call-count SLA for large-stack landing. (Inherited.)
- [ ] Productized telemetry retention, dashboards, aggregation, or query UI. (Inherited.)
- [ ] Broad instrumentation rollout to unrelated SDL commands beyond shared surfaces needed by Flow land. (Inherited.)
