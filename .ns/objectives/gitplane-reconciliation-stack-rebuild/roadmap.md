# Roadmap

## Work

- [x] Contract amendment: replace the previously accepted cursor-diff, descent/history-gated, initial-`--full`, and event-reconstruction contract with level-triggered complete snapshots and generation-aware cursor/attempt/event semantics across the canonical README/SPEC and both Objective records. This explicitly supersedes rather than erases the old contract and PR #4128's shallow-history rationale.
  - Proof obligation: initial/forward/older/divergent/merge targets use one history-independent model; planning authority, attempt precedence, generation advancement, bounded result accounting, and proof ownership are unambiguous.
- [x] Complete snapshot facts and pure planner: simplify `ArtifactGateway`/Gather to target-commit resolution plus complete raw topology/corpus; add one coherent completed-materialization snapshot read; implement `deriveReconciliationPlan(facts)` over immutable target, stored current/tombstone/lineage, and registrations with no gateways.
  - Proof obligation: complete topology/corpus validates before a plan; lifecycle create/restore/revise/move/unchanged/delete, classification/schema legality, complete deletion detection, canonical ordering, deterministic Reconciliation Plan equality, and merge neutrality are table/property tested. Source logs prove no ancestry, diff, shallow probe, cursor-tree read, or target-row read.
- [ ] Durable generation protocol: generation-bearing cursors and CAS, deterministic generation-aware `gpa_` attempts, generation/attempt-aware `gpe_` lifecycle events, Reconciliation Plan persistence, atomic Pending Plan insertion, snapshot reads, exact replay/conflict handling, and cleanup are defined in the fake and SQLite seams. Full planner/engine replay proof remains for later slices.
  - Proof obligation: absent generation 0/first completion 1 is consistent; the Reconciliation Plan contains Planned Artifact Materializations that Domain logic prepares for the Materialization Store Gateway; the Resulting Cursor and event IDs cannot be independently authored; exact identity literals pass; sequential retries preserve event identity/sequence under SQLite's documented single-writer boundary; later same-target visits are distinct; `A → B → A → B` rejects stale expected generation despite commit-string equality; post-CAS residue is cleanup-only; incompatible pre-release schema is refused without mutation or migration.
- [ ] Retry-safe engine and CLI: compose Gather → Decide → Apply; persist the Reconciliation Plan as the Pending Plan before writes; apply each Planned Artifact Materialization as revision → lineage → current → classified target → event in canonical artifact-ID order; write the Resulting Cursor last; resolve errors and delete the Pending Plan; expose `gitplane reconcile <commit>` with bounded typed output.
  - Proof obligation: failure before/after every store write boundary converges on retry to uninterrupted cursor generation, control/revision/target state, event IDs/sequences, and cleanup. Minimal real-Git/SQLite E2E covers initial, update, older, divergent, merge, repeated target, equal no-op/cleanup, unavailable target, and depth-1 reconciliation without fetch; CLI scenarios cover help/version/runtime/schema, lifecycle counts/cursor/replay/cleanup fields, no repair/ancestry/reconstruction fields, and close-on-all-paths.
- [ ] Closure and accounting: account against prototype `09d75c3ae`, naming cursor diff, descent, merge rejection, initial full, commit-keyed event collapse, and `--full` repair naming as intentionally superseded; finish all revised proof scenarios; preserve PR #4128's rationale as history while removing dead runtime paths; close PR #4076 unmerged; update the parent `gitplane` reconciliation evidence.
  - Evidence: focused pure/conformance/fault-injection/E2E suites plus repository `just`, integration, isolated, and TypeScript style-guard lanes pass at stack tip.

## Parked

- Incremental complete-snapshot optimization (tree-OID caching, commit-diff fast paths, or similar); measure first, and never make ancestry a correctness input.
- Working-tree targets including dirty or untracked content.
- Repair mode and operator target-row drift detection; add them only after an operational need and backend-neutral semantics are proven.
- Source leases and broader distributed scheduling beyond one Pending Plan plus generation CAS.
- Migration of old prototype/pre-release stores; incompatible stores are recreated.
- Event dispatch, production persistence, and other capabilities parked by the parent `gitplane` Objective.
