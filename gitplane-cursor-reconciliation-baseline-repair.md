# Gitplane v1 cursor-diff reconciliation implementation plan

## Summary

Implement the `gitplane` Objective roadmap row **“Cursor-diff reconciliation and `gitplane reconcile <commit>`”** in the existing incubating packages:

- `ts/packages/incubating/infra/gitplane` (`@nseng-ai/gitplane`)
- `ts/packages/incubating/infra/gitplane-sqlite` (`@nseng-ai/gitplane-sqlite`)

The slice must preserve the settled contracts in:

- `.ns/objectives/gitplane/references/README-draft.md`
- `.ns/objectives/gitplane/references/SPEC-draft.md`
- `.ns/objectives/gitplane/roadmap.md`

The implementation remains non-transactional and cursor-last. It first builds and validates a complete read-only transition plan from Git trees, persists a retry baseline, then applies deterministic idempotent writes. The cursor is the completed-materialization boundary. A durable plan baseline preserves cursor-derived transition facts across partial writes, especially restoration and schema-transition baselines that mutable current/lineage rows cannot safely retain after a failed attempt.

## Settled decisions from grilling

1. **Test seams**
   - Public core `reconcile(...)` over `ArtifactGateway` and `MaterializationStoreGateway` fakes owns the convergence matrix.
   - The Clinkr `gitplane reconcile <commit>` seam owns arguments, config, bounded machine output, store lifetime, and sanitized failures.
   - Shared store conformance plus focused SQLite integration owns persistence semantics that cannot be proven through the fake.
   - Do not export or primarily test private planner helpers.

2. **Plan before apply**
   - Resolve history, inspect all required source data, read required store facts, validate every candidate and lineage rule, and build every projection before the first write.
   - Planning failures produce zero writes and no durable reconciliation-error record.

3. **Deterministic apply order**
   - Sort transitions by canonical artifact ID.
   - After the retry baseline is durable, apply each artifact as: revision → lineage → current state → classified target upsert/tombstone → event, skipping inapplicable operations.
   - Advance the cursor by compare-and-set only after every artifact succeeds.
   - Resolve errors after cursor CAS, then compare-and-delete the baseline.
   - Put a concise invariant comment beside the apply loop explaining deterministic ordering, intentional partial visibility, cursor-last completion, event-last consistency, baseline-backed retry, and cleanup ordering.

4. **Durable retry baseline**
   - Persist one plan header and immutable per-artifact entries before materialization writes.
   - Header: source ID, expected cursor, target commit, mode, event-reconstruction status, deterministic plan digest.
   - Entry: artifact ID, transition kind, prior/current revision and path, prior/current classification and schema baseline, and target-mapping identity needed for deletion/repair.
   - Do not persist artifact bytes, projected values, or operation progress.
   - Rebuild the plan from Git on retry and verify its digest. Use baseline prior facts where partial current/lineage writes would otherwise obscure cursor-derived semantics.
   - While an unfinished baseline exists, a different target or incompatible rebuilt plan fails closed; v1 does not abandon or overwrite it automatically.
   - Baseline cleanup is compare-and-delete by source ID and plan digest.

5. **Operational error boundary**
   - Durable reconciliation errors are exclusively operational failures once reconciliation enters its write phase: baseline persistence, revision/lineage/current/target/event writes, cursor CAS operation failure, post-CAS error resolution, or baseline deletion.
   - Do not persist usage/configuration errors, commit resolution or merge rejection, ancestry/divergence rejection, source/history reads, invalid corpus, duplicate IDs, illegal lineage/classification/schema transitions, same-path ID replacement, store-open failure, other pre-write planning failures, store close failure, or programmer/local-development errors.
   - CAS mismatch is a concurrency/precondition result, not an operational backend error category; return it structurally and do not mislabel it.
   - Error persistence is best effort and never replaces the original failure.

6. **Full repair semantics**
   - Initial reconciliation requires `--full`.
   - `--full` may intentionally target a descendant, equal, older, or divergent non-merge commit.
   - Reconstruct events only when the previous cursor is a strict ancestor of the target. For equal, older, divergent, or unavailable prior cursors, emit no events and report reconstruction skipped or not applicable as defined below.
   - Same-cursor `--full` performs complete repair, emits no events, and uses same-value cursor CAS as its final concurrency check.
   - Full repair scans every target artifact, repairs all live control/target rows, tombstones stored live IDs absent at target, preserves existing tombstones and immutable history, and is neither history import nor garbage collection.

7. **Normal equal-cursor behavior**
   - Normal equal-cursor reconciliation does not replay materialization.
   - It retries target-error resolution and baseline compare-and-delete cleanup when needed, then reports already current.
   - If cleanup after CAS fails, return an operational failure that accurately reports `cursorAdvanced: true`; a later equal-cursor invocation completes cleanup only.

8. **Classified deletion/repair mapping**
   - Every classified tombstone needs the exact old `(gpApiVersion, gpKind)` registration so the target mapping is known.
   - Missing registration is a pre-write planning failure for incremental deletion and full absent-ID repair.
   - Do not widen v1 by persisting arbitrary historical mappings outside the accepted plan baseline.

9. **Target-wide uniqueness without full snapshots**
   - Add a domain-shaped `ArtifactGateway` capability that inventories target-commit attempted boundaries and reads marker bytes only.
   - Use it for nesting-first topology and source-wide target ID uniqueness, including collisions between changed and unchanged artifacts.
   - Continue reading complete recursive snapshots only for changed candidates in incremental mode; full mode already reads all complete candidates.

10. **Bounded public result**
    - Reconcile data includes `sourceId`, resolved `targetCommit`, `previousCursor`, `mode`, domain `status`, transition counts, `eventReconstruction`, `cursorAdvanced`, and per-invocation `errorsResolved`.
    - Exact values:
      - `mode`: `incremental | full`
      - domain `status`: `reconciled | already-current` (distinct from the Clinkr envelope status)
      - transition counts: `created`, `restored`, `revised`, `moved`, `unchanged`, `deleted`
      - `eventReconstruction`: `complete` when a strict forward cursor transition was reconstructed, `skipped` when full repair cannot safely reconstruct events, `not-applicable` for initial sync or equal-cursor work with no transition
    - Do not return full plans, artifact bytes, projection values, or unbounded event lists.
    - `errorsResolved` is the count newly resolved by that invocation. Make the store operation return this count.

## Existing implementation anchors

### Core and gateways

- `ts/packages/incubating/infra/gitplane/src/core/gateways.ts`
  - Existing history operations: commit resolution/facts, ancestry, commit inventories/candidates, diffs.
  - Existing store operations: cursor CAS, lineage/current state, revisions/events, target writes, reconciliation errors, doctor, close.
- `src/core/domain.ts`
  - `ArtifactCorpusEntry`, kind/schema registrations, mappings, config, and access-aware store factory.
- `src/core/check/check-artifact-corpus.ts`
  - Reuse marker parsing, classified registration validation, duplicate detection, and digest-bearing snapshots; extract private reusable logic only when needed without widening public API gratuitously.
- `src/core/check/inspect-corpus-topology.ts`
  - Reuse the nesting-first boundary rules for commit marker inventory.
- `src/core/artifact.ts`
  - Existing generic/classified transition validation; reconciliation must add directed schema-edge and established-lineage checks.
- `src/core/identity.ts`
  - Existing deterministic revision and event IDs.
- `src/core/projection/index.ts`
  - Existing deterministic RFC 6901 projection plan.

### CLI and adapters

- `src/cli/commands/reconcile/command.ts` is currently an unavailable scaffold.
- `src/cli/commands/check/command.ts` and `doctor/command.ts` establish Clinkr failure/result and store-lifecycle patterns.
- `src/cli/real-artifact-gateway.ts` already implements Git commit tree inventory, complete candidate reads, ancestry, and diffs.
- `src/testing/artifact-gateway.ts` and `src/testing/materialization-store.ts` are constructor-state fakes; the store currently clones state and must gain shared backing state.
- `src/testing/materialization-store-conformance.ts` is the common fake/SQLite contract.
- `gitplane-sqlite/src/schema.ts`, `initialize.ts`, and `store.ts` own explicit schema initialization and operation-level persistence. Reconcile/store opening must never initialize or migrate schema implicitly.

## Stage 1 — Contract and persistence foundations

### 1. Clarify the canonical README and spec

Make narrow edits before implementation so tests derive from a coherent contract:

- document the deterministic per-artifact apply order and cursor completion boundary;
- document the durable plan baseline and competing-target fail-closed behavior;
- limit durable reconciliation-error records to operational write/CAS/cleanup failures;
- clarify normal equal-cursor cleanup retry;
- permit `--full` at equal, older, or divergent targets;
- allow event reconstruction only for strict forward ancestry;
- state same-cursor full-repair behavior;
- state missing classified target registration fails deletion/repair before writes;
- state target-wide marker inventory validates uniqueness without full-reading unchanged artifacts;
- define the bounded result fields and enum values above.

Keep implementation rationale in code comments; canonical docs should state behavior and guarantees.

### 2. Extend gateway/store contracts

In `src/core/gateways.ts` and exports:

- add a target-commit marker/boundary inventory result carrying paths, marker entry kind/bytes as needed, without complete artifact contents;
- add plan-baseline records and operations:
  - read baseline by source;
  - insert-or-verify identical baseline;
  - compare-and-delete baseline by source and digest;
- change reconciliation-error resolution to return a count-bearing result;
- retain operation-level backend-neutral shapes and expected-failure result unions.

Choose exact TypeScript names during implementation, but keep them semantic and store-neutral.

### 3. Extend fake and SQLite persistence first

Test-first at the shared store seam:

- refactor the in-memory store into a shared mutable backing-state object plus per-invocation fault policy;
- retain immutable copied inputs/outputs and expose narrow operation logs only for invisible order assertions;
- add baseline state and operations;
- add count-returning idempotent error resolution;
- prove same-value cursor CAS and compare-and-delete semantics;
- extend `materialization-store-conformance.ts`, then satisfy it in both fake and SQLite;
- add explicit SQLite control table(s) for baseline header/entries through `CONTROL_SCHEMA` and `initializeSqliteStore`; preserve explicit idempotent initialization and strict doctor compatibility;
- do not add DDL to store open, doctor, or reconcile.

The plan digest must be deterministic over a canonical encoding, not host object iteration order. Add literal-vector or independently constructed expected-value tests rather than tautologically recomputing it with production logic.

## Stage 2 — Incremental public core reconciliation

Implement a public core operation (for example `reconcile(...)`) exported from the package root, with private read/plan/apply modules under a reconciliation folder.

### Read and plan phase

For normal reconciliation:

1. Resolve target and reject merge commits.
2. Read the cursor. Require `--full` when absent.
3. For normal mode, require cursor ancestry; equal cursor routes to cleanup-only behavior.
4. Diff cursor→target and derive old/new candidate boundaries by walking changed paths against both commit trees.
5. Inventory all target markers to enforce nesting-first validity and target-wide ID uniqueness, including unchanged artifacts.
6. Read complete old/new snapshots only for transition candidates.
7. Read all required current/lineage/baseline store facts before any write.
8. Derive prior facts primarily from the cursor Git tree. For restoration absent from the cursor tree, use the prior tombstoned materialization/baseline. Never let partial current or lineage writes redefine cursor-derived facts.
9. Validate, before writes:
   - complete candidate validity and duplicate IDs;
   - same-path ID replacement prohibition;
   - generic→classified only, never classified→generic;
   - immutable established API/kind;
   - same-version or one registered directed schema edge, including restoration from the last tombstoned schema;
   - exact old registration availability for classified deletion;
   - deterministic projection construction;
   - existing baseline compatibility and plan digest.
10. Produce transitions sorted by artifact ID and counts for all transition kinds.

Event precedence remains created → restored → revised → moved → none → deleted, with revision winning over simultaneous move and at most one event per artifact.

### Apply phase

- Insert or verify the durable baseline first.
- Apply transitions in artifact-ID order and the accepted per-artifact operation order.
- On the first operational failure, stop; leave cursor unchanged; best-effort record a sanitized operational reconciliation error keyed to target/subject/operation.
- Use deterministic revision/event IDs and idempotent store operations so retry over shared partial state converges.
- CAS cursor from exact expected prior commit to target last.
- Treat CAS mismatch structurally and leave the baseline for retry/diagnosis; do not label it backend operational failure.
- Resolve target errors and compare-and-delete baseline after CAS.

### Incremental core scenario matrix

Drive these through public core `reconcile(...)` over fakes, one red→green vertical case at a time:

- create generic and classified artifacts;
- pure revision, pure outer move, simultaneous revise+move;
- delete and restore generic/classified artifacts;
- generic→classified creates first target row and emits revised;
- allowed direct schema transition and rejected downgrade/skipped/unregistered transition;
- classified→generic and API/kind mutation rejection;
- same-path ID replacement rejection;
- duplicate ID against an unchanged target artifact;
- changes outside artifact boundaries produce no transition;
- deterministic artifact/event sequence ordering;
- invalid candidate or missing deletion mapping yields zero writes;
- all planning reads precede the baseline/first write;
- failure at each write boundary, including restoration and generic→classified, followed by a new fault-free store instance over shared backing state;
- repeated retry reuses revision/event identity and event sequence;
- cursor CAS mismatch and backend failure behavior;
- post-CAS error-resolution and baseline-delete cleanup failures, then equal-cursor cleanup-only recovery;
- no durable errors for planning/local-development failures; best-effort durable errors only for operational phase failures.

## Stage 3 — Full repair, CLI, and real-boundary proof

### Full repair core behavior

Add full-mode cases through the same public core seam:

- initial sync with no prior cursor (`eventReconstruction: not-applicable`);
- strict descendant full repair with inferable events (`complete`);
- equal-cursor full repair with no events and same-value CAS (`not-applicable`);
- older and divergent full repair with no synthetic events (`skipped`);
- unavailable prior cursor history with no synthetic events (`skipped`);
- full upsert of every live artifact and revision;
- full classified target-row repair;
- tombstoning stored live IDs absent at target while preserving last revision/path/domain values;
- preserving existing tombstones and immutable revisions/events;
- missing historical classified registration fails before writes;
- partial full-repair failure and convergence on retry;
- competing target while a baseline exists fails closed;
- full repair never deletes immutable history and never behaves as history import or garbage collection.

### CLI implementation

Replace `src/cli/commands/reconcile/command.ts` scaffold:

- positional commit, `--full`/`-f`, and `--config`/`-c`;
- load config and require a configured store;
- request exactly one read-write store with absolute config directory context;
- call public core reconcile;
- always attempt close and report close failure without persisting it as reconciliation error;
- emit a strict bounded result schema matching the settled fields;
- map expected planning/precondition failures, operational failures, CAS mismatch, and cleanup-after-CAS failure to sanitized structured Clinkr failure data with phase/operation/subject where safe;
- keep stdout as result, human diagnostics/status on stderr via Clinkr conventions;
- preserve coarse exits and publish the true schema through `--json-schema`.

Extend `test/scenario/cli.test.ts` for:

- help/metadata and `--full`/`--config` parsing;
- successful incremental/full/already-current data;
- config/store capability failures;
- planning failure without partial success data;
- operational and post-CAS cleanup failures with accurate `cursorAdvanced` evidence;
- one store open/close lifetime and no implicit initialization;
- bounded JSON output and stable human rendering.

### Real Git and SQLite proof

- Extend `RealArtifactGateway` and its integration tests for marker-only target inventory, old/new boundary derivation support, root/path confinement, marker entry kinds, and commits with unchanged-ID collision scenarios.
- Keep real Git out of default fake-driven scenario tests.
- Extend SQLite integration only for new baseline schema/operations, error-resolution counts, shared conformance, and one focused end-to-end reconciliation persistence smoke if needed to prove SQL composition.
- Do not duplicate the complete convergence matrix against SQLite.

## Documentation and code-comment requirements

Beside the core apply loop, add one focused invariant comment explaining:

- the plan is complete and validated before writes;
- baseline persistence freezes prior transition facts across partial attempts;
- artifact-ID order stabilizes event sequence and retry behavior;
- revision → lineage → current → target → event prevents events from preceding observable state;
- partial current/target state is intentionally visible but cannot redefine retry planning;
- cursor CAS is the completed-materialization boundary and happens last;
- error resolution and baseline deletion are post-CAS cleanup, recoverable by equal-cursor retry.

Add a second short comment at baseline verification only if needed to explain why a competing target or digest mismatch fails closed. Avoid scattering redundant narration across every gateway call.

## Validation

Run focused gates during red→green work:

```bash
pnpm --dir ts --filter @nseng-ai/gitplane run check
pnpm --dir ts --filter @nseng-ai/gitplane run test
pnpm --dir ts --filter @nseng-ai/gitplane-sqlite run check
pnpm --dir ts exec vitest run --config vitest.config.ts packages/incubating/infra/gitplane-sqlite/test/integration/sqlite-store.test.ts
```

Then run repository-required lanes:

```bash
just ts-deps-check
just ts-format-check
just ts-lint
just ts-check
just ts-test
just ts-test-integration
just ts-test-isolated
just ts-test-typescript-style-guard
just
```

If formatting fails, use `just ts-format-fix`; if dprint fails, use `just dprint-fix`; use `just ts-lint-fix` for autofixable lint failures, then rerun affected gates.

## Objective tracking and completion evidence

After implementation and validation, update only `.ns/objectives/gitplane/` through the `objective-update` workflow:

- mark the cursor-diff reconciliation roadmap row complete only when the public core, CLI, fake, SQLite seams, and convergence matrix pass;
- add an immutable Semantic Update summarizing the cursor-last/baseline design, full-repair behavior, focused test counts, and validation evidence;
- preserve README/SPEC drafts as canonical until their later promotion roadmap row;
- do not advance the reference-consumer, GitHub Action, or documentation-promotion rows in this slice.

Completion evidence must include passing fake-driven scenarios for recursive artifacts, moves, revisions, deletes, duplicate IDs, restoration, generic classification, schema transitions, partial-write retries, cursor CAS failure/mismatch, repeated attempts, older/divergent and same-cursor full repair, cleanup-only recovery, competing-target refusal, and full repair; focused package checks; SQLite conformance/integration; TypeScript style guard; and final `just`.