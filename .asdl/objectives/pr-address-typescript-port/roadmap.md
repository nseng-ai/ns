# Roadmap

## Work

- [x] Inventory the current public `pr-address` contract.
  - Evidence should include the public skill, README and development docs, `pyproject.toml` console script and plugin entry point, scenario/golden tests, and observed `exec` operation families.
  - Distinguish durable public contract from incidental Python behavior before designing the TypeScript implementation.
  - Policy: read-only inventory and checked-in Objective/doc updates are directly executable.
  - Evidence: `updates/2026-06-09T121838Z-current-contract-inventory.md` records durable invocation, JSON envelope, payload, classification/planning, mutation safety, stack workflow, operation-surface, test/golden contracts, and incidental Python behavior.
- [x] Define the TypeScript migration boundary and package shape for `pr-address`.
  - Decide package name, CLI entry path, ASDL plugin compatibility approach, wrapper dispatch strategy, and what remains private/internal.
  - Policy: package scaffold, wrapper dispatch, direct fallback routing, and compatibility docs are directly executable; npm publishing and plugin replacement require an explicit later cutover decision.
  - Evidence: `updates/2026-06-09T124800Z-typescript-boundary-scaffold.md` records the `@asdl/pr-address` package scaffold, standalone-only TypeScript CLI boundary, local TS-default wrapper, direct Python fallback for unported operations, and deferred plugin/prod cutover.
- [x] Identify the minimal command-runtime and schema seams needed by the first operation slice.
  - Keep the design incremental; do not design a broad clinkr replacement before the slice proves repeated needs.
  - First port slice: `pr-address exec classification-template`.
  - Minimal runtime seams: local operation registry with per-operation fallback, Clinkr-compatible machine envelope, JSON input-source helper, eager `--json-schema`, and CLI test stdin injection.
  - Minimal schema seams: compact payload/feedback manifests, manifest view, classification-template packet, counts, and Python/Pydantic-compatible explicit `null` fields where goldens expose them.
  - Policy: this row is complete enough for execution; refine details during the first port rather than pausing for broader framework design.
  - Evidence: `updates/2026-06-09T134424Z-execution-policy-and-first-slice-seams.md` records the execution policy and the first-slice seam decision.
- [x] Port `classification-template` as the first TypeScript operation slice.
  - Add only local operation-runtime and schema helpers needed by this operation: registry/fallback dispatch, JSON envelope output, JSON input-source handling, `--json-schema`, manifest schemas/views, and classification-template output construction.
  - Preserve Python/Pydantic output compatibility intentionally, including explicit `null` fields where current goldens or schema probes require them.
  - Policy: directly executable after preview. Do not extract a shared command-runtime package in this row.
  - Evidence: `updates/2026-06-09T150509Z-classification-core-parity.md` records TypeScript-managed `classification-template` behavior, existing golden parity, stdin/inline/file scenario coverage, schema emission, and continued fallback for unrelated operations.
  - Earlier progress evidence: `updates/2026-06-09T145038Z-runtime-schema-seams.md` records the local TypeScript operation registry/fallback, stdin/JSON input seams, Clinkr-compatible envelope helpers, local Zod schema emission, targeted package validation, and the deliberate deferral of full `classification-template` output parity to the next slice.
- [x] Port validation and deterministic planning on top of the first-slice seams.
  - Port `validate-feedback-classification` and `plan-feedback` after `classification-template` proves the manifest/view/schema boundary.
  - Preserve exact-once accounting, fail-closed validation, ordered batch semantics, and approval-required markers for cross-cutting/complex work.
  - Policy: directly executable after preview when it reuses the local seams; ask before changing classification schema semantics.
  - Evidence: `updates/2026-06-09T150509Z-classification-core-parity.md` records TypeScript-managed `validate-feedback-classification` and `plan-feedback`, golden parity over the existing fixture suites, and targeted package validation.
  - Contract hardening evidence: `updates/2026-06-09T171450Z-canonical-contracts-and-fallback-retirement-readiness.md` records canonical Zod manifest/plan contract modules, typed plan item variants, schema-document ownership for `plan-feedback`, and preservation of existing runtime JSON shapes.
