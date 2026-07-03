# pr-address TS Stack Thermo-Review Follow-Ups

## Thesis

Resolve every blocker and major finding from the 2026-06-12 thermo-nuclear code-quality review of the `pr-address-ts/*` Graphite stack (`pr-address-ts/cli-format-int` through `pr-address-ts/test-scaffolding`, reviewed at commit `147337e28`) as one new Graphite stack of small, independently reviewable branches stacked on top of `pr-address-ts/test-scaffolding`.

All work is behavior-preserving structural cleanup of `ts/packages/pr-address` (plus two tightly bounded `ts/packages/clinkr` documentation/test touches): deleting hand-written mirror types in favor of `z.infer`/`z.input` derivations, replacing the remaining payload cast-laundering with one schema-validated boundary, removing dead ported API, consolidating duplicated helpers onto canonical homes, folding the orphaned `classification-schemas.ts` into `operation-schemas/`, making the parse-schema/doc-schema seam structurally checkable, and splitting `stack-feedback.ts` (947 lines, two operations) before it crosses the repo's 1,000-line ceiling.

This record is designed to be executed autonomously in a single `objective-stack-impl` session using runner subagents: every roadmap row is one branch with an explicit thesis, exact files and symbols, pre-resolved design decisions, and validation evidence requirements. Decision rules are encoded inline so the runner does not need to re-derive the review or ask the user mid-stack.

## Scope

- The verified findings of the 2026-06-12 thermo review of the `pr-address-ts` stack, organized as nine branch slices (see `roadmap.md` for the full executable specs):
  1. Dead-code and dedup sweep (dead thread-index API, dead re-exports, `pythonRepr` ×4, duplicate-detection trio, duplicated constants/helpers, name collisions, stale references).
  2. `loadOperationPayload` resolved-schema validation deleting the four remaining payload casts.
  3. `classification-operations.ts` rethreaded onto the canonical `json-input.ts` loader.
  4. Classification mirror-interface deletion via `z.infer`, plus `satisfies`-typed plan builders.
  5. `classification-schemas.ts` folded into `src/operation-schemas/` with bounded schema convergence.
  6. Payload/result contract typing: `z.input`-derived manifest builder inputs, typed builder returns, golden drift-guards for parity-frozen result schemas, small cast/optionality fixes.
  7. Parse-schema exposure on `ExecOperation` plus a structural parse↔doc schema parity test, table-sortedness assertion, and the `map-branch-prs` doc/CLI surface alignment.
  8. `stack-feedback.ts` three-way pure-move split (contracts / prep / plan).
  9. clinkr comment/doc accuracy fixes and test-scaffolding polish.
- Line numbers cited in roadmap rows are as of commit `147337e28` (`pr-address-ts/test-scaffolding`). Symbol and file names are authoritative; line numbers are hints that may drift.
- Test, fixture, and Objective-record updates needed as evidence for the above.

## Non-Goals

- No behavior changes. The byte-parity envelope contract from `pr-address-typescript-port` is binding: envelope text, artifact write order, exit codes, and golden fixtures stay byte-identical, with exactly two sanctioned, individually attributable fixture updates (the `map-branch-prs` doc-surface alignment in row 7, and the conditional classification template-schema convergence in row 5 — each gated by the decision rules in its row).
- No fixes to the two behavior-adjacent review findings; they are deliberately deferred to the `pr-address-typescript-port` endgame (python-deletion era): surfacing posted-reply evidence on resolve failure in `mutation-operations.ts` (`applyResolution`), and parallelizing the within-PR sequential gateway fetches in `stack-feedback.ts` / `feedback-collection.ts`.
- No clinkr framework redesign or new clinkr features. Only a comment-accuracy fix, a doc comment, and clinkr-local test additions; reusable framework API work belongs to `ts-cli-foundation`.
- No changes to `read-feedback-detail.ts`'s internal `readJsonFile`/JSON-pointer machinery — the parked containment slice in `pr-address-typescript-port` owns that rework; this record only removes its duplicate `pythonRepr`.
- No fixture regeneration beyond the two sanctioned updates; no rewriting of Python-captured parity fixtures.
- No PR submission, no live GitHub writes, no publishing. PR submission is left to the user.
- No edits to `packages/asdl-pr-address` (Python) — it is the frozen in-repo parity reference until the separately owned python-deletion branch lands.

## Completion Criteria

