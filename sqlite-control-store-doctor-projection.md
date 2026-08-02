# Implement Gitplane SQLite control storage, target projection, and `doctor`

## Goal and outcome

Complete the next open `gitplane` Objective slice without pulling cursor-diff reconciliation into scope:

- implement `@nseng-ai/gitplane-sqlite` as the Node 24+ reference `MaterializationStoreGateway` adapter using native `node:sqlite` `DatabaseSync`;
- add an explicit, idempotent `initializeSqliteStore(...)` package API for Gitplane-owned control-table DDL;
- keep `gitplane doctor` strictly read-only while making it report deterministic control-schema, target-table, mapped-column, lineage, composite-uniqueness, and JSON-projection checks;
- support complete classified target-row upsert/tombstone behavior, including RFC 6901 projection, JSON serialization, `clearFields`, and custom physical lineage-column names;
- preserve generic artifacts as control-plane-only records with no target mapping or target row;
- leave reconciliation planning, commit traversal, transition legality, and command execution for the following roadmap slice.

The implementation is complete when the public contracts, in-memory fake, native SQLite adapter, CLI composition, fake-driven scenarios, adapter conformance coverage, SQLite integration tests, canonical README/spec drafts, and Objective tracking agree.

## Context and discovered facts

### Governing artifacts

- Objective: `.ns/objectives/gitplane/objective.md`.
- Ordered work: `.ns/objectives/gitplane/roadmap.md`; this is the SQLite control-store / optional target-projection / `gitplane doctor` row immediately after recursive corpus check.
- Canonical user contract: `.ns/objectives/gitplane/references/README-draft.md`.
- Canonical normative contract: `.ns/objectives/gitplane/references/SPEC-draft.md`.
- Non-normative rationale: `.ns/objectives/gitplane/references/v1-contract-design-report.md`.
- Package placement is already established at:
  - `ts/packages/incubating/infra/gitplane/`
  - `ts/packages/incubating/infra/gitplane-sqlite/`

The drafts already settle operator-owned target DDL, adapter-owned control DDL, one target table per classified kind, mandatory mapped lineage fields, exact `(source_id, artifact_id)` composite uniqueness, JSON Pointer mappings, JSON mode, null-clearing, deletion preservation, read-only doctor behavior, and `pass`/`fail`/`unsupported` checks.

### Current implementation state

- `MaterializationStoreGateway` and all record/result shapes are currently concentrated in `ts/packages/incubating/infra/gitplane/src/core/gateways.ts`.
- `InMemoryMaterializationStoreGateway` in `src/testing/materialization-store.ts` already models cursors, lineage, current records, revisions, target rows, events, reconciliation errors, and injected doctor checks.
- `@nseng-ai/gitplane-sqlite` is only a package skeleton: `src/index.ts` exports nothing and the manifest has no runtime dependency on `@nseng-ai/gitplane`.
- `gitplane doctor` is an unavailable Clinkr scaffold in `src/cli/commands/doctor/command.ts`.
- The config loader already validates source, kind, schema-version, transition, target, and store-factory structure, but does not yet expose the config directory or validate physical-column collisions.
- `GitplaneContext` currently carries only `Clock`; `GitplaneCliContext` does not expose that clock separately for lazy store construction.
- The current store factory is lazy (`store?: (context) => MaterializationStoreGateway`), so `check` can remain storage-free.
- `TargetRowRecord.values: Record<string, unknown>` loses the projection mode needed for a backend to distinguish ordinary scalar binding from `mode: "json"` serialization. Refine this request shape before implementing SQLite writes.
- Current local recursive-check changes are uncommitted and have a known formatter-only `just` failure in `test/unit/check.test.ts`. Preserve them; format and validate rather than overwriting or re-planning that completed semantic slice.

### Grilled decisions

1. Use native `node:sqlite` `DatabaseSync`, not `better-sqlite3` or another npm driver.
2. Resolve relative SQLite paths against the selected config file’s directory.
3. Open one store lazily per `doctor`/future `reconcile` invocation and close it in `finally`.
4. Put stable doctor orchestration/check codes in Gitplane core; the store gateway supplies normalized introspection facts rather than final user-facing policy conclusions.
5. Do not bootstrap or migrate control tables while opening a store, running doctor, or reconciling.
6. Add explicit `initializeSqliteStore(...)` as an idempotent `@nseng-ai/gitplane-sqlite` package API. Do not add a fifth Gitplane CLI command and do not add `initialize()` to the backend-neutral gateway.

### Runtime and repository constraints

