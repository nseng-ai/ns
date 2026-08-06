# Implement level-triggered Gitplane snapshot reconciliation

## Goal and outcome

Replace Gitplane's planned cursor-diff, history-gated reconciliation contract with a level-triggered model:

> `gitplane reconcile <commit>` converges Gitplane control state and classified target rows from the last completed materialization state to the complete artifact snapshot at the resolved target commit. Git history and ancestry are not reconciliation inputs.

The finished behavior must have these properties:

- One ordinary reconciliation algorithm handles initial materialization, forward updates, older-commit rollbacks, divergent commits, and merge-commit snapshots.
- The immutable target commit tree is desired state; literal dirty/untracked working-tree contents are not reconciled.
- The complete Gitplane-owned control-state snapshot is prior state. Operator-owned target-table values are never planning authorities.
- `--full` is removed and replaced by `--repair`. Normal mode emits lifecycle transitions from stored state to target state; repair mode deliberately reapplies the complete desired snapshot and emits lineage-free `artifact.repaired` events for affected live/removal work.
- Ancestry observation is removed entirely—not retained as a warning, gate, metric, fetch trigger, or optional optimization.
- Cursor compare-and-set uses a monotonic generation, eliminating commit-only ABA when commits are revisited.
- Attempt and event identities include reconciliation generation/attempt identity so retries are idempotent while later visits to the same commit can produce distinct events.
- V1 performs a complete target-corpus scan on every reconciliation. Do not add tree-OID caching, commit-diff fast paths, or other incremental optimizations in this change.
- Gitplane is unreleased. Define the generation-aware records directly as the supported v1 schema; do not migrate prototype or old pre-release reconciliation state. Existing incompatible local stores must be rejected and recreated.

Keep the existing Gather → Decide → Apply architecture: I/O-only immutable fact gathering, a pure deterministic planner, and ordered retry-safe effects behind the public `reconcile(context, options)` interface.

## Context and discovered facts

### Current branch and stack state

- Source branch: `shallow-ancestry-incomplete-history-classification`.
- Current checkpoint: `62f4acd26` (`[cp] Classify shallow Git history conservatively`), submitted as PR #4128 at the tip of a five-PR Graphite stack (#4093 → #4100 → #4114 → #4117 → #4128).
- That tip correctly distinguishes shallow `incomplete-history` from proven non-forward history under the old contract. The contract flip supersedes that requirement; preserve its rationale in Objective/PR history, but do not keep dead history machinery in the new normative or runtime contract.
- Active Objective `gitplane-reconciliation-stack-rebuild` currently encodes cursor-diff reconciliation. Its contract slice is checked off; source-fact code is partially implemented, but the pure planner, persisted attempts, retry-safe engine, and functional CLI command do not yet exist. This is therefore the least costly point for the flip.
- Repo-wide orienting Objectives do not add Gitplane-specific constraints. Normal repo rules, `ts/AGENTS.md`, and TypeScript/CLI skills apply.

### Existing implementation anchors

- `ts/packages/incubating/infra/gitplane/src/core/gather-source-facts.ts`
  - Defines `ReconciliationMode = "normal" | "full"`, `HistoryRelationship`, `GatheredCursorFacts`, and cursor/history-oriented facts.
  - Currently reads a complete target corpus and, when a cursor exists, a complete cursor corpus plus ancestry. Replace this module's contract rather than layering snapshot reconciliation beside it.
- `ts/packages/incubating/infra/gitplane/src/core/gateways.ts`
  - `ArtifactGateway` currently exposes `readCommitFacts`, `isAncestor`, and `diffCommits` in addition to target-tree methods.
  - `CursorRecord` contains only `{ sourceId, commit }`; `compareAndSetCursor` compares commits.
  - Store reads are individually exposed through `readCursor`, `readLineage`, `readCurrentArtifact`, and `listCurrentArtifacts`; no persisted-attempt interface exists.
  - `EventRecord` has no generation/attempt field.
