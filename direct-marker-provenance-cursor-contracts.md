# Remediate GitPlane source-fact gathering and marker-provenance review findings

## Goal and outcome

Revise PR #4114 on branch `gather-raw-source-facts-marker-provenance` so the source-fact slice remains a clean Gather → Decide → Apply foundation rather than landing an exhaustive Git-history snapshot implementation or a facts model with convention-only invariants.

The completed change should:

- replace the current full-history/per-commit marker snapshot walk with direct, literal-path Git history queries;
- fail closed with semantic `incomplete-history` observations whenever marker provenance cannot be proven because the repository is shallow or reachable history contains a merge;
- preserve `missing-object` as a distinct semantic observation and operational/protocol failures as `GatewayError`;
- remove marker bytes and marker JSON parsing from the real Git adapter;
- represent cursor facts as one discriminated state so impossible combinations cannot compile;
- establish one canonical artifact-marker name/path convention and one deterministic provenance ordering contract;
- remove redundant Gather copying while keeping the in-memory fake defensive and faithful;
- retain raw invalid/nested candidates for the future pure planner, while only regular files named `gitplane-artifact.json` establish artifact boundaries;
- keep the package’s public `reconcile(context, options)` direction unchanged and avoid implementing planner policy in this source-fact slice.

This is a full remediation of the surviving thermo-nuclear review findings, not only the approval blocker.

## Context and discovered facts

### Branch and Objective context

- Current branch: `gather-raw-source-facts-marker-provenance`.
- Parent branch: `clarify-reconciliation-retry-contract`.
- Graphite PR: #4114, “Add GitPlane source-fact gathering and marker provenance observations.”
- Active Objective: `.ns/objectives/gitplane-reconciliation-stack-rebuild/`.
- The Objective rebuilds reconciliation as Gather → Decide → Apply. This branch owns the source-fact slice; the pure planner is the next slice.
- The source-fact roadmap proof obligation requires raw candidates and faithful Git observations, with no reconciliation policy or corpus validation embedded in the adapter.
- GitPlane is unreleased, so these source-fact and fake contracts may change without compatibility scaffolding.
- No GitPlane `CONTEXT.md` exists yet; do not create one for this implementation-only remediation.

### Current implementation facts

- `src/cli/real-artifact-gateway.ts` is 472 lines and currently implements provenance by:
  1. running `git rev-list --parents <target>` over all reachable history;
  2. running `ls-tree` and `cat-file` for every commit;
  3. decoding every marker’s `gpId` in the adapter;
  4. retaining every historical marker snapshot in memory; and
  5. comparing adjacent snapshots by path and bytes.
- The implementation manufactures a Git-shaped `missingObjectError()` so an outer stderr regex will reinterpret an internal result as `missing-object`; this should disappear with the algorithm.
- `MarkerProvenanceRequest` currently contains `artifactId`, `path`, and `markerBytes`; the direct path-history algorithm needs only the first two.
- `readMarkerProvenance` currently receives `artifactRoot`, but direct per-marker path history does not need it. Removing it is appropriate only if marker paths become a documented, validated repository-relative contract.
- `gather-source-facts.ts` currently exposes four correlated cursor fields: `cursorCommit`, `cursorFacts`, `cursorCorpus`, and `relationship`. It also defensively recopyies values already returned as fresh gateway snapshots.
- The fake cannot seed an unavailable commit-facts observation for a specific commit because unavailable observations contain no commit key. Its provenance fixture is also keyed too loosely for duplicate artifact IDs at different paths.
- `ARTIFACT_MARKER_NAME` already exists in `inspect-corpus-topology.ts` and is exported from the package root, but production code repeats the literal and boundary predicate in several forms.
- `parseArtifactMarker` validates the complete marker envelope. Gather needs a deliberately narrower identity extraction: a canonical `gpId` should still request provenance even if classification fields are invalid, because the next pure planner owns whole-marker validation.
- Existing tests cover raw invalid/nested candidates, add/change/move/move-plus-change attribution, merge and missing history, fake semantics, and low-level command protocol. The sanity test is already 887 lines, so new protocol cases should replace the obsolete snapshot-walk section rather than only append to it.

### Resolved behavior decisions