- The workspace requires Node `>=24.12.0`; the checked runtime exposes `node:sqlite` `DatabaseSync`, read-only open options, prepared statements, `close()`, and SQLite catalog/pragma access.
- `DatabaseSync` is synchronous, but it remains encapsulated behind the existing Promise-returning gateway interface.
- Default tests must stay fake-driven. Real SQLite belongs in `test/integration/` and runs via `just ts-test-integration`.
- Use strict erasable TypeScript, Zod at config/CLI boundaries, relative `.ts` imports within packages, exported package paths across packages, result unions for expected database failures, and no module mocks/process mutation.
- `doctor` is a Tier 0 finite Clinkr command: typed envelope, result schema, human renderer, `--config`/`-c`, exit `0` for pass or warning-only unsupported checks, `1` for any failed check, and `2` for config/store/inspection/close failures.

## Public contract and architecture

### Store opening and path ownership

Refine the config store factory so a caller explicitly requests access mode:

```ts
type StoreAccess = "read-only" | "read-write";

type GitplaneStoreFactory = (
  context: GitplaneContext,
  options: { readonly access: StoreAccess },
) => MaterializationStoreGateway;
```

Extend `GitplaneContext` with the absolute selected config directory alongside `clock`. Make `ConfigLoadResult` return that directory. Add the package clock to `GitplaneCliContext`; bootstrap one real clock and reuse it for artifact-ID generation and store context. `check` must continue loading config without calling `config.store`.

The documented SQLite wiring should become explicit, for example:

```ts
store: (context, options) =>
  createSqliteStore({
    path: "state/greetings.db",
    baseDirectory: context.configDirectory,
    clock: context.clock,
    access: options.access,
  }),
```

`createSqliteStore` resolves the path once, opens `DatabaseSync` with `readOnly: true` for doctor and writable mode for future reconciliation, performs no DDL, and returns a closable gateway. Do not create a missing parent directory implicitly. Opening a missing read-only database is an operational failure.

Add `close(): Promise<OperationResult>` to `MaterializationStoreGateway`; the in-memory implementation is an idempotent no-op. Commands retain their primary operation error if both work and close fail, but a close failure after otherwise successful work is an exit-2 operational failure.

### Explicit control-schema initialization

Export an idempotent API from `@nseng-ai/gitplane-sqlite`:

```ts
initializeSqliteStore({ path, baseDirectory }): Promise<OperationResult>
```

It opens a short-lived writable native connection, inspects before writing, and closes in `finally`.

- If an existing Gitplane-owned table/version marker is incompatible, return a structured failure without mutation.
- If the schema is absent or only compatible expected tables are missing, create all missing v1 control objects in one SQLite transaction and then verify compatibility.
- Repeated initialization against the exact v1 schema succeeds without changes.
- Do not migrate, drop, rename, or rewrite incompatible objects.
- Keep exact private table/column names in one SQLite schema descriptor module so initializer, adapter SQL, and introspection cannot drift.

Use a private schema-version metadata table plus tables sufficient for every existing gateway operation:

- source cursor;
- artifact lineage;
- current artifact state;
- immutable revisions, including parsed envelope and digest manifest;
- immutable per-source sequenced events;
- reconciliation errors with first/last observation, attempt count, and resolution state.

Store dates as canonical ISO strings and structured values as deterministic JSON. Preserve revision/event conflict semantics already modeled by the in-memory fake: same deterministic ID and immutable content is `existing`; different content is `conflict`; later first-observed revision locators do not replace the first locator.

### Backend-neutral doctor orchestration

Replace `inspectDoctor()` and injected final `DoctorCheck[]` with normalized store-introspection facts. Keep the gateway operation cohesive, but do not let an adapter choose final check codes, ordering, severity, or CLI status.

The normalized facts should cover:

- control schema state/version/compatibility details;
- target-table existence;
- target column names;
- unique constraints/indexes as column sets;
- JSON-projection capability (`supported` for SQLite; future adapters may report `unsupported`).

Implement a pure core doctor evaluator under `src/core/doctor/` that accepts `sourceId`, configured kinds, and introspection facts and emits deterministic doctor checks. Replace the artifact-oriented optional `Finding[]` on `DoctorCheck` with doctor-specific fields such as `code`, `subject`, `status`, and `summary`; doctor diagnostics must not pretend to be artifact corpus findings.

Use stable repeated codes plus a separate subject rather than interpolating kind/table names into codes. At minimum evaluate, in deterministic API-version/kind order:

- `control-schema`;
- `target-table`;
- `target-columns`;
- `target-lineage-columns`;
- `target-source-artifact-uniqueness`;
- `target-json-mapping-support` when a schema version uses JSON mode.

A source-only config with a store and no kinds runs only control checks. Generic artifacts never create additional checks and never imply a target mapping.

### Projection and target-write request shape

Add pure backend-neutral projection logic under `src/core/projection/`:

- resolve RFC 6901 pointers, including the empty pointer and `~0`/`~1` decoding;
- distinguish a missing pointer internally, then map missing and explicit JSON `null` to backend null as required by the spec;
- produce complete mapped values for one selected schema version;
- apply `clearFields` as explicit null assignments;
- keep projection planning separate from SQL execution.

Replace the lossy `TargetRowRecord.values` bag with an operation request that preserves, per physical target column, the value and whether the mapping is ordinary or `json`. Include `TargetMapping`, lineage values, projected fields, and cleared columns explicitly. The in-memory fake and SQLite adapter must implement the same request semantics.

For SQLite binding:

- bind SQL values; never interpolate data;
- quote every configured table/column identifier with one shared identifier-quoting helper;
- serialize non-null `mode: "json"` values with deterministic `JSON.stringify` and bind JSON null/missing as SQL `NULL`;
- bind ordinary JSON scalars using SQLite-native values (including a deliberate boolean-to-integer representation); let unsupported ordinary object/array values fail closed rather than silently stringify them;
- issue one `INSERT ... ON CONFLICT(mapped_source, mapped_artifact) DO UPDATE` statement containing all lineage, current-version projected, and clear-field columns;
- make restoration the same complete live upsert with deletion false/null;
- make tombstone update only mapped deletion/deleted-at columns, preserving revision, path, and domain values; a missing target row remains an idempotent success.

At config-load time reject unsafe/ambiguous mappings before SQL generation: duplicate lineage physical columns; duplicate projected target columns within a schema version; projection/`clearFields` collisions; duplicate `clearFields`; and collisions between lineage columns and projected/cleared columns. Preserve the existing exact-optional-property construction style.

Doctor must require an exact unique two-column key over mapped source ID and artifact ID (regardless of whether implemented as a table constraint, primary key, or unique index). A wider unique index is insufficient. It should report missing tables/columns/constraints as failed checks, not perform a probe write or DDL. SQLite reports JSON mapping support as pass because serialization is adapter-owned and does not depend on JSON1.

## Files, symbols, tests, and docs

### `@nseng-ai/gitplane` core and testing

- `ts/packages/incubating/infra/gitplane/src/core/domain.ts`
  - add config-directory context and access-aware store-factory types;
  - refine target-write/projection data types.
- `ts/packages/incubating/infra/gitplane/src/core/gateways.ts`
  - replace final-check inspection with normalized facts;
  - add close operation;
  - refine target-row upsert request without widening unrelated reconciliation methods.
- `ts/packages/incubating/infra/gitplane/src/core/doctor/` (new)
  - schemas/types for facts and checks;
  - pure ordered evaluator.
- `ts/packages/incubating/infra/gitplane/src/core/projection/` (new)
  - RFC 6901 resolver and projection-plan builder.
- `ts/packages/incubating/infra/gitplane/src/core/index.ts`
  - curate only the public types/functions needed by config authors, adapters, and tests.
- `ts/packages/incubating/infra/gitplane/src/testing/materialization-store.ts`
  - mirror the refined contract, no-op close, constructor-state introspection facts, and observable target state.
- Add a reusable conformance harness under `src/testing/` for backend-visible gateway semantics. Run it once against the in-memory fake in the default lane and once against native SQLite in integration; avoid duplicating a large operation matrix.

### CLI/config wiring

- `src/cli/config-loader.ts`
  - return config directory;
  - validate mapping collisions;
  - preserve lazy store factory and source-root behavior.
- `src/cli/context.ts`, `src/cli/bootstrap.ts`, and relevant test context builders
  - expose/reuse clock and construct per-config `GitplaneContext`.
- `src/cli/commands/doctor/command.ts`
  - implement `--config`/`-c`;
  - require configured storage or return a structured configuration failure;
  - invoke the factory with `read-only`, inspect, evaluate in core, and close in `finally`;
  - publish a bounded typed result containing source ID, aggregate pass/fail/unsupported counts, and ordered checks;
  - provide concise human rendering and stable failure data.
- `test/scenario/cli.test.ts` or a focused `test/scenario/doctor.test.ts`
  - fake-driven pass, fail, unsupported-warning, missing-store, open/inspect failure, close failure, human output, machine envelope, and schema/help coverage.

