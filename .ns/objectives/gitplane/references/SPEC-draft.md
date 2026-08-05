# Gitplane specification

Normative reference for Gitplane v1. The implementation follows this document together with [README-draft.md](README-draft.md), which owns the user-facing surface: motivation, getting started, configuration, CLI usage, the GitHub Action, and multiple domains. This document carries the precise semantics: artifact discovery, identity, corpus findings, revisions, materialization, command behavior, events, errors, package topology, and v1 boundaries.

## Artifact discovery

A fixed file named `gitplane-artifact.json` marks an artifact root. Gitplane recursively searches the configured artifact root; organizational directories may be arbitrarily deep.

```text
artifacts/greetings/
  examples/
    welcome/
      gitplane-artifact.json
      plans/
        localized/
          rollout.md
```

A regular file with the reserved marker name establishes an attempted artifact boundary regardless of its JSON or envelope validity. Every descendant entry belongs to that attempted artifact, at arbitrary depth. A descendant regular file named `gitplane-artifact.json` is invalid because artifacts cannot nest. Directories, symlinks, and other non-regular entries with the reserved name do not establish artifact boundaries; each one is invalid and produces `unsupported-artifact-entry`.

Working-tree discovery uses `lstat` semantics and never follows symlinks. It first discovers every entry with the reserved marker name without reading marker contents or artifact files. Nested regular-file markers produce one `nested-artifact` finding each, and non-regular reserved-name entries produce one `unsupported-artifact-entry` finding each; if any of these occur, discovery returns only those findings and performs no corpus reads. Otherwise each outer regular-file occurrence is an attempted boundary and contributes one to `artifactCount`. An empty configured root is valid and has count zero.

Within an outer boundary, regular files and directories are supported. Symlinks and other special entries produce `unsupported-artifact-entry`. Non-regular entries outside attempted boundaries are ignored unless they carry the reserved marker name. Ordinary files and directories outside boundaries are also ignored.

For incremental reconciliation, Gitplane diffs the cursor and target trees. For each changed path it walks upward independently in both trees to the nearest `gitplane-artifact.json`. The union of old and new boundaries is the candidate set. Each target candidate is then read as a complete recursive snapshot. Changes outside an artifact produce no candidate. `--full` recursively discovers every target artifact and compares those IDs with all live materialized IDs.

## Artifact envelope and identity

`gitplane-artifact.json` is an open JSON object. Gitplane requires `gpId` and reserves an optional all-or-none classification block consisting of `gpApiVersion`, `gpKind`, and `gpSchemaVersion`. The rest are arbitrary domain fields under the user's control:

```json
{
  "gpApiVersion": "example.dev/v1",
  "gpKind": "Greeting",
  "gpSchemaVersion": 1,
  "gpId": "01jxyz8y3jqazj7jrx53w9b3dn",
  "message": "Hello, world!",
  "settings": {
    "locale": "en-US"
  }
}
```

- `gpId` must be a canonical 26-character lowercase ULID using Crockford Base32 alphabet `0123456789abcdefghjkmnpqrstvwxyz`, with first character `0` through `7`. It is immutable for the artifact's lifetime, unique across the source, and never reused. `gitplane artifact create` may mint it or accept it explicitly; discovery and reconciliation never mint IDs.
- A generic artifact omits all three classification fields. A classified artifact contains all three. Every partial combination is invalid.
- `gpApiVersion` and `gpKind` are non-empty strings, preserved byte-for-byte, that select a registered kind. Once established for an artifact ID they are immutable.
- `gpSchemaVersion` is a positive integer accepted by that kind.
- Additional fields are application-owned. Gitplane preserves the complete parsed marker and, for classified artifacts, projects configured values, but assigns no generic meaning to them.

Artifact IDs are unique across generic and classified artifacts in one source. A generic artifact may become classified once. That transition establishes immutable `gpApiVersion`/`gpKind` lineage and uses the ordinary `artifact.revised` event because marker content changes. Classified-to-generic transitions and changes to an established API version or kind are invalid. A tombstoned classified ID remains permanently reserved to its established `gpApiVersion` and `gpKind`; restoring any ID retains its prior classification state and transition rules. Separate sources may reuse an ID because durable identity is `(source_id, artifact_id)`.

The same ID moving to another path preserves artifact lineage. The move commit becomes the marker's last-changed commit, so it creates a new revision and produces `artifact.revised` with both paths rather than a separate move event. A different ID appearing at a different path while an old ID disappears is delete-plus-create. Replacing an ID at the same path in one commit is invalid; perform deletion and creation in separate commits.

### Kind registration and schema transitions