- Remediate all surviving findings in this PR revision.
- In any shallow repository, return `incomplete-history` for every requested marker rather than trying to prove individual markers from the fetched suffix.
- Replace flat cursor fields with this conceptual state model:
  - `none`;
  - `unavailable { commit, reason }` when cursor commit facts cannot be read; or
  - `observed { commit, facts, corpus, relationship }` when commit facts exist, while corpus and ancestry may independently be unavailable.
- Preserve request order at the gateway seam. Gather owns canonical request ordering before calling the gateway.
- For Gather’s combined provenance list, valid marker requests come first in deterministic `(artifactId, path)` order; `identity-unavailable` observations follow in deterministic path order.

## Files, symbols, tests, and documentation

### Production contracts and core logic

- `ts/packages/incubating/infra/gitplane/src/core/artifact.ts`
  - `ARTIFACT_MARKER_NAME` (move canonical ownership here)
  - add a small marker-path helper if it removes repeated root/non-root path construction
  - retain `parseArtifactId` and `parseArtifactMarker` roles
- `ts/packages/incubating/infra/gitplane/src/core/check/inspect-corpus-topology.ts`
  - import the canonical marker name
  - use the same regular-file boundary rule as Gather
- `ts/packages/incubating/infra/gitplane/src/core/gateways.ts`
  - `MarkerProvenanceRequest`
  - `ArtifactGateway.readMarkerProvenance`
  - caller-owned gateway snapshot contract
- `ts/packages/incubating/infra/gitplane/src/core/gather-source-facts.ts`
  - `HistoryRelationship`
  - new `GatheredCursorFacts` union
  - `GatheredSourceFacts`
  - `gatherSourceFacts`
  - `readCorpus`
  - narrow marker identity extraction
  - `targetUnavailable`
- `ts/packages/incubating/infra/gitplane/src/core/index.ts`
  - preserve the existing root export of `ARTIFACT_MARKER_NAME`
  - export the new cursor facts type and remove/rename superseded types deliberately

### Real and fake adapters

- `ts/packages/incubating/infra/gitplane/src/cli/real-artifact-gateway.ts`
  - `RealArtifactGateway.readMarkerProvenance`
  - `isMissingGitObject`
  - remove `missingObjectError`, `decodeGpId`, `sameMarker`, and `readMarkersAtCommit`
- `ts/packages/incubating/infra/gitplane/src/testing/artifact-gateway.ts`
  - `InMemoryArtifactGatewayState.commitFacts`
  - `InMemoryArtifactGatewayState.markerProvenance`
  - `InMemoryArtifactGateway.readCommitFacts`
  - `InMemoryArtifactGateway.readMarkerProvenance`
  - retain fake input/output defensive copying

### Tests

- `ts/packages/incubating/infra/gitplane/test/gather-source-facts.test.ts`
- `ts/packages/incubating/infra/gitplane/test/gateways/fakes.test.ts`
- `ts/packages/incubating/infra/gitplane/test/sanity/real-artifact-gateway.test.ts`
- `ts/packages/incubating/infra/gitplane/test/integration/real-artifact-gateway.test.ts`

### Objective/docs

- `.ns/objectives/gitplane-reconciliation-stack-rebuild/roadmap.md` already states the intended adapter/planner ownership. Change it only if implementation evidence requires a factual clarification; do not mark the source-fact row complete merely for addressing review.
- `.ns/objectives/gitplane/references/SPEC-draft.md` defines `markerLastChangedCommit` as the commit that most recently added, changed, or moved the marker and states V1’s linear, squash-only source-history assumption. No semantic spec amendment is currently expected.

## Implementation steps

### 1. Establish canonical marker path and boundary semantics

1. Move `ARTIFACT_MARKER_NAME = "gitplane-artifact.json"` from `check/inspect-corpus-topology.ts` to `artifact.ts`; update `core/index.ts` so the package root continues to export the same symbol.
2. Add one small pure helper only if useful for constructing a repository-relative marker path from an artifact-directory path:
   - `""` (repository-root artifact) maps to `gitplane-artifact.json`, not `/gitplane-artifact.json`;
   - non-empty `path` maps to `${path}/${ARTIFACT_MARKER_NAME}`.
3. Make artifact-boundary discovery require both:
   - basename exactly `ARTIFACT_MARKER_NAME`; and
   - entry kind `regular-file`.
