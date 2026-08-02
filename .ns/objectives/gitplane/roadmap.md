# Roadmap

## Work

- [x] Settle the README contract (first readme-driven-development pass): grilled and finalized `references/README-draft.md` across recursive artifact discovery, fixed marker/envelope, CLI/configuration, deterministic digest/revision identity, projections, non-transactional reconciliation, event/error semantics, package topology, and the originally proposed source/store gateways. `references/v1-contract-design-report.md` preserves the full rationale, alternatives, and implementation-review invariants. No user-facing question blocks the package skeleton.
- [x] Split the settled contract into a user-facing `references/README-draft.md` and a normative `references/SPEC-draft.md`; both drafts are canonical, cross-linked, and tracked together by the implementation.
- [x] Package skeleton, core domain model, and local artifact creation: implemented incubating `@nseng-ai/gitplane` and `@nseng-ai/gitplane-sqlite`, the API-kind `/cli` subpackage and Clinkr filesystem command topology, canonical lowercase ULIDs, generic and classified markers with one-way classification, exact digest/revision/event identities, package-local `Clock`, complete artifact/store gateway contracts with in-memory fakes, and atomic config-free `gitplane artifact create <directory>`.
  - Evidence: PR #4064 contains the implementation; package typechecks and the focused Gitplane suite pass, with identity/digest coverage for recursive trees, outer-path exclusion, internal renames, special-file rejection, and deterministic `gpr_`/`gpe_` vectors, plus creation coverage for generated and supplied IDs, classification defaults/overrides, conflicts, missing parents, and rollback. CI checks including TypeScript, integration, style guard, dprint, and Objective validation pass.
- [ ] Recursive discovery, optional kind registration, and `gitplane check`: discover fixed `gitplane-artifact.json` boundaries, validate canonical lowercase ULIDs and all-or-none classification, accept generic artifacts without kind validation, enforce immutable established classification and explicit schema transitions, run deterministic validators for classified artifacts, and support working-tree validation.
- [ ] SQLite control store, optional target projection, and `gitplane doctor`: implement control records for every artifact plus operation-level target-row upsert/tombstone behavior for classified artifacts against operator-owned DDL; support JSON Pointer/blob mappings, composite uniqueness, and complete SQLite read-only introspection without requiring generic artifacts to have mappings.
- [ ] Cursor-diff reconciliation and `gitplane reconcile <commit>`: build cursor-tree→target-tree plans, recognize move/revise/delete/restore and one-way classification transitions, track/revision/event generic and classified artifacts while projecting only classified artifacts, apply deterministic idempotent writes, persist events/errors, advance the cursor last with compare-and-set, and implement `--full` initial sync/repair.
  - Evidence: scenario convergence suite over fakes covers recursive artifacts, renames/moves, deletes, duplicate IDs, restoration, partial-write retries, cursor CAS failure, repeated attempts, divergence rejection, and full repair.
- [ ] Reference consumer: permanent documentation-grade fixture/package demonstrating operator-owned Greeting DDL, artifact+revision pinning, mapped JSON blobs, idempotent event reading by ID/sequence, runtime-state separation, and injected artifact/store paths.
- [ ] Check-only GitHub Action: ship the composite required-check action that runs `gitplane check` against the PR head for one explicit config; document one step per domain and conceptual reconcile-in-CI wiring.
- [ ] Promote the settled README from `references/README-draft.md` to the shipped package README and the settled spec from `references/SPEC-draft.md` to the shipped package reference documentation, then repoint this Objective's canonical references at the promoted documents.

## Parked

- Merge commits and nonlinear Git history.
- Concurrent reconciliation and source-scoped leases.
- GitHub API source fetching behind a future `ArtifactGateway` adapter.
- Durable outbox/dispatcher, webhooks, and event delivery state.
- Production persistence backend (for example Postgres).
- Reconcile-in-CI wired to real durable storage.
- Query CLI (`gitplane list` / `gitplane show`).
- Target-table DDL and migration management.
- Object-store replication of immutable artifact contents.
- Automatic multi-domain discovery or aggregate configuration.
- Multiple target tables per kind.
- Real consumer integrations (Riptide, Goat Farm, or ns-internal) — separate future objective(s).