- `ts/packages/incubating/infra/gitplane/src/core/identity.ts`
  - `deriveEventId` hashes source, artifact, reconciled commit, and event type, so repeated visits collapse.
  - No `gpa_` attempt identity implementation exists.
  - `ARTIFACT_EVENT_TYPES` currently omits `artifact.repaired` even though the draft spec describes it.
- `ts/packages/incubating/infra/gitplane/src/cli/real-artifact-gateway.ts`
  - Already supports resolving a commit and reading its complete tree/candidates.
  - Also contains ancestry, diff, and shallow-history classification that become dead under the new contract.
- `ts/packages/incubating/infra/gitplane/src/testing/artifact-gateway.ts` and `test/gather-source-facts.test.ts`
  - Fake and tests currently model ancestry/diff/cursor facts and must be replaced with target-snapshot behavior.
- `ts/packages/incubating/infra/gitplane/src/cli/commands/reconcile/command.ts`
  - Is still an unavailable stub and exposes `--full`/`-f`.
- `ts/packages/incubating/infra/gitplane/src/cli/context.ts` and `bootstrap.ts`
  - Do not yet supply the reconciliation-capable source/store dependencies to the command.
- `ts/packages/incubating/infra/gitplane/src/testing/materialization-store.ts` and `materialization-store-conformance.ts`
  - Implement and prove commit-based cursor CAS and commit-keyed event idempotency; no attempts exist.
- `ts/packages/incubating/infra/gitplane-sqlite/src/schema.ts`
  - Existing v1 cursor table stores only `source_id` and `commit_id`; events have no reconciliation generation; there is no attempt/frozen-plan table.
- `ts/packages/incubating/infra/gitplane-sqlite/src/store.ts`
  - Implements commit CAS and existing event matching; it needs generation and attempt protocol support.
- `ts/packages/incubating/infra/gitplane-sqlite/src/initialize.ts`
  - Inspects before creating missing compatible tables and refuses incompatible objects. Preserve fail-closed behavior; no migration or rewrite is wanted.
- `ts/packages/incubating/infra/gitplane/src/core/index.ts`
  - Publicly exports Gather/history types that must be replaced with the new snapshot/reconciliation types.

### Existing invariants to retain

- Revision identity remains deterministic from source ID, artifact ID, repository-relative path, and content digest.
- Complete target topology/corpus and the complete semantic plan are validated before the first materialization write.
- Nested markers, special entries, duplicate IDs, same-path ID replacement, immutable classification lineage, and registered schema transitions remain structural failures.
- Generic artifacts remain control-plane records and lifecycle participants; only classified artifacts project to target tables.
- A persisted complete frozen plan is retry authority; retry never rereads source artifacts or reinterprets changed kind registration.
- Writes remain non-transactional and apply in deterministic artifact-ID order. Cursor advancement remains last and marks completed materialization.
- One unresolved attempt per source; matching work replays it, conflicting work cannot replace it, and post-CAS residue is cleanup-only.
- Revision/event writes remain conflict-detecting and idempotent. Operational versus structural failure treatment and sanitized reconciliation-error persistence remain.
- Concurrent writer serialization must come from atomic single-attempt persistence plus generation CAS; do not add source leases in this slice.

## Contract and documentation changes

Make the contract amendment first so later implementation is reviewed against the correct model.

### Canonical product docs

Update:

- `.ns/objectives/gitplane/references/README-draft.md`
- `.ns/objectives/gitplane/references/SPEC-draft.md`

Required normative changes:

1. Replace incremental cursor/target tree discovery with complete target-commit corpus discovery for both normal and repair modes.
2. Specify the target commit tree as immutable desired state and completed Gitplane control state as prior state.
3. Remove fast-forward/descent, non-forward rejection, merge rejection, cursor-tree availability, shallow-history retry, and ancestry/diff requirements.
4. Specify that initial ordinary reconciliation is valid and creates all target artifacts.
5. Specify ordinary lifecycle derivation:
   - unseen + present → `artifact.created`;
   - tombstoned + present → `artifact.restored`;
   - live + changed revision/path → `artifact.revised`;
   - live + identical revision/path → no event;
   - live + absent → `artifact.deleted`.
