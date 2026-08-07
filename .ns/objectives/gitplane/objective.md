---
edges:
  - objective: gitplane-reconciliation-stack-rebuild
    annotation: The cursor-diff reconciliation slice lands through that Objective's verified PR stack rather than prototype PR #4076.
---

# Gitplane v1: Git-backed artifact control plane

## Thesis

Build Gitplane v1 as an incubating TypeScript platform package: a Git-backed artifact control plane in which Git owns declared intent and durable artifact contents, Gitplane owns lineage, a queryable relational materialization, and immutable revision/event history, and runtime consumers own transactional execution state. A runtime operation links to an immutable artifact revision, while the artifact's stable ID links all revisions and paths into one lineage.

This Objective follows the readme-driven-development pattern with two canonical drafts: `references/README-draft.md` is the exclusively user-facing contract until promoted to the package README, and `references/SPEC-draft.md` is the normative reference/spec the implementation follows, tracked and promoted the same way. `references/v1-contract-design-report.md` preserves the grilling rationale and rejected alternatives but is non-normative. Design decisions count as settled only when they appear in the README or the spec; execution state stays in `roadmap.md`.

## Scope

- Two incubating workspace packages under `ts/packages/`: `@nseng-ai/gitplane`, with an exported API-kind `/cli` subpackage, and `@nseng-ai/gitplane-sqlite`. Gitplane depends on Clinkr but not Foundation; its package-local invocation context contains `Clock` plus the absolute selected config directory needed for config-relative adapter paths.
- Clinkr filesystem-first CLI with four surfaces:
  - `gitplane artifact create <directory>` — local, config-free creation of a generic artifact by default, with optional classification.
  - `gitplane check` — stateless validation of the full corpus in the working tree.
  - `gitplane reconcile <commit>` — fast-forward cursor-diff reconciliation with cursor-last, idempotent writes; `--full` handles initial sync and repair.
  - `gitplane doctor` — read-only configuration, control-store, target-table, mapping, and uniqueness checks.
- Multiple independent Gitplane domains per repository through explicitly selected TypeScript config files. Each config selects exactly one immutable source ID and one artifact root; `source` is the minimum config, while kind registration and storage are independently optional capabilities.
- Recursive, symlink-safe working-tree discovery through the fixed `gitplane-artifact.json` marker. The reserved name establishes an attempted boundary regardless of entry kind or marker validity; nesting is discovered globally before corpus reads, special entries under boundaries are findings, and ordinary entries outside boundaries are ignored.
- Generic envelope validation requiring canonical lowercase ULID IDs. Classification is an optional all-or-none `gpApiVersion`/`gpKind`/`gpSchemaVersion` block: generic artifacts need no registry and are first-class tracked, revisioned, and evented artifacts; classified artifacts require an exact registered kind and declared current schema version but no custom validator. Projection and transition metadata are consumed only by later reconciliation, where one generic-to-classified transition is allowed, API/kind lineage becomes immutable, and schema changes follow explicit directed transitions.
- Deterministic recursive SHA-256 content digests and `gpr_` revision IDs, plus deterministic `gpe_` event IDs. Revisions are immutable content snapshots with required `markerLastChangedCommit` provenance in their identity, a first-observed Git locator, and a file-digest manifest; marker moves count as marker changes and therefore create revisions, while raw bytes remain in Git.
- One operator-owned current-state target table per kind, with mandatory mapped lineage semantics and composite `(source_id, artifact_id)` uniqueness. RFC 6901 field mappings include arbitrary JSON-subtree projection. Gitplane owns no target DDL.
- Move recognition by stable ID, deletion tombstones preserving last live domain values/path, restoration, immutable revisions, durable deterministic event facts, and sanitized reconciliation errors.
- Non-transactional, cursor-last reconciliation. Partial writes may be visible after failure; deterministic plans and IDs make retry idempotent, and compare-and-set cursor advancement detects races. Concurrent writers remain unsupported in v1.
- Valid artifact-domain access behind one canonical `ArtifactGateway`, with local creation, commit/history facts, discovery, complete recursive snapshots, and commit diffs; creation consumes only its narrowed create operation. Stateless working-tree checking uses a separate `CorpusCheckGateway` for raw tree inventory and candidate reads so invalid corpus entries cannot leak into downstream artifact operations. Storage sits behind a complete operation-level `MaterializationStoreGateway`. One adapter owns both control records and target-table writes. SQLite is the test/local implementation, not a deployment commitment.
- A shipped check-only composite GitHub Action that runs `gitplane check` against the PR head for each explicitly configured domain, plus documentation showing conceptual reconcile-in-CI wiring.
- A permanent documentation-grade reference consumer and fake-driven scenario suite proving the pin-and-react/materialization contract and convergence behavior.

## Non-Goals

Each deliberate shortcut preserves a named future path where applicable:

- **No ID minting during discovery or reconciliation.** Only local `gitplane artifact create` mints an ID or accepts a caller-supplied canonical ID; all other paths consume artifact IDs already present in markers.
- **No merge commits or nonlinear-history support.** V1 assumes squash-only/linear repositories.
- **No concurrent-writer coordination.** Operators ensure one reconciler per source; a future source lease remains possible.
- **No GitHub API source fetching.** Local Git is primary; another source may implement the gateway later.
- **No event dispatch, webhooks, or async outbox publication.** V1 records immutable, sequence-ordered event facts without delivery state; a future dispatcher can consume them.
- **No production persistence commitment.** SQLite is local/reference only; production adapters implement the same gateway.
- **No reconcile-in-CI with durable state.** Shipped CI support is check-only.
- **No query CLI.** `gitplane list`/`show` are deferred.
- **No target-table DDL or migrations.** Operators own application schemas; `doctor` only inspects.
- **No object-store replication or raw-byte persistence.** Commit, path, digest, and file manifest identify content.
- **No automatic multi-domain discovery or aggregate config.** One invocation handles one explicit config.
- **No Riptide/Goat Farm integration.** Real consumers belong to later objectives.
- **Not a workflow engine.** Gitplane records artifact transition facts; activation policy remains consumer-owned.

## Completion Criteria

- Both workspace packages exist with the documented topology, package-local clock seam, canonical artifact, corpus-check, and store gateways, in-memory fakes, and SQLite reference adapter.
- `gitplane artifact create <directory>`, `gitplane check`, `gitplane reconcile <commit>`/`--full`, and `gitplane doctor` work against a local clone through Clinkr's filesystem-first command layout and stable output contract; creation is config-free, validates or mints a canonical lowercase ULID, supports optional classification, and is atomic at the artifact gateway boundary.
- `gitplane check` is a stateless, corpus-only working-tree operation: it resolves one config/root within the invocation directory, never follows symlinks or invokes storage/history, discovers all nesting before reads, aggregates the fixed normative finding set deterministically, counts outer attempted boundaries, and distinguishes completed finding exits from operational/configuration/source failure without partial data.
- Recursive discovery, generic and classified envelope behavior, optional kind/schema registration and projection, deterministic digest/revision/event identity with required marker last-change provenance, move/delete/restore behavior, initial-full materialization creation events, lineage-free events for every artifact reapplied by any full repair after initial materialization, one-way generic-to-classified lineage, cursor-last retry convergence, immutable events, and durable errors work as specified in the README and spec drafts.
- The SQLite adapter explicitly initializes and manages control tables, operates against operator-owned target tables, and supports every v1 read-only `doctor` check.
- The check-only composite GitHub Action ships and is documented, including PR-head/per-domain behavior and a conceptual reconcile-in-CI recipe.
- The reference consumer exists and demonstrates operator-owned DDL, artifact+revision pinning, mapped JSON, event consumption, and runtime-state separation.
- Scenario and conformance suites cover recursive artifacts, renames/moves, revisions, deletes, duplicate IDs, restoration, partial-write retries, cursor CAS failure, repeated reconcile attempts, and full repair.
- The settled README is promoted from `references/README-draft.md` to the shipped package README, the settled spec is promoted from `references/SPEC-draft.md` to the shipped package's reference documentation, and this Objective's canonical references point at the promoted documents.

## Prompt Guidance

Every prompt produced for this Objective must begin with the exact first token `/ns:plan:grill-and-save`, with the complete self-contained task text immediately after it on the same line or subsequent lines. This applies unconditionally to every produced prompt — implementation slices, discussion, research, and contract review alike — and is stated once here rather than repeated as row-level `Prompt:` prose.

Every produced prompt should carry these standing anchors: `references/README-draft.md` and `references/SPEC-draft.md` as the governing user-facing and normative contract, `roadmap.md` as slice ordering, incubating package placement under `ts/packages/` (`@nseng-ai/gitplane` and `@nseng-ai/gitplane-sqlite`), and `just` as the repo validation gate.

This guidance shapes prompt serialization only; it grants no execution authority and does not select the next roadmap row.

## Assumptions and Risks

Assumptions:

- **Cursor-derived, cursor-last reconciliation is convergence-safe without transactions.** While the cursor remains unchanged, retry reconstructs the same Git-tree transition plan and deterministic writes; partial visibility is accepted. Scenario tests must falsify this if an operation cannot be made idempotent.
- **Linear source history is sufficient for v1.** `reconcile` rejects merge commits; repositories using Gitplane initially enforce squash-only history.
- **Operator-owned target DDL is the correct boundary.** Gitplane maps and attempts writes, while `doctor` catches introspectable incompatibilities and backend failures remain authoritative.
- **Durable event facts are enough for v1.** Sequence-ordered immutable events preserve a future dispatch/outbox path without implementing delivery now.
- **SQLite behind the operation-level gateway is faithful enough** to prove adapter semantics without implying production readiness.
- **Incubating platform placement fits Gitplane** per `docs/conventions/platform-and-consumer.md` and `ts/packages/README.md`.

Risks:

- **Non-transactional partial visibility.** A failed reconcile can expose some target rows or control records before retry completes; consumers must treat cursor advancement as the completed-materialization boundary where needed.
- **Event correctness depends on cursor-tree planning.** Retries must derive transitions from cursor Git tree to target Git tree rather than partially written store rows; scenario coverage is mandatory.
- **Target schemas can reject blind mappings.** Projection writes deliberately rely on operator-owned SQL constraints and fail closed; `doctor` cannot guarantee compatibility where an adapter reports unsupported introspection.
- **Revision provenance and first-observed Git locators depend on retained history.** Reconciliation fails structurally before materialization when Git history cannot establish a live artifact's marker last-changed commit, and raw bytes become unavailable if a revision's referenced commit is removed; object-store replication remains an explicit future upgrade.
- **Scope gravity toward workflow behavior.** Runtime activation and event delivery must stay outside v1.
- **CI-hostability could rot untested.** The reference consumer and fake-driven scenarios must exercise injected stores and stateless invocation shapes even though reconcile-in-CI is documentation-only.
- **Corpus discovery must avoid misleading partial diagnostics.** Nested attempted boundaries short-circuit all content reads, and operational/configuration/source failures return no partial check result; tests must preserve those all-or-nothing phases.

## Open Questions

No user-facing contract decision currently blocks the package skeleton. Exact TypeScript result names, private module organization, SQLite control-table naming, and internal SQL statement shapes are implementation decisions constrained by `references/README-draft.md`, `references/SPEC-draft.md`, and conformance tests.
