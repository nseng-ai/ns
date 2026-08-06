# Split Gitplane Snapshot Reconciliation into an Independently Reviewable Replacement Stack

## Goal and outcome

Replace the single published PR [#4130](https://github.com/nseng-ai/ns/pull/4130), **“Rebuild Gitplane reconciliation around generation-aware snapshots,”** with a small Graphite stack whose parent-relative diffs separate architectural change from feature implementation.

The resulting review sequence must let a reviewer answer these questions independently:

1. **Architecture:** Are complete target snapshots, coherent materialization snapshots, and generation-aware identities the right replacement for ancestry/diff-driven reconciliation?
2. **Policy:** Does the pure planner correctly derive lifecycle work from those facts?
3. **Durability:** Does the frozen-attempt/generation protocol converge safely across partial writes and retries?
4. **Product behavior:** Does `gitplane reconcile <commit> [--repair|-r]` expose the intended feature and bounded output?
5. **Accounting:** Does the final implementation intentionally preserve, supersede, or delete every behavior from the old prototype?

Do not land the obsolete cursor-diff implementation as an intermediate dependency. Preserve it only as immutable comparison evidence. After the replacement stack is published and verified, close PR #4130 unmerged. This plan does not authorize implementing, publishing, or closing anything in the planning session itself.

## Context and discovered facts

### Current repository state at planning time

- Current branch: `generation-aware-snapshot-reconciliation`
- Current implementation commit: `48a07b6bb2cd652f795f7d1bad5616acb016977d`
- Published PR: #4130
- Current remote parent commit used for the PR diff: `62f4acd26bfab03d85b979380e1367b6db4fa288` on `origin/shallow-ancestry-incomplete-history-classification`
- Graphite reported the current branch as needing restack because the local parent had moved. Treat all branch OIDs and topology as volatile and revalidate them before mutation.
- PR #4130 currently reports 33 files, +3,435/−1,088:
  - production: +1,773/−322
  - tests: +1,522/−605
  - Objective/docs: +140/−161
- The unmerged old implementation is anchored by prototype commit `09d75c3ae`, **“Implement cursor-diff reconciliation,”** on the `gitplane-cursor-reconciliation-baseline-repair` line. It is approximately +3,011/−119 and must remain historical/reference material, not a landing dependency.
- PR #4128 and its Objective history preserve the conservative shallow-history rationale. That rationale is historical evidence, not a requirement to retain ancestry or shallow-history runtime behavior.

Revalidate at implementation start:

```bash
git status --short --branch
gt branch info --no-interactive
gt parent --no-interactive
gt children --no-interactive
gh pr view 4130 --json number,state,headRefName,baseRefName,headRefOid,baseRefOid,url
git show --stat --oneline 09d75c3ae
git show --stat --oneline 48a07b6bb
```

### Why the current PR grew

The current branch does two jobs:

- it implements the previously planned reconciliation feature (planner, application engine, durable attempt protocol, CLI, SQLite behavior, and proof suites); and
- it changes the architecture from cursor diffs/ancestry/initial `--full` to level-triggered complete snapshots, generation-aware cursors, replayable frozen attempts, and `--repair`.

The old runtime source capabilities are already largely deleted from the current implementation: there are no remaining production ancestry, commit-diff, shallow-probe, or cursor-tree-read gateway methods. The isolation problem is therefore primarily **review shape**, not a large body of surviving dead runtime code.

### Governing contracts

Read these before changing the stack:

- `AGENTS.md`
- active orientations from `ns objective exec load-orientations --format md`
- `ts/AGENTS.md`
- `.ns/objectives/gitplane/objective.md`
- `.ns/objectives/gitplane/roadmap.md`
- `.ns/objectives/gitplane-reconciliation-stack-rebuild/objective.md`
- `.ns/objectives/gitplane-reconciliation-stack-rebuild/roadmap.md`
- `.ns/objectives/gitplane/references/README-draft.md`
- `.ns/objectives/gitplane/references/SPEC-draft.md`
- `docs/conventions/consumer-gateways-and-command-shape.md`
- `.agents/skills/code-graphite/SKILL.md`
- `.agents/skills/ns-typescript/SKILL.md`
- `.agents/skills/typescript-style/SKILL.md`
- the CLI design skill required by `ts/AGENTS.md` before editing/reviewing the command surface

The Objective requires prompts produced for Gitplane work to begin with `/ns:plan:grill-and-save`; honor that if further implementation plans are generated from this plan.

## Resolved requirements

- Use an **analysis-only comparison baseline**, not a mergeable old-feature PR.
- Define the isolated rearchitecture narrowly as **contract and seam replacement**:
  - remove ancestry/diff/incomplete-history planning inputs;
  - introduce complete target snapshot facts;
  - introduce coherent materialization snapshot facts and generation-aware protocol types/identities;
  - do not activate the reconcile command in that first PR.
- Keep the pure planner in a later feature PR rather than folding it into the architecture review.
- Add a concise checked-in architecture accounting document under the reconciliation Objective, anchored to immutable old/new commits and exact symbols.
- Create a **replacement stack** with fresh PR identities. Do not reshape PR #4130 in place.
- Close PR #4130 only after the replacement stack is submitted, remote diffs are verified, and no unique behavior or rationale has been lost.

## Target replacement stack

Use the fewest coherent review units that preserve the decisions above. The recommended stack is five PRs.

### PR 1 — Replace reconciliation contracts and source/store seams

**Review question:** Is the new fact model and seam placement correct without considering planner or CLI behavior?

Responsibilities:

- Amend canonical README/SPEC and Objective language from ancestry/diff/initial-`--full` to complete-snapshot/generation-aware semantics.
- Remove obsolete `ArtifactGateway` capabilities and types:
  - commit facts used for ancestry classification;
  - ancestor checks;
  - commit diffs;
  - incomplete-history result variants;
  - cursor-tree reads, if any reappear while rebuilding from the parent.
- Retain the live commit-facing capabilities required to read one immutable target snapshot:
  - `resolveCommit`;
  - `inventoryCommitTree`;
  - `readCommitTreeCandidate`.
- Retain working-tree and create capabilities used by `gitplane check` and `gitplane artifact create`.
- Refactor `gatherSourceFacts` to gather only the complete target commit topology/corpus plus kind registrations and reconciliation mode.
- Introduce the coherent materialization snapshot and generation-aware cursor/attempt/event **types and gateway contract** needed by later PRs. Add the minimum fake/SQLite adapter support required for this PR to typecheck and for focused contract tests to pass; do not add the planner, apply engine, or command activation.
- Update generation-/attempt-aware identity functions and literal identity tests where those functions are part of the new contract.
- Preserve immutable-read and missing-object semantics. A missing target object remains structurally unavailable; ordinary operational Git failures remain sanitized gateway failures.

Primary files/symbols:

- `ts/packages/incubating/infra/gitplane/src/core/gateways.ts`
  - `ArtifactGateway`
  - `CursorRecord`
  - `ReconciliationAttemptRecord`
  - `MaterializationSnapshot`
  - `MaterializationStoreGateway`
- `ts/packages/incubating/infra/gitplane/src/core/gather-source-facts.ts`
  - `gatherSourceFacts`
  - `TargetSnapshotFacts`
  - `ReconciliationMode`
- `ts/packages/incubating/infra/gitplane/src/core/identity.ts`
  - `deriveAttemptId`
  - `deriveEventId`
  - `ARTIFACT_EVENT_TYPES`
- `ts/packages/incubating/infra/gitplane/src/cli/real-artifact-gateway.ts`
- `ts/packages/incubating/infra/gitplane/src/testing/artifact-gateway.ts`
- `ts/packages/incubating/infra/gitplane/src/testing/materialization-store.ts`
- `ts/packages/incubating/infra/gitplane-sqlite/src/store.ts`
- contract portions of:
  - `.ns/objectives/gitplane/references/README-draft.md`
  - `.ns/objectives/gitplane/references/SPEC-draft.md`
  - both Gitplane Objective records

Focused proof:

- `ts/packages/incubating/infra/gitplane/test/gather-source-facts.test.ts`
- `ts/packages/incubating/infra/gitplane/test/integration/real-artifact-gateway.test.ts`
- relevant cases in `test/sanity/real-artifact-gateway.test.ts`
- `ts/packages/incubating/infra/gitplane/test/unit/identity.test.ts`
- fake gateway tests proving the reduced operation log

Do not retain tests whose only purpose is asserting that a deleted shallow-history probe is not called. Retain positive depth-1 clone coverage because it proves target-only gathering works without fetching history.

### PR 2 — Add the pure complete-snapshot planner and frozen semantic plan

**Review question:** Given immutable target and completed-store facts, is lifecycle policy deterministic, complete, and history-neutral?

Responsibilities:

- Add `deriveReconciliationPlan(facts)` with no gateway calls.
- Validate complete raw topology and corpus before deriving work.
- Derive create, restore, revise, move, unchanged, delete, classification/schema transition, and repair outcomes.
- Detect deletions from the complete target and stored-current sets.
- Canonically order work by artifact ID.
- Freeze all semantic data required for replay without rereading source/config/registration state.
- Emit lineage-free `artifact.repaired` events for repair reapplication/removal work.
- Ensure initial, forward, older, divergent, and merge targets are indistinguishable to planning except for immutable snapshot contents and target identity.
- Keep planner and frozen-plan internals unexported from the package’s public interface unless an existing contract explicitly requires an export.

Primary files/symbols:

- new `ts/packages/incubating/infra/gitplane/src/core/reconciliation-plan.ts`
  - `deriveReconciliationPlan`
- new `ts/packages/incubating/infra/gitplane/src/core/frozen-plan.ts`
  - `frozenReconciliationPlanSchema`
  - `FrozenReconciliationPlan`
  - `FrozenArtifactWork`
- `ts/packages/incubating/infra/gitplane/src/core/index.ts`
- planner-related normative sections in `SPEC-draft.md`

Focused proof:

- new `ts/packages/incubating/infra/gitplane/test/unit/reconciliation-plan.test.ts`
- deterministic ordering and equality
- malformed/incomplete topology and duplicate-ID rejection
- all lifecycle transitions
- classification and schema legality
- complete deletion detection
- normal versus repair
- repeated-target identity inputs
- merge/history neutrality

Before finalizing this PR, delete redundant frozen data rather than preserving accidental implementation weight:

- Do not persist `FrozenArtifactWork.prior` if apply never reads it and prior revision/path have already been collapsed into the event.
- Do not persist `FrozenReconciliationPlan.completion` if result counts are deterministically derived from `artifactWork`.

These are current high-confidence simplification opportunities and should be resolved in the planner PR rather than deferred as cleanup.

### PR 3 — Implement the durable generation protocol and retry-safe engine

**Review question:** Does one frozen pending attempt plus generation CAS make partial, non-transactional application converge safely?

Responsibilities:

- Add atomic one-pending-attempt insertion and exact replay/conflict handling.
- Persist and parse complete frozen plans in both the in-memory fake and SQLite adapter.
- Apply effects in canonical order:
  1. revision;
  2. lineage;
  3. current record;
  4. classified target upsert/tombstone;
  5. event;
  6. cursor CAS last;
  7. error resolution and attempt cleanup.
- Treat cursor generation, not commit-string equality, as CAS authority and prove `A → B → A → B` safety.
- Keep matching retries idempotent and later same-target visits identity-distinct.
- Treat a pending attempt whose next cursor is already current as cleanup-only residue; do not reapply artifact writes.
- Refuse conflicting work before artifact writes.
- Refuse incompatible pre-release SQLite schemas without mutation or migration.
- Add fake/SQLite shared conformance and systematic write-boundary fault injection.

Primary files/symbols:

- new `ts/packages/incubating/infra/gitplane/src/core/apply-reconciliation-plan.ts`
  - `applyReconciliationPlan`
- new `ts/packages/incubating/infra/gitplane/src/core/reconcile.ts`
  - `reconcile`
  - replay/conflict/residue translation
- `ts/packages/incubating/infra/gitplane/src/core/gateways.ts`
  - final operation-level store interface
- `ts/packages/incubating/infra/gitplane/src/testing/materialization-store.ts`
- `ts/packages/incubating/infra/gitplane/src/testing/materialization-store-conformance.ts`
- `ts/packages/incubating/infra/gitplane-sqlite/src/schema.ts`
- `ts/packages/incubating/infra/gitplane-sqlite/src/database.ts`
- `ts/packages/incubating/infra/gitplane-sqlite/src/store.ts`
- `ts/packages/incubating/infra/gitplane-sqlite/test/integration/sqlite-store.test.ts`

Focused proof:

- new `ts/packages/incubating/infra/gitplane/test/reconcile.test.ts`
- new `ts/packages/incubating/infra/gitplane/test/reconciliation-faults.test.ts`
- shared materialization-store conformance against fake and SQLite
- exact generation CAS and ABA behavior
- matching replay, attempt conflict, post-CAS cleanup, and equal completed target no-op
- failure before and after every durable write boundary converges to uninterrupted state

Delete legacy point-read store operations if repository-wide search still shows no production consumer:

- `readCursor`
- `readLineage`
- `readCurrentArtifact`
- `listCurrentArtifacts`
- `LookupResult`
- corresponding SQLite/fake lookup helpers and self-justifying tests

The current implementation reads reconciliation state only through `readMaterializationSnapshot`; point reads were present before the rearchitecture and appear to be test-only compatibility residue. Re-run a repository-wide caller search before deletion.

Also review `ArtifactCurrentRecord.observedCommit` / SQLite `observed_commit`. It appears write-only, while completed cursor and immutable events already retain commit provenance. Remove it in this PR if canonical README/SPEC do not require per-current-row observed commit and no external consumer exists. If retained, document the concrete reader/invariant that justifies it in the PR description and accounting document.

Do **not** delete first-observed revision locators. `firstObservedCommit` and `firstObservedPath` are explicit durable requirements and retries must not overwrite them.

### PR 4 — Activate the CLI and prove end-to-end behavior

**Review question:** Does the completed engine expose the intended user-visible reconciliation feature without leaking architecture internals?

Responsibilities:

- Wire `reconcile` into config/context/store lifecycle.
- Expose `gitplane reconcile <commit> [--repair|-r]`.
- Remove `--full`/`-f` from help and accepted options.
- Return bounded typed output containing mode, prior/resulting cursor, lifecycle/repair counts, replay status, cleanup-only status, completion, and cursor advancement.
- Do not expose ancestry, reconstruction, or unbounded event details.
- Close the materialization store exactly once on success, structural failure, operational failure, and close failure paths.
- Sanitize runtime and close errors.
- Add minimal real-Git/SQLite composition coverage for initial, update, older, divergent, merge, equal/no-op, repair, repeated target, unavailable target, and depth-1 behavior.

Primary files/symbols:

- `ts/packages/incubating/infra/gitplane/src/cli/commands/reconcile/command.ts`
- `ts/packages/incubating/infra/gitplane/src/cli/commands/reconcile/metadata.ts`
- `ts/packages/incubating/infra/gitplane/src/cli/context.ts`
- `ts/packages/incubating/infra/gitplane/src/core/index.ts`
- `ts/packages/incubating/infra/gitplane/test/scenario/cli.test.ts`
- real composition cases in `gitplane-sqlite/test/integration/sqlite-store.test.ts`

Avoid negative-test accumulation:

- One help/schema assertion that `--repair` exists and `--full` is absent is sufficient unless direct rejection has Gitplane-specific error semantics beyond generic Clinkr unknown-option behavior.
- Remove stale assertions that output “does not have ancestry” once the output schema positively enumerates all allowed fields.
- Keep engine no-op tests and CLI no-op mapping tests because they verify different interfaces.

### PR 5 — Add durable architecture accounting and close the rebuild

**Review question:** Is every old/new architectural and behavioral difference explicit, and can obsolete branches/PRs be closed safely?

Responsibilities:

- Add a concise checked-in accounting document under `.ns/objectives/gitplane-reconciliation-stack-rebuild/` (recommended name: `architecture-accounting.md`; verify local naming conventions before creating it).
- Anchor comparisons to immutable commits:
  - old implementation: `09d75c3ae`;
  - replacement stack tip: record the final immutable tip SHA at implementation time;
  - historical shallow rationale: PR #4128 and its immutable commit(s).
- Compare exact old/new symbols and responsibilities, not line counts alone:
  - source facts and gateway methods;
  - planning authority;
  - initial/forward/older/divergent/merge handling;
  - target completeness and deletion detection;
  - retry authority and frozen state;
  - cursor generation and ABA behavior;
  - attempt/event identity;
  - repair semantics and naming;
  - CLI output;
  - intentionally deleted capabilities.
- Name cursor diff, descent classification, merge rejection, initial `--full`, target-commit-keyed event collapse, and old repair naming as intentionally superseded.
- Record which production capabilities and tests were deleted during the replacement.
- Reconcile parent and child Objective roadmap evidence only after implementation and validation are true.
- Keep PR #4128 rationale as historical evidence rather than normative runtime behavior.
- Verify the replacement stack contains every behavior intended from the current `48a07b6bb` implementation before closing anything.
- Submit the replacement stack using Graphite and verify remote parent-relative diffs.
- Close PR #4130 unmerged only after replacement PR links are available. Close prototype PR #4076 unmerged if it is still open and the Objective closure criteria are satisfied.
- Do not rewrite immutable ADRs or erase historical Objective rationale.

## Implementation and stack-construction procedure

### 1. Preserve evidence before rewriting

Create durable local safety refs/tags or backup branches for:

- current PR #4130 tip;
- current parent;
- prototype `09d75c3ae`.

Do not publish backup refs. Record the exact SHAs in the implementation session notes. Ensure the worktree is clean before stack operations.

### 2. Create a replacement stack rather than mutating #4130

Use Graphite mechanics from `.agents/skills/code-graphite/SKILL.md`.

Recommended strategy:

1. Check out the intended existing parent of the replacement stack and revalidate its local/remote/topology state.
2. Create a fresh first replacement branch with `gt create`.
3. Reconstruct PR 1 from the saved #4130 patch using selective staging and precise edits.
4. Create each subsequent child with `gt create` after its parent is coherent and validated.
5. Do not use `gt create -i` unless the replacement must be inserted beneath an existing live child; this is a fresh replacement series, not an in-place split.
6. Revalidate `gt parent --no-interactive`, `gt children --no-interactive`, and `gt branch info --no-interactive` at every boundary.
7. Do not close or delete the old branch until the replacement stack is remotely visible and compared.

Because the parent branch was already reported as locally moved, do not hard-code `62f4acd26` as a checkout target. Resolve the intended Graphite parent by branch identity and inspect its remote divergence first.

### 3. Rebuild by semantic ownership, not raw file count

Some files must change in multiple PRs because their interfaces evolve with the stack, especially:

- `core/gateways.ts`
- `core/index.ts`
- SQLite/fake store implementations
- `SPEC-draft.md`
- Objective roadmaps

Each parent-relative diff should contain only the minimum coherent state for its review question. Do not place all modifications to a shared file in the earliest PR merely to avoid touching it again.

Where a later PR needs part of a hunk currently entangled with earlier work, reconstruct the semantic change manually or use interactive patch staging; do not blindly cherry-pick the entire `48a07b6bb` commit into one layer.

### 4. Compare each replacement layer to both sources

At each stack tip, inspect:

- parent-relative diff for review coherence;
- cumulative replacement diff versus the original parent;
- cumulative behavior/file inventory versus `48a07b6bb`;
- architectural accounting versus `09d75c3ae`.

Useful commands, with resolved SHAs substituted:

```bash
git diff --stat <replacement-parent>...HEAD
git diff --name-status <replacement-parent>...HEAD
git range-diff <old-parent>...48a07b6bb <replacement-parent>...<replacement-tip>
git diff --stat 48a07b6bb...<replacement-tip>
```

`range-diff` is supporting evidence, not proof of behavioral equivalence after deliberate cleanup.

## Refactor execution strategy

This split involves same-concept edits across more than five files and mixes TypeScript, tests, SQLite schema code, and semantic prose. Per `skills/incubating/branch-context/enriched-plan-save/references/refactor-execution-strategy.md`, use the repository’s **refactor-swarm** workflow for the broad file-local migration if it is available in the implementation harness. Partition workers by the five PR responsibilities above, not by arbitrary directories, and keep Graphite mutation/commit ownership in one orchestrating session.

Within each PR:

- use precise semantic edits for README/SPEC/Objective prose;
- use TypeScript AST-aware tooling or a suitable codemod for purely syntactic symbol/API removals if a repo tool exists;
- otherwise make small, inspected edits rather than opaque ad hoc `text.replace()` scripts;
- use selective staging for shared files whose changes belong in different PRs.

Mandatory stale-surface searches at the relevant stack tips:

```bash
rg -n --glob '!*.map' --max-columns 300 --max-columns-preview \
  '(readCommitFacts|isAncestor|diffCommits|incomplete-history|--full|cursor.*tree|event reconstruction)' \
  ts/packages/incubating/infra/gitplane ts/packages/incubating/infra/gitplane-sqlite \
  .ns/objectives/gitplane/references

rg -n --glob '!*.map' --max-columns 300 --max-columns-preview \
  '\b(readCursor|readLineage|readCurrentArtifact|listCurrentArtifacts|LookupResult)\b' \
  ts/packages/incubating/infra/gitplane ts/packages/incubating/infra/gitplane-sqlite

rg -n --glob '!*.map' --max-columns 300 --max-columns-preview \
  '(observedCommit|observed_commit)' \
  ts/packages/incubating/infra/gitplane ts/packages/incubating/infra/gitplane-sqlite
```

Historical mentions intentionally retained in the accounting document and Objective history must be reviewed manually rather than mechanically deleted.

## Validation guidance

Validation is cumulative: each PR must be independently coherent and its focused proof must pass; the replacement tip must pass repository-wide gates.

At minimum, use the repo-prescribed commands after inspecting current `just` recipes/package scripts:

- focused Gitplane and Gitplane SQLite package tests for the changed layer;
- native TypeScript typecheck (`just ts-check` or the current narrower package command);
- integration lane when real Git/SQLite adapter behavior changes;
- isolated lane only if changed tests belong there;
- TypeScript style guard because the work changes gateways, fakes, and test architecture;
- full `just` at each publishable PR boundary, and again at stack tip;
- Objective validation after Objective/reference changes.

If formatting fails, use the prescribed fixers (`just ts-format-fix`, `just ts-lint-fix`, or `just dprint-fix`) rather than hand-formatting generated output.

Before submitting:

1. Verify each branch is clean.
2. Verify Graphite topology using plumbing commands, not parsed `gt ls` output.
3. Verify every parent-relative diff answers only its named review question.
4. Verify the cumulative replacement tip has the intended behavior of `48a07b6bb` minus documented dead/redundant surface.
5. Verify the accounting document’s final tip SHA and PR links.
6. Submit with `gt submit --no-interactive` only when publication is authorized in the implementation session.
7. Inspect each remote PR’s base/head and changed-file inventory.
8. Close #4130 and #4076 only after successful remote verification.

## Risks, assumptions, and open questions

### Risks

- **Temporary lower-stack incoherence:** The architecture PR introduces contracts before feature activation. Keep adapters/typechecks coherent and avoid exporting unusable public planner/apply interfaces.
- **Shared-file leakage:** `gateways.ts`, stores, specs, and roadmaps naturally span layers. Selective staging errors can put behavior in the wrong PR; review every parent-relative diff.
- **Topology drift:** The current branch already needs restack. Revalidate before every Graphite mutation and avoid SHA-based assumptions about the live parent.
- **False equivalence from line counts:** The old prototype and new implementation organize behavior differently. Compare capabilities, invariants, and proof obligations, not just files or LOC.
- **Over-deletion of proof:** Planner, engine, fault-injection, adapter conformance, E2E, and CLI tests verify distinct interfaces. Delete only self-justifying or historical negative tests.
- **Premature closure:** Closing #4130 before replacement PRs are remotely inspectable could lose review context. Closure is the last external action.
- **Schema compatibility:** Gitplane is unreleased and the accepted contract refuses incompatible pre-release stores rather than migrating them. Do not accidentally add migration behavior while splitting.

### Assumptions

- The replacement stack remains above the same intended Graphite parent as #4130 unless topology inspection shows that a lower superseded branch must also be replaced. If the intended parent changes, record the reason in the accounting PR and compare cumulative diffs against both old and new bases.
- Complete scans are accepted v1 behavior; ancestry/diff may return only as measured optimizations and never as correctness inputs.
- Non-transactional partial visibility, frozen-attempt replay, and generation CAS remain required product semantics. This plan isolates them; it does not narrow them to SQLite transactions.
- `firstObservedCommit` and `firstObservedPath` remain required revision provenance.
- The checked-in accounting document is durable design/implementation evidence, not a new ADR and not a rewrite of historical records.

### Open implementation questions

These are non-blocking and should be settled from code/conventions during implementation:

- Exact fresh branch names and PR titles.
- Whether the architecture accounting filename should be `architecture-accounting.md` or another existing Objective convention.
- Whether `observedCommit` has an undocumented external consumer; repository evidence currently shows none.
- Whether the generic Clinkr test suite already proves removed-option rejection strongly enough to delete Gitplane’s explicit `--full` rejection test.

A material discovery—such as an external consumer of a proposed-deleted store method, or a requirement to change the replacement stack’s parent—must pause mutation long enough to update the split rationale before proceeding.

## Review and remediation checklist

### Architecture PR

- [ ] No reconcile command activation.
- [ ] No ancestry, diff, shallow-history, or cursor-tree planning operation remains.
- [ ] Complete target snapshot and coherent materialization snapshot contracts are understandable without reading later PRs.
- [ ] Create/check capabilities remain intact.
- [ ] Positive missing-object and depth-1 behavior remains covered.

### Planner PR

- [ ] Planner is pure and deterministic.
- [ ] Complete validation precedes work derivation.
- [ ] Lifecycle, deletion, lineage, repair, ordering, and history neutrality are proven.
- [ ] Frozen plan contains only replay-required semantic data.

### Durable engine PR

- [ ] One pending attempt per source is atomic.
- [ ] Replay/conflict/residue precedence is explicit.
- [ ] Cursor CAS is generation-based and cursor-last.
- [ ] Fake and SQLite share conformance.
- [ ] Every required write boundary has convergence proof.
- [ ] Dead point-read methods and write-only current-row provenance are either removed or concretely justified.

### CLI/E2E PR

- [ ] `--repair|-r` is the only repair surface.
- [ ] Output is bounded and typed.
- [ ] Store closes exactly once on all paths.
- [ ] Initial/older/divergent/merge/equal/repair/repeated/unavailable/depth-1 cases are covered at the appropriate layer.

### Accounting/closure PR

- [ ] Old prototype and final replacement tip are immutable anchors.
- [ ] All intentionally superseded behaviors are named.
- [ ] Historical rationale is preserved but clearly non-normative.
- [ ] Parent and child Objective evidence matches the implemented state.
- [ ] Replacement PR topology and cumulative diff are verified remotely.
- [ ] #4130 is closed unmerged only after replacement publication.
- [ ] #4076 is closed unmerged when its remaining reference role is exhausted.