- [x] Port payload/detail/finalization helpers that do not require live GitHub mutation.
  - Cover payload manifest readers/builders, selected feedback detail lookup, resolve-batch payload builders, checkpoint recording, finalization summaries, and stack plan/diff builders where they can be driven by fixtures or fakes.
  - Policy: directly executable after preview with fake filesystem/process gateways. Ask before changing artifact layout or payload defaults.
  - Evidence should include fake-driven tests plus golden/contract parity for payload manifests, batch payloads, checkpoints, finalization, and stack planning/diff outputs.
  - Progress evidence: `updates/2026-06-09T152041Z-payload-finalize-helper-parity.md` records TypeScript parity for payload manifest builders, selected feedback detail lookup, resolve-thread batch payloads, checkpoint calculation helpers, and finalization summaries; artifact-writing and stack-wide helpers remain fallback-backed until their filesystem/stack contracts are ported safely.
  - Contract hardening evidence: `updates/2026-06-09T171450Z-canonical-contracts-and-fallback-retirement-readiness.md` records that downstream consumers now compose canonical plan/manifest schemas where compatible, with legacy-broader parsing kept explicit for consumer paths.
  - Completion evidence: `updates/2026-06-09T195714Z-payload-store-and-full-operation-port.md` records the ported payload artifact store, TS-managed `read-feedback-details`, `record-batch-checkpoint` artifact writing, and stack plan/payload builders with byte-for-byte Python parity fixtures.
- [x] Port GitHub/git-backed read-only feedback collection behind adapter-neutral gateways.
  - Cover current-branch PR lookup, reviews, review comments, discussion comments, `get-feedback`, `prepare-run`, and compact payload artifacts.
  - Use capability-shaped gateways and in-memory fakes for git, GitHub, filesystem, process, and payload behavior.
  - Policy: directly executable after preview for fake-driven behavior and safe read-only smoke probes. Ask before adding Graphite-specific runtime dependencies outside explicitly Graphite-named stack inputs.
  - Evidence should include fake-driven unit/scenario tests, compact payload parity, and limited safe real-adapter smoke evidence when useful.
  - Progress evidence: `updates/2026-06-09T153238Z-readonly-gateway-stack-diff.md` records adapter-neutral GitHub/git gateways, TypeScript-managed read-only fetch operations, inline `get-feedback`, and `stack-feedback-diff-current` transformation coverage; artifact-writing `get-feedback`, `prepare-run`, `stack-feedback-prep`, and `stack-feedback-plan` remain fallback-backed.
  - Completion evidence: `updates/2026-06-09T195714Z-payload-store-and-full-operation-port.md` records TS-managed payload-mode `get-feedback`, `prepare-run` (contested-thread reopen via the TS mutation gateway, restructured-files via the git gateway), `summarize-feedback`, and the stack orchestration trio; no exec operation executes via Python fallback.
- [x] Port mutation/reply helpers without weakening safety gates.
  - Cover reply builders, thread resolution/unresolution helpers, issue comments, reactions, review-thread replies, batch resolution, and stack resolution payload generation.
  - Preserve validation-before-action semantics, explicit decision requirements, durable resolution modes, planned provenance validation, and no-push behavior.
  - Policy: builder and fake mutation paths are directly executable after preview. Live GitHub writes require explicit user confirmation for the exact operation and target.
  - Evidence: `updates/2026-06-09T154839Z-mutation-safety-fake-gateways.md` records reply formatting parity, fake-backed mutation gateway operations, validation-before-action tests, planned provenance validation, and the explicit absence of live GitHub write probes.