Generic artifacts are valid without kind registration. A classified artifact requires an exact registered `(gpApiVersion, gpKind)` pair and a `gpSchemaVersion` declared by that registration. Schema-version declarations carry projection fields and optional `clearFields`; they do not contain validators.

```ts
schemaVersions: {
  1: { fields: { "/message": { target: "message" } } },
  2: {
    fields: { "/content/message": { target: "message" } },
    clearFields: ["legacy_locale"],
  },
},
transitions: [{ from: 1, to: 2 }],
```

Projection fields, clear-fields, and directed transition metadata are retained for later reconciliation. `check` establishes only that the current classified marker names a registered kind and declared current schema version. It does not evaluate transition or lineage legality. During reconciliation, an existing artifact may remain on its version or follow one registered direct transition. Downgrades and skipped transitions fail unless registered. Restoring a tombstoned ID follows the same rule from its last schema version.

## Content digests and revisions

An artifact revision is an immutable content snapshot at one repository-relative artifact path. An internal path or byte change creates a new revision through the content digest. Moving the artifact creates a new revision through the artifact path, even when the recursive content digest matches an earlier revision. Latest observed commit belongs to the mutable artifact materialization.

### Content digest

The content digest includes every recursive regular file, including `gitplane-artifact.json`. Each file path is artifact-root-relative, `/`-separated UTF-8. Entries are sorted by the raw UTF-8 bytes of the complete relative path. Gitplane hashes this concatenation for each sorted entry:

```text
u64be(path_byte_length) || path_bytes ||
u64be(content_byte_length) || raw_content_bytes
```

The outer artifact path and Git mode are excluded. Gitplane performs no text, JSON, Unicode, or newline normalization. Symlinks, submodules, directories presented as file entries, and every other special entry are rejected.

The public digest is lowercase `sha256:<64 hex characters>`. Identity code also retains the raw 32 SHA-256 bytes for revision-ID derivation.

### Revision identity and storage

Revision identity is deterministic from source ID, artifact ID, repository-relative artifact path, and content digest:

```text
revision_id = "gpr_" + base32lower(
  SHA-256(
    u64be(len(utf8(source_id))) || utf8(source_id) ||
    u64be(len(utf8(artifact_id))) || utf8(artifact_id) ||
    u64be(len(utf8(artifact_path))) || utf8(artifact_path) ||
    raw_32_byte_content_digest
  )
)
```

`gpr_` means “Gitplane revision.” Lowercase Base32 uses the Crockford alphabet without padding. `artifact_path` is the repository-relative `/`-separated artifact directory; the repository root is the empty string.

A revision stores its ID and digest, complete parsed marker, recursive relative-path/per-file-SHA-256 manifest, and one immutable first-observed Git locator: commit plus artifact path. Because path participates in revision identity, re-observing the same revision at another path is impossible.

Gitplane stores no raw artifact bytes. Exact content remains addressed by the first-observed Git commit and path. Object-store replication is a future extension and out of scope for v1.

## Relational materialization

Each classified kind maps to exactly one operator-owned current-state target table. One classified artifact maps to one row containing both mandatory Gitplane lineage and application fields. The target table and lineage mappings remain fixed across schema versions; projected fields may vary by version.

Generic artifacts are first-class control-plane records: they are discovered, checked, revisioned, reconciled, evented, moved, deleted, restored, and retained in control storage. They have no kind registration requirement or target-row projection. Classification writes the first target row. `doctor` checks configured kind/store capabilities and never requires a target mapping merely because generic artifacts exist.

For a one-field `Greeting`, an operator might create:

```sql
CREATE TABLE greetings (
  gp_source_id TEXT NOT NULL,
  gp_artifact_id TEXT NOT NULL,
  gp_revision_id TEXT NOT NULL,
  gp_artifact_path TEXT NOT NULL,
  gp_deleted INTEGER NOT NULL DEFAULT 0,
  gp_deleted_at_commit TEXT,
  message TEXT NOT NULL,
  settings_json TEXT,
  UNIQUE (gp_source_id, gp_artifact_id)
);
```

Gitplane does not otherwise constrain physical names, SQL types, primary keys, or additional columns. The two-column `(gp_source_id, gp_artifact_id)` composite unique constraint is mandatory so upserts have a deterministic conflict target; it need not be the primary key.

Operators own all target-table DDL and migrations. Gitplane neither creates nor migrates application tables. The SQLite adapter owns Gitplane control tables for cursors, lineage, current state, immutable revisions, durable events, and reconciliation errors. Operators create them only through the explicit, idempotent `initializeSqliteStore({ path, baseDirectory })` API. Initialization inspects before writing, creates a missing compatible v1 schema atomically, and refuses incompatible objects without migration, drop, rename, or rewrite. Opening a store, `doctor`, and `reconcile` perform no DDL.