6. Rename `--full` to `--repair`; use `--repair` for deliberate complete reapplication and lineage-free `artifact.repaired` events. Do not retain `--full` compatibility because the product is unreleased.
7. Remove the event-reconstruction status model if it only exists to distinguish history reconstruction. Report mode and bounded counts directly instead of retaining obsolete `not-requested`/`performed` terminology.
8. Define cursor generation, generation CAS, generation-aware attempt identity, and event identity that is stable across retry but distinct across later visits to the same target.
9. State when control state is a valid planning authority: only a completed snapshot with no unresolved attempt; pending attempts must be replayed, rejected as conflicting, or cleaned up before new planning.
10. Keep repair semantics explicit: reapply all live target artifacts plus required removals of stored-live artifacts absent from target; already-absent tombstones need no synthetic repair work.
11. Remove merge/nonlinear history from V1 exclusions; a merge commit tree is simply a valid immutable snapshot.
12. Keep working-tree reconciliation, incremental snapshot optimization, source leases, and operator target-row drift detection out of scope.

Replace the history-heavy proof matrix with snapshot, generation, and retry proofs. Stable scenarios should include:

- initial normal snapshot materialization;
- later forward, older, divergent, and merge target snapshots, all using identical planning rules;
- target commit/object unavailable before writes;
- equal completed snapshot no-op/cleanup-only behavior;
- create/restore/revise/move/unchanged/delete and lineage legality;
- repair of matching, changed, and removal states;
- repeated `A → B → A → B` with distinct generations/events;
- stale expected generation rejected even when the current commit string matches (explicit ABA proof);
- matching attempt replay, conflicting attempt refusal, post-CAS cleanup;
- failure injection around every write boundary and convergence to uninterrupted state.

### Objective records

Update:

- `.ns/objectives/gitplane/objective.md` if its thesis/scope still names cursor-diff/linear history;
- `.ns/objectives/gitplane/roadmap.md` reconciliation row;
- `.ns/objectives/gitplane-reconciliation-stack-rebuild/objective.md`;
- `.ns/objectives/gitplane-reconciliation-stack-rebuild/roadmap.md`.

Record this as a deliberate superseding contract decision, not an unexplained deletion. Remove completion guards requiring `diffCommits`, old/new boundary discovery, full-vs-incremental source modes, descent classification, and `--full`. Replace them with complete snapshot facts, completed-store snapshot facts, generation protocol, and the revised proof ownership. Retain the stack's additive review boundaries, reshaped to: contract amendment; snapshot facts/planner; durable protocol; retry-safe engine/CLI; closure/accounting.

## Implementation design and steps

### 1. Simplify the source Gateway and Gather facts

In `src/core/gateways.ts`, `src/core/gather-source-facts.ts`, the real adapter, fake adapter, exports, and tests:

- Retain only source operations needed to resolve the requested commit and inventory/read its complete target tree.
- Remove `CommitDiff`, `CommitFacts` if no other command needs them, `readCommitFacts`, `isAncestor`, `diffCommits`, `HistoryRelationship`, `GatheredCursorFacts`, and history-specific fake fixture state.
- Remove the shallow-repository completeness probe and `incomplete-history` classification once no operation can produce it. Target commit/object absence remains a typed target-unavailable/missing-object result; operational Git failures remain Gateway errors.
- Replace `ReconciliationMode = "normal" | "full"` with `"normal" | "repair"`, or an equivalent discriminated options type.
- Make Gather return immutable target snapshot facts: source/config identity, resolved target commit, raw complete target topology/candidates, registrations needed for deterministic planning, and mode. It must not read the cursor tree, ancestry, diffs, or operator target rows.
- Preserve nesting-first/raw-topology behavior so planner validation remains canonical and malformed topology cannot be hidden by Gather.
- Make merge commits valid by construction: no parent-count policy remains.

Do not add an optional Git-diff path. Full scan is the single implementation and semantic baseline.

