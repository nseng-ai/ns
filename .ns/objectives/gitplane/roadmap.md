# Roadmap

## Work

- [x] Settle the README contract (first readme-driven-development pass): grilled and finalized `references/README-draft.md` across recursive artifact discovery, fixed marker/envelope, CLI/configuration, deterministic digest/revision identity, projections, non-transactional reconciliation, event/error semantics, package topology, and the originally proposed source/store gateways. `references/v1-contract-design-report.md` preserves the full rationale, alternatives, and implementation-review invariants. No user-facing question blocks the package skeleton.
- [x] Split the settled contract into a user-facing `references/README-draft.md` and a normative `references/SPEC-draft.md`; both drafts are canonical, cross-linked, and tracked together by the implementation.
- [x] Package skeleton, core domain model, and local artifact creation: implemented incubating `@nseng-ai/gitplane` and `@nseng-ai/gitplane-sqlite`, the API-kind `/cli` subpackage and Clinkr filesystem command topology, canonical lowercase ULIDs, generic and classified markers with one-way classification, exact digest/revision/event identities (with repository-relative artifact path participating in revision identity), package-local `Clock`, complete artifact/store gateway contracts with in-memory fakes, and atomic config-free `gitplane artifact create <directory>`.
  - Evidence: PR #4064 contains the implementation; package typechecks and the focused Gitplane suite pass, with identity/digest coverage for recursive trees, outer-path exclusion, internal renames, special-file rejection, and deterministic `gpr_`/`gpe_` vectors, plus creation coverage for generated and supplied IDs, classification defaults/overrides, conflicts, missing parents, and rollback. CI checks including TypeScript, integration, style guard, dprint, and Objective validation pass.
- [x] Recursive discovery, optional kind registration, and `gitplane check`: implemented source-only config loading and invocation-relative root resolution, symlink-safe nesting-first discovery, the fixed deterministic corpus finding set, optional classified-kind/schema registration, and completed-versus-operational CLI result handling without storage or history access.
  - Evidence: the local implementation adds the real artifact gateway, config loader, core corpus-check rules, functional Clinkr command, and fake-driven unit, scenario, integration, and isolated coverage. Package typecheck and all 88 focused Gitplane tests pass; repository integration, isolated, TypeScript style-guard, and full `just` validation also pass.
- [x] SQLite control store, optional target projection, and `gitplane doctor`: implemented explicit idempotent native `node:sqlite` control-schema initialization, all operation-level control records, projection-aware target upsert/tombstone behavior against operator-owned DDL, RFC 6901/JSON/clear-field semantics, exact composite uniqueness inspection, normalized backend-neutral doctor facts/policy, access-aware config-relative store lifecycle, and fake-driven plus SQLite integration coverage without requiring generic artifacts to have mappings.
  - Evidence: focused Gitplane and Gitplane SQLite typechecks/tests, the repository integration lane, TypeScript style guard, Objective validation, and full `just` validation pass.
- [ ] Level-triggered complete-snapshot reconciliation and `gitplane reconcile <commit>`: converge from the last completed Gitplane control snapshot to the complete resolved target-commit corpus without ancestry/diff inputs; recognize create/restore/revise/move/unchanged/delete and one-way classification transitions; persist one generation-aware frozen attempt before deterministic idempotent writes; and advance the generation cursor last. This deliberately supersedes the earlier cursor-diff, initial-`--full`, linear-history contract while preserving its rationale in Objective/PR history. The contract, source/store seams, generation protocol, and identity vectors are established; planner, engine, and CLI activation remain.
  - Evidence required: pure planner lifecycle/lineage and ordering proofs; shared fake/SQLite attempt, event, and generation-CAS conformance including explicit ABA; fault injection around every write boundary; and real composition scenarios for initial, forward, older, divergent, merge, equal/no-op, repeated-target, unavailable-target, and post-CAS cleanup behavior.
- [ ] Reference consumer: permanent documentation-grade fixture/package demonstrating operator-owned Greeting DDL, artifact+revision pinning, mapped JSON blobs, idempotent event reading by ID/sequence, runtime-state separation, and injected artifact/store paths.
- [ ] Check-only GitHub Action: ship the composite required-check action that runs `gitplane check` against the PR head for one explicit config; document one step per domain and conceptual reconcile-in-CI wiring.
- [ ] Promote the settled README from `references/README-draft.md` to the shipped package README and the settled spec from `references/SPEC-draft.md` to the shipped package reference documentation, then repoint this Objective's canonical references at the promoted documents.

## Parked

- Incremental snapshot optimizations such as tree-OID caching or commit-diff fast paths.
- Source-scoped leases and broader distributed scheduling beyond atomic pending-attempt persistence plus generation CAS.
- Repair mode and operator target-row drift detection; add them only after an operational need and backend-neutral semantics are proven.
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