### Projections

Mappings use RFC 6901 JSON Pointers into the complete parsed `gitplane-artifact.json`:

```ts
fields: {
  "/message": { target: "message" },
  "/settings": { target: "settings_json", mode: "json" },
  "": { target: "artifact_json", mode: "json" },
}
```

Ordinary mappings preserve the selected JSON value without Gitplane coercion. Missing pointers and explicit JSON `null` both map to the backend's null value. `mode: "json"` passes an object, array, scalar, or null as one adapter-native structured value; the empty pointer maps the complete marker. SQLite deterministically JSON-serializes non-null JSON-mode values and binds ordinary scalars directly, representing booleans as integers; ordinary objects and arrays fail closed. Gitplane does not prevalidate projected SQL types. The adapter/database is authoritative, and rejection fails closed.

A live upsert writes the complete lineage and configured target-version projection in one target-row statement. `clearFields` explicitly writes retired columns as null. A deletion updates only the deletion fields, preserving the last revision ID, path, and domain values. Restoration performs a complete live upsert at the restored path and clears deletion state.

## Command semantics

The CLI surface — command list, common output behavior, and exit codes — is defined in [README-draft.md](README-draft.md). This section specifies each command's semantics.

### `gitplane artifact create <directory>`

Creation is local and config-free. It does not load `gitplane.config.ts`, inspect Git history, require the directory to be under a configured artifact root, or open the materialization store.

By default it mints a canonical lowercase ULID and creates a target directory containing only a deterministically formatted `gitplane-artifact.json` with `{ "gpId": "..." }` and a trailing newline. `--id` substitutes a validated canonical lowercase ULID. `--kind` opts into classification with defaults `gpApiVersion: "gitplane/v0"` and `gpSchemaVersion: 1`; `--api-version` and `--schema-version` override those defaults and are valid only with `--kind`. Kind and API-version values must be non-empty and are preserved byte-for-byte. No option accepts arbitrary application metadata, templates, stdin JSON, or generic fields.

The immediate parent must already exist. Any existing target path, including an empty directory, produces `target-exists` without mutation. A missing parent produces `parent-missing` without creating parents. Creation is one atomic domain operation at the artifact gateway boundary: exclusively create the directory, stage the marker inside that newly owned directory, and publish the marker atomically. On marker failure it removes only invocation-owned temporary content and the directory created by this invocation; it never overwrites or removes a pre-existing path.

This is a danger-tier 1 scoped/reversible mutation and requires no confirmation. Success returns the created path and artifact ID. `target-exists` and `parent-missing` are structured semantic non-successes, invalid options or IDs are usage errors, and unexpected filesystem failures are operational failures.

### `gitplane check`

`check` validates the complete corpus in the working tree. It is stateless, never invokes the store factory, and never reads Git history or stored lineage. Checking covers the entire configured artifact root, not only changed artifacts. An empty root completes successfully.

At invocation start Gitplane captures the current working directory. The default config is `gitplane.config.ts` in that directory; `--config <path>` is resolved against it. The selected config contains exactly one `source.id` and one `source.artifactRoot`; `source` alone is a valid minimum config, with `kinds` and `store` independently optional. The artifact root is resolved relative to the config directory, must resolve within the invocation directory, and must be a real directory according to `lstat`. Output reports its normalized logical path relative to the invocation directory with `/` separators. Config or source failures exit `2` without partial corpus data.

After the nesting-first phase defined under Artifact discovery, `check` reads each outer attempted boundary and emits only these normative findings:

| Code                         | Semantics                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `nested-artifact`            | One error per regular file with the reserved marker name nested beneath another attempted boundary. Discovery-phase findings (`nested-artifact` and reserved-name `unsupported-artifact-entry`) are returned together; if any occur, they are the only findings and no marker or artifact contents are read.                                                                  |
| `invalid-marker-json`        | The regular marker is not syntactically valid JSON, or its parsed value is not an object.                                                                                                                                                                                                                                                                                     |
| `invalid-marker-envelope`    | The marker object violates the exhaustive reserved-field envelope: `gpId` is required; classification fields are all present or all absent; `gpApiVersion` and `gpKind` are non-empty strings; and `gpSchemaVersion` is a positive integer. One finding describes the envelope failure without producing downstream ID, kind, or schema findings for invalid reserved values. |
| `invalid-artifact-id`        | `gpId` is not a canonical 26-character lowercase ULID in Crockford Base32 with first character `0` through `7`.                                                                                                                                                                                                                                                               |
| `duplicate-artifact-id`      | One error for every artifact participating in a duplicate ID. Each finding carries the complete, symmetrically identical list of that ID's artifact paths, sorted lexically.                                                                                                                                                                                                  |
| `unknown-artifact-kind`      | A classified marker's exact `(gpApiVersion, gpKind)` pair is not registered. Generic artifacts never produce this finding.                                                                                                                                                                                                                                                    |
| `unknown-schema-version`     | The classified kind is registered but its `gpSchemaVersion` is not one of that registration's declared current schema versions.                                                                                                                                                                                                                                               |
| `unsupported-artifact-entry` | A symlink or other special entry occurs under an outer boundary, or a non-regular entry anywhere in the root carries the reserved marker name. Discovery never follows the entry.                                                                                                                                                                                             |

