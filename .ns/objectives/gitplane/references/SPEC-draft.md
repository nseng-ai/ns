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

The reserved marker name establishes an attempted artifact boundary regardless of the entry's kind, JSON validity, or envelope validity. Every descendant entry belongs to that attempted artifact, at arbitrary depth. A descendant entry named `gitplane-artifact.json` is invalid because artifacts cannot nest.

Working-tree discovery uses `lstat` semantics and never follows symlinks. It first discovers every occurrence of the reserved marker name without reading marker contents or artifact files. If any are nested, discovery returns only one `nested-artifact` finding per nested occurrence and performs no corpus reads. Otherwise each outer occurrence is an attempted boundary and contributes one to `artifactCount`. An empty configured root is valid and has count zero.

Within an outer boundary, regular files and directories are supported. Symlinks and other special entries produce `unsupported-artifact-entry`; a non-regular reserved marker produces that finding even when it is not within another boundary. Ordinary special entries outside attempted boundaries are ignored. Ordinary files and directories outside boundaries are ignored.

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

The same ID moving to another path is a move. A different ID appearing at a different path while an old ID disappears is delete-plus-create. Replacing an ID at the same path in one commit is invalid; perform deletion and creation in separate commits.

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

An artifact revision is an immutable content snapshot, not an observation of current location. A pure outer artifact move reuses the revision. An internal path or byte change creates a new one. Current path and latest observed commit belong to the mutable artifact materialization.

### Content digest

The content digest includes every recursive regular file, including `gitplane-artifact.json`. Each file path is artifact-root-relative, `/`-separated UTF-8. Entries are sorted by the raw UTF-8 bytes of the complete relative path. Gitplane hashes this concatenation for each sorted entry:

```text
u64be(path_byte_length) || path_bytes ||
u64be(content_byte_length) || raw_content_bytes
```

The outer artifact path and Git mode are excluded. Gitplane performs no text, JSON, Unicode, or newline normalization. Symlinks, submodules, directories presented as file entries, and every other special entry are rejected.

The public digest is lowercase `sha256:<64 hex characters>`. Identity code also retains the raw 32 SHA-256 bytes for revision-ID derivation.

### Revision identity and storage

Revision identity is deterministic from source, artifact, and content:

```text
revision_id = "gpr_" + base32lower(
  SHA-256(
    u64be(len(utf8(source_id))) || utf8(source_id) ||
    u64be(len(utf8(artifact_id))) || utf8(artifact_id) ||
    raw_32_byte_content_digest
  )
)
```

`gpr_` means “Gitplane revision.” Lowercase Base32 uses the Crockford alphabet without padding.

A revision stores its ID and digest, complete parsed marker, recursive relative-path/per-file-SHA-256 manifest, and one immutable first-observed Git locator: commit plus artifact path. Re-observing the same revision elsewhere does not append locations.

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

Operators own all target-table DDL and migrations. Gitplane neither creates nor migrates application tables. The SQLite adapter creates only Gitplane control tables for cursors, immutable revisions, durable events, and reconciliation errors.

### Projections

Mappings use RFC 6901 JSON Pointers into the complete parsed `gitplane-artifact.json`:

```ts
fields: {
  "/message": { target: "message" },
  "/settings": { target: "settings_json", mode: "json" },
  "": { target: "artifact_json", mode: "json" },
}
```

Ordinary mappings preserve the selected JSON value without Gitplane coercion. Missing pointers and explicit JSON `null` both map to the backend's null value. `mode: "json"` passes an object, array, scalar, or null as one adapter-native structured value; the empty pointer maps the complete marker. Gitplane does not prevalidate table schemas or projected SQL types. The adapter/database is authoritative, and rejection fails closed.

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
| `nested-artifact`            | One error per reserved marker-name occurrence nested beneath another attempted boundary. If any occur, these are the only findings and no marker or artifact contents are read.                                                                                                                                                                                               |
| `invalid-marker-json`        | The regular marker is not syntactically valid JSON, or its parsed value is not an object.                                                                                                                                                                                                                                                                                     |
| `invalid-marker-envelope`    | The marker object violates the exhaustive reserved-field envelope: `gpId` is required; classification fields are all present or all absent; `gpApiVersion` and `gpKind` are non-empty strings; and `gpSchemaVersion` is a positive integer. One finding describes the envelope failure without producing downstream ID, kind, or schema findings for invalid reserved values. |
| `invalid-artifact-id`        | `gpId` is not a canonical 26-character lowercase ULID in Crockford Base32 with first character `0` through `7`.                                                                                                                                                                                                                                                               |
| `duplicate-artifact-id`      | One error for every artifact participating in a duplicate ID. Each finding carries the complete, symmetrically identical list of that ID's artifact paths, sorted lexically.                                                                                                                                                                                                  |
| `unknown-artifact-kind`      | A classified marker's exact `(gpApiVersion, gpKind)` pair is not registered. Generic artifacts never produce this finding.                                                                                                                                                                                                                                                    |
| `unknown-schema-version`     | The classified kind is registered but its `gpSchemaVersion` is not one of that registration's declared current schema versions.                                                                                                                                                                                                                                               |
| `unsupported-artifact-entry` | A symlink or other special entry occurs under an outer boundary, or a reserved marker-name entry is non-regular even outside another boundary. Discovery never follows the entry.                                                                                                                                                                                             |

`artifactCount` is the number of outer attempted boundaries, including boundaries whose markers later fail entry, JSON, envelope, ID, kind, or schema checks. Findings use current-working-directory-relative `/`-separated paths. Completed results sort findings by absent artifact path first, then `artifactPath`, `relativePath`, `jsonPointer`, and `code`, each lexically. Completed output contains `sourceId`, normalized `artifactRoot`, `artifactCount`, severity counts, and findings. Exit `0` means clean or warning-only completion; exit `1` means at least one error finding. Operational, usage, configuration, or source failure exits `2` and returns no partial result.

Lineage legality between commits (immutable `gpApiVersion`/`gpKind`, registered schema transitions, no ID replacement at one path) is not `check`'s job. `reconcile` enforces it while planning from cursor tree to target tree and fails closed. If pre-merge validation of the commit-based process proves necessary, a future `reconcile --dry-run` can plan and validate without writes.

### `gitplane reconcile <commit> [--full]`

Normal reconciliation is fast-forward and cursor-derived:

1. Resolve target `C`; reject merge commits. V1 assumes linear, squash-only source history.
2. Read the source cursor. First reconciliation requires `--full`.
3. Require the cursor to be an ancestor of `C`; equal cursor is a no-op.
4. Build the complete deterministic transition plan from the cursor Git tree to the target Git tree—not from possibly partial store state.
5. Validate every candidate and enforce lineage legality (one-way generic-to-classified transition, immutable established kind/API identity, registered schema transitions, no ID replacement at one path) before writes.
6. Apply idempotent revision and event inserts for every artifact, control-current-state changes for every artifact, and target-row upserts/tombstones only for classified artifacts.
7. Advance the cursor from the expected prior value to exactly `C` with compare-and-set, last.
8. Resolve errors recorded for that target after success.

Writes are deliberately non-transactional. If an operation fails, reconciliation stops, the cursor does not advance, and partial writes may be visible. Gitplane records a sanitized error best-effort and requires engineer action where appropriate. Retrying while the cursor is unchanged reconstructs the same plan and deterministic IDs, making completed writes harmless. The guarantee is eventual convergence after a successful retry, not atomic visibility of one complete commit.

A normal target must descend from the cursor. Older or divergent targets fail without writes. `--full` is required for initial sync and intentional repair. It discovers and validates every target artifact, upserts control state and revisions for all live artifacts plus target rows for classified artifacts, tombstones stored live IDs absent at the target in control state and in target tables where applicable, preserves already absent tombstones and all immutable history, and advances the cursor last. When the previous cursor commit is available, `--full` records only transitions inferable from cursor tree to target tree; otherwise it creates no synthetic historical events and reports that event reconstruction was skipped. `--full` is not history import or garbage collection.

### `gitplane doctor`

`doctor` is read-only. It loads configuration, requests one read-only store from the access-aware lazy factory, closes that store before returning, and checks:

- control-table compatibility;
- configured target-table and mapped-column presence;
- mandatory lineage fields for configured classified kinds;
- `(gp_source_id, gp_artifact_id)` composite uniqueness for each configured target table;
- configured JSON-mapping support where introspection permits.

Checks return `pass`, `fail`, or `unsupported`. A failure exits `1`. Unsupported introspection is a visible warning unless the adapter says the capability is required for safe writes. `doctor` performs no DDL, initialization, migration, probe write, or destructive operation. The SQLite adapter supports all v1 doctor checks.

## Reconciliation events

A successful plan emits at most one transition event per artifact, with this precedence:

1. `artifact.created` — the ID has never existed;
2. `artifact.restored` — a tombstoned ID becomes live;
3. `artifact.revised` — a live artifact's revision changes, even if its path also changes;
4. `artifact.moved` — its path changes while its revision remains identical;
5. no event — revision and path are unchanged;
6. `artifact.deleted` — a live ID disappears.

Events carry prior/current revision and path where applicable, so a revised event can also describe a simultaneous move. Generic artifacts emit the same event kinds as classified artifacts; generic-to-classified uses `artifact.revised`.

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

A failed reconcile records or updates a sanitized error best-effort, keyed by `(source_id, target_commit, artifact_id-or-path, operation)`. Records carry a stable category, diagnostic, first/last observed timestamps, and attempt count. A later successful reconcile to that target marks its errors resolved rather than deleting them.

Failure to persist the error does not hide or replace the original failure and never advances the cursor. Diagnostics must not contain secrets, environment values, SQL parameter values, or full artifact contents. `check` is stateless and never writes reconciliation errors.

## Package topology

V1 uses two incubating workspace packages:

- `@nseng-ai/gitplane` — domain API, validation, digesting, reconciliation planning, the canonical artifact, corpus-check, and materialization-store gateway contracts, in-memory fakes, conformance helpers, and an exported API-kind `@nseng-ai/gitplane/cli` subpackage;
- `@nseng-ai/gitplane-sqlite` — local/reference store adapter and Gitplane control-table implementation.

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
