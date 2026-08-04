# Gitplane Source Facts Slice — Grilled Implementation Plan

## Goal

Implement the **Source facts** roadmap slice for Objective `gitplane-reconciliation-stack-rebuild` as the second additive PR in the six-slice rebuild stack. The slice must gather faithful, policy-free Git observations for later reconciliation planning while proving the real adapter, in-memory fake, and Gather seam independently of planner/store/engine behavior.

This plan starts from the contract slice on branch `clarify-reconciliation-retry-contract` at `5ef991595dbae5fa0853c4f5639a26cf09a6d332`. The prototype commit `09d75c3ae` is reference material only and must not be landed or treated as normative.

## Authoritative context

Read before implementation:

- `.ns/objectives/gitplane-reconciliation-stack-rebuild/objective.md`
- `.ns/objectives/gitplane-reconciliation-stack-rebuild/roadmap.md`, row **Source facts**
- `.ns/objectives/gitplane/references/SPEC-draft.md`, especially reconciliation history modes, marker provenance, failure split, and proof matrix
- `.ns/objectives/gitplane/references/README-draft.md`, reconcile behavior and linear-history constraint
- `ts/AGENTS.md`
- `docs/conventions/consumer-gateways-and-command-shape.md`
- `.agents/skills/typescript-style/SKILL.md` and `.agents/skills/ns-typescript/SKILL.md`

Normative precedence: the SPEC draft and rebuild Objective supersede inconsistent prototype behavior. In particular, marker provenance is required for revision identity; moves revise through the marker-changing commit; unavailable required provenance is a structural fact, while source-command execution failure is operational.

## Grilled decisions

These decisions were confirmed during planning and should not be reopened without concrete implementation evidence:

1. Introduce a pure/core **Gather** orchestration seam that composes `ArtifactGateway` observations into a planner-ready source-fact snapshot. The adapter reports observations; the later planner decides their reconciliation meaning.
2. Do not use Git rename heuristics such as `git log --follow`. Track markers by `gpId` across history so add, marker-content change, move, and move-plus-change attribution are deterministic.
3. Gather marker provenance in one batched target-corpus operation, returning results in canonical artifact-ID order rather than doing an independent history walk per artifact.
4. Commit-tree discovery is mechanical. It must preserve candidates/facts needed for later whole-corpus validation rather than reject nested boundaries, duplicate IDs, unsupported entries, classification, or schema conditions inside the real adapter.
5. Commit reads return raw artifact candidates—entry kinds and bytes, including marker bytes—not adapter-validated semantic `ArtifactSnapshot`s.
6. Commit/object lookup distinguishes a successful `unavailable` observation from an operational Git execution/protocol failure.
7. Gather may use a small pure identity decoder to extract only a syntactically usable `gpId` from raw target marker bytes for provenance lookup. It is not authoritative whole-marker validation and emits no user-facing corpus findings.
8. Keep unavailable reasons small and semantic: `missing-object` and `incomplete-history` for Git/history observations. `identity-unavailable` is a Gather-level reason for not requesting provenance, not an adapter execution error. Sanitized diagnostics belong only to operational `GatewayError`s.
9. Amend the Objective roadmap/contract wording in this PR from validated `readCommitTreeSnapshot` semantics to raw candidate reads plus pure Gather assembly. Preserve the proof obligation.
10. Do not silently choose first-parent traversal through merge history. A merge target is directly observable for later rejection; ambiguous merge ancestry that prevents unique marker attribution yields `incomplete-history`.
11. This slice proves the facts boundary, not temporary planner policy. Do not add public `reconcile(...)` behavior or planner/store/engine implementation.
12. Gather accepts the already-read cursor commit explicitly and does not depend on `MaterializationStoreGateway`.

One proposed optimization question was deliberately left unresolved when the grill ended: whether Gather should always read complete prior and target corpora or use diffs to reduce reads. Start with correctness and the complete planner-ready fact contract; settle read optimization only from code/test evidence, and record any contract-affecting decision through the selected Objective.

## Current implementation state

Relevant current files:

- `ts/packages/incubating/infra/gitplane/src/core/gateways.ts`
  - `ArtifactGateway` already declares `resolveCommit`, `readCommitFacts`, `isAncestor`, `discoverCommitTree`, `readCommitTreeSnapshot`, and `diffCommits`.
  - The history result shapes are mostly generic `GatewayResult<T>` and do not yet encode successful unavailability or marker provenance.
- `ts/packages/incubating/infra/gitplane/src/cli/real-artifact-gateway.ts`
  - `RealArtifactGateway` currently implements a narrowed `Pick<ArtifactGateway, ...>`.
  - It implements commit resolution, commit facts, ancestry, raw commit inventory/candidate reads, and commit diffs.
  - It does not implement the contract’s `discoverCommitTree` or `readCommitTreeSnapshot` methods.
  - Existing raw helpers `inventoryCommitTree` and `readCommitTreeCandidate` are the useful starting point.
- `ts/packages/incubating/infra/gitplane/src/testing/artifact-gateway.ts`
  - `InMemoryArtifactGateway` implements the full current interface with seeded commit facts, ancestry, boundaries, snapshots, and diffs.
- Tests:
  - `test/gateways/fakes.test.ts`
  - `test/sanity/real-artifact-gateway.test.ts` for scripted command protocol
  - `test/integration/real-artifact-gateway.test.ts` for real Git

The prototype made `RealArtifactGateway` implement the full gateway by adding adapter-owned `discoverValidatedBoundaries()` and `snapshot()` validation. Do **not** copy that design: it embeds corpus and marker policy in the adapter and conflicts with the confirmed raw-facts seam. Mine the prototype only for useful command mechanics and test fixtures.

## Target architecture

### Observation contracts

Refine the source-facing contracts in `src/core/gateways.ts` using discriminated unions. Exact names may follow nearby package conventions, but preserve these semantic distinctions:

- Fallible execution stays wrapped in `GatewayResult<T>`.
- Successful commit/object observations distinguish `found` from `unavailable` with stable semantic reasons.
- Raw commit candidates preserve paths, entry kinds, and bytes without parsing/validating the artifact marker.
- Marker-provenance results identify each requested artifact and distinguish:
  - `found` with `markerLastChangedCommit`;
  - `unavailable` with `missing-object` or `incomplete-history`.
- Batched outputs have deterministic canonical ordering and cannot silently omit an input artifact.

Do not expose Git stderr, exit codes, command argv, or rename scores in domain facts. Do not widen ordinary optional fields to smuggle domain absence through `undefined`.

### Gather seam

Add a focused core module under `src/core/` for gathering reconciliation source facts. It should:

1. Accept `ArtifactGateway`, `sourceId`, artifact root, target commitish/commit input as appropriate, already-read `cursorCommit: string | null`, and mode/options needed only to determine which observations must be requested.
2. Resolve/read target commit facts and collect raw target corpus observations.
3. Observe cursor equality/ancestry/history availability without deciding whether a normal/full reconciliation is legal.
4. Collect prior-cursor facts/corpus when available and required by the fact contract.
5. Decode only usable target `gpId` values for provenance requests; retain undecodable candidates in the fact snapshot and mark provenance `identity-unavailable`/not requested.
6. Request batched marker provenance and combine it with raw target candidates.
7. Return a complete immutable fact snapshot or an operational Gather failure. The snapshot must contain enough explicit state for the later pure `deriveReconciliationPlan(facts)` to run with no gateways.

Keep Gather free of `MaterializationStoreGateway`, registration interpretation, classification/schema legality, revision/event identity derivation, transition selection, and materialization writes.

### Real adapter

Evolve `RealArtifactGateway` toward satisfying the revised source contract while retaining working-tree/create behavior already used elsewhere.

- Reuse and, where helpful, rename/generalize `inventoryCommitTree`, `readCommitTreeCandidate`, `readCommitBlobs`, and exact Git command parsing.
- Discovery must report mechanical candidate boundaries/facts without duplicate/nesting/marker-schema policy.
- Classify expected Git “not found/unavailable” outcomes as successful unavailable observations only when the command protocol establishes that state; unexpected execution failures and malformed protocol output remain `GatewayError`.
- Implement batched identity-based marker provenance traversal:
  - compare target markers by `gpId`, path, and marker bytes across history;
  - attribute add, marker-byte change, path move, and move-plus-change to the responsible commit;
  - avoid rename heuristics;
  - avoid N complete history traversals;
  - stop with `incomplete-history` rather than selecting first parent when merge ancestry makes attribution ambiguous;
  - preserve deterministic request/result ordering.