- Zero hand-written interfaces mirroring existing Zod schemas remain for: `FeedbackClassificationValidationResult`, `FeedbackClassificationValidationError`, `FeedbackPlanningResult`, `ManifestKind`, `ClassificationDisposition`, `GetFeedbackPayloadManifestInput`, `PrepareRunPayloadManifestInput`. Each is replaced by `z.infer`/`z.input` derivation or an import of the already-derived type.
- `loadOperationPayload` validates the assembled payload record with a schema before returning; the casts at `json-input.ts` (`resolvedPayload as TPayload`, `resolvedPayload[field.key] as ...`), `stack-feedback.ts` (`payloadResult.value as StackFeedbackPlanInput`), and `stack-feedback-diff-current.ts` (`payloadResult.value as { stack_plan: ...; current_prep: ... }`) are deleted.
- `classification-operations.ts` contains no private re-implementation of JSON input loading: `loadJsonObjectSource`, its copied `jsonParseMessage`, and the `LoadPayloadResult` shape are gone; the module consumes `json-input.ts` exports and `JsonInputResult`.
- `buildStackFeedbackThreadIndex`, its `StackFeedbackThreadIndex` interface, and `selectedBatchReviewThreadItems` are deleted (or the latter has a production consumer); no test-only exports remain in `stack-feedback-thread-index.ts`.
- `src/classification-schemas.ts` no longer exists; its document builders live under `src/operation-schemas/`; exactly one `bodyLocatorSchema` per distinct wire shape and one `JsonSchemaDocument` type (clinkr's) are in use.
- One `pythonRepr` implementation (plus at most one nullable wrapper) exists in the package; one ordered-first-occurrence duplicate-detection helper family exists; `VALID_RESOLUTION_MODES`, `provenanceShapeError`, and `firstDuplicatePayloadThreadId` each have exactly one definition.
- `ExecOperation` exposes its parse schema, and a test asserts per-operation agreement between the clinkr parse-schema surface and the published `--json-schema` document properties, with an explicit, commented allowlist for deliberate parity deltas; `EXEC_OPERATIONS` sortedness is asserted; the `map-branch-prs` document describes the real CLI surface (`branches_json`) or carries an explicit allowlist entry recording why not.
- No source file in `ts/packages/pr-address/src` exceeds 1,000 lines, and `stack-feedback.ts` is split into contracts/prep/plan modules each under ~500 lines, as a pure move with byte-unchanged fixtures.
- The clinkr `parseIntegerValue` comment accurately describes its divergence from click; the `--format` markdown/md aliasing is documented at the option/spec definition.
- Stale references to the deleted `operation-schemas.ts` (in `exec-operation.ts` and `README.md`) and the stale `classification-core.test.ts` filename are fixed.
- `pnpm --dir ts/packages/pr-address run check` and `pnpm --dir ts/packages/pr-address run test` pass on every branch; `pnpm --dir ts run check` and `pnpm --dir ts run test` pass at the stack tip; all golden/envelope fixtures are byte-identical except the sanctioned, individually documented updates.
- An Objective update records the landed stack with per-branch evidence.

## Definition of Progress

Keepable progress deletes concepts without changing behavior:

- A mirror type replaced by a schema-derived type, with the schema as the single source of truth.
- A cast replaced by a runtime-validated boundary that provably cannot change envelope bytes.
- A dead export, duplicate helper, or pass-through wrapper deleted with its tests updated.
- A pure-move decomposition whose fixtures are byte-unchanged.
- A structural test (shape parity, sortedness, empty-corpus guard) that turns a convention into an enforced invariant.

Do not keep changes that:

- Alter envelope text, artifact write order, fixture bytes, or exit codes outside the two sanctioned updates.
- Add new abstractions beyond what deletes existing duplication — the bar is fewer concepts, not rearranged ones.
- Touch `packages/asdl-pr-address` or rewrite Python-captured fixtures.
- Mix unrelated decisions into one branch; each branch carries exactly one thesis from the roadmap.

## Runner Policy

This Objective is execution-friendly for `objective-stack-impl` and `objective-next` across every roadmap row.

- Direct execution after one confirmed stack preview is allowed for all nine rows: they are confined to repository files (`ts/packages/pr-address`, `ts/packages/clinkr` test/doc touches, Objective records) and local validation.
- Build the stack on top of `pr-address-ts/test-scaffolding` using the repo's Graphite workflow (`gt create`, `gt modify`, `gt restack`). If that branch has already merged to `master` when execution starts, base on `master` instead and note it in the Objective update.
- Execute rows strictly in roadmap order: rows 2→3 and 1→8 are hard dependencies; rows 2, 4, and 6 all edit files that row 8 moves, so row 8 must come after them.
- Each row is one branch and one runner-subagent slice. Run one subagent at a time in this worktree. The parent validates per branch before committing: `pnpm --dir ts/packages/pr-address run check` and `pnpm --dir ts/packages/pr-address run test`; rows touching `ts/packages/clinkr` (rows 7 and 9) or shared test infra additionally run `pnpm --dir ts run test`; at the stack tip run `pnpm --dir ts run check` and `pnpm --dir ts run test` (or `just ts-check` / `just ts-test`).
- Fixture rule: any test-fixture diff outside the two sanctioned updates is a failure signal — stop the slice and fix the implementation, do not refresh the fixture. The two sanctioned updates must each land with a commit-message note attributing the exact fixture diff to its decision rule.
- Steer or ask first only when: a decision rule in a row resolves to its "do not converge / allowlist" fallback and the runner believes the primary path is still safe (record instead of asking when the fallback suffices); a slice cannot preserve fixture bytes and is not one of the two sanctioned updates; or material conflicts with sibling stacks (`delete-python-pr-address-package`, `pr-address-group1-group2-stack`) surface during restack.
- Out of scope without explicit user confirmation: PR submission, live GitHub writes, npm/PyPI publishing, edits to the Python package, and any public-contract change beyond the two sanctioned fixture updates.
- Work may be left as committed Graphite branches plus Objective updates. Do not leave generated payload artifacts or uncommitted churn.
- Record one Objective Semantic Update at the end of the stack (or at a stopping point) with per-branch evidence; do not write one update per branch mechanically.

## Assumptions and Risks

Assumptions:

- The 2026-06-12 review findings were verified against commit `147337e28` with file:line evidence, and the highest-conviction findings (cast laundering at `json-input.ts:204,215`, dead thread-index exports, `jsonParseMessage` duplication, `payload-manifest.ts` mirror interfaces, `pythonRepr` ×4) were independently re-verified in the working tree. Line numbers drift as the stack lands; symbols are the durable reference.
- The byte-parity envelope contract from `pr-address-typescript-port` remains binding while `packages/asdl-pr-address` is in-repo. Every slice here is designed to be provably byte-preserving except the two sanctioned fixture updates.
- The assembled-record validation added in row 2 cannot fire for inputs that previously succeeded: each payload part is already individually validated (embedded payloads by `payloadSchema`, references by `referenceSchema`), so a post-assembly mismatch is a programmer error and is encoded as an invariant throw, not a new user-facing envelope.
- The `--json-schema` fixtures for the classification trio (`classification-template`, `validate-feedback-classification`, `plan-feedback`) are TS-captured (the trio is absent from `PARITY_OPERATIONS` in `test/scenario/json-schema-routes.test.ts`), while the `stack-feedback-prep` document embedding the template-result shape is Python-parity-pinned. Row 5's convergence decision rule depends on this; the runner must re-verify it before converging.
- The `map-branch-prs` schema fixture is TS-self-captured (per `json-schema-routes.test.ts`), so aligning its document to the real CLI surface is a TS-owned doc fix, not a Python parity break.

Risks:

- Ownership tension: `pr-address-typescript-port` declares that all `ts/packages/pr-address` work sequences in one roadmap (2026-06-10 consolidation precedent — the previous thermo-review-followups record was absorbed there). This record exists as a separate slug at explicit user request; if the user prefers, fold these rows into the port objective's roadmap instead and archive this slug. Until then, the port objective's endgame branches (`bundle-distribution` onward) should sequence after this stack or rebase over it.
- Sibling-stack conflicts: `delete-python-pr-address-package` (slot-01) and `pr-address-group1-group2-stack` exist as parallel branches off master. If python-deletion lands mid-execution, row decision rules that reference "capture from in-repo Python" lose their reference; fall back to the recorded fixture-preserving paths.
- Schema convergence (row 5) is the riskiest slice: converging two divergent schemas for the same artifact can silently change an emitted document. The row's decision rule gates convergence on byte-evidence; when in doubt, take the fallback (dedupe without convergence) and record the residual divergence as a finding.
- Consolidating `pythonRepr` variants could alter error-message bytes if the variants differ subtly (one is nullable). Mitigation: row 1 requires diffing the four implementations first and keeping a nullable wrapper; fixtures must be byte-identical.
- The parse↔doc schema parity test (row 7) may surface real pre-existing drift beyond `map-branch-prs`. The allowlist mechanism absorbs known deltas; genuinely new drift discovered by the test should be recorded in the Objective update and allowlisted with a comment, not silently fixed in doc schemas (that would be an unsanctioned contract change).

## Open Questions

- clinkr integer acceptance-side parity: click accepts `"+5"`, `" 5 "`, and `"1_000"`; TS `parseIntegerValue` rejects them. Row 9 deliberately keeps the stricter behavior and fixes only the comment. Whether to widen acceptance for true click parity is a parity-arbitration question that must be resolved in `pr-address-typescript-port` before its python-deletion branch.
- Should this record be folded into `pr-address-typescript-port` per the 2026-06-10 consolidation precedent? Created standalone at explicit user request; revisit at stack completion.

## Closure

Completed by the nine-branch Graphite stack from `pr-address-ts/fu-dead-code-dedup` through `pr-address-ts/fu-clinkr-test-polish`, stacked above `refactor-pr-address-thermo-followups` / `pr-address-ts/test-scaffolding`. The stack implements every non-parked roadmap row: dead-code and dedup cleanup, schema-validated payload assembly, canonical classification JSON loading, schema-derived classification and payload contracts, classification schema-route consolidation, exec parse↔doc schema parity, the pure `stack-feedback` module split, and the clinkr/test-support polish.

Verification evidence: each branch passed its required package or workspace validation before commit; the committed stack tip passed `pnpm --dir ts run check` and `pnpm --dir ts run test`. Fixtures remained byte-identical except for the sanctioned `map-branch-prs` JSON-schema fixture update that aligns the TS-owned document with the real `branches_json` CLI surface. The classification trio Python-vs-TS schema comparison produced no diff, so no classification fixture update was needed.

Caveats and follow-ups remain parked in `roadmap.md`: behavior-adjacent mutation/fetch changes, clinkr integer acceptance widening, post-python-deletion schema dedup, comparator deepening, and thread-key ergonomics. PR submission was intentionally not performed by this implementation session.
