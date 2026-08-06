# Gitplane v1 Contract Design Report

## Purpose and provenance

This report preserves reasoning from the initial human grilling session for Gitplane's v1 user-facing contract. It is non-normative historical rationale, not a second specification. The canonical [`README-draft.md`](./README-draft.md) and [`SPEC-draft.md`](./SPEC-draft.md) say **what Gitplane promises**; this report records why the initial contract took its shape, which alternatives were rejected or deferred, and where later changes would need to revisit assumptions.

The discussion began from the first roadmap row in `.ns/objectives/gitplane/roadmap.md`: settle the README before implementation. The initial draft proposed two commands, a `meta.json` envelope, transactional reconciliation with in-process event handlers, and an unresolved storage/package topology. The grilling materially changed that design.

The canonical drafts also include immediate pre-implementation refinements made after this session—most notably generic artifacts, config-free `artifact create`, corpus-only `check`, one root per config, removal of custom validators, and canonical `gp*` envelope names. If wording here conflicts with either canonical draft, the drafts govern; treat the discrepancy as historical context rather than a live contract choice.

## Amendment (2026-08-06): same-path ID replacement is delete-plus-create

The complete-snapshot planner showed that the original same-path replacement restriction was unnecessary. Gitplane can derive two independent final-state transitions without Git history or inferred human intent: the old artifact ID is absent and is deleted, while the new artifact ID is present and is created. The canonical spec now permits both Planned Artifact Materializations in one Reconciliation Plan, including when they use the same path. This supersedes the same-path restriction under "Move, replacement, and delete-plus-create semantics" below; the original text is preserved as historical rationale.

## Amendment (2026-08-05): artifact path joined revision identity

Implementation evidence superseded the content-only revision identity settled below. An interim spec revision added `markerLastChangedCommit` to revision identity so marker adds, changes, and moves created revisions; establishing that commit required walking `rev-list` and re-reading marker trees at every commit in history — potentially hundreds of git subprocesses per reconciliation — and proved too complicated to keep up to date for the limited value it tracked. PR #4117 removed marker provenance entirely: revision identity now derives from source ID, artifact ID, repository-relative artifact path, and content digest, so moving an artifact creates a new revision, and the separate `artifact.moved` event type was dropped. This supersedes the "Content snapshot versus observation" consequences and invariants 3 and 4 below; the canonical drafts carry the current contract. The original text is preserved unchanged as historical rationale.

## Executive summary

The session settled these defining choices:

- A Gitplane artifact is a recursively discovered directory marked by fixed `gitplane-artifact.json`; its complete nested regular-file tree is content.
- Stable artifact identity is a consumer-minted canonical lowercase ULID. `apiVersion` and `kind` are immutable for that identity; schema changes follow explicit directed transitions.
- A revision is a content snapshot, not a commit/path observation. Its digest is deterministic over recursively framed paths and raw bytes; its `gpr_` ID derives from source ID, artifact ID, and digest.
- Gitplane stores revision metadata, a per-file digest manifest, and a first-observed Git locator, but no raw artifact bytes.
- Each kind maps to one operator-owned current-state table. Gitplane writes mandatory lineage and configured JSON Pointer projections into the same row, keyed by a mandatory composite unique `(source_id, artifact_id)` constraint.
- Reconciliation does **not** require transactions. It plans from cursor Git tree to target Git tree, performs independently durable idempotent writes, and advances the cursor last with compare-and-set. Partial visibility after failure is accepted until retry converges.
- V1 records immutable deterministic events with a source-scoped sequence, but does not dispatch them. The schema must leave room for a future outbox/dispatcher.
- V1 assumes linear, squash-only Git history and rejects merge commits.
- V1 has three commands: `validate`, `reconcile`, and read-only `doctor`.
- One repository may host multiple explicit Gitplane domains/configs. One invocation handles exactly one domain.
- Package topology is `@nseng-ai/gitplane` with an exported `/cli` subpackage plus `@nseng-ai/gitplane-sqlite`; the CLI uses Clinkr's filesystem-first layout. Gitplane does not depend on Foundation and begins with only a package-local `Clock` context seam.