- Keep command construction/parsing private to the real adapter. Do not leak command mechanics into core.

Choose the exact Git command sequence incrementally under scripted and real-Git tests. If Git behavior disproves an agreed shape, pause and update the plan/Objective rather than burying a policy exception in parsing code.

### Fake

Update `InMemoryArtifactGateway` and its exported state to seed every new semantic observation directly:

- found/unavailable commit/object states;
- raw commit inventories/candidates;
- ancestry/equality observations;
- batched marker provenance, including unavailable results;
- injected operational failures for each new operation.

Defensively clone bytes, arrays, and records at ownership boundaries. Fake tests should prove per-commit/root selection, deterministic ordering, unavailable-state preservation, and failure injection without duplicating real Git command behavior.

### Exports

Update `src/core/index.ts`, `src/cli/index.ts`, and `src/testing/index.ts` only as needed for the curated existing package surfaces. Keep planner-only internal types internal unless later slices genuinely need a public core export. Do not add a new package/subpackage or root-only catch-all barrel.

## Incremental implementation sequence

### Checkpoint 1 — contract and red tests

- Amend `.ns/objectives/gitplane-reconciliation-stack-rebuild/roadmap.md` so Source facts names raw commit candidates and Gather assembly instead of adapter-validated `readCommitTreeSnapshot` semantics.
- Add/reshape discriminated observation types and the minimal gateway signatures.
- Write focused fake/Gather tests first for found vs unavailable vs operational failure and raw-candidate preservation.
- Keep this checkpoint compiling or intentionally local-red only while immediately proceeding; do not leave dead scaffolding.

### Checkpoint 2 — raw commit facts parity

- Make `RealArtifactGateway` satisfy the revised raw source surface for commit resolution/facts, ancestry, mechanical discovery/candidate reads, and diffs.
- Remove or replace the overlapping validated snapshot contract rather than keeping two divergent reconciliation read surfaces.
- Add scripted command-protocol tests for exact argv, NUL/binary parsing, path confinement, expected unavailable outcomes, malformed output, and operational failures.
- Extend minimal real-Git tests for raw tree/candidate fidelity.

### Checkpoint 3 — Gather snapshot

- Implement the Gather function and immutable source-fact types.
- Add pure/default-lane tests for target/cursor states: no cursor, equal, descendant, non-forward observation, prior unavailable, merge target observation, and provenance unavailable.
- Ensure tests assert facts, not planner verdicts such as “structural rejection.”
- Resolve the complete-corpus versus diff-guided-read question from these tests. Prefer complete facts unless an optimization can be proven without weakening planner authority.

### Checkpoint 4 — marker provenance

- Implement the narrow pure `gpId` decoder used only to request provenance.
- Implement batched identity-based real-Git provenance traversal.
- Add scripted command-protocol tests for bounded invocation behavior and result ordering.
- Add real-Git integration fixtures proving:
  - marker addition;
  - marker content change;
  - marker move with unchanged content;
  - marker move plus content change;
  - missing/unreadable object;
  - ambiguous merge ancestry resulting in `incomplete-history`.
- Prove candidates lacking a usable `gpId` remain available to the later planner and do not cause adapter validation.

### Checkpoint 5 — slice accounting

- Compare the finished source-fact behavior with prototype `09d75c3ae` and document intentional differences, especially removal of adapter-owned corpus validation and addition of deterministic marker provenance/unavailable states.
- Update the Objective through the `objective-update` workflow with meaningful completion evidence and any contract decisions discovered during implementation; do not manually edit or rewrite existing Semantic Updates.
- Keep the roadmap row open until its proof obligation and validation evidence are complete; mark it complete only through the Objective workflow when justified.

## Test proof obligations

### Default lane