4. Apply that rule in `readCorpus` and `inspectCorpusTopology`. Continue treating regular marker files with invalid JSON, invalid IDs, partial classification, nested paths, duplicates, or unsupported sibling entries as raw candidates for later planner validation.
5. Replace touched production marker-name literals in Gather, topology inspection, creation, and provenance code with the canonical constant/helper where doing so removes divergence. Do not introduce a broad utility module for one-line mechanics.

### 2. Simplify the marker-provenance gateway contract

1. Change `MarkerProvenanceRequest` to `{ artifactId, path }`; remove `markerBytes`.
2. Remove `artifactRoot` from `ArtifactGateway.readMarkerProvenance`. It no longer contributes to the implementation after direct marker-path history queries.
3. Document `MarkerProvenanceRequest.path` as a repository-relative artifact-directory path; allow `""` for the repository root.
4. Document the gateway result contract:
   - exactly one observation per input request;
   - observations preserve request order, including duplicate IDs or duplicate requests;
   - values returned by gateway calls are caller-owned snapshots that implementations must not mutate after return or back with later-reused mutable storage.
5. Keep `MarkerProvenanceObservation` keyed by `artifactId`; association for duplicate IDs at different paths is positional through the request-order contract.
6. Use a locale-independent lexical comparator in Gather (explicit `<`/`>` comparison) to sort valid requests by artifact ID then path. The real and fake gateways must not sort again.

### 3. Replace the exhaustive provenance walk with direct Git history queries

Rewrite `RealArtifactGateway.readMarkerProvenance` as a short orchestration over precise Git commands:

1. If `markers` is empty, return `[]` without invoking Git.
2. Validate every artifact-directory path before invoking Git:
   - reject absolute paths;
   - reject NULs;
   - reject any `..` path component;
   - permit the empty root path;
   - construct the marker path through the canonical helper.
   Invalid caller paths are operational gateway failures, not history observations.
3. Run `git rev-parse --is-shallow-repository` once.
   - accept only normalized `true` or `false` output;
   - malformed/empty output is `GatewayError`;
   - when `true`, return `unavailable/incomplete-history` for every marker and do not run merge or marker-history queries.
   - This deliberately gives shallow-history unavailability precedence over target-object resolution, per the resolved fail-closed decision.
4. Run `git rev-list --min-parents=2 -1 <targetCommit>` to detect any merge reachable from the target, not only a merge target.
   - empty output means linear reachable history;
   - one lowercase hexadecimal object ID means return `incomplete-history` for all markers;
   - malformed/multiple output is an operational protocol failure;
   - do not hard-code SHA-1’s 40-character width so SHA-256 repositories are not rejected by parser policy;
   - a missing target/object at this repository-wide stage returns `missing-object` for all markers.
5. For each marker, run a literal-path query equivalent to:
   - `git --literal-pathspecs rev-list -1 <targetCommit> -- <markerPath>`.
   `--` alone does not disable Git pathspec magic, so `--literal-pathspecs` is required.
6. Execute independent marker-history queries concurrently with `Promise.all`, while classifying each result independently:
   - one hexadecimal object ID → `found` with `markerLastChangedCommit`;
   - empty output → `unavailable/incomplete-history` because the requested target marker cannot be proven from history;
   - missing-object subprocess failure → `unavailable/missing-object` for that request only;
   - malformed output or any non-missing operational failure → fail the whole gateway call with `GatewayError`.
7. Preserve request order when collecting concurrent results.
8. Delete the now-obsolete full-history algorithm and helpers: `missingObjectError`, `decodeGpId`, `sameMarker`, `readMarkersAtCommit`, snapshots, historical tree inventories, and historical marker blob reads.

This direct-path algorithm remains faithful under linear history:

- add → marker path first appears at the add commit;
- byte change → path’s blob changes at that commit;
- move → destination path is added at the move commit, including byte-identical moves;
- move plus change → destination path is added with changed bytes at that commit;
- delete plus re-add → the re-add is the latest path change;
- byte-identical rewrite that leaves the Git tree unchanged is not a provenance change, matching the old path+bytes comparison.

### 4. Encode cursor states as a discriminated union

1. Remove `no-cursor` from `HistoryRelationship`; retain only observed relationships:
   - `equal`;
   - `ancestor`;
   - `non-forward`;
   - `unavailable { reason }`.
