# Structural/dedup group landed (branches 4-9 of the clinkr-migration stack)

Six branches stacked on `pr-address-ts/schema-routes` complete the Group-3 structural rows: `support-context-hardening`, `shared-thread-modules`, `prep-fetch-split`, `schemas-decomposition`, `classification-decomposition`, `test-scaffolding`. Validation per branch: full TS workspace check + test plus full `just`; all envelope/golden/schema fixtures byte-unchanged except the deliberate deletions and split noted below.

## Required gateways (rows: shared operation-support, required gateways)

- `PrAddressContext.github`/`.git` are required. The `missing_gateway` envelope class, the per-operation two-step guards, the `githubGateway`/`gitGateway` helper indirection, and the repo-context wrapper's git-undefined fail-open arm are deleted. Tests build contexts via a new `fakePrAddressContext` (default in-memory fakes); the omitted-gateway tests are deleted as type-impossible. No fixture contained a `missing_gateway` envelope.
- `APPROVAL_REQUIRED_COMPLEXITIES` has one definition in `feedback-plan-contracts.ts`; `isRecord` lives in `operation-support.ts`; `RESOLUTION_MARKER` has one definition in `reply-formatting.ts`. The row's `errorMessage` helper had already dissolved in the dead-code sweep; the trim helpers landed in `string-values.ts` (below) rather than `operation-support.ts` — the coupling the row targeted is gone either way. The "one exec argv parser" portion dissolved in the clinkr shell migration as predicted.

## Shared thread modules (row: thread-decision engine and shared-module ports)

- `src/string-values.ts` ports `string_values.py`. `trimRequired` is unified on throw-on-null; the silent-empty copies (`stack-feedback-diff-current.ts`, `batch-checkpoint.ts`) were proven unreachable for null/empty inputs (upstream validation and explicit guards), so no envelope changes. Five local trim copies deleted; `read-feedback-detail.ts` keeps its JsonValue-typed variant deliberately.
- `src/stack-feedback-thread-index.ts` ports `stack_feedback_thread_index.py` (frozen index, threadKey, plannedPrNumbers, actionable/known/informational key sets, itemsByThread, otherBatchReviewThreads, duplicateThreadKeys), generic over a structural item type. TS key sets are keyed by a NUL-joined `threadKeyString` since JS sets lack tuple equality. New unit tests port the Python module's cases.
- The decision-validation core (`buildThreadResolutionDecision`) was **not** moved to its own module: it is already shared via import from `resolve-thread-batch-payload.ts`, has a single importer, and its helpers are tightly coupled — extraction would not improve the import graph. The row's "~250-300 duplicated lines" had already been deduplicated by the earlier sharing; this group removed the remaining ad-hoc index/filter duplication.

## Prep fetch split (row: split stack-feedback-prep; resolves the open question)

- Phase 1 fetches all PRs concurrently (per-PR call chain stays sequential, preserving reviews→threads→comments error precedence); failures resolve to the first failure in input order by awaiting all and scanning — never racing. Phase 2 writes artifacts strictly sequentially in stack order, so `PayloadStore` sequence numbers and filenames are byte-identical.
- **Open question resolved: concurrency is on by default.** Consequence: partial-failure disk state may contain no per-PR artifacts where Python had some; stdout/exit/sequence parity is preserved and nothing pinned changes (`stack-feedback-prep` fixture byte-unchanged). A scenario test pins input-order-beats-completion-order with failures on different calls of different PRs.

## Decompositions (row: decompose the two 1k-line files)

- `operation-schemas.ts` (1,276 lines) → `src/operation-schemas/` (`shared`, `github-mirrors`, `manifest-mirrors`, `mutation`, `collection`, `payload`, `classification`, `stack`, `index`). Pure move; only imports/exports changed; acyclic graph; `json-schema-routes` fixtures byte-unchanged.
- `classification-core.ts` (1,331 lines) → `classification-{shared,packet,validation,planning,operations}.ts` along its import-graph seams, acyclic. Judo folded in: exact-once code/message helpers became `verb_prefix` template literals plus one verb-keyed message-template table; `actionItems`/`informationalItems` collapsed into one `partitionPlanItems` pass with shared review/thread/discussion source-field extractors; the `requiredAt` index joins (which live in `stack-feedback.ts`) became zipped pairs and `requiredAt` is deleted. All classification/plan golden and envelope fixtures byte-unchanged.

## Test scaffolding (row: consolidate test scaffolding and align layout)

- New `test/support/run-scenario.ts` (`runScenario` with throwing no-fallback legacy, `runScenarioWithLegacy` recording fake, `fixedClock`), `test/support/temp.ts` (`useTempDirs`), `test/support/golden.ts` (`GOLDEN_V1_ROOT`, `goldenCases`, `readJson`, `normalizePayloadBytes`). Replaced 13 hand-rolled `runCli` wrappers, 8 throwing-legacy copies, 9 temp-dir machines, and the duplicated clock/golden/normalize helpers (~500 scaffolding lines).
- Layout: function-level tests moved `scenario/` → `unit/` (`json-input`, `classification-golden`, `reply-formatting-golden`, `payload-builders-golden`, `json-schema-parity-comparator`); `RealLegacyPrAddressGateway` routing tests moved to `gateways/`. Collected counts verified before/after: 331 → 332 tests (one deliberate split), 21 → 26 files, no orphans.
- `payload-operations` read-feedback-details error cases are order-independent: success and error sweeps are separate tests, each seeding its own payload root; the `not-raw-role` precondition (the summary artifact) is materialized as explicit setup.
- The pinned fake gateway stderr strings are named exported constants in `in-memory-pr-address-gateways.ts`.
- **Coordination (ts-cli-foundation):** `@asdl/clinkr/testing`'s `runForTest` was evaluated and not adopted — every pr-address harness drives `runCli` (cwd/env/stdin/legacy-fallback seam), not a bare `ClinkrGroup`; `parseEnvelope` adoption was skipped because its strict envelope schema is a behavior change local JSON.parse assertions don't need. `@asdl/core/testing`'s `createTempDirTracker` was not adopted because it realpaths temp dirs (macOS `/var` → `/private/var`), a path-shape change pr-address's byte-comparison tests should not absorb incidentally. pr-address keeps package-local support modules; the ownership boundary recorded in ts-cli-foundation's harness row stands.

## Skill-consumer note

No CLI surface changes in this group; the usage-error channel shift was the branches 1-3 group. Skill docs needed no edits beyond what `schema-routes` already scrubbed.