### 2. Add an atomic completed-materialization snapshot interface

Deepen `MaterializationStoreGateway` rather than making the engine coordinate many unrelated planning reads. Introduce a read model such as `MaterializationSnapshot` containing, for one source:

- cursor `{ sourceId, commit, generation } | null`;
- all current artifact records, including tombstones;
- all required lineage records;
- pending reconciliation attempt metadata/frozen plan, if any.

Expose one store operation that returns this coherent snapshot. The SQLite adapter should read it in one read transaction/snapshot; the in-memory fake should return one deep immutable copy. Keep narrower existing reads only where another public operation genuinely needs them; avoid a broad breaking removal unrelated to reconciliation.

A new plan may only be derived from a snapshot with no unresolved attempt. The engine must first:

- replay a matching unresolved attempt from its persisted frozen plan;
- reject a conflicting unresolved attempt before writes;
- clean post-CAS residue without replaying materialization/events.

Atomic insertion of the one pending attempt per source must be the serialization point before materialization. A losing concurrent invocation fails structurally before artifact writes.

### 3. Define generation-aware identities and records

In `identity.ts`, `gateways.ts`, store adapters, and literal-vector tests:

- Extend `CursorRecord` with non-negative/positive monotonic `generation` (choose one consistent initial convention; recommended: absent is conceptual generation 0, first completed materialization writes generation 1).
- Change cursor CAS input to expected generation/cursor state and explicit next `{ commit, generation }`. Mismatch output must return actual cursor facts, not only a commit string.
- Derive deterministic `gpa_` attempt ID from length-framed source ID, expected cursor generation/initial sentinel, target commit, and mode. Add a literal identity vector.
- The frozen plan owns expected and next generations. A transition to a different target commit advances generation even when artifact content happens to be identical. A repair that performs a completion also advances generation. A pure equal-state no-op/cleanup invocation does not fabricate a generation.
- Extend `EventRecord` with reconciliation generation or attempt identity. Derive `gpe_` from source, artifact, reconciliation generation/attempt, target commit, and event type. Retry of one frozen attempt must reproduce the same ID; a later visit to the same target/type must produce a new ID.
- Add `artifact.repaired` to the closed event-type union and all validators/storage matchers.

Be precise about ABA: conformance must prove that a stale writer expecting an earlier generation is rejected after `A → B → A → B`, even though the current commit equals its original expected commit.

### 4. Implement the pure snapshot planner

Create the internal planner module (retain the planned name `deriveReconciliationPlan(facts)` unless implementation evidence reveals a clearer private name). It takes only immutable target snapshot + completed materialization snapshot + kind configuration and returns a complete frozen semantic apply plan or a structural result. No Gateway calls.

Planner responsibilities:

- validate raw target topology and complete corpus before plan production;
- parse envelopes, enforce duplicate-ID and same-path replacement rules;
- calculate content digests and path-inclusive revisions;
- compare every target ID with stored current/lineage state using the lifecycle table above;
- identify stored-live IDs absent from target for deletion;
- preserve tombstone lineage and enforce classification/schema transition legality;
- build classified projections and explicit clear fields;
- choose normal lifecycle events or repair events;
- sort all artifact work canonically by artifact ID;
- include all prior/current values, revision facts, projections, event records, target identity, mode, expected/next generation, and completion metadata needed for replay without source/config rereads.

Normal identical live artifacts produce no artifact work/event. Repair deliberately plans reapplication without reading operator-owned target rows. Store control records are trusted only because the engine supplied a completed snapshot.

Use table-driven pure tests for every lifecycle and legality row, input-order independence, deterministic frozen-plan equality, at-most-one artifact outcome, complete deletion detection, merge snapshot neutrality, normal vs repair behavior, and repeated-target generation-dependent event identity.

### 5. Implement durable attempts and fresh SQLite v1 shape

Extend `MaterializationStoreGateway`, the in-memory fake, SQLite adapter, and shared conformance suite with:

- lookup/read as part of the materialization snapshot;
- atomic insert-if-absent for one complete frozen attempt per source;
- exact-match reuse versus conflict detection;
- deletion/cleanup of completed attempt residue;
- generation cursor CAS;
- idempotent generation-aware event insertion.

Define an adapter-neutral persisted frozen-plan representation with runtime validation at the SQLite JSON boundary. Persist the complete semantic plan, not mutable progress markers or adapter SQL.

Update `gitplane-sqlite/src/schema.ts` directly as the supported v1 schema:

- add cursor generation;
- add event reconciliation generation/attempt identity as required by `EventRecord` matching;
- add the attempt table and source-scoped uniqueness;
- add any deterministic-plan JSON/identity fields needed for conflict detection and replay.

Keep `SQLITE_SCHEMA_VERSION = 1` as the initial unreleased contract unless the implementation's existing schema machinery requires a version bump for internal consistency; in either case, provide no migration. Schema inspection must reject old cursor/event shapes as incompatible and diagnostics/docs must tell operators to recreate pre-release stores. Initialization must never mutate, drop, or rewrite incompatible control tables.

Conformance must run identically against fake and SQLite and cover exact identity conflicts, one-pending-attempt atomicity, generation CAS/ABA, event sequencing/idempotency, snapshot immutability, and cleanup.

### 6. Implement retry-safe Apply and top-level reconciliation

Create the internal apply module and public `reconcile(context, options)` composition.

Preserve deterministic effect order:

1. Gather target snapshot and a completed store snapshot.
2. Purely derive the complete plan.
3. Atomically persist/reuse the attempt and frozen plan before materialization.
4. For each artifact by canonical ID: revision → lineage → current state → classified target operation → event.
5. CAS cursor generation/commit only after every artifact effect succeeds.
6. Resolve applicable reconciliation errors.
7. Delete completed attempt residue.

Handle retries and residue exactly:

- pre-write structural failures create no durable reconciliation error;
- operational failure after write phase begins records a sanitized error best-effort without replacing the primary failure;
- matching retry replays the frozen plan verbatim and converges idempotently;
- CAS semantic mismatch is structural and distinct from backend failure;
- after successful CAS, cleanup failure reports completed materialization and leaves recognizable residue;
- later cleanup-only invocation never replays artifact writes/events.

Build a fault-injection harness over shared fake state and fail before/after every store write boundary. Compare final cursor generation, control rows, revisions, target values, event IDs/sequences, and attempt cleanup with an uninterrupted execution.

### 7. Expose the CLI contract

Replace the unavailable stub in `src/cli/commands/reconcile/command.ts` and wire dependencies through `context.ts`, `bootstrap.ts`, config/store factory, and test contexts.

Command surface:

```text
gitplane reconcile <commit>
gitplane reconcile <commit> --repair
gitplane reconcile <commit> -r
```

Do not retain `--full`/`-f`. Reconciliation is a normal mutation and should remain non-interactive; no confirmation is needed merely for an older/divergent/merge snapshot because those distinctions are not observed.

Design a bounded Clinkr result schema with at least:

- source ID and resolved target commit;
- mode (`normal` or `repair`);
- prior and resulting cursor `{ commit, generation }` where present;
- whether this invocation advanced the cursor;
- planned/applied lifecycle or repair counts by event type;
- cleanup-only/replayed-attempt indication where applicable;
- structured structural/operational failure data without backend details or artifact contents.

Do not emit ancestry fields. Follow Clinkr's `ok=0`, semantic negative=1, failure/usage=2 envelope conventions, stdout/stderr separation, `--json-schema`, and guaranteed single read-write store close. Preserve/extend CLI scenario coverage for `-h`, `--version`, `--runtime`, JSON envelope/schema, store close on all paths, and the new `--repair` spelling.

Add minimal real-Git + real-SQLite E2E composition for initial, update, rollback/divergent, merge snapshot, repair, repeated target, and unavailable target. Real Git integration should prove a depth-1 clone reconciles normally without fetching or probing shallow state.

### 8. Closure and stale-concept removal