2. Introduce and export `GatheredCursorFacts` with reachable states:
   - `{ type: "none" }`;
   - `{ type: "unavailable"; commit: string; reason: GitUnavailableReason }` when cursor commit facts cannot be read; corpus and ancestry are not attempted;
   - `{ type: "observed"; commit: string; facts: CommitFacts; corpus: GitObservation<CommitCorpusFacts>; relationship: HistoryRelationship }` when commit facts are found.
3. Replace `cursorCommit`, `cursorFacts`, `cursorCorpus`, and top-level `relationship` on the gathered variant with `cursor`.
4. Retain `cursorCommit: string | null` on the `target-unavailable` variant because target failure occurs before cursor gathering; this records the requested input rather than pretending cursor facts were observed.
5. Gather observed cursor corpus and ancestry as independent observations:
   - corpus unavailability does not prevent ancestry observation;
   - ancestry unavailability does not erase corpus facts;
   - an equal cursor yields `equal` without calling `isAncestor`, even when corpus is unavailable.
6. Keep target commit facts and corpus behavior unchanged apart from type shape and redundant copies.

### 5. Simplify Gather ownership, identity extraction, and ordering

1. Remove `copyCandidate`, `copyCorpus`, `copyCommitFacts`, and Gather’s nullable `copyObservation`. Gateway results are caller-owned snapshots, so Gather can retain them directly in its immutable result.
2. Keep the fake’s copying behavior. Constructor state is caller-owned test data, and fake outputs must not permit tests to mutate fake state.
3. Keep candidate identity extraction deliberately narrower than `parseArtifactMarker`:
   - locate the regular-file marker entry using the canonical marker name;
   - decode JSON from bytes;
   - extract and validate only `gpId` through `parseArtifactId`;
   - return `{ artifactId, path }` without copying bytes;
   - leave the raw candidate untouched so the planner can reject invalid classification/envelope fields later.
4. Type the pending identity failures as only the `identity-unavailable` variant, eliminating the dead `"path" in …` sort guard.
5. Sort valid requests once by `(artifactId, path)`, call the gateway, and preserve its aligned response order. Append identity-unavailable results sorted by path.
6. Reuse `targetUnavailable(options, reason)` for resolve, target-facts, and target-corpus unavailability instead of maintaining duplicate literals.

### 6. Make the in-memory fake faithfully model the revised seam

1. Change `commitFacts` seed state from unkeyed `GitObservation<CommitFacts>[]` to records keyed by requested commit, for example `{ commit, observation }`. This allows unavailable `missing-object` and `incomplete-history` facts to be seeded for a specific cursor.
2. Change marker-provenance seed state so it distinguishes target commit plus `(artifactId, path)`, rather than artifact ID alone. Duplicate IDs at different paths must be independently representable.
3. Implement `readMarkerProvenance` by mapping the incoming request list in order and looking up each target/path/ID fixture. Do not sort in the fake.
4. Preserve the current semantic default for absent provenance fixtures (`unavailable/incomplete-history`) unless a more explicit nearby fake convention requires adjustment.
5. Continue copying fixture input and returned observations/collections. Add or retain operation-log evidence only for invisible behavior such as proving equal-cursor ancestry was skipped or empty marker requests caused no real adapter calls; do not over-specify domain behavior through logs.

### 7. Replace and extend tests at the correct proof layers

#### Default fake-driven Gather tests

Update `test/gather-source-facts.test.ts` and focused fake checks to prove:

- cursor `none`;
- cursor facts unavailable for both reasons;
- observed cursor with found/unavailable corpus independently of found/unavailable relationship;
- equal cursor skips ancestry even if corpus is unavailable;
- target-unavailable still records the requested `cursorCommit`;
- a canonical `gpId` with invalid or incomplete classification still produces a provenance request while retaining the raw candidate;
- invalid JSON/ID produces `identity-unavailable`;
- regular-file boundary behavior for nested/duplicate/raw candidates and non-boundary marker-named directories;
- duplicate artifact IDs at different paths receive distinct request-aligned provenance;
- exact duplicate requests remain one-to-one;
- root artifact path `""` creates `gitplane-artifact.json` rather than an absolute-looking path;
- combined ordering: valid `(artifactId, path)` observations, then identity-unavailable by path;
- Gather does not add a second defensive-copy layer, while fake state remains insulated from caller mutation.