### Native SQLite package

- `ts/packages/incubating/infra/gitplane-sqlite/package.json`
  - add runtime dependency on `@nseng-ai/gitplane`; no third-party SQLite dependency.
- `ts/packages/incubating/infra/gitplane-sqlite/tsconfig.json`
  - include tests if needed for package-local typechecking.
- Replace the empty `src/index.ts` with curated exports backed by private modules such as:
  - `schema.ts` — exact v1 control-schema descriptor/DDL;
  - `path.ts` — config-relative resolution;
  - `database.ts` — native connection/result normalization and identifier quoting;
  - `initialize.ts` — explicit idempotent initialization;
  - `store.ts` — `MaterializationStoreGateway` implementation;
  - `introspection.ts` — normalized read-only schema facts.
- Add `test/integration/` coverage using temporary database files and real `DatabaseSync` for initialization, reopen/read-only behavior, complete gateway conformance, incompatible schema refusal, target upsert/restore/tombstone, custom identifiers, JSON values, clear fields, and doctor introspection.

### Canonical docs and Objective tracking

Update both canonical drafts in the same change:

- README getting-started must call `initializeSqliteStore(...)` explicitly before doctor/reconcile, show config-relative `baseDirectory`, state that commands never initialize/migrate, and retain operator ownership of target DDL.
- SPEC must define explicit initialization, no implicit DDL on open/doctor/reconcile, read-only doctor access, connection lifetime, and the refined target/doctor semantics.
- Remove or amend statements implying that simply opening the SQLite adapter creates control tables.

Because this is a settled-contract amendment, add a new immutable Semantic Update under `.ns/objectives/gitplane/updates/`; do not edit prior updates. Update `objective.md` where it still says package-local invocation context contains only `Clock`, and mark the roadmap row complete only after implementation and evidence are real. Do not touch the subsequent reconciliation row except to preserve its dependency on this store contract.

## Implementation sequence

1. **Cleanly absorb the current branch state.** Run the TypeScript formatter on the existing recursive-check changes, rerun its focused package checks, and inspect `git status` so this slice does not overwrite unrelated local work.
2. **Amend canonical contracts first.** Update README/SPEC for native `node:sqlite`, explicit initialization, config-relative path base, access-aware opening, and no command-side DDL. Keep Objective tracking open until code lands.
3. **Refine backend-neutral types.** Introduce store access, config directory, close semantics, introspection facts, doctor checks, and projection-aware target requests. Update the in-memory fake and existing fake tests immediately so the gateway remains executable rather than becoming dead scaffolding.
4. **Implement pure projection and doctor policy.** Test RFC 6901 edge cases, missing/null behavior, JSON modes, clear fields, deterministic check ordering, no-kind configs, exact uniqueness, and unsupported capability handling without SQLite.
5. **Wire config and CLI lifecycle.** Add mapping-collision validation, clock/config-directory construction, lazy read-only factory invocation, typed doctor envelope, and guaranteed close. Confirm `check` never invokes storage.
6. **Implement the SQLite schema and initializer.** Centralize exact schema metadata, inspect before mutation, create atomically, verify after creation, and refuse incompatible existing objects. Add no migration behavior.
7. **Implement control operations.** Port each existing fake semantic to prepared SQL: cursor CAS, lineage/current lookups and upserts, revision/event idempotence/conflicts, source-scoped event sequence, and error aggregation/resolution. Translate expected SQLite failures into sanitized gateway errors.
8. **Implement target writes and introspection.** Generate safely quoted dynamic SQL, bind all values, support JSON/clear fields, preserve tombstoned data, and normalize catalog/index facts for core doctor policy.
9. **Run shared conformance and focused SQLite integration tests.** Keep broad state-machine cases in the reusable conformance suite and add only SQLite-specific catalog, serialization, identifier, and lifecycle tests around it.
10. **Review and update durable tracking.** Run a standards/spec review against both drafts, remedy findings, add a new Semantic Update, mark the roadmap row complete with command evidence, and re-run Objective validation.

## Execution strategy for cross-file changes

This work changes more than five files, but it is not a same-shape mechanical refactor: core contracts, fake state, SQLite SQL, CLI lifecycle, tests, and prose each have different semantics. Use compiler-guided precise edits in dependency order rather than an opaque replacement script or `refactor-swarm`.

For the one cross-cutting API replacement (`inspectDoctor` and the target-upsert request), first use bounded `rg` to inventory every definition/call, edit the owning type, then follow TypeScript errors through fake, command, adapter, and tests. Finish with stale-shape checks:

```sh
rg -n --glob '*.ts' 'inspectDoctor|doctorChecks|TargetRowRecord|\.values' ts/packages/incubating/infra/gitplane{,-sqlite}
rg -n 'creates.*control tables|control tables.*creates|initializeSqliteStore' .ns/objectives/gitplane/references
```

Do not use ad hoc `text.replace()` scripts for README/SPEC/Objective prose. Read and precisely edit each affected section.

## Validation guidance

Run focused checks during development, then the repository gates:

```sh
pnpm --dir ts --filter @nseng-ai/gitplane check
pnpm --dir ts --filter @nseng-ai/gitplane test
pnpm --dir ts --filter @nseng-ai/gitplane-sqlite check

just ts-format-check
just ts-lint
just ts-check
just ts-test
just ts-test-integration
just ts-test-typescript-style-guard
ns objective check gitplane
just
```

Use autofixers for formatter/lint output (`just ts-format-fix`, then `just ts-lint-fix` if applicable) and rerun the failing gate. `just` does not include integration or style-guard lanes, so those explicit commands remain required.

Minimum evidence matrix:

- default pure tests: pointer decoding, projection/null/JSON/clear-field planning, config mapping collisions, doctor evaluation and ordering;
- default fake conformance: every `MaterializationStoreGateway` operation, idempotence/conflict behavior, generic records without target rows;
- default CLI scenarios: access mode, lazy invocation, exits 0/1/2, typed JSON, human output, no-store and gateway/close failures;
- SQLite integration: explicit initializer idempotence/refusal, file path and read-only lifecycle, full gateway conformance, target DDL introspection, exact composite uniqueness, custom quoted identifiers, JSON serialization, restoration and tombstone preservation;
- regression: `gitplane check` never calls the store factory and artifact creation remains config-free.

## Risks, assumptions, and open questions

### Resolved assumptions

- Native `node:sqlite` is acceptable as the reference adapter because Node 24.12+ is the repository/package baseline; no fallback driver is planned.
- Synchronous database calls are acceptable for v1 local/reference usage because they are hidden behind the gateway and no production persistence commitment is made.
- Control initialization is an explicit deployment/setup action. A missing database is an operational open failure; an existing database with missing/incompatible control schema becomes a deterministic doctor failure when it can be opened read-only.
- `reconcile` will later request read-write access but will not initialize or migrate control tables.
- SQLite JSON support is adapter serialization, not dependence on the optional SQLite JSON1 extension.
- Concurrent writers remain out of scope; source-scoped event sequencing and cursor CAS must still be correct for retries and accidental races under the v1 single-writer assumption.

### Risks to contain

- **Contract drift:** centralize schema descriptors and share normalized types so initializer, store SQL, and doctor introspection cannot disagree.
- **SQL injection through identifiers:** quote identifiers in exactly one reviewed helper and bind every value. Test quotes/reserved words in operator-owned names.
- **Implicit partial migration:** inspect before initialization writes and transact creation; never “repair” incompatible existing objects.
- **Lossy projection:** preserve projection mode in the gateway request and test scalars, arrays/objects in JSON mode, null, missing pointers, empty pointer, and escaped tokens.
- **Doctor accidentally mutating:** open `DatabaseSync` read-only and integration-test database bytes/schema before and after doctor.
- **Overreaching into reconciliation:** implement storage operations and pure projection preparation only; do not add commit planning, transition events, cursor-last orchestration, or `reconcile` command behavior.

No material product question remains open. Exact private control-table/column names and SQL statement decomposition are implementation choices, provided the descriptor is centralized and the canonical semantics above hold.

## Review and remediation

Before calling the slice complete, perform two explicit reviews:

1. **Standards review:** gateway ownership and normalized failures, strict TypeScript shapes, no ambient test state, integration-lane placement, Clinkr envelope/help/schema behavior, identifier/value safety, and package dependency closure.
2. **Spec review:** trace every SQLite/doctor/projection paragraph in README/SPEC to code and tests, especially explicit initialization, no DDL in doctor/reconcile, generic-artifact independence, complete live upsert, deletion preservation, exact uniqueness, unsupported semantics, and exit codes.

Remediate all correctness/data-safety findings before marking the roadmap row complete. Record any deliberate unsupported future-backend behavior in the new Semantic Update rather than weakening SQLite’s required complete introspection. If implementation evidence disproves a settled contract, amend both canonical drafts and add a new immutable update; never silently diverge and never rewrite existing updates.