At stack tip:

- account explicitly for differences from prototype commit `09d75c3ae`; cursor-diff, descent, merge rejection, initial-full, target-commit event collapse, and old repair naming are intentionally superseded;
- update the parent `gitplane` Objective's reconciliation evidence;
- close prototype PR #4076 unmerged only when the rebuilt stack meets the revised completion criteria;
- preserve PR #4128's historical rationale while removing its now-unused runtime paths.

## Files, symbols, tests, and docs

Likely existing files to edit or replace:

- `.ns/objectives/gitplane/references/{README-draft.md,SPEC-draft.md}`
- `.ns/objectives/gitplane/{objective.md,roadmap.md}`
- `.ns/objectives/gitplane-reconciliation-stack-rebuild/{objective.md,roadmap.md}`
- `ts/packages/incubating/infra/gitplane/src/core/{gateways.ts,gather-source-facts.ts,identity.ts,index.ts}`
- `ts/packages/incubating/infra/gitplane/src/cli/{context.ts,bootstrap.ts,real-artifact-gateway.ts}`
- `ts/packages/incubating/infra/gitplane/src/cli/commands/reconcile/{command.ts,metadata.ts}`
- `ts/packages/incubating/infra/gitplane/src/testing/{artifact-gateway.ts,materialization-store.ts,materialization-store-conformance.ts,index.ts}`
- `ts/packages/incubating/infra/gitplane/test/{gather-source-facts.test.ts,gateways/fakes.test.ts,unit/identity.test.ts,scenario/cli.test.ts}`
- `ts/packages/incubating/infra/gitplane/test/{sanity,integration}/real-artifact-gateway.test.ts`
- `ts/packages/incubating/infra/gitplane-sqlite/src/{schema.ts,initialize.ts,store.ts,index.ts}`
- `ts/packages/incubating/infra/gitplane-sqlite/test/integration/sqlite-store.test.ts`

Likely new internal modules/tests:

- reconciliation fact/snapshot types and pure planner;
- deterministic attempt/frozen-plan identities and runtime schema;
- apply engine and public `reconcile` composition;
- planner table/property tests;
- durable attempt conformance cases;
- shared-state fault-injection engine tests;
- CLI E2E composition tests.

Do not export the planner merely for testing; keep `reconcile(context, options)` as the package interface and use internal module tests.

## Execution strategy for broad refactoring

This change contains semantic docs plus same-shape TypeScript contract removals across more than five files. Use a mixed strategy consistent with `refactor-execution-strategy.md`:

1. Make the SPEC/Objective amendments through precise reviewed semantic edits; do not use blind prose replacement.
2. Change the central TypeScript contracts first (`gateways.ts`, identity/fact types), then use compiler errors and a deterministic symbol-aware/AST refactor where available to update importers and fixtures.
3. For the broad adapter/fake/test cleanup, use `refactor-swarm` if available, partitioned into non-overlapping source Gateway, store protocol, and documentation/test lanes. Do not use an opaque ad hoc `text.replace()` script.
4. Re-read each semantic test rather than mechanically renaming `full` to `repair`; the behavior changes.
5. Finish with bounded stale-concept searches, for example:

```bash
rg -n --glob '!*.map' --max-columns 300 --max-columns-preview \
  'cursor-diff|cursor-derived|diffCommits|isAncestor|HistoryRelationship|incomplete-history|non-forward|--full|full reconciliation|merge commit.*reject|event reconstruction' \
  .ns/objectives/gitplane .ns/objectives/gitplane-reconciliation-stack-rebuild \
  ts/packages/incubating/infra/gitplane ts/packages/incubating/infra/gitplane-sqlite |
head -n 200
```

Review each remaining occurrence as either intentional historical provenance or stale live contract.

## Validation guidance

Use fake-driven default tests for domain policy and store protocols; use integration only for real Git/SQLite boundaries. Do not use module mocking, shared process mutation, fake timers, or real adapters in shared-cache default tests.

During implementation, run focused package typechecks/tests as useful, then complete the repo-required lanes:

```bash
just ts-deps-check
just ts-format-check
just ts-lint
just ts-check
just ts-test
just ts-test-integration
just ts-test-isolated
just ts-test-sanity
just ts-test-typescript-style-guard
just
```

If formatting fails, use `just ts-format-fix`; for dprint failures use `just dprint-fix`; for autofixable lint use `just ts-lint-fix`, then rerun validation. The default `just` does not include integration, isolated, or the TypeScript style guard, so report those lanes separately.

Minimum semantic evidence before completion:

- pure planner lifecycle/lineage matrix and deterministic ordering;
- normal initial/rollback/divergent/merge snapshot convergence;
- no ancestry/diff/shallow probe invocation in source operation logs;
- depth-1 real clone success without fetch;
- generation CAS literal/conformance proof including ABA;
- deterministic attempt and event identity vectors;
- repeated same-target transitions produce distinct events across generations and stable events on retry;
- fake + SQLite attempt/store conformance;
- failure at every apply boundary converges on retry;
- incompatible old pre-release SQLite shape is refused without mutation;
- CLI schema/help/runtime/version and close-on-all-path tests.

## Risks, assumptions, and non-goals

- **Complete-scan cost:** accepted deliberately for v1 simplicity. Measure before adding target-tree OID caching or other snapshot-local optimization. Never restore history dependence as a correctness requirement.
- **Control-state trust:** only Gitplane-owned completed control state is authoritative. Operator target-table drift remains undetected unless `--repair` is deliberately invoked; no target-row reads are added.
- **Partial materialization:** store state is not planning authority while an attempt is unresolved. Attempt replay/conflict/cleanup must precede new planning.
- **Concurrency:** one pending attempt plus generation CAS protects the implemented workflow, including ABA. Source leases and broader distributed scheduling policy remain out of scope.
- **No migration:** old local pre-release stores may become incompatible. Fail closed with recreate guidance; never silently rewrite them.
- **Working tree:** `reconcile <commit>` does not include dirty or untracked files. A future explicit working-tree target would require a separate contract.
- **No ancestry diagnostics:** older/divergent/merge labels are not computed or shown. The operator selects desired state by commit; Gitplane converges to it.
- **Equal invocation:** a true normal no-op or post-CAS cleanup must not invent a new generation. A completed change to a distinct target commit, and a deliberate repair completion, does advance generation.
- **Schema convention:** absent cursor is conceptual generation 0; first completed materialization writes generation 1 unless implementation evidence requires another equally explicit convention.

No material product requirements remain open. Exact private module filenames, frozen-plan JSON field names, and SQL statement layout are implementation-owned so long as the interfaces and proof obligations above hold.

## Review and remediation

Review the work in these passes:

1. **Contract review:** ensure no history fact influences desired state or policy and normal/repair semantics are internally consistent across README, SPEC, proof matrix, and Objectives.
2. **Data-safety review:** inspect pending-attempt atomicity, completed-snapshot consistency, generation CAS, event identity, apply ordering, and cleanup residue. Explicitly simulate ABA and every interruption boundary.
3. **Module/interface review:** keep source Gather, pure Decide, and effectful Apply distinct; make the store snapshot/attempt interface deep enough that callers do not coordinate SQLite consistency themselves.
4. **CLI review:** apply the ns CLI checklist, verify bounded machine output and removal of `--full` without hidden aliases.
5. **Adapter review:** compare fake and SQLite behavior through shared conformance, then retain only narrow real Git/SQLite integration proofs.
6. **Stale-contract review:** run the final searches and classify every remaining cursor-diff, ancestry, shallow-history, non-forward, merge-rejection, and `--full` occurrence.
7. **Objective accounting:** ensure completion claims cite passing evidence and that historical decisions are superseded explicitly rather than erased without explanation.

If implementation evidence challenges a semantic requirement—especially generation advancement, attempt conflict precedence, or repair events—stop and amend the SPEC/Objective deliberately before coding a workaround. Do not let adapter convenience silently redefine the contract.