`artifactCount` is the number of outer attempted boundaries, including boundaries whose regular-file markers later fail JSON, envelope, ID, kind, or schema checks. Findings use current-working-directory-relative `/`-separated paths. Completed results sort findings by absent artifact path first, then `artifactPath`, `relativePath`, `jsonPointer`, and `code`, each lexically. Completed output contains `sourceId`, normalized `artifactRoot`, `artifactCount`, severity counts, and findings. Exit `0` means clean or warning-only completion; exit `1` means at least one error finding. Operational, usage, configuration, or source failure exits `2` and returns no partial result.

Lineage legality between commits (immutable `gpApiVersion`/`gpKind`, registered schema transitions, no ID replacement at one path) is not `check`'s job. `reconcile` enforces it while planning from cursor tree to target tree and fails closed. If pre-merge validation of the commit-based process proves necessary, a future `reconcile --dry-run` can plan and validate without writes.

### `gitplane reconcile <commit> [--full]`

Normal reconciliation is fast-forward and cursor-derived:

1. Resolve target `C`; reject merge commits. V1 assumes linear, squash-only source history.
2. Read the source cursor and any pending reconciliation attempt. First reconciliation requires `--full`.
3. Require a normal target to descend from the cursor. An equal normal target may still require cleanup of a completed attempt.
4. Gather all required Git and store facts, build the complete deterministic semantic plan from the cursor and target Git trees, and validate the complete corpus, lineage transitions, classifications, schemas, and plan before the first materialization write. Planning never derives truth from partially materialized rows.
5. Persist the complete frozen plan under its deterministic reconciliation attempt ID before materialization. A matching retry reuses that plan verbatim rather than rereading source artifacts or reinterpreting kind registration.
6. Apply the plan in the phase order specified below.
7. Advance the cursor from the expected prior value to exactly `C` with compare-and-set. A successful cursor CAS is the completed-materialization boundary.
8. Resolve errors recorded for that target and delete the completed attempt.

Writes are deliberately non-transactional. Partial materialization may be visible before cursor CAS. A retry of an unresolved matching attempt replays the persisted plan with the same deterministic identities, making completed writes harmless. The guarantee is eventual convergence after a successful retry, not atomic visibility of one complete commit.

A normal target must descend from the cursor. Older or divergent targets fail without materialization writes. `--full` is required for initial sync and intentional repair. It discovers and validates every target artifact, upserts control state and revisions for all live artifacts plus target rows for classified artifacts, tombstones stored live IDs absent at the target in control state and in target tables where applicable, and preserves already absent tombstones and immutable history. `--full` is not history import or garbage collection.

#### Reconciliation invariants

**Truth and validation.** Git facts and a persisted frozen attempt are the only planning authorities. Gitplane gathers source and store facts and validates the complete corpus and semantic plan before the first materialization write. It never plans from partially materialized rows.

**Transition selection.** A successful plan emits at most one event per artifact. Normal incremental reconciliation uses lifecycle precedence `created → restored → revised → none → deleted`; generic-to-classified and outer-path moves are revisions. Initial full reconciliation emits `artifact.created` for every target artifact. Every later full reconciliation is a repair: it reapplies every artifact in the repair plan and emits `artifact.repaired` for each one, without first detecting target drift or asserting a Git-history transition.

**Event reconstruction.** Events describe transitions in Gitplane's materialization lifecycle, not the commit where an artifact first appeared in repository history. Initial full reconciliation transitions every target artifact from untracked to tracked and emits one deterministic `artifact.created` event per artifact. Every completed reconciliation reports exactly one event-reconstruction status:

- `not-requested` — normal incremental reconciliation, including normal equal-cursor cleanup-only work;
- `performed` — initial full reconciliation, with one `artifact.created` event per target artifact;
- `repair-performed` — any later full reconciliation, regardless of ancestry or cursor-history availability; reapply every artifact in the repair plan and emit one `artifact.repaired` event per artifact.

A repair event is lineage-free: it records the corrective materialization work and carries known prior/current revision and path without asserting how the artifact transitioned through Git history. Repairing an artifact out of current materialization tombstones its control and classified target state and emits `artifact.repaired` with its prior revision/path and null current revision/path.