- [~] Cut over public skill, wrapper, plugin, and distribution paths to TypeScript default.
  - Decided 2026-06-09: installed/prod mode executes a bundled JavaScript artifact shipped inside the installed skill (no npm publish), and the `asdl pr-address ...` plugin is retired outright. The current prod `uvx` pin (`0.1.0`) was never published and is broken; the rollback reference is PyPI `asdl-pr-address==0.1.1`.
  - Policy: docs, wrapper behavior and tests, bundle build machinery, local checkout behavior, and plugin retirement are directly executable after preview. Live npm/PyPI publishing and pushing installed-skill artifacts to external stores remain out of scope.
  - Evidence should include wrapper local/prod checks, installed-skill compatibility evidence where practical, and documentation updates.
  - Progress evidence: `updates/2026-06-09T155412Z-cutover-retirement-playbook.md` records local TypeScript operation status, wrapper alias coverage, public docs/playbook updates, and explicit deferral of npm/prod/plugin cutover decisions.
- [x] Fix CLI argument compat gaps: `--format=json` and strict integer parsing.
      Group 1 — Python-reference-dependent; must land before the endgame `python-deletion` branch. Centralize `--format` handling once in `cli.ts` (both `--format json` and `--format=json`), stripping it before handlers; replace `Number()` coercion with strict `/^-?\d+$/` parsing in `summarize-feedback.ts` and `feedback-collection.ts` so `1e2`/`0x10` are usage errors as in click. These are parity corrections toward Python behavior, not contract changes.
- [x] Test hardening while the Python reference is in-repo.
      Group 1 — Python-reference-dependent; must land before the endgame `python-deletion` branch. Real-gateway tests for `RealPrAddressGitHubGateway`/`RealPrAddressGitGateway` via scripted `ProcessRunner` (lookup-miss vs failure, GraphQL errors, `comments.nodes`, non-numeric ids, restructure lines); known-mismatch tests for the `json-schema-parity.ts` comparator. Fixture regeneration, drift detection, and provenance stamps are deliberately dropped from this Objective.
- [x] Canonical contracts modules and `unknown`-seam removal.
      Group 1 — Python-reference-dependent; parity arbitration needs the in-repo reference. One Zod definition per wire shape (stack-plan via the compositional `stack-feedback-diff-current` pattern; checkpoint contracts shared by producer and `finalization.ts`; compact summaries; classification template unified across its two contradictory routes); producers typed with `z.infer`; type the payload-manifest builders against gateway domain types; typed `FinalizeRunResult`; drop the double-parses; replace the `mode as ResolutionMode` cast with a guard. Evidence: json-schema route parity fixtures unchanged. The reference-validation rule in group 2 resolves the duplicated `stackPlanReferenceShapeSchema` and satisfies part of this row.
- [x] Shared XOR-source resolver in `json-input.ts`.
      Group 2 — payload/reference consolidation. Promote `resolveDiffInput` (rename, add `commandName` param), migrate `stack-feedback-plan`, `stack-feedback-diff-current`, and `build-stack-resolve-thread-payloads` onto it; delete `resolvePlanPrepInput` and the inline block; error messages generated in one place. Evidence: pr-address suite green; envelope fixtures unchanged except unified message templates.
- [x] One reference-validation and diagnostics rule.
      Group 2 — payload/reference consolidation. Decide the shape-layer open question (delete vs canonical single definition), apply it to all three reference options, and make `loadArtifactReference` failure diagnostics consistent with the embedded-path `z.prettifyError` output. Resolves the duplicated `stackPlanReferenceShapeSchema` copies (also satisfies part of the canonical-contracts row).
- [x] Declarative per-operation payload spec.
      Group 2 — payload/reference consolidation. Package-local `loadOperationPayload(invocation, { commandName, payloadSchema, fields })` consuming the shared resolver; owns source-count rejection, payload-optionality when all fields are reference-backed, and reference loading; the reference-backed operations declare specs instead of orchestrating. Keep the spec clinkr-compatible (snake_case keys, `--<key>-reference` derivation), but do not extract it into `@asdl/clinkr` unless a later second consumer proves the seam.
      Review follow-up evidence: `updates/2026-06-12T170434Z-payload-cast-laundering-removed.md` records the PR #1350 removal of the broad empty-payload generic cast and prepare-run manifest test double-cast laundering without changing this row's completed status.
- [x] Document and pin the stdin edge for fully reference-backed inputs.
      Group 2 — payload/reference consolidation. Piping a payload while passing all reference options silently ignores stdin instead of rejecting it as a mixed source — the only place mixing is tolerated. Document in the CLI reference and pin with a scenario test.
- [x] Dead-code sweep.
      Group 3 — structural/dedup. Deleted `LEGACY_EXEC_OPERATIONS`, `isTsManaged`, the `raw-exit` dispatch variant, `isActionComplexity`, `getFeedbackInlineResultSchema` (feedback-collection copy), `validResolutionModesText`, `stackFeedbackPrFixture`, the verbatim `parseOptions` copy in `classification-core.ts`, and unreachable `--json-schema` skip branches; pruned speculative `index.ts` barrel exports to the real embedding contract. `writeTextArtifact` was retained because the payload store still owns log artifact parity and lookup-negative coverage. Evidence: `updates/2026-06-12T171157Z-dead-code-sweep.md`; `pnpm --dir ts/packages/pr-address run check`; `pnpm --dir ts/packages/pr-address run test`.
- [ ] Shared operation-support layer.
      Group 3 — structural/dedup. Move `githubGateway`/`gitGateway` (one return shape), `gatewayOptions`, `gatewayFailure*`, `trimOptional`, `errorMessage`, `isRecord` into a support module so features stop importing from `feedback-collection.ts`; single `RESOLUTION_MARKER`; `APPROVAL_REQUIRED_COMPLEXITIES` moves to `feedback-plan-contracts.ts`. The "one exec argv parser" portion of the original row is expected to dissolve in the clinkr shell migration — keep it only if this row is sequenced before that migration.
- [x] Single operation table driving dispatch, schema routing, and help.
      Group 3 — structural/dedup. Merge the registry definitions, `SCHEMA_DOCUMENT_BUILDERS`, and the hardcoded `execHelp()` list into one `{ name, handler, schemaDocument }` table with `satisfies` enforcement of handler-schema 1:1; `--json-schema` routes through the same table as dispatch.
      Completion evidence: `updates/2026-06-12T201417Z-clinkr-shell-migration.md` — `src/exec-commands.ts` is the single table (dispatch, `--json-schema` via the clinkr `schemaDocument` override, and commander-generated help all derive from it); the table↔builder 1:1 contract is enforced by unit test plus a registration-time throw in `defineExecOperation` rather than `satisfies`.
- [ ] Make `PrAddressContext` gateways required; delete the `missing_gateway` branch class.
      Group 3 — structural/dedup. Remove the optionality on `github`/`git`, the per-operation two-step guards, and the synthetic `missing_gateway` envelope; convert the one omitted-gateway test to in-memory fakes.
- [ ] Decompose the two 1k-line files.
      Group 3 — structural/dedup. `operation-schemas.ts` (1,322) into a per-domain `operation-schemas/` directory importing the canonical contracts; `classification-core.ts` (1,316) into packet/validation/planning/operations modules along its existing import-graph seams. Fold in the local judo moves: identity-function code/message helpers become template literals/tables, plan builders collapse to one partition pass with shared source-field extractors, `requiredAt` index joins become per-element joins.
- [ ] Shared thread-decision engine and Python shared-module ports.
      Group 3 — structural/dedup. Extract the decision-validation/application core duplicated (~250-300 lines) between `resolve-thread-batch-payload.ts` and `stack-resolve-thread-payloads.ts`, parameterized by subject identity; port `stack_feedback_thread_index` and `string_values` equivalents; eliminate the `trimRequired` silent-empty divergence in `stack-feedback-diff-current.ts`. Evidence: envelope byte-parity fixtures unchanged.
- [ ] Split `stack-feedback-prep` into parallel fetch planning and ordered artifact writes.
      Group 3 — structural/dedup. Phase 1 fetches per-PR data concurrently (first failure in input order wins); phase 2 writes artifacts sequentially in stack order so sequence numbers stay byte-identical. Decide flip-on timing per the open question.
- [ ] Consolidate test scaffolding and align test layout.
      Group 3 — structural/dedup. Shared `run-scenario`/`temp`/`golden` support modules replacing the six hand-rolled CLI harnesses and repeated temp-dir/clock/golden helpers (~300 lines); move function-level golden tests from `test/scenario/` to `test/unit/` and legacy-gateway tests to `test/gateways/` per the repo layout convention; make `payload-operations` error cases order-independent; name the fake error-string constants the envelope fixtures depend on. Coordinate with `ts-cli-foundation`'s test-harness consolidation row.
- [x] Migrate the `pr-address` CLI shell to `@asdl/clinkr`.
      Ownership transferred from `ts-cli-foundation` on 2026-06-12. This record owns the consumer migration: build the `pr-address` command tree through `@asdl/clinkr`, preserve legacy-Python fallback dispatch until the retirement rows, keep package-specific payload/reference behavior local, and coordinate only reusable framework gaps back to `ts-cli-foundation`. Sequence after the group-2 payload spec and before the endgame's `schema-routes`/`bundle-distribution` branches as evidence allows.
      Completion evidence: `updates/2026-06-12T201417Z-clinkr-shell-migration.md` — all 20 exec operations are clinkr command specs with `(ctx, request)` handlers; unknown-operation legacy fallback preserved; value-based fallback collapsed to strict-enum usage errors; the three reusable framework gaps (strict int, 4-choice `--format`, `schemaDocument` override) landed in `@asdl/clinkr` (`pr-address-ts/clinkr-parity-extensions`).
- [ ] Retire active Python fallback paths and fully delete `packages/asdl-pr-address`.
  - Decided 2026-06-09: the end state is full in-repo deletion within the endgame stack, gated on all operations being TypeScript-managed, all `--json-schema` routes TypeScript-owned, wrapper/bundle cutover landed, plugin retirement landed, and docs/tests free of Python invocation paths. PyPI `asdl-pr-address==0.1.1` is the external frozen rollback after deletion.
  - Policy: per-operation fallback removal and the final gated deletion are directly executable within the endgame stack once the listed gates are evidenced in earlier branches; outside that stack context, ask before broad deletion.
  - Evidence should include operation parity coverage, wrapper/distribution cutover evidence, and docs showing no active invocation path depends on the retired Python surface.
  - Current evidence: `updates/2026-06-09T155412Z-cutover-retirement-playbook.md` documents why broad Python fallback retirement is still blocked by installed/prod wrapper, plugin, artifact-writing, stack orchestration, and schema-route compatibility requirements.
  - Updated readiness evidence: `updates/2026-06-09T171450Z-canonical-contracts-and-fallback-retirement-readiness.md` confirms Python is still present and still required for unported operations, public schema fallback routes, installed/prod wrapper mode, rollback, and the `asdl pr-address ...` plugin; broad deletion is not ready.
- [ ] Feed lessons into the umbrella porting playbook.
  - Record reusable migration guidance for later `brmem`, `handoff`, `objective`, and other capability ports.
  - Policy: directly executable after enough repeated evidence exists; do not generalize from only one operation slice.
  - Evidence should include concrete seams proven by `pr-address`, portability limits, and guidance for when future ports should avoid or reuse the same patterns.

## Endgame Stack

The first stack (runtime-schema through cutover-retirement-playbook) landed; its plan is recorded in `updates/`. This endgame stack covers all remaining Objective work and is designed to be executed in a single multi-agent session under the Runner Policy plus the 2026-06-09 Decided entries. Every branch is directly executable; the only standing exclusions are live GitHub write probes, registry publishing (npm or PyPI), and PR submission unless separately confirmed.

Default branch sequence:

1. `payload-store` — landed as `pr-address-ts/payload-store`.
   - Thesis: port the payload artifact store (Python `asdl_core.payloads`) to TypeScript behind the filesystem gateway: `ASDL_PAYLOAD_ROOT`/`ASDL_PAYLOAD_SESSION_ID` session resolution, `{root}/{session}/artifacts/` layout, `{descriptor}--{role}.json` naming, and session metadata. Fake-driven tests plus parity probes against Python-written artifacts. Keystone for every later branch.
   - Landed note: the actual Python store contract is `{root}/sessions/{session-id}/payloads/` with timestamped `{stamp}-{seq}-{descriptor}.{role}.{ext}` names and no session-metadata files; the port follows the real source, not this row's earlier description.
2. `payload-operations` — landed as `pr-address-ts/payload-operations`.
   - Thesis: make default payload-mode `get-feedback`, `read-feedback-details` (plural), and `record-batch-checkpoint` artifact writing TypeScript-managed using the store; golden/contract parity against Python artifact output.
3. `prepare-run-summarize` — landed as `pr-address-ts/prepare-run-summarize`.
   - Thesis: port `prepare-run` (contested-thread reopen via the existing TypeScript mutation gateway, restructured-files via the git gateway, payload/inline modes) and `summarize-feedback` (deterministic excerpt/automation-marker heuristics). Fake-validated only; no live writes.
4. `stack-orchestration` — landed as `pr-address-ts/stack-orchestration` (kept as one branch; the optional prep/plan vs payload-building split was not needed for thesis clarity).
   - Thesis: port `stack-feedback-prep`, `stack-feedback-plan`, and `build-stack-resolve-thread-payloads` on the store plus the already-ported planning/classification core. No Graphite dependency. The parent may split this into two adjacent branches (prep/plan vs payload building) for review size.
5. `clinkr-shell` — landed as `pr-address-ts/clinkr-parity-extensions` + `pr-address-ts/clinkr-shell`.
   - Thesis: migrate the `pr-address` command shell to `@asdl/clinkr` while preserving fallback dispatch and package-local payload/reference behavior. Reusable framework gaps route back to `ts-cli-foundation`; package-specific compatibility fallout stays here.
   - Landed note: the framework gaps (strict int, 4-choice `--format`, `schemaDocument` override) landed in `@asdl/clinkr` directly under this Objective's stack; value-based legacy fallback (bogus `--payload-mode`/`--stdout-mode`) deliberately collapsed to strict-enum usage errors, and repeated `--format` adopted commander last-wins after probing the Python CLI (also last-wins).
6. `schema-routes` — landed as `pr-address-ts/schema-routes`.
   - Thesis: make every remaining `pr-address exec ... --json-schema` route TypeScript-owned (structured semantic parity), removing the schema fallback dependency.
   - Landed note: all 20 routes were already TS-owned after `clinkr-shell` (the `schemaDocument` override serves the pinned builders); this branch added the total-coverage guard tying the routes sweep to the operation table and scrubbed docs that still claimed click usage errors render through Python.
7. `bundle-distribution`
   - Thesis: add bundle build machinery producing a self-contained JavaScript artifact inside the installed skill; wrapper prod mode executes the bundle; `legacy-python` rollback mode becomes `uvx --from asdl-pr-address==0.1.1` (the broken unpublished `0.1.0` pin is removed); wrapper tests and public docs updated. Building the bundle locally is in scope; publishing anything externally is not.
8. `plugin-retirement`
   - Thesis: remove the `asdl pr-address ...` plugin entry point, plugin module, and asdl-scope plugin smoke test; update docs to name the standalone CLI as the only invocation surface.
9. `python-deletion`
   - Thesis: remove fallback dispatch from the TypeScript CLI, delete `packages/asdl-pr-address` and asdl-core surfaces that become unused, and scrub workspace/config/test references. Validate with full repo checks, not just the TS package.
   - Guard (2026-06-10 absorption): gated on the group-1 Python-reference-dependent rows being complete — parity corrections, test hardening with fixture regeneration/provenance, and canonical-contracts parity arbitration. Deleting the in-repo reference before they land makes them substantially more expensive or impossible to verify.
10. `playbook`
    - Thesis: feed proven seams, portability limits, and bundle/retirement lessons into the umbrella porting playbook; record final Objective evidence.

Planning guidance:

- Keep the branch order; the parent may merge or split adjacent branches when dependency inspection produces a cleaner review boundary.
- Runners decide local implementation details; the parent verifies parity evidence per branch; ask the user only at the standing exclusions (live GitHub writes, registry publishing, PR submission, scope changes to public JSON shapes).
- Treat existing golden JSON outputs as byte-for-byte parity targets where practical; treat generated `--json-schema` documents as structured semantic parity unless existing tests/docs assert exact formatting.
- Preserve Python/Pydantic explicit-`null` compatibility details wherever goldens or schema probes expose them.
- Branches 1-6 validate with `pnpm --dir ts/packages/pr-address run check` and `run test` plus targeted golden/parity probes; branch 7 adds wrapper tests and dprint for docs; branches 8-9 broaden to full `just` because they remove Python packages, plugin wiring, and asdl-scope tests.
- Capture parity fixtures from the Python implementation in early branches while it still exists in-repo; after branch 9 the reference is PyPI `0.1.1` and checked-in fixtures.
- Record Objective Semantic Updates per meaningful branch group or durable decision point, not mechanically per branch.

## Parked

- npm registry publishing of `@asdl/pr-address` — superseded by the bundled installed-skill distribution decision; revisit only if a registry consumer appears.
- Restore `read-feedback-detail` (singular) Python containment parity — defer until the package-local payload/reference consolidation and pr-address clinkr-shell migration can simplify this containment boundary. Original slice: rewrite `readFeedbackDetail` as a thin composition of the plural op's existing helpers (`readRawClinkrEnvelope`, `resolvePayloadJsonPointer`, `detailKindForPointer`); delete the bespoke `readJsonFile`, local `resolveJsonPointer`, `isJsonValue`, `JsonValue`, duplicate `pythonRepr`; move the scenario fixture to a contained `sessions/<id>/payloads/` path and assert Python rejection messages for relative path, symlink, and uncontained-dir cases.
- Discriminated classified-item union narrowing after validation (deletes `requiredActionComplexity` throw and nullable-complexity plumbing) — revisit after the decomposition row lands.
- Post-cutover fixture simplification: replace byte-exact `expected_envelope_text` comparisons with structural equality plus one byte-format test per emitter, and delete the parity comparator + captured fixtures alongside the Python package retirement. Solely owned here as of the 2026-06-10 consolidation.
- Spec-driven generation of option allowlists and `--json-schema` request documents from the payload spec (the former payload-reference #5b) — dissolves into this record's pr-address clinkr-shell migration rather than landing standalone. It should remain package-local unless a later second consumer proves a shared clinkr seam.
- Full public API shape for a shared JS/TS clinkr-style framework until repeated seams prove it.
- Direct browser execution for workflows that depend on local git, shell, filesystem, or authenticated GitHub state.
- Broad TypeScript rewrites of Python `asdl-core` concepts not needed by this vertical slice.
- User-facing workflow redesigns beyond explicit compatibility decisions.