## 1. Revision purpose and identity

### Why a revision digest exists

The discussion first clarified that the digest is not the stable artifact identity. It serves four distinct purposes:

1. Determine whether artifact content changed.
2. Reuse a content revision when the same bytes are observed again.
3. Verify that content read from Git still matches an immutable revision record.
4. Provide a storage-independent content fingerprint for future replication or caching.

A consumer normally pins **artifact ID + revision ID**, not the digest by itself. Artifact ID identifies lineage; revision ID identifies exact content.

### Content snapshot versus observation

The initial draft mixed two concepts by describing a revision with commit/path fields while also saying a pure move should not create a revision. The settled model separates them:

- A revision is an immutable **content snapshot**.
- Current path and latest observed commit are mutable artifact-materialization facts.
- A revision retains one immutable first-observed commit/path locator for retrieving and verifying the snapshot in Git.

Consequences:

- Moving an unchanged artifact reuses its revision.
- Restoring content identical to an old revision reuses that revision.
- Reobserving a revision at another path or commit does not append observation locations in v1.

This keeps revision identity about content rather than where content happened to be seen.

### Deterministic revision IDs

A database-generated revision key was rejected in favor of deterministic identity. The revision ID derives from `(source_id, artifact_id, digest)` with length-prefixed binary framing and SHA-256. This gives repeated reconciliation and independent store implementations the same identity.

The chosen human-readable prefix is `gpr_`, meaning **Gitplane revision**. A longer `gitplane_rev_` and no-prefix forms were considered; `gpr_` was accepted as compact and recognizable.

## 2. Artifact tree and digest algorithm

### Recursive content is fundamental

The initial question framed an artifact as a directory of files, then the human clarified that artifacts can recurse and contain arbitrarily nested subdirectories, including nested `plans/` trees. The settled digest therefore covers the complete recursive regular-file tree beneath the artifact boundary.

### Exact digest framing

The accepted algorithm is SHA-256 over canonically framed entries:

- Include every regular file recursively, including `gitplane-artifact.json`.
- Express each path relative to the artifact root with `/` separators.
- Sort by raw UTF-8 bytes of the complete relative path.
- Frame each entry with path-byte length, path bytes, content-byte length, and raw content bytes.
- Exclude the outer artifact path and Git file mode.
- Apply no JSON, text, Unicode, newline, whitespace, or other semantic normalization.
- Reject symlinks, submodules, and other special entries anywhere in the artifact.
- Encode the result as lowercase `sha256:<64 hex characters>`.

The README makes the integer framing concrete as unsigned 64-bit big-endian lengths.

### Why raw bytes rather than semantic normalization

Semantic JSON normalization was considered implicitly when deciding what changes should create revisions. Raw-byte hashing was chosen because it is deterministic across artifact kinds and does not make Gitplane interpret application formats. It also means formatting-only changes produce a revision, which is an intentional consequence of defining a revision as the exact source snapshot.

### Path and mode consequences

- Moving the entire artifact does not change the digest because its outer path is excluded.
- Moving or renaming a file inside the artifact changes the digest because relative internal paths are included.
- Changing executable mode alone does not create a revision because mode is excluded.
- Empty directories do not contribute because Git does not track them.

### No raw-byte persistence

V1 stores no raw content bytes. A revision records:

- deterministic revision ID and digest;
- complete parsed marker JSON;
- recursive path/per-file-SHA-256 manifest;
- first-observed commit/path locator.

If a future system needs durable content outside rewritten Git history, it can add object-store replication. That is explicitly out of scope rather than partially implemented in v1.

## 3. Artifact boundaries and discovery

### Marker rename

The initial draft used `meta.json`. During grilling, the marker was renamed to fixed `gitplane-artifact.json`. The old filename is not recognized.

