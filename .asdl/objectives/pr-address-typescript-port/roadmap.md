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
- [x] Cut over public skill, wrapper, plugin, and distribution paths to TypeScript default.
  - Decided 2026-06-09: installed/prod mode executes a bundled JavaScript artifact shipped inside the installed skill (no npm publish), and the `asdl pr-address ...` plugin is retired outright. The current prod `uvx` pin (`0.1.0`) was never published and is broken; the rollback reference is PyPI `asdl-pr-address==0.1.1`.
  - Policy: docs, wrapper behavior and tests, bundle build machinery, local checkout behavior, and plugin retirement are directly executable after preview. Live npm/PyPI publishing and pushing installed-skill artifacts to external stores remain out of scope.
  - Evidence should include wrapper local/prod checks, installed-skill compatibility evidence where practical, and documentation updates.
  - Progress evidence: `updates/2026-06-09T155412Z-cutover-retirement-playbook.md` records local TypeScript operation status, wrapper alias coverage, public docs/playbook updates, and explicit deferral of npm/prod/plugin cutover decisions.
  - Completion evidence: `updates/2026-06-09T210900Z-schema-bundle-plugin-deletion-cutover.md` records TS-owned schema routes, the deterministic checked-in bundle with prod wrapper cutover, the 0.1.1 rollback pin, and outright plugin retirement.
- [x] Retire active Python fallback paths and fully delete `packages/asdl-pr-address`.
  - Decided 2026-06-09: the end state is full in-repo deletion within the endgame stack, gated on all operations being TypeScript-managed, all `--json-schema` routes TypeScript-owned, wrapper/bundle cutover landed, plugin retirement landed, and docs/tests free of Python invocation paths. PyPI `asdl-pr-address==0.1.1` is the external frozen rollback after deletion.
  - Policy: per-operation fallback removal and the final gated deletion are directly executable within the endgame stack once the listed gates are evidenced in earlier branches; outside that stack context, ask before broad deletion.
  - Evidence should include operation parity coverage, wrapper/distribution cutover evidence, and docs showing no active invocation path depends on the retired Python surface.
  - Current evidence: `updates/2026-06-09T155412Z-cutover-retirement-playbook.md` documents why broad Python fallback retirement is still blocked by installed/prod wrapper, plugin, artifact-writing, stack orchestration, and schema-route compatibility requirements.
  - Updated readiness evidence: `updates/2026-06-09T171450Z-canonical-contracts-and-fallback-retirement-readiness.md` confirms Python is still present and still required for unported operations, public schema fallback routes, installed/prod wrapper mode, rollback, and the `asdl pr-address ...` plugin; broad deletion is not ready.
  - Completion evidence: `updates/2026-06-09T210900Z-schema-bundle-plugin-deletion-cutover.md` records the gated full deletion of `packages/asdl-pr-address`, TS fallback dispatch removal, TS-native usage-error envelopes, golden fixture relocation into the TS package, and full repo gate verification.
- [x] Feed lessons into the umbrella porting playbook.
  - Record reusable migration guidance for later `brmem`, `handoff`, `objective`, and other capability ports.
  - Policy: directly executable after enough repeated evidence exists; do not generalize from only one operation slice.
  - Evidence should include concrete seams proven by `pr-address`, portability limits, and guidance for when future ports should avoid or reuse the same patterns.
  - Completion evidence: `docs/typescript-porting-playbook.md` (indexed in `docs/README.md`) records the vertical-slice porting shape, parity discipline, gateway/fake seams, bundle distribution, retirement sequencing, and portability limits proven by this port; command-runtime extraction is explicitly deferred to a second capability port. Recorded in `updates/2026-06-09T211507Z-umbrella-porting-playbook.md`.

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
5. `schema-routes` — landed as `pr-address-ts/schema-routes`.
   - Thesis: make every remaining `pr-address exec ... --json-schema` route TypeScript-owned (structured semantic parity), removing the schema fallback dependency.
   - Landed note: the classification trio kept its already-shipped TS schema documents, exempted from the structural parity bar with Python fixtures checked in for a future tightening pass.
6. `bundle-distribution` — landed as `pr-address-ts/bundle-distribution`.
   - Thesis: add bundle build machinery producing a self-contained JavaScript artifact inside the installed skill; wrapper prod mode executes the bundle; `legacy-python` rollback mode becomes `uvx --from asdl-pr-address==0.1.1` (the broken unpublished `0.1.0` pin is removed); wrapper tests and public docs updated. Building the bundle locally is in scope; publishing anything externally is not.
7. `plugin-retirement` — landed as `pr-address-ts/plugin-retirement`.
   - Thesis: remove the `asdl pr-address ...` plugin entry point, plugin module, and asdl-scope plugin smoke test; update docs to name the standalone CLI as the only invocation surface.
8. `python-deletion` — landed as `pr-address-ts/python-deletion`.
   - Thesis: remove fallback dispatch from the TypeScript CLI, delete `packages/asdl-pr-address` and asdl-core surfaces that become unused, and scrub workspace/config/test references. Validate with full repo checks, not just the TS package.
   - Landed note: the wrapper's `python-local` mode was removed with the package; the three click usage-error cases now emit TS-native `invalid_request` envelopes; golden contract fixtures moved into the TS package as the durable post-deletion reference; `asdl_core.payloads` was kept (aretro consumers) while `asdl_core.clinkr.json_input` was deleted (zero remaining importers).
9. `playbook` — landed as `pr-address-ts/playbook`.
   - Thesis: feed proven seams, portability limits, and bundle/retirement lessons into the umbrella porting playbook; record final Objective evidence.

Planning guidance:

- Keep the branch order; the parent may merge or split adjacent branches when dependency inspection produces a cleaner review boundary.
- Runners decide local implementation details; the parent verifies parity evidence per branch; ask the user only at the standing exclusions (live GitHub writes, registry publishing, PR submission, scope changes to public JSON shapes).
- Treat existing golden JSON outputs as byte-for-byte parity targets where practical; treat generated `--json-schema` documents as structured semantic parity unless existing tests/docs assert exact formatting.
- Preserve Python/Pydantic explicit-`null` compatibility details wherever goldens or schema probes expose them.
- Branches 1-5 validate with `pnpm --dir ts/packages/pr-address run check` and `run test` plus targeted golden/parity probes; branch 6 adds wrapper tests and dprint for docs; branches 7-8 broaden to full `just` because they remove Python packages, plugin wiring, and asdl-scope tests.
- Capture parity fixtures from the Python implementation in early branches while it still exists in-repo; after branch 8 the reference is PyPI `0.1.1` and checked-in fixtures.
- Record Objective Semantic Updates per meaningful branch group or durable decision point, not mechanically per branch.

## Parked

- npm registry publishing of `@asdl/pr-address` — superseded by the bundled installed-skill distribution decision; revisit only if a registry consumer appears.
- Full public API shape for a shared JS/TS clinkr-style framework until repeated seams prove it.
- Direct browser execution for workflows that depend on local git, shell, filesystem, or authenticated GitHub state.
- Broad TypeScript rewrites of Python `asdl-core` concepts not needed by this vertical slice.
- User-facing workflow redesigns beyond explicit compatibility decisions.