- Pure Gather produces deterministic, immutable planner-ready facts.
- Equality, ancestry, non-forward observations, merge facts, and unavailable prior history remain observations rather than adapter/planner verdicts.
- Raw invalid marker bytes, nested/duplicate candidates, and unsupported entries survive gathering for later whole-corpus validation.
- Identity decoding requests provenance only for usable `gpId`s without becoming authoritative marker validation.
- In-memory fake supports all found/unavailable/operational variants and defensively clones state.

### Sanity / scripted command protocol

- Exact Git argv and stdin for resolution, facts, ancestry, tree inventory, blob reads, diffs, and provenance traversal.
- Stable interpretation of expected missing-object/history outcomes versus execution failures.
- NUL-safe paths and binary marker/content reads; malformed/truncated protocol data fails operationally.
- Provenance batching has bounded invocation behavior and deterministic ordering.
- No `git log --follow`, rename-threshold dependency, or silent first-parent selection.

### Integration / real Git

Use temporary real repositories only in `test/integration/`:

- root, linear, and merge commit facts;
- true/false ancestry and missing objects;
- mechanical raw tree discovery and historical bytes;
- marker add/change/move/move-plus-change attribution;
- marker path change produces provenance even when recursive artifact content is otherwise unchanged;
- incomplete/ambiguous merge ancestry is represented explicitly;
- no network access for gitlinks/submodules.

Do not put real Git, subprocesses, filesystem repositories, or module mocking into shared-cache default tests.

## Validation

Run focused feedback loops while implementing:

```sh
pnpm --dir ts --filter @nseng-ai/gitplane run check
pnpm --dir ts --filter @nseng-ai/gitplane run test
pnpm --dir ts vitest run --config vitest.sanity.config.ts packages/incubating/infra/gitplane/test/sanity/real-artifact-gateway.test.ts
pnpm --dir ts vitest run --config vitest.integration.config.ts packages/incubating/infra/gitplane/test/integration/real-artifact-gateway.test.ts
```

Before calling the slice complete, run:

```sh
just ts-deps-check
just ts-format-check
just ts-lint
just ts-check
just ts-test
just ts-test-integration
just ts-test-sanity
just ts-test-typescript-style-guard
ns objective check gitplane-reconciliation-stack-rebuild
just
```

If formatting or lint autofixes are needed, use `just ts-format-fix` and `just ts-lint-fix`, then rerun the checks. `just` does not substitute for the explicit integration or TypeScript style-guard lanes.

## PR boundary and dependencies

This is one additive PR stacked directly above the contract/proof-matrix PR. It may include:

- revised source-fact contracts and raw candidate types;
- Gather source-fact assembly;
- real adapter and fake support;
- default, sanity, and integration proofs;
- the narrowly required Objective/contract clarification and source-slice completion evidence.

It must not include:

- `deriveReconciliationPlan(facts)` policy or transition derivation;
- revision/event identity implementation beyond facts required as planner input;
- durable attempt/frozen-plan storage, CAS, SQLite protocol, or conformance work;
- apply ordering, fault-injection engine work, CLI reconcile exposure, or prototype PR closure.

The next PR, **Pure reconciliation planner**, consumes the complete immutable source-fact snapshot and owns whole-corpus validation, history-mode legality, marker-provenance structural rejection, revision identity, transition precedence, deterministic semantic plan construction, and planner property tests. If this slice cannot provide all required planner inputs without further I/O, treat that as a seam-design finding and update the Objective rather than allowing the planner to call gateways.

## Completion criteria for this slice

- `ArtifactGateway`, `RealArtifactGateway`, and `InMemoryArtifactGateway` expose one coherent raw source-fact surface with no overlapping validated reconciliation snapshot API.
- Gather returns complete deterministic planner-ready facts without store access or reconciliation policy.
- Found/unavailable/operational distinctions are typed and proven.
- Marker add/change/move/move-plus-change attribution is deterministic, identity-based, batched, and real-Git tested.
- Missing identity and unavailable/ambiguous history remain explicit facts; no rename heuristic or first-parent invention is used.
- Adapter tests prove command protocol; integration tests prove Git behavior; default tests remain fake-driven.
- Prototype differences and the raw-candidate contract clarification are recorded under Objective `gitplane-reconciliation-stack-rebuild`.
- Focused and full validation commands pass, and the PR remains bounded to Source facts.