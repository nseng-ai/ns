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

Every reconciliation resolves the requested commit and recursively discovers its complete artifact corpus. The immutable target commit tree is desired state; dirty or untracked working-tree contents are never included. Gitplane does not inspect ancestry, parents, diffs, or the prior commit tree, and V1 deliberately has no incremental snapshot optimization.

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

The same ID moving to another path preserves artifact lineage. Because the repository-relative artifact path participates in revision identity, the move creates a new revision and produces `artifact.revised` with both paths rather than a separate move event; Gitplane does not reconstruct marker-change provenance. When an old ID disappears and a different ID appears, Gitplane plans deletion and creation in the same Reconciliation Plan, including when both IDs use the same path.

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

Operators own all target-table DDL and migrations. Gitplane neither creates nor migrates application tables. The SQLite adapter owns Gitplane control tables for generation cursors, lineage, current state, immutable revisions, durable Reconciliation Plans, generation-aware durable events, and reconciliation errors. Operators create them only through the explicit, idempotent `initializeSqliteStore({ path, baseDirectory })` API. Initialization inspects before writing, creates a missing compatible v1 schema atomically, and refuses incompatible objects without migration, drop, rename, or rewrite. Prototype/pre-release cursor or event shapes are incompatible and must be recreated. Opening a store, `doctor`, and `reconcile` perform no DDL.

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

Lineage legality across completed materialization snapshots (immutable `gpApiVersion`/`gpKind` and registered schema transitions) is not `check`'s job. `reconcile` enforces it while planning from the complete Gitplane control snapshot to the complete target-commit corpus and fails closed. If pre-merge validation of the commit-based process proves necessary, a future `reconcile --dry-run` can plan and validate without writes.

### `gitplane reconcile <commit>`

`reconcile` is level-triggered: it converges Gitplane control state and classified target rows from the last completed materialization snapshot to the complete artifact snapshot at resolved target commit `C`. Initial, forward, older, divergent, and merge snapshots all use the same algorithm. Git ancestry, parentage, commit diffs, and history completeness are never observed, reported, or used to fetch additional history.

1. Resolve `C` and read its complete raw topology and artifact corpus. Missing target commits or required objects fail before writes.
2. Atomically read the complete Gitplane-owned materialization snapshot: cursor, all current records including tombstones, lineage, and any Pending Plan. Operator-owned target rows are not planning authorities.
3. If a Pending Plan exists, replay an exact matching Reconciliation Plan, reject conflicting work, or clean post-CAS residue before new planning. Only a completed snapshot with no Pending Plan is a valid planning baseline.
4. Validate the complete target corpus and prepare one deterministic Reconciliation Plan from target facts, completed control state, and kind registration. V1 always performs a complete scan.
5. Atomically persist the complete Reconciliation Plan as the sole Pending Plan for the source before materialization.
6. Apply it in the phase order below.
7. Compare-and-set the cursor from the expected generation to `{ commit: C, generation: expected + 1 }`. This is the completed-materialization boundary.
8. Resolve applicable errors and delete completed attempt residue.

An equal completed snapshot with no semantic work is a no-op and does not fabricate a generation. Cleanup-only work also leaves the generation unchanged. A completed transition to a distinct target commit advances generation even if artifact contents are identical. Absent cursor is conceptual generation `0`, and first completed materialization writes generation `1`.

Writes are non-transactional. Partial materialization can be visible before cursor CAS, but matching sequential retry replays the Reconciliation Plan with stable identities and converges. The Gateway protocol permits only one Pending Plan per source: serialized invocations atomically reuse or reject that plan before artifact writes, and generation CAS protects the completion boundary, including ABA when a commit is revisited. The native SQLite adapter is a single-writer local/reference adapter in v1; concurrent SQLite writers or simultaneous replayers are unsupported. Source leases remain out of scope.

#### Reconciliation invariants

**Truth and validation.** The immutable target commit tree is desired state. The complete Gitplane-owned snapshot at the last completed cursor generation is prior state. Dirty/untracked working-tree contents and operator-owned target-table values are not planning authorities. Complete target topology, corpus, lineage legality, classification/schema legality, and the semantic plan are validated before the first materialization write.

**Transition selection.** Reconciliation derives exactly these lifecycle outcomes: unseen + present → `artifact.created`; tombstoned + present → `artifact.restored`; live + changed revision or path → `artifact.revised`; live + identical revision and path → no event; live + absent → `artifact.deleted`. A successful plan emits at most one outcome per artifact. Generic-to-classified and moves are revisions. V1 has no repair mode or operator target-row drift detection.

**Apply ordering.** Persist the Reconciliation Plan as the Pending Plan → for each Planned Artifact Materialization in canonical artifact-ID order, prepare and write revision → lineage → control current state → classified target operation when applicable → event when applicable → after all artifacts, Resulting Cursor generation/commit CAS → resolve errors → delete the Pending Plan. This is adapter-neutral semantic ordering.

**Completion and visibility.** Successful generation CAS is the completed-materialization boundary. Consumers requiring snapshot freshness check cursor commit and generation. Post-CAS cleanup failure leaves recognizable attempt residue; a later invocation performs cleanup only and never replays materialization or events. Results report bounded lifecycle counts, prior/resulting cursor, `cursorAdvanced`, and replay/cleanup-only indication directly; repair and obsolete event-reconstruction status are not retained.

**Failure split.** Structural failures are deterministic corpus, lineage, classification/schema, attempt-conflict, plan-conflict, or CAS-precondition outcomes and create no durable reconciliation-error row. Operational source/store failures after writes begin record a sanitized error best-effort without replacing the primary failure. Semantic CAS mismatch and attempt conflict remain distinct from backend failures.

**Generation-aware plans and events.** An Attempt ID (`gpa_`) is deterministically calculated by length-framed hashing of source ID, expected cursor generation (or the initial sentinel), and target commit. The Reconciliation Plan is the canonical durable description of the complete reconciliation. It stores shared source, Attempt ID, target, and expected-cursor facts once and contains zero or more Planned Artifact Materializations. Domain logic prepares each one as a Prepared Artifact Materialization for the Materialization Store Gateway. The Resulting Cursor, Gateway records, and deterministic event IDs cannot be independently authored or persisted as a duplicate record graph. Event identity includes reconciliation generation, Attempt ID, target commit, artifact, and type: retries reproduce the same `gpe_`, while later visits to the same commit can emit distinct events.

**Pending Plan.** One unresolved Reconciliation Plan is permitted per source. Matching work replays it verbatim, conflicting work fails before artifact writes, and residue whose cursor already matches the plan's Resulting Cursor is cleanup-only. Existing incompatible pre-release stores are rejected with recreate guidance; v1 defines generation-aware cursor, attempt, and event records directly and provides no migration.

#### Reconciliation proof matrix

This curated matrix assigns stable public-interface and protocol proofs; it is not a Cartesian generator.

| ID                               | Scenario                                                        | Expected proof                                                                                                                   |
| -------------------------------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `snapshot-initial-normal`        | no cursor; normal                                               | Complete target materializes; target artifacts emit `artifact.created`; generation becomes 1.                                    |
| `snapshot-forward`               | later descendant target                                         | Uses complete-snapshot rules only; converges normally.                                                                           |
| `snapshot-older`                 | older target                                                    | Same planning rules; converges without ancestry observation.                                                                     |
| `snapshot-divergent`             | divergent target                                                | Same planning rules; converges without ancestry observation.                                                                     |
| `snapshot-merge`                 | merge target                                                    | Merge tree is an ordinary immutable snapshot.                                                                                    |
| `snapshot-target-unavailable`    | target commit/object missing                                    | Fails before materialization writes.                                                                                             |
| `snapshot-equal-noop`            | equal completed target; no residue                              | No Planned Artifact Materialization, event, or fabricated generation.                                                            |
| `snapshot-equal-cleanup`         | completed Pending Plan residue                                  | Cleanup only; no materialization/event replay or generation change.                                                              |
| `lifecycle-matrix`               | create/restore/revise/move/unchanged/delete                     | Exact lifecycle table, legal lineage, at most one event per artifact.                                                            |
| `generation-repeat`              | `A → B → A → B`                                                 | Every completed transition has a distinct generation and event identity.                                                         |
| `generation-aba`                 | stale writer expects old generation while commit string matches | CAS rejects stale expected generation and returns actual cursor facts.                                                           |
| `attempt-first-persist`          | no Pending Plan                                                 | Complete Reconciliation Plan persists atomically before artifact writes.                                                         |
| `attempt-matching-replay`        | matching Pending Plan                                           | Replays verbatim with stable event IDs/sequences.                                                                                |
| `attempt-conflict`               | different Pending Plan                                          | Refused before artifact writes; the existing plan is not replaced.                                                               |
| `attempt-post-cas-residue`       | Resulting Cursor written; Pending Plan remains                  | Cleanup only.                                                                                                                    |
| `failure-boundary-convergence`   | fail before/after every write boundary, then retry              | Final cursor generation, control rows, revisions, target values, event IDs/sequences, and cleanup equal uninterrupted execution. |
| `schema-incompatible-prerelease` | old cursor/event schema                                         | Refused without mutation; operator is told to recreate the store.                                                                |

Pure planner tests own lifecycle, lineage, ordering, and determinism. Shared fake/SQLite conformance owns snapshot immutability, canonical-plan validation, serialized Pending Plan reuse/conflict behavior, generation CAS/ABA, identity conflicts, events, and cleanup. Focused SQLite integration proves sequential close/reopen retry; concurrent SQLite writer behavior is outside v1 conformance. Engine fault injection owns interruption convergence. Minimal real-Git/SQLite E2E owns initial/update/older/divergent/merge/repeated-target/unavailable-target behavior, including depth-1 reconciliation without fetch or shallow-history probes. CLI scenarios own bounded output, schema/help/runtime/version, rejection of repair flags, and store close on every path.

### `gitplane doctor`

`doctor` is read-only. It loads configuration, requests one read-only store from the access-aware lazy factory, closes that store before returning, and checks:

- control-table compatibility;
- configured target-table and mapped-column presence;
- mandatory lineage fields for configured classified kinds;
- an exact two-column `(gp_source_id, gp_artifact_id)` unique key for each configured target table (a wider unique key is insufficient);
- configured JSON-mapping support where introspection permits.

Checks return `pass`, `fail`, or `unsupported`. A failure exits `1`. Unsupported introspection is a visible warning unless the adapter says the capability is required for safe writes. `doctor` performs no DDL, initialization, migration, probe write, or destructive operation. The SQLite adapter supports all v1 doctor checks through normalized introspection facts; core policy owns stable check codes, subjects, ordering, and statuses. A source-only store config runs only the control-schema check. Generic artifacts imply no target checks.

## Reconciliation events

Event emission follows completed control-state lineage. A successful plan emits at most one transition event per artifact, with this precedence:

1. `artifact.created` — an unseen ID is present in the target snapshot, including ordinary initial reconciliation;
2. `artifact.restored` — a tombstoned ID becomes live;
3. `artifact.revised` — a live artifact's revision changes through content, classification, or path;
4. no event — revision and path are unchanged;
5. `artifact.deleted` — a live ID disappears.

Events carry prior/current revision and path where applicable, so revised events can describe moves. `artifact.created` is a materialization-lifecycle fact, not a claim about repository introduction. Generic artifacts emit the same event kinds as classified artifacts; generic-to-classified and outer-path moves use `artifact.revised`.

Event identity is deterministic:

```text
event_id = "gpe_" + base32lower(
  SHA-256(
    u64be(len(utf8(source_id))) || utf8(source_id) ||
    u64be(len(utf8(artifact_id))) || utf8(artifact_id) ||
    u64be(reconciliation_generation) ||
    u64be(len(utf8(attempt_id))) || utf8(attempt_id) ||
    u64be(len(utf8(reconciled_commit))) || utf8(reconciled_commit) ||
    u64be(len(utf8(event_type))) || utf8(event_type)
  )
)
```

Lowercase Base32 uses the Crockford alphabet without padding. The Reconciliation Plan fixes generation and attempt identity, so retries reproduce the same event ID and sequence while a later visit to the same commit and event type receives a distinct ID. Each inserted event receives a store-assigned monotonic sequence scoped to its source.

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
- incremental snapshot optimization through tree-OID caching, commit diffs, or ancestry;
- source leases or broader distributed scheduling;
- repair mode or operator target-row drift detection;
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

`CorpusCheckGateway` owns only raw working-tree inventory and candidate reads for stateless checking. `ArtifactGateway` operates on artifacts after corpus validation and retains creation, target-commit resolution, discovered-boundary, and complete-snapshot operations. It exposes no ancestry or commit-diff operation. This separation keeps malformed working-tree entries out of the valid artifact-domain seam.

The gateway shapes and immutable event records preserve upgrade paths for alternate Git sources, production stores, source leases, outbox delivery, and object-store replication without making those v1 features.

## Implementation details intentionally left open

The semantics above, and the user-facing surface in [README-draft.md](README-draft.md), are settled. The next implementation slice may choose exact TypeScript result-object names, private module layout, SQLite control-table/column names, and internal SQL statement shapes, provided those choices satisfy these two documents and the public conformance suites.