**Apply ordering.** The authoritative rebuild order is: persist attempt and frozen plan → for each artifact in canonical artifact-ID order, apply its revision → lineage → control current state → classified target, when applicable → event, when applicable → after all artifacts, cursor CAS → resolve errors → delete the attempt. This is adapter-neutral semantic ordering, not SQL statement or transaction ordering. The engine/fault-injection slice must test it and may amend it only explicitly if evidence requires a change.

**Completion and visibility.** Successful cursor CAS is the completed-materialization boundary. Because writes are non-transactional, readers that do not check the cursor may observe stale or mixed control and target state while reconciliation is in progress; this eventual consistency is intentional. Consumers that need commit-level freshness must treat cursor equality with the expected target as the completion signal. If later error resolution or attempt deletion fails, the advanced cursor and persisted attempt retain enough state to identify completed-attempt residue. A later equal-cursor invocation retries those cleanup operations idempotently without replaying materialization or artifact events, so transient cleanup failures are eventually recoverable. Permanent cleanup failures may require operator recovery; exact controls remain provisional to the durable-store and engine slices. `cursorAdvanced` describes this invocation, not cursor equality: cleanup failure after this invocation successfully advances the cursor reports `true`; a later equal-cursor cleanup-only invocation reports `false` even though the durable cursor already equals the target.

**Failure split.** Structural failures are deterministic history, corpus, lineage-legality, classification/schema, attempt-conflict, baseline/frozen-plan-conflict, or CAS-precondition-mismatch outcomes. They create no durable reconciliation-error row. Operational failures are failures to execute required source or store operations. Once the write phase begins, Gitplane records a sanitized durable reconciliation error best-effort where applicable; failure to record it never replaces the primary failure. A semantic CAS mismatch is distinct from an operational CAS-backend failure, and a semantic attempt conflict is distinct from an operational attempt-store failure. Failure-recording side effects are outside the happy-path apply order.

**Attempt identity and retry authority.** A reconciliation attempt ID has prefix `gpa_` and is deterministically derived by length-framed hashing of source ID, expected cursor commit or an explicit initial-sync sentinel, target commit, and mode. The durable-store slice owns the exact derivation function and literal identity test. One complete adapter-neutral semantic apply plan is persisted under that ID and replayed verbatim after interruption. It contains prior and current facts, identities, transition/event outcomes, target identity, and all derived projection values required to apply without rereading source artifacts or reinterpreting changed kind registration. It excludes adapter-specific SQL and mutable progress markers. Exact planner types and durable schema remain provisional to their owning slices.

**Single pending attempt.** A source cannot silently replace an unresolved attempt. Matching work reuses its frozen plan, conflicting work fails structurally, and residue after cursor CAS is cleanup-only. Detailed stale-attempt recovery, mode-mismatch handling, operator controls, and exact lookup precedence are provisional TODOs for the durable-store and engine slices.

#### Reconciliation proof matrix

This matrix is a curated normative catalog, not a Cartesian test generator or a claim of implementation proof. Stable IDs identify the public-interface end-to-end scenarios that the named future slice must add through `reconcile(context, options)` when the required behavior and test infrastructure exist. Typed vectors arrive with those executable scenarios, not before them.

| ID                                   | Dimensions                                     | Expected semantic outcome                                                                        | Proof obligation                                                  | Owner         |
| ------------------------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- | ------------- |
| `history-initial-normal`             | no cursor; normal                              | Structural rejection before writes; first reconciliation requires full                           | Resolve initial history state                                     | source facts  |
| `history-initial-full`               | no cursor; full                                | Materialize target; `performed`; one `artifact.created` event per target artifact                | Establish the materialization lifecycle from scratch              | engine E2E    |
| `history-incremental-descendant`     | cursor ancestor; normal                        | Plan cursor-to-target transitions; `not-requested`                                               | Supply comparable diff facts                                      | source facts  |
| `history-incremental-equal`          | cursor equals target; normal                   | No materialization replay; cleanup residue only; `not-requested`                                 | Distinguish equality from advancement                             | engine E2E    |
| `history-normal-non-forward`         | target older or divergent; normal              | Structural rejection before writes                                                               | Classify non-forward history                                      | source facts  |
| `history-full-descendant`            | cursor ancestor; full                          | Full repair; `repair-performed`; reapply and emit `artifact.repaired` for every planned artifact | Keep explicit repair semantics independent of ancestry            | engine E2E    |
| `history-full-equal`                 | cursor equals target; full                     | Full repair; `repair-performed`; reapply and emit `artifact.repaired` for every planned artifact | Permit noisy equal-cursor repair without target-drift reads       | engine E2E    |
| `history-full-older`                 | target older; full                             | Full repair; `repair-performed`; reapply and emit `artifact.repaired` for every planned artifact | Repair without asserting nonlinear Git transitions                | engine E2E    |
| `history-full-divergent`             | target divergent; full                         | Full repair; `repair-performed`; reapply and emit `artifact.repaired` for every planned artifact | Repair without asserting nonlinear Git transitions                | engine E2E    |
| `history-merge-rejected`             | target merge commit; either mode               | Structural rejection before writes                                                               | Enforce linear-history contract                                   | source facts  |
| `history-prior-unavailable`          | recorded cursor unreadable; full               | Full repair; `repair-performed`; reapply and emit `artifact.repaired` for every planned artifact | Distinguish corrective work from inferred history                 | source facts  |
| `lifecycle-create`                   | unseen ID becomes live                         | `artifact.created`                                                                               | Derive creation from complete facts                               | planner       |
| `lifecycle-delete`                   | live ID absent at target                       | `artifact.deleted`; control and classified target tombstoned                                     | Derive deletion deterministically                                 | planner       |
| `lifecycle-restore`                  | tombstoned ID becomes live                     | `artifact.restored`; complete live projection restored                                           | Preserve lineage across absence                                   | planner       |
| `lifecycle-move`                     | same ID and content, new path                  | New path-derived revision; one `artifact.revised` event carrying both paths                      | Treat path as part of immutable revision identity                 | planner       |
| `lifecycle-revise`                   | same ID, changed content                       | `artifact.revised`                                                                               | Derive immutable revision identity                                | planner       |
| `lifecycle-revise-move`              | content and path change together               | One `artifact.revised` event carrying both paths                                                 | Prove precedence and at-most-one event                            | planner       |
| `lifecycle-unchanged`                | same revision and path                         | No event                                                                                         | Avoid synthetic transitions                                       | planner       |
| `lifecycle-generic-classified`       | generic becomes classified                     | Legal `artifact.revised`; first target row                                                       | Establish classification lineage once                             | planner       |
| `lifecycle-classified-generic`       | classified becomes generic                     | Structural rejection                                                                             | Enforce one-way classification                                    | planner       |
| `lifecycle-kind-api-change`          | established kind or API changes                | Structural rejection                                                                             | Preserve established identity                                     | planner       |
| `lifecycle-schema-legal`             | registered direct transition                   | Revision and target projection apply                                                             | Enforce registered edge                                           | planner       |
| `lifecycle-schema-illegal`           | downgrade, skip, or unregistered transition    | Structural rejection                                                                             | Reject illegal schema lineage                                     | planner       |
| `lifecycle-same-path-id-replacement` | old ID replaced by new ID at one path          | Structural rejection                                                                             | Reject lineage replacement                                        | planner       |
| `lifecycle-duplicate-target-id`      | target corpus repeats ID                       | Structural rejection before writes                                                               | Validate complete corpus                                          | planner       |
| `events-not-requested`               | normal incremental/equal cleanup               | `not-requested`                                                                                  | Cover normal modes                                                | engine E2E    |
| `events-initial-materialization`     | initial full                                   | `performed`; one deterministic `artifact.created` per target artifact                            | Distinguish materialization creation from repository introduction | engine E2E    |
| `events-repair-descendant-equal`     | later full; descendant/equal target            | `repair-performed`; one `artifact.repaired` per planned artifact                                 | Keep explicit full repair semantics simple and ancestry-neutral   | engine E2E    |
| `events-repair-baseline-unavailable` | later full; unreadable prior commit            | `repair-performed`; one `artifact.repaired` per planned artifact                                 | Record reapplied work without inventing Git lineage               | engine E2E    |
| `events-repair-non-forward`          | later full; older/divergent target             | `repair-performed`; one `artifact.repaired` per planned artifact                                 | Record reapplied work without asserting nonlinear transitions     | engine E2E    |
| `events-precedence`                  | all lifecycle outcomes                         | At most one event per artifact in declared precedence                                            | Exhaust transition decision table                                 | planner       |
| `events-retry-stability`             | interruption and retry                         | Same event ID and sequence; no duplicate event                                                   | Replay frozen outcomes over shared state                          | engine E2E    |
| `attempt-first-persist`              | no pending attempt                             | Persist deterministic attempt ID and complete frozen plan before materialization                 | Establish retry authority                                         | durable store |
| `attempt-matching-retry`             | matching unresolved attempt                    | Reuse frozen plan verbatim                                                                       | Prevent source/config reinterpretation                            | engine E2E    |
| `attempt-conflict`                   | different unresolved attempt                   | Structural conflict; do not replace attempt                                                      | Enforce one pending attempt                                       | durable store |
| `attempt-post-cas-residue`           | cursor advanced; attempt remains               | Cleanup only; no materialization or event replay                                                 | Recognize completed attempt residue                               | engine E2E    |
| `failure-prewrite-structural`        | invalid deterministic input                    | Fail before materialization; no durable error                                                    | Separate structural policy from operations                        | planner       |
| `failure-materialization-backend`    | store operation fails after write phase starts | Operational failure; sanitized durable error best-effort                                         | Preserve primary operation failure                                | engine E2E    |
| `failure-cas-mismatch`               | CAS precondition false                         | Structural failure; no durable error                                                             | Distinguish semantic conflict                                     | durable store |
| `failure-cas-backend`                | CAS operation cannot execute                   | Operational failure; durable error best-effort                                                   | Distinguish adapter failure                                       | engine E2E    |
| `failure-attempt-store-backend`      | attempt operation cannot execute               | Operational failure, not attempt conflict                                                        | Preserve boundary classification                                  | engine E2E    |
| `failure-error-recording`            | primary operation and error persistence fail   | Return primary failure unchanged                                                                 | Keep diagnostics subordinate                                      | engine E2E    |
| `failure-post-cas-cleanup`           | resolve/delete fails after successful CAS      | Operational failure with completed materialization                                               | Preserve completion boundary                                      | engine E2E    |
| `completion-cas-success`             | CAS succeeds in invocation                     | `cursorAdvanced: true`                                                                           | Report invocation advancement                                     | engine E2E    |
| `completion-pre-cas-failure`         | any failure before CAS success                 | `cursorAdvanced: false`                                                                          | Do not overstate completion                                       | engine E2E    |
| `completion-post-cas-failure`        | same invocation cleanup fails after CAS        | `cursorAdvanced: true`                                                                           | Preserve completed-materialization fact                           | CLI E2E       |
| `completion-later-cleanup-failure`   | later equal-cursor cleanup fails               | `cursorAdvanced: false`                                                                          | Separate durable equality from invocation action                  | CLI E2E       |
| `completion-later-cleanup-success`   | later equal-cursor cleanup succeeds            | `cursorAdvanced: false`; residue removed                                                         | Finish without replay                                             | CLI E2E       |
| `completion-shared-state-retry`      | failure at every write boundary; retry         | Final revisions, events, sequences, and target values equal uninterrupted run                    | Prove per-artifact ordering and retry convergence                 | engine E2E    |

The durable-store and engine slices must re-examine stale-attempt/operator recovery, mode-mismatch handling, exact attempt lookup precedence, and exact durable storage shape rather than infer outcomes absent from this matrix.

### `gitplane doctor`

`doctor` is read-only. It loads configuration, requests one read-only store from the access-aware lazy factory, closes that store before returning, and checks:

- control-table compatibility;
- configured target-table and mapped-column presence;
- mandatory lineage fields for configured classified kinds;
- an exact two-column `(gp_source_id, gp_artifact_id)` unique key for each configured target table (a wider unique key is insufficient);
- configured JSON-mapping support where introspection permits.

Checks return `pass`, `fail`, or `unsupported`. A failure exits `1`. Unsupported introspection is a visible warning unless the adapter says the capability is required for safe writes. `doctor` performs no DDL, initialization, migration, probe write, or destructive operation. The SQLite adapter supports all v1 doctor checks through normalized introspection facts; core policy owns stable check codes, subjects, ordering, and statuses. A source-only store config runs only the control-schema check. Generic artifacts imply no target checks.

## Reconciliation events

Event emission follows the reconstruction status and initial-full rules above. A successful plan emits at most one transition event per artifact, with this precedence:

1. `artifact.created` — the ID first becomes tracked in this materialization, including initial full reconciliation;
2. `artifact.restored` — a tombstoned ID becomes live;
3. `artifact.revised` — a live artifact's revision changes through content, classification, or path;
4. no event — revision and path are unchanged;
5. `artifact.deleted` — a live ID disappears.

Every full reconciliation after initial materialization uses `artifact.repaired` instead of lifecycle kinds, one per artifact reapplied by the repair plan, regardless of ancestry or cursor-history availability. V1 deliberately does not read target rows to suppress no-op repair writes or events; this may produce repair events for already-matching materializations, and semantic drift detection is a later optimization. Repeating full repair for the same source, artifact, and target commit reuses the same deterministic repair event rather than recording each invocation separately; invocation history remains in command logs, and a separate attempt-history capability may be added later if needed. Events carry prior/current revision and path where applicable, so revised and repaired events can describe moves. A repair removal tombstones the artifact and carries its prior revision/path with null current revision/path. `artifact.created` is a materialization-lifecycle fact, not a claim about the commit where the marker first appeared in repository history; `artifact.repaired` is a corrective materialization fact, not a claim about Git lineage. Generic artifacts emit the same event kinds as classified artifacts; generic-to-classified and outer-path moves use `artifact.revised` when history is comparable.

Event identity is deterministic:

```text
event_id = "gpe_" + base32lower(
  SHA-256(
    u64be(len(utf8(source_id))) || utf8(source_id) ||
    u64be(len(utf8(artifact_id))) || utf8(artifact_id) ||
    u64be(len(utf8(reconciled_commit))) || utf8(reconciled_commit) ||
    u64be(len(utf8(event_type))) || utf8(event_type)
  )
)
```

Lowercase Base32 uses the Crockford alphabet without padding. Thus event IDs are store-independent and deterministic across retry. Each inserted event receives a store-assigned monotonic sequence scoped to its source; a retry reuses the existing event and sequence.

V1 persists immutable event facts but does not dispatch them. There are no handlers, delivery attempts, acknowledgements, or pending-event retries. Event identity and sequence are designed not to preclude a future outbox or dispatcher, whose delivery state would be separate from the immutable event.

## Reconciliation errors

Only applicable operational failures after the write phase begins record or update a sanitized error best-effort, keyed by `(source_id, target_commit, artifact_id-or-path, operation)`. Structural failures do not create durable reconciliation-error rows. Records carry a stable category, diagnostic, first/last observed timestamps, and attempt count. A later successful reconcile to that target marks its errors resolved rather than deleting them.

Failure to persist the error does not hide or replace the original failure. Diagnostics must not contain secrets, environment values, SQL parameter values, or full artifact contents. `check` is stateless and never writes reconciliation errors. Exact final error-code names remain provisional to the implementing slices.

## Package topology

V1 uses two incubating workspace packages:

- `@nseng-ai/gitplane` — domain API, validation, digesting, reconciliation planning, the canonical artifact, corpus-check, and materialization-store gateway contracts, in-memory fakes, conformance helpers, and an exported API-kind `@nseng-ai/gitplane/cli` subpackage;
- `@nseng-ai/gitplane-sqlite` — Node 24+ native `node:sqlite` local/reference store adapter and explicit Gitplane control-schema initializer. Relative database paths resolve against the selected config directory, read-only opens do not create missing databases, parent directories are never created implicitly, and each command owns one closable store lifetime.

The `/cli` subpackage has distinct runtime importers, passes the repository subpackage rank test, and is rooted at `src/cli/`. A thin executable bootstrap invokes its Clinkr app. Its command topology follows Clinkr's filesystem layout:

```text
src/cli/
  app.ts
  commands/
    artifact/
      group.ts
      create/
        metadata.ts
        command.ts
    check/
      metadata.ts
      command.ts
    reconcile/
      metadata.ts
      command.ts
    doctor/
      metadata.ts
      command.ts
```

## Reference consumer

A permanent, tested example demonstrates the application contract with the `Greeting` table: operator-owned DDL, config and mappings, storing artifact ID plus revision ID for reproducibility, reading immutable event facts idempotently by event ID/sequence, and keeping runtime execution state outside Gitplane. It exercises injected source/store fakes and does not grow workflow-engine responsibilities.

## V1 boundaries and future upgrades

V1 deliberately excludes:

- artifact scaffolding beyond local `artifact create`, or ID minting during discovery/reconciliation;
- merge-commit and nonlinear-history support;
- concurrent writers or source leases;
- GitHub API source fetching;
- event dispatch, webhooks, or an async outbox publisher;
- production persistence adapters;
- reconcile-in-CI wired to durable storage;
- query CLI commands such as `list` or `show`;
- `reconcile --dry-run` pre-merge transition validation;
- target-table DDL or migration management;
- raw-content/object-store replication;
- multiple target tables per kind;
- automatic multi-domain discovery;
- real Riptide, Goat Farm, or ns-internal consumer integrations;
- workflow-engine activation policy.

`CorpusCheckGateway` owns only raw working-tree inventory and candidate reads for stateless checking. `ArtifactGateway` operates on artifacts after corpus validation and retains creation, commit/history, discovered-boundary, complete-snapshot, and commit-diff operations for reconciliation. This separation keeps malformed working-tree entries out of the valid artifact-domain seam.

The gateway shapes and immutable event records preserve upgrade paths for alternate Git sources, production stores, source leases, outbox delivery, and object-store replication without making those v1 features.

## Implementation details intentionally left open

The semantics above, and the user-facing surface in [README-draft.md](README-draft.md), are settled. The next implementation slice may choose exact TypeScript result-object names, private module layout, SQLite control-table/column names, and internal SQL statement shapes, provided those choices satisfy these two documents and the public conformance suites.
