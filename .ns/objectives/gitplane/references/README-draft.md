# Gitplane

Gitplane is a Git-backed artifact control plane. It discovers and checks artifacts in a working tree, then reconciles exact Git commits into control state and operator-owned relational tables while preserving immutable revision and event history.

The division of authority:

> Git owns durable artifact contents as plain non-binary files in a repository. Gitplane owns artifact lineage, revision and event history, control-plane state, and the idempotent reconciliation process that projects classified artifacts into operator-owned relational tables.

This README covers the user-facing surface. The precise contracts — artifact discovery and identity, corpus findings, revisions, relational materialization, command semantics, events, and errors — are specified in [SPEC-draft.md](SPEC-draft.md).

## Motivation

Agentic applications, and agentic software engineering systems in particular, often keep durable documents directly in a Git repository. That is where agents work best: plain files, hierarchically organized and accessible via bash commands, are the medium models have been trained to read and edit. Placing curated, "small" context under version control also lets software engineering processes manage it. You can review, commit, and revert these documents, and plug them into the existing tooling ecosystem.

But those same applications need queryable state, transactional control, administrative UIs, leases, workflow coordination, and so forth. That combination forces a bad trade. Push operational state into the repository and transactional data thrashes through commit history. Keep the repository pure and there is no effective control plane at all. Intermediate schemes (GitHub Issues as a database, JSON state files, bespoke bots) go surprisingly far, but a fully fledged application eventually graduates to a relational database or another backing store. At that point the documents in Git and the rows in the store share no identity, drift apart, and are more difficult for agents to use.

Gitplane targets the hybrid. Documents stay in Git, in the exact form agents consume and manipulate them. Their identities and contents are reconciled into an operator-owned relational store where applications can query, transact, and coordinate.

For classified artifacts, this is a bring-your-own-database system. Each configured kind has a table representing its domain artifacts and satisfying lineage-column and uniqueness requirements. The user is free to join that table with the rest of their application. Generic artifacts need no domain table. Gitplane also adds control-plane tables strictly under its control for both generic and classified artifacts.

A stable artifact ID follows a document's lineage through edits and moves. A deterministic revision ID pins one exact content snapshot at one repository-relative artifact path, so moving an artifact creates a new revision without changing its lineage identity. Target tables carry artifact and revision IDs alongside projected fields. Harnesses and agents work the content in the repository. Applications (workflow engines, dashboards, schedulers) build on the materialization. Both sides get what they need, and neither corrupts the other's medium.

Control state and classified domain-table state are maintained by a reconciliation process run in CI. On every commit to the default branch, a CI system runs a provided CLI command and idempotently brings them up to date.

The system only works on a "small" corpus: sets of documents that fit comfortably in an agent's context window and need no embeddings, vector stores, or broad search infrastructure to work effectively. Agentic workflows managing migration campaigns and context-management systems serving small document sets to coding agents are examples. Large document corpora and search-driven retrieval are out of scope. Gitplane is not a workflow engine. It records artifact facts; activation policy belongs to the consumer.

Hence the division of authority above. Each system owns what it is structurally good at. The artifact-plus-revision pin is the seam that lets runtime state reference durable content without copying it.

## Getting started

The happy path starts locally and needs no configuration: create a generic artifact, then add files beneath it. To use kind-specific registration and relational projection, classify the artifact, configure a domain, create its domain table, explicitly initialize Gitplane's control-plane tables, wire CI, check the setup with `doctor`, and reconcile.

### 1. Create the document corpus

Create an artifact beneath an existing parent directory:

```text
gitplane artifact create artifacts/greetings/welcome
```

This local, config-free command mints a canonical lowercase ULID and atomically creates a new target directory containing only `gitplane-artifact.json`:

```json
{
  "gpId": "01jxyz8y3jqazj7jrx53w9b3dn"
}
```

The immediate parent must exist, and the target path must not exist—even as an empty directory. Gitplane never overwrites an existing path. It exclusively creates the directory, stages and atomically publishes the marker within it, and removes only invocation-owned temporary content and the newly created directory if marker creation fails.

`--id <lowercase-ulid>` supplies the identity instead of generating it. `--kind <non-empty-string>` creates a classified marker, defaulting `gpApiVersion` to `gitplane/v0` and `gpSchemaVersion` to `1`; `--api-version <non-empty-string>` and `--schema-version <positive-integer>` override those defaults and are valid only with `--kind`. Caller-supplied kind and API-version spelling is preserved byte-for-byte. The command accepts no arbitrary metadata, templates, stdin JSON, or generic `--field` option.

For example:

```text
gitplane artifact create artifacts/greetings/welcome --kind Greeting --api-version example.dev/v1
```

produces an open JSON marker whose four `gp`-prefixed fields are reserved and whose other fields are application-owned:

```json
{
  "gpApiVersion": "example.dev/v1",
  "gpKind": "Greeting",
  "gpSchemaVersion": 1,
  "gpId": "01jxyz8y3jqazj7jrx53w9b3dn"
}
```

`gpId` is always a canonical lowercase ULID: immutable for the artifact's lifetime, unique across the source, and never reused. Outside `artifact create`, Gitplane does not mint IDs during discovery or reconciliation.

Classification is optional but all-or-none: a marker either omits `gpApiVersion`, `gpKind`, and `gpSchemaVersion` or contains all three. Generic artifacts participate fully in discovery, checking, revision history, reconciliation, events, moves, deletion, restoration, and control storage. They need no kind registration and have no operator-owned target-table projection. A classified artifact's exact API version and kind must be registered, and its schema version must equal a schema version declared by that registration. A generic artifact may become classified once; established API version and kind cannot be removed or changed, and later schema changes follow registered transitions during reconciliation.

Every file beneath the marker's directory belongs to the artifact. Artifacts cannot nest, and files outside all artifact boundaries are ignored.

### 2. Create the config

By default, put `gitplane.config.ts` in the directory from which Gitplane is invoked. It declares the source (artifact root) and store, and may declare registered kinds with their table mappings:

```ts
import { defineArtifactKind, defineGitplaneConfig } from "@nseng-ai/gitplane";
import { createSqliteStoreFactory } from "@nseng-ai/gitplane-sqlite";

export default defineGitplaneConfig({
  source: {
    id: "acme/greetings",
    artifactRoot: "artifacts/greetings",
  },
  store: createSqliteStoreFactory({
    path: "state/greetings.db",
  }),
  kinds: [
    defineArtifactKind({
      apiVersion: "example.dev/v1",
      kind: "Greeting",
      target: {
        table: "greetings",
        lineage: {
          sourceId: "gp_source_id",
          artifactId: "gp_artifact_id",
          revisionId: "gp_revision_id",
          path: "gp_artifact_path",
          deleted: "gp_deleted",
          deletedAtCommit: "gp_deleted_at_commit",
        },
      },
      schemaVersions: {
        1: {
          fields: {
            "/message": { target: "message" },
            "/settings": { target: "settings_json", mode: "json" },
          },
        },
      },
      transitions: [],
    }),
  ],
});
```

### 3. Create the domain table

You own the domain table and its DDL. Gitplane requires the mapped lineage columns and the composite `(gp_source_id, gp_artifact_id)` unique constraint. Beyond that, physical names, SQL types, primary keys, and extra columns are up to you. The `gp_` prefix keeps Gitplane-owned columns visually separate from application columns:

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

### 4. Initialize control-plane tables

Gitplane keeps its own control-plane tables (generation cursors, lineage, current state, immutable revisions, frozen reconciliation attempts, generation-aware durable events, and reconciliation errors) in the same store, strictly under its control. Initialize the native Node SQLite adapter explicitly during setup:

```ts
import { initializeSqliteStore } from "@nseng-ai/gitplane-sqlite";

await initializeSqliteStore({
  path: "state/greetings.db",
  baseDirectory: import.meta.dirname,
});
```

Initialization is idempotent and refuses incompatible existing control objects without migrating or rewriting them. Opening the adapter and running `doctor` or `reconcile` never creates or migrates tables. The parent directory must already exist; applications do not author the control-plane DDL.

### 5. Add the CI job

Two jobs cover the loop:

- Every pull request: the shipped composite GitHub Action runs `gitplane check` on the PR head, so invalid artifacts never land.
- Every commit to the default branch: a job with access to durable storage runs `gitplane reconcile <commit>` to bring the domain table up to date.

### 6. Run doctor

`gitplane doctor` verifies the setup. It is read-only: it loads the config, opens one read-only store for the invocation, and checks control-table compatibility, configured domain tables and mapped columns, lineage fields, the exact two-column `(gp_source_id, gp_artifact_id)` uniqueness, and JSON projection support. It closes the store before returning and never initializes or migrates it.

### 7. End-to-end test

Commit an artifact, then check and reconcile:

```text
gitplane check                    # checks the working tree
gitplane reconcile HEAD           # initial reconciliation is ordinary snapshot materialization
```

One live row per classified artifact appears in its domain table, carrying lineage plus projected fields. Generic artifacts remain tracked in control storage without a domain row:

```sql
SELECT gp_artifact_id, gp_revision_id, message FROM greetings WHERE gp_deleted = 0;
```

## Configuration

Gitplane loads `gitplane.config.ts` from the invocation's current working directory unless `--config <path>` is supplied. The config option resolves against that invocation directory; paths declared by the config resolve from the config file's directory. Reported artifact paths are invocation-directory-relative and `/`-separated.

One configuration defines one **domain** and selects exactly one `source.id` and one `source.artifactRoot`. One CLI invocation operates on exactly one domain. The minimum valid configuration contains only `source`; `kinds` and `store` are independently optional. Generic artifacts require no kind registration or target mapping. Commands that need an absent capability fail as configuration errors.

Configuration is trusted executable code. At invocation start Gitplane captures the current working directory. The default config is `gitplane.config.ts` in that directory, and `--config <path>` is resolved against that directory. `source.artifactRoot` is resolved against the selected config's directory, must resolve within the invocation directory, and must identify a real directory by `lstat`; its logical path is then normalized back to a current-working-directory-relative `/`-separated path. Working-tree discovery never follows symlinks. The store is an access-aware lazy factory: `check` never invokes it or reads history, `doctor` requests read-only access, and `reconcile` requests read-write access. Each command opens one store per invocation and closes it before returning. Store paths resolve from `context.configDirectory`; no command initializes or migrates storage.

## CLI

Gitplane ships four command surfaces using Clinkr's filesystem-first command layout:

- `gitplane artifact create <directory>` — locally and atomically creates a generic artifact by default, without loading config, inspecting Git history, requiring an artifact root, or opening storage. It returns the created path and artifact ID. Existing targets and missing parents are structured semantic conflicts; invalid options/IDs are usage errors; unexpected filesystem failures are operational errors.
- `gitplane check` — validates the complete corpus in the working tree. It is stateless, never opens the store, and never consults Git history. Empty artifact roots are valid.
- `gitplane reconcile <commit>` — converges Gitplane control state and classified domain rows from the last completed materialization snapshot to the complete artifact snapshot at the resolved target commit. Initial materialization, forward updates, older-commit rollbacks, divergent commits, and merge commits use the same level-triggered planning rules; Git history and ancestry are not reconciliation inputs. It emits lifecycle transitions from stored control state. V1 has no repair mode or operator target-row drift detection.
- `gitplane doctor` — read-only verification of the configuration, store, control tables, configured domain tables, and mappings.

Common behavior:

- human-readable output by default;
- `--format json` emits the standard Clinkr machine envelope;
- `--json-schema`, `--runtime`, `--version`, and `-h`/`--help` follow Clinkr conventions;
- findings have stable code, severity, summary, and optional artifact path/ID, relative file path, and JSON Pointer;
- for completed `check` runs, exit `0` means clean or warning-only findings and exit `1` means at least one error finding; usage, configuration, source, store, or other operational failure exits `2` and emits no partial corpus result;
- completed JSON `check` output identifies `sourceId` and normalized `artifactRoot` and includes `artifactCount`, severity counts, and the deterministically sorted findings.

For reconciliation, the target commit tree is immutable desired state and the complete Gitplane-owned control snapshot at the last completed cursor generation is prior state. Operator-owned target-table values are never planning authorities. Control state is safe to plan from only when no unresolved attempt exists: matching work replays its frozen plan, conflicting work is refused, and residue left after cursor advancement is cleaned before new planning.

Successful generation-and-commit cursor compare-and-set is the completed-materialization boundary. Because writes are non-transactional, readers that do not check the cursor may observe stale or mixed materialized state while reconciliation is in progress; consumers that need snapshot-level freshness must check both cursor commit and generation. Cleanup can still fail after materialization has completed. The advanced cursor and persisted attempt retain enough state to identify that post-completion residue, so a later invocation retries error resolution and attempt deletion idempotently without replaying materialization or artifact events. A stale writer is rejected by generation even when its expected commit string has been revisited. The result reports bounded lifecycle counts, prior and resulting cursors, whether this invocation advanced the cursor, and whether it replayed or only cleaned an attempt; it does not report repair, ancestry, or event-reconstruction status.

Complete command semantics — atomic creation, validation coverage, snapshot reconciliation and failure guarantees, and doctor checks — are specified in [SPEC-draft.md](SPEC-draft.md).

## GitHub Action

Gitplane ships a check-only composite GitHub Action. For one explicitly configured domain it:

- accepts a required config path plus optional working-directory/runtime setup inputs;
- invokes `gitplane check --config <path> --format json` against the checked-out PR head;
- renders findings in the Action log and fails for error findings or operational errors;
- never runs `doctor`, opens storage, or reconciles.

Repositories with multiple domains use one Action step per config. Documentation also shows a conceptual reconcile job with durable storage, but shipped CI support remains check-only. Local `artifact create` is config-free and therefore does not select a domain.

## Multiple domains

A repository may contain multiple independent Gitplane installations. Each domain has its own configuration file, selected explicitly with `--config <path>`; relative paths inside each config resolve from that config file's directory:

```text
.gitplane/
  greetings/gitplane.config.ts
  campaigns/gitplane.config.ts
```

There is no automatic multi-domain discovery or aggregate config in v1. Invoke Gitplane once per config. Cross-config artifact-root overlap is an operator responsibility because one invocation does not discover other domains.