#### Sanity command-protocol tests

Replace the obsolete full-history/tree/blob provenance test block in `test/sanity/real-artifact-gateway.test.ts`; do not only append to the already-large file. Prove:

- empty request performs zero Git calls;
- exact shallow, merge-detection, and literal per-marker command shapes;
- shallow `true` short-circuits merge and marker queries;
- malformed shallow output fails operationally;
- merge query recognizes empty versus one object ID and rejects malformed/multiple records;
- missing object versus operational failure at the shallow/merge/per-marker stages has the required batch/per-item scope;
- per-marker queries may complete concurrently but output remains in input order;
- malformed marker-history output fails the gateway call;
- literal pathspec handling for pathspec-magic-looking valid paths;
- unsafe absolute/parent/NUL paths fail before Git execution.

Sanity tests own command protocol. Do not duplicate every real add/move behavior here.

#### Real-Git integration tests

Update `test/integration/real-artifact-gateway.test.ts` to retain/prove actual Git behavior for:

- marker add;
- marker byte change;
- byte-identical move;
- move plus byte change;
- missing target/object;
- a merge target;
- a single-parent target descended from a merge (any reachable merge violates V1 linear history);
- a real shallow clone created through `git clone --depth=1 file://…` (a plain local-path clone may ignore depth), yielding `incomplete-history`;
- one unusual but valid repository-relative marker path demonstrating literal path treatment.

Keep duplicate-ID matrices, ordering, malformed output, and empty requests in default/sanity tests rather than adding unnecessary real-Git coverage.

### 8. Update exports and perform stale-shape checks

1. Update `core/index.ts` exports for `GatheredCursorFacts`, the revised `HistoryRelationship`, and the canonical marker constant without creating broad wildcard exports.
2. Run bounded stale-shape searches after edits:
   - `markerBytes` in provenance request construction;
   - removed cursor fields (`cursorFacts`, `cursorCorpus`, gathered top-level `relationship`);
   - `missingObjectError`, `decodeGpId`, `sameMarker`, `readMarkersAtCommit`;
   - duplicate production `gitplane-artifact.json` literals where the canonical symbol should be used;
   - old `artifactRoot` arguments to `readMarkerProvenance`;
   - fake commit-fact and provenance fixture shapes.
3. Inspect all remaining marker literals before changing them: expected marker contents in tests are not stale constant usage.
4. Update Objective/spec text only if the final behavior differs from the already-recorded contract. Do not update `CONTEXT.md` because there is no authoritative GitPlane context file yet and this change introduces no new domain vocabulary.

## Refactor execution strategy

This plan contains same-shape TypeScript contract updates across more than five mixed code/test files, so follow `skills/incubating/branch-context/enriched-plan-save/references/refactor-execution-strategy.md` and use **refactor-swarm** rather than an opaque ad hoc replacement script.

Recommended sequence:

1. Make the semantic contract edits (`artifact.ts`, `gateways.ts`, `gather-source-facts.ts`, exports) first in one controlled workstream; these are not a purely syntactic rename and should not be delegated to blind text replacement.
2. Once contracts typecheck far enough to expose callers, partition non-overlapping workstreams:
   - real adapter + sanity command-protocol tests;
   - fake adapter + default fake/Gather tests;
   - real-Git integration tests.
3. Reconcile all workstreams in the shared worktree, run the stale-shape searches above, and use compiler diagnostics as the final caller inventory.
4. No suitable repo-local AST codemod was identified for this semantic union/gateway redesign. If the executor has an AST-aware rename tool, it may use it only for mechanical symbol renames after inspecting the TypeScript AST; the cursor-state and fixture redesign must remain precise semantic edits.
5. Do not use an unreviewed `text.replace()` script across code and tests.

## Validation guidance

Use the repository’s Node 24+/pnpm/TypeScript 7 toolchain. Tests must remain in their existing lanes: fake-driven policy in default tests, injected command protocol in sanity, and actual Git behavior in integration.

During implementation, run focused package checks as useful, then complete at least:

```bash
just ts-format-check
just ts-lint
just ts-check
just ts-test
just ts-test-sanity
just ts-test-integration
just ts-test-typescript-style-guard
just
```

Notes:

- `just` includes sanity but deliberately omits integration and the TypeScript style guard, so those explicit lanes are required here.
- If formatting fails, run `just ts-format-fix`; if lint has autofixable findings, run `just ts-lint-fix`, then rerun checks.
- The default and sanity tests were passing before this remediation (121 default package tests and 26 sanity tests in the prior review session); treat regressions as introduced by this refactor unless repository state changes.
- Do not use module mocks, fake timers, process mutation, or real Git in the default shared-cache lane.

## Risks, assumptions, and open questions

### Risks and mitigations

- **Git pathspec interpretation:** `--` does not disable pathspec magic. Mitigation: invoke Git with `--literal-pathspecs`, centralize root/non-root marker-path construction, and cover a pathspec-magic-looking path.
- **Shallow-history false identity:** a graft boundary can look like the marker’s introduction. Mitigation: fail all requested provenance as `incomplete-history` before examining target history.
- **Reachable merge ambiguity:** checking only whether the target itself is a merge is insufficient. Mitigation: `rev-list --min-parents=2 -1 <target>` detects any reachable merge.
- **Parallel failure collapse:** one outer catch around `Promise.all` could turn one missing marker object into batch-wide unavailability. Mitigation: classify each per-marker subprocess result before aggregation; only operational failures fail the entire gateway call.
- **Duplicate artifact IDs:** result observations do not carry path. Mitigation: preserve one-to-one request order and key fake fixtures by target + ID + path.
- **Root artifact path:** naïve string interpolation creates `/gitplane-artifact.json`. Mitigation: canonical marker-path helper with an explicit empty-path case.
- **Over-validating marker identity:** using `parseArtifactMarker` in Gather would move whole-envelope planner policy into Gather. Mitigation: validate only JSON object + canonical `gpId` for provenance requests and retain raw candidates.
- **Semantic boundary change for marker-named directories:** the plan treats only regular marker files as artifact boundaries. This is intentional review remediation; cover it explicitly so it cannot drift silently.
- **Sanity test growth:** the file is near 1,000 lines. Mitigation: replace the obsolete snapshot-walk protocol section; if it still crosses 1,000 lines, split provenance protocol tests into a focused sanity file before landing.

### Assumptions

- Git object IDs emitted by supported Git versions are lowercase hexadecimal, but object width is not fixed to SHA-1.
- Empty per-marker history output is semantic `incomplete-history`, because Gather only requests provenance for a marker observed at the target and an empty history result therefore cannot prove the required commit.
- Empty marker requests are a no-op and do not validate the target commit.
- The gateway seam preserves request order; canonical ordering is Gather policy, not adapter policy.
- Breaking the newly introduced facts/fake contract is acceptable because GitPlane is unreleased and no downstream planner has landed.
- `artifactRoot` has no remaining interface value once every request carries a validated repository-relative artifact path.

### Open questions

No material requirement remains unresolved. If implementation evidence disproves direct per-path history semantics or reveals a supported Git repository mode not covered here, stop and amend the SPEC/Objective rather than rebuilding snapshot policy inside the adapter.

## Review and remediation checklist

Before declaring the PR ready for re-review, explicitly verify the original review findings:

- **Structural blocker removed:** no full-history snapshot array, no per-commit `ls-tree`/`cat-file` fan-out, and no adapter-side marker JSON decoding.
- **Forged errors removed:** no synthetic stderr/code object used for internal control flow; structured gateway failures retain classification.
- **Shallow correctness fixed:** real shallow integration proof returns `incomplete-history` before materialization facts can be planned.
- **Cursor invariants encoded:** no four-field nullable/correlated gathered cursor shape remains.
- **Marker semantics canonicalized:** one marker constant/path rule and one regular-file boundary predicate are used by touched production flows.
- **Copies clarified:** Gather does not recopy caller-owned gateway snapshots; the fake still protects fixture and output ownership.
- **Ordering owned once:** Gather sorts requests, gateways preserve request order, and identity-unavailable results have an explicit final position.
- **Existing helper completed:** all target-unavailable branches use the common constructor.
- **File-size bar checked:** no touched file is pushed from below 1,000 lines to above 1,000 lines without decomposition.
- **No scope leak:** no planner validation, reconciliation transition policy, durable-store behavior, CLI surface, or public planner interface is added in this branch.