The filename is intentionally not configurable in v1. A fixed name simplifies recursive discovery, old/new-tree boundary lookup, portability, and diagnostics. Kind-specific content filenames remain unconstrained.

### Recursive artifact discovery

The first discovery proposal treated immediate children of a configured root as artifacts. That was rejected. The accepted model allows artifact directories at any depth:

- A directory containing `gitplane-artifact.json` establishes an artifact root.
- Its entire recursive subtree belongs to that artifact.
- A descendant `gitplane-artifact.json` is invalid; artifacts cannot nest.
- Directories above an artifact are organizational namespaces.
- Files outside any artifact boundary are ignored, allowing documentation, `.gitkeep`, and namespace-level content.

The clarification “no nested `meta.json`; just top-level” meant exactly one marker at the root of each artifact, not that artifacts themselves must be direct children of a configured root.

### Incremental touched-artifact discovery

For cursor-to-target reconciliation:

1. Obtain changed paths from Git.
2. For each path, walk upward independently in the cursor tree and target tree to the nearest marker.
3. Reconcile the union of old and new artifact roots.
4. Read each target candidate as a complete recursive snapshot.
5. Use prior stable IDs to recognize moves and deletions.
6. Ignore changed paths outside any artifact boundary.

Looking in both old and new trees matters for deleted and moved boundaries. `--full` instead discovers every artifact at the target and compares it with all live materialized IDs.

## 4. Artifact IDs, lineage, and schema versions

### Lowercase canonical ULIDs

The initial draft merely recommended ULIDs, and an early recommendation used uppercase canonical spelling. The human rejected uppercase. V1 therefore requires lowercase canonical ULIDs:

- exactly 26 characters;
- Crockford Base32 alphabet `0123456789abcdefghjkmnpqrstvwxyz`;
- first character `0` through `7` to avoid 130-bit overflow;
- no `i`, `l`, `o`, or `u` because those are absent from Crockford Base32;
- Gitplane validates but never mints IDs.

A broader custom identifier strategy was deferred under YAGNI. If later supported, it should be named as a new ID strategy rather than quietly weakening what “ULID” means.

### Source-wide uniqueness

An ID is globally unique within one configured source across all roots and kinds. Tombstoned IDs remain permanently reserved to their original lineage. Separate sources may reuse an ID because the full identity is `(source_id, artifact_id)`.

Validation checks the complete target tree for duplicate live IDs, not only touched candidates.

### Move, replacement, and delete-plus-create semantics

- Same ID at a different path is a move.
- Old ID disappearing while a different ID appears at a different path is delete-plus-create.
- Changing the ID at the same path in one commit is rejected. Intentional replacement at one path requires separate delete and create commits.

This rule makes identity continuity clear without pretending Gitplane can infer human intent from a simultaneous cross-path replacement.

### Immutable kind lineage

For one artifact ID, `apiVersion` and `kind` are immutable. Changing kind requires a new artifact ID and tombstoning the old one. This prevents one lineage from jumping between validators and target tables.

### Explicit schema transitions

`schemaVersion` may change only through explicitly registered directed transitions:

- Each version has its own validator and projection mapping.
- Existing artifacts may stay on their version or follow one registered direct edge.
- Skipped versions and downgrades fail unless explicitly registered.
- Gitplane validates the target shape but does not transform content.
- Restoration follows allowed transitions from the last version.

One kind retains one target table and fixed lineage-column mapping across schema versions. Domain mappings may change, and `clearFields` explicitly nulls retired columns to prevent stale values.

## 5. Kind validation

### Why registrations are required

The draft said applications define kinds while Gitplane validates allowed kinds/schema versions. That requires a registration mechanism. V1 therefore requires explicit `(apiVersion, kind, schemaVersion)` registration.

This is intentionally narrower than a general plugin/lifecycle framework. The validator seam exists to let applications own document semantics without moving workflow behavior into Gitplane.

### Validator boundary

Validators receive a complete immutable artifact snapshot:

- source and artifact identity;
- API/kind/schema version;
- repository-relative artifact path;
- recursive relative-file/raw-byte map;
- parsed complete envelope.

They return structured findings with stable codes and optional file path/JSON Pointer. They may be async for library interoperability but must be deterministic and read-only.

Validators do not receive the store, source gateway, clock, environment, logger, network capability, or mutation capability. Throwing is an operational validator failure, not an ordinary invalid-artifact finding.

### Open marker object

`gitplane-artifact.json` allows arbitrary application keys. Gitplane reserves only:

- `apiVersion`;
- `kind`;
- `schemaVersion`;
- `id`.

An earlier possibility was to preserve arbitrary keys only as opaque revision JSON. The human explicitly required metadata-to-column mappings, so arbitrary keys also feed configured relational projections.

## 6. Projection and target-table model

### Evolution of the projection design

Several alternatives were explored:

1. Preserve arbitrary metadata only as JSON and let consumers project it later.
2. Let registrations declare Gitplane-managed projection tables and schemas.
3. Automatically project top-level scalar keys based on declared schemas.
4. Blindly attempt configured writes into operator-owned target tables and let the database remain authoritative.

The human chose the fourth model. Gitplane does not own application table DDL or infer/migrate schemas. It maps configured values and attempts the upsert; SQL constraints and adapter behavior decide whether the write succeeds.

### One current-state row per artifact

A key clarification was that lineage and domain fields share the **same row** in one target table. There is not a generic current-artifact row plus a separate domain projection row.

For a `Greeting` with one field, the conceptual row contains:

- `source_id`;
- `artifact_id`;
- `revision_id`;
- current/last-live artifact path;
- deletion flag;
- nullable deletion commit;
- `message`;
- any other mapped domain fields.

One live upsert statement writes the lineage and mapped domain values together for that target row. Separate Gitplane control tables still hold cursor, immutable revisions, events, and errors; “one statement” never meant embedding all history in the application row.

### Operator-owned DDL

The operator creates and migrates target tables, even when using SQLite. Gitplane's SQLite adapter manages only control tables.

Gitplane is deliberately unopinionated about:

- physical table and column names;
- SQL data types;
- a surrogate or domain primary key;
- extra columns.

The minimum hard requirement is a two-column composite unique constraint on `(source_id, artifact_id)`. It need not be the physical primary key. This gives deterministic upsert conflict semantics while allowing existing operator table design.

One kind maps to exactly one target table in v1. Multi-table fanout is deferred because it would amplify partial-write behavior and complicate retry semantics.

### Mandatory lineage semantics

A kind mapping identifies fields for:

- `source_id`;
- `artifact_id`;
- `revision_id`;
- artifact path;
- deletion state;
- deletion commit.

Names are configurable, semantics are not. The store adapter must support idempotent full live upsert, deletion-only update, restoration through live upsert, and current-lineage lookup for verification/repair.

### Tombstones

Deletion preserves the last live path, revision ID, and domain values. Only deletion lineage fields change. This avoids writing null into non-null application columns and keeps useful last-known values for diagnostics.

Restoration rewrites the complete live row at its restored path and clears deletion state.

### JSON Pointer mappings

Mappings use RFC 6901 JSON Pointers into the complete parsed marker. Missing and explicit JSON null both map to backend null in v1; the distinction is not preserved in projections.

Gitplane does not coerce values or prevalidate SQL types. Objects and arrays may be passed, but backend support is authoritative. Rejection fails closed.

### Arbitrary JSON blob escape hatch

`mode: "json"` maps any selected subtree as one adapter-native structured value. The empty pointer `""` maps the complete marker. Gitplane does not canonicalize the subtree to a string; the adapter chooses a native representation such as SQLite JSON text or Postgres `jsonb`.

This escape hatch applies to marker JSON, not arbitrary artifact file bytes.

## 7. Transactions, failure semantics, and convergence

### Transaction requirement was explicitly removed

The initial proposal required one transaction covering cursor, revisions, projections, errors, and events. During grilling, the human stated that Gitplane does not require transactions. This is the most important change from the original design.

The accepted consistency model is **idempotent retry with cursor-last advancement**, not atomic visibility.

### Cursor-last protocol

Normal reconciliation:

1. Reads the current cursor.
2. Plans complete transitions from cursor Git tree to target Git tree.
3. Validates all candidates before writes where possible.
4. Applies deterministic idempotent row/revision/event writes.
5. Advances the cursor only after every planned write succeeds.
6. Records failures best-effort without advancing the cursor.

A failed attempt may leave partial rows or control records visible. A later retry reconstructs the same plan while the cursor is unchanged and reuses deterministic identities, converging safely once all operations succeed.

### Why planning comes from Git trees, not store rows

A concrete failure case drove this rule: if a revised target row is written and the process fails before writing its event/cursor, then a retry comparing against current store state might incorrectly see no revision. Therefore transition facts are always derived from the **cursor commit's Git tree versus the target commit's Git tree**. Store state verifies lineage and idempotency but does not define the transition.

### Compare-and-set cursor

Concurrency is out of scope, but cursor advancement still takes `(expected_cursor, target_commit)` and fails on mismatch. This is a small correctness guard, not a claim of concurrent-writer support. Operators must ensure one writer per source in v1.

The gateway/control schema should not preclude adding a future source-scoped lease.

### Fast-forward targets and repair

- First reconciliation requires `--full`.
- Normal target must descend from the cursor.
- Equal target is a no-op.
- Older/divergent targets fail without writes.
- `--full` handles initial sync and intentional repair.

The discussion initially allowed reconciling merge commits even though validation rejected them, because tree-to-tree planning can technically handle one. The human rejected that distinction and chose a simpler v1 assumption: both validate and reconcile reject merge commits, including `--full`. V1 assumes squash-only linear history.

### Full repair semantics

`--full` treats the target tree as current-state authority:

- discover and validate every target artifact;
- upsert every live row and revision deterministically;
- tombstone stored live IDs absent from target;
- preserve already absent tombstones;
- preserve all immutable revisions, prior events, and resolved errors;
- advance cursor last.

It is not history import or garbage collection. It records only events inferable from cursor tree to target tree when the previous cursor commit is available; otherwise it reports skipped event reconstruction rather than fabricating history.

### Fail closed

Projection/database failures do not cause coercion, column omission, partial-domain fallback, or cursor advancement. An engineer must correct mapping or schema issues and retry.

“Fail closed” does not mean writes are atomically rolled back; transactions are not required. It means Gitplane refuses to claim successful reconciliation or advance the cursor after a failed operation.

## 8. Events

### Transition precedence

One artifact emits at most one transition event per successful plan. The accepted precedence is:

1. `artifact.created`;
2. `artifact.restored`;
3. `artifact.revised`, even if path also changed;
4. `artifact.moved`, only when revision is unchanged;
5. no event for no change;
6. `artifact.deleted`.

Prior/current path and revision references carry compound facts. For example, a revised event can also reveal a simultaneous move without a second event.

### Event identity

The original key `(source_id, artifact_id, revision_id, event_type)` was found insufficient because delete/restore/delete cycles could repeat a revision and collide. The settled deterministic identity is based on:

```text
(source_id, artifact_id, reconciled_commit, event_type)
```

This distinguishes repeated transitions while preserving idempotency on retries of the same plan.

### Sequence for future dispatch

Each event receives a store-assigned monotonic sequence scoped to the source. If an idempotent insert finds the event already present, it retains its original sequence. Sequence is administrative ordering, not identity or domain semantics.

This allows a future dispatcher to checkpoint event scans without making dispatch part of v1.

### Handler system removed from v1

The discussion briefly designed durable at-least-once handlers, pending deliveries, per-handler IDs, filters, acknowledgements, and same-cursor retry. The human then rejected needing anything like that for now.

The final v1 design therefore has:

- immutable durable events;
- deterministic IDs;
- source-scoped sequence;
- no handlers;
- no delivery attempts or acknowledgements;
- no pending-delivery retry behavior.

The event schema must not preclude a future dispatcher, and future delivery state should be separate from immutable event facts.

## 9. Reconciliation errors

### Durable best-effort errors

After a failed operation, Gitplane best-effort records or updates one sanitized error keyed by:

```text
(source_id, target_commit, artifact_id-or-path, operation)
```

It tracks category, diagnostic, first/last observed timestamps, and attempt count. A successful later reconcile to that target marks errors resolved rather than deleting history.

### Why error persistence is separate from success semantics

Under the earlier transactional model, a second transaction was proposed to save errors after rollback. Once transactions were removed, the durable meaning remained useful: failure to save the diagnostic must not mask the original failure, and the cursor must remain unchanged either way.

Diagnostics must not persist secrets, environment values, SQL parameter values, or complete artifact contents.

`validate` remains stateless and does not create reconciliation-error records.

## 10. Store and source gateway seams

### Source gateway

Core asks for domain-relevant Git facts:

- resolve a commitish;
- inspect parent/ancestry facts;
- enumerate artifact boundaries;
- read recursive snapshots with relative paths, bytes, and entry types;
- read the working-tree equivalent;
- diff commits into changed paths.

The local-Git implementation should have minimal code between this domain gateway and existing repository Git utilities. No parallel translation-heavy Git abstraction should be invented. Parsing marker JSON, digesting, move recognition, and reconciliation policy stay in core.

### Materialization-store gateway

Because transactions are not required, the gateway is operation-level rather than exposing a transaction callback. It owns:

- cursor read and compare-and-set advance;
- lineage/current-state lookup;
- idempotent immutable-revision insertion;
- target-row upsert and tombstone update;
- idempotent event insertion;
- error record/resolve;
- doctor introspection.

Core emits domain operations/values and does not build SQL. One adapter per source owns both Gitplane control records and mapped target-table operations. Splitting them across stores is out of scope.

Each operation returns a named result rather than `void`/`null`, preserving explicit non-ideal outcomes and adapter evidence.

## 11. Configuration, domains, and context

### TypeScript config

A data-only JSON config with validator/store module specifiers was considered. Executable TypeScript config was chosen because it can directly register validator functions, store factories, mappings, and transitions while remaining type-safe.

Default config is repository-root `gitplane.config.ts`; `--config <path>` selects another. Relative paths resolve from the config directory, while stored artifact paths remain repository-relative.

### Multiple domains per repository

One repository may host many Gitplane installations/domains, for example separate greetings and campaigns configs. Each config has its own:

- immutable source ID;
- roots;
- store factory;
- kind registry;
- target mappings;
- cursor and control records.

One invocation handles one config. Automatic recursive config discovery and aggregate multi-domain execution are out of scope. CI invokes validation once per domain.

### Source ID

`source_id` is explicit operator-chosen configuration, not derived from repository URL, remote, local path, or branch. Renaming it creates a logically new source and requires full initialization. One config represents exactly one source with potentially multiple non-overlapping roots.

### Lazy store factory

The store is a factory rather than an eagerly created instance. `validate` loads registrations but does not open storage; `doctor` and `reconcile` invoke the factory. This preserves stateless validation.

### YAGNI context seam

A broad invocation context containing cwd, env, source, logger, abort signal, and clock was proposed. The human explicitly chose YAGNI:

- context begins with `Clock` only;
- `Clock` is copied/defined locally rather than depending on Foundation;
- Clinkr is the only required ns package dependency;
- paths/options remain explicit config captured by factories.

The clock timestamps operational observations only. It must not influence IDs, digests, ordering, cursor behavior, or reconciliation decisions. Adapters receive timestamps from core rather than reading ambient time where domain records require it.

## 12. CLI contract

### Three commands, not two

The initial Objective said “exactly two commands.” Operator-owned DDL created a need for preflight introspection, so `doctor` was deliberately added as a third v1 command:

- `gitplane validate [commit]`;
- `gitplane reconcile <commit> [--full]`;
- `gitplane doctor`.

### Validate semantics

- No commit: validate working tree against `HEAD`.
- Commit `C`: validate its complete configured trees against its sole parent.
- Root commit: full validation without historical identity baseline.
- Merge commits: reject.
- Validate all roots and source-wide uniqueness, not only touched paths.
- Never initialize storage.

A `--base` option was considered and rejected because CI evaluates one commit at a time. Commit validation derives its parent automatically.

### Reconcile semantics

`reconcile` resolves a linear target, enforces ancestry, reconstructs cursor-tree transitions, applies idempotent writes, and advances cursor last. `--full` is initial-sync/repair, not a bypass for merge commits.

Same-cursor reconcile is a no-op now that event dispatch is absent.

### Doctor semantics

`doctor` is read-only and capability-aware. It asks adapters to check:

- config/control compatibility;
- target table and columns;
- mandatory lineage mappings;
- composite unique constraint;
- JSON-mapping support where introspectable.

Checks return `pass`, `fail`, or `unsupported`. Failures exit nonzero. Unsupported introspection is visible but not necessarily fatal unless the adapter says it is required for safe writes. SQLite must support every v1 doctor check.

`doctor` performs no DDL, migrations, probe writes, or destructive operations.

### Clinkr output and exits

All commands use Clinkr's filesystem-first command model and rendering:

- human output by default;
- standard Clinkr JSON envelope under `--format json`;
- stable findings with optional artifact/file/JSON Pointer location;
- `--json-schema`, `--runtime`, `--version`, and help surfaces;
- exit `0` success, `1` domain/reconciliation findings, `2` usage/config/source/store operational failure.

The CLI should not emit ad hoc machine output outside Clinkr's contract.

## 13. Package topology

### Settled packages

The package topology evolved from a three-package proposal (`core`, `sqlite`, `gitplane` CLI) to two workspace packages:

- `@nseng-ai/gitplane`;
- `@nseng-ai/gitplane-sqlite`.

`@nseng-ai/gitplane` exports an API-kind `@nseng-ai/gitplane/cli` subpackage. A thin executable bootstrap hosts the CLI. The `/cli` subpackage earns rank from distinct runtime importers and follows repository subpackage conventions rather than being a mere internal folder.

Both packages begin in the incubating disposition because Gitplane has genuine external-release intent but is not yet warranted as public support surface.

### Clinkr filesystem layout

The CLI uses Clinkr's new filesystem-first topology, conceptually:

```text
src/cli/
  app.ts
  commands/
    validate/
      metadata.ts
      command.ts
    reconcile/
      metadata.ts
      command.ts
    doctor/
      metadata.ts
      command.ts
```

Implementation must use the current Clinkr contract when the package slice begins; it should not recreate legacy mutable programmatic groups.

## 14. GitHub Action

The action is validate-only and composite. For one explicit config it:

- requires enough Git history to read every parent;
- validates every non-merge PR commit individually, oldest to newest;
- runs the commit form of `gitplane validate` with JSON output;
- renders findings and fails on invalid commits or operational errors;
- never opens storage, runs doctor, or reconciles.

Repositories with several domains configure one action step per config. The docs may show conceptual reconcile-in-CI wiring once durable storage exists, but shipped CI behavior remains validation only.

This design follows the linear/squash-only assumption: problematic merge commits are rejected rather than interpreted.

## 15. Reference consumer

The permanent example should demonstrate the actual contract, not invent a workflow engine. The `Greeting` example is expected to show:

- operator-created target DDL;
- mandatory lineage fields and composite uniqueness;
- one domain field such as `message`;
- JSON blob projection;
- artifact ID + revision ID pinning;
- event reading idempotently by deterministic ID/sequence;
- runtime execution state stored outside Gitplane;
- injected/fake source and store paths for architectural evidence.

It must not grow event dispatch or application activation policy under the guise of an example.

## 16. Explicitly rejected or deferred alternatives

### Rejected for v1

- Uppercase ULIDs.
- Custom artifact ID strategies.
- Configurable marker filename.
- Immediate-child-only artifact discovery.
- Nested artifact markers.
- Treating loose files outside artifacts as errors.
- Semantic JSON/text digest normalization.
- Digest inclusion of outer artifact path or Git file mode.
- Raw artifact-byte storage.
- Store-generated revision IDs.
- Multiple events for one move-plus-revision transition.
- Changing `kind`/`apiVersion` within one artifact lineage.
- Implicit/skipped schema transitions.
- Generic opaque-metadata-only materialization.
- Gitplane-owned application DDL/migrations.
- Reconcile-time dynamic column discovery.
- Mapping one kind to multiple target tables.
- Nulling domain values on tombstone.
- Splitting control records and target writes across independent stores.
- Requiring transactions or promising atomic visibility.
- Deriving retries from partially written store state.
- Merge-commit support.
- In-process event handlers or delivery tracking.
- Broad Foundation-based runtime context.
- Data-only JSON config.
- Automatic multi-domain discovery.
- A two-command CLI without doctor.

### Deferred but deliberately not precluded

- GitHub API source adapters.
- Production stores such as Postgres.
- Source-scoped leases/concurrent-writer coordination.
- Durable outbox/dispatcher and event delivery state.
- Object-store content replication.
- Query commands.
- Reconcile-in-CI with real durable storage.
- Target DDL/migration management.
- Aggregate multi-domain tooling.
- Nonlinear/merge history.
- Multiple target projections per kind.
- Real application integrations.

## 17. Remaining implementation freedom

The grilling intentionally stopped before private implementation design. The package-skeleton and later slices may still choose:

- exact TypeScript type/result names;
- private module boundaries;
- error class versus result details at infrastructure boundaries, consistent with repo style;
- SQLite control-table and column names;
- SQL statement forms and indexes beyond public semantics;
- in-memory fake internals;
- exact Clinkr renderer wording;
- conformance-suite organization;
- composite Action packaging details that preserve the settled behavior.

These are not invitations to reopen user-facing semantics accidentally. If implementation evidence shows a settled contract is infeasible or harmful, record that as a new Objective finding and deliberately amend the canonical README rather than silently drifting.

## 18. Key invariants for implementation review

> Amended 2026-08-05: invariants 3 and 4 are superseded — revision identity now includes the repository-relative artifact path, and outer moves create revisions. See the amendment at the top of this report.

A reviewer can use this compact list to detect contract drift:

1. Artifact identity is `(source_id, lowercase_ulid)` and kind/API lineage is immutable.
2. Artifact content is the complete recursive regular-file tree under one fixed marker boundary.
3. Revision identity depends on source, artifact, and content—not path or observation time.
4. Outer artifact moves preserve revision; internal path changes do not.
5. Raw bytes remain in Git; revisions keep a first-observed locator and file manifest.
6. One kind writes one operator-owned current-state table row keyed by composite source/artifact uniqueness.
7. Tombstones preserve last domain values and path.
8. Normal transition planning comes from cursor Git tree to target Git tree.
9. Writes are idempotent and non-transactional; cursor CAS advances last.
10. Merge commits and concurrent writers are unsupported.
11. Events are immutable deterministic facts with source sequence, not delivered messages.
12. Validate never opens storage; doctor never mutates storage; reconcile alone advances the cursor.
13. One explicit TypeScript config equals one domain/source invocation.
14. Gitplane depends on Clinkr, not Foundation, and context starts with Clock only.
15. The README remains the normative user-facing contract until promoted to the package README.
