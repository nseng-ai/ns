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
- [ ] Port `classification-template` as the first TypeScript operation slice.
  - Add only local operation-runtime and schema helpers needed by this operation: registry/fallback dispatch, JSON envelope output, JSON input-source handling, `--json-schema`, manifest schemas/views, and classification-template output construction.
  - Preserve Python/Pydantic output compatibility intentionally, including explicit `null` fields where current goldens or schema probes require them.
  - Policy: directly executable after preview. Do not extract a shared command-runtime package in this row.
  - Evidence should include golden parity for the existing `classification-template` fixtures plus scenario coverage for stdin, inline JSON, file JSON, invalid JSON, source conflicts, fallback behavior for unported operations, and `--json-schema`.
- [ ] Port validation and deterministic planning on top of the first-slice seams.
  - Port `validate-feedback-classification` and `plan-feedback` after `classification-template` proves the manifest/view/schema boundary.
  - Preserve exact-once accounting, fail-closed validation, ordered batch semantics, and approval-required markers for cross-cutting/complex work.
  - Policy: directly executable after preview when it reuses the local seams; ask before changing classification schema semantics.
  - Evidence should include existing golden fixtures and scenario coverage for valid, invalid, incomplete, informational, and planned/pre-existing cases.
- [ ] Port payload/detail/finalization helpers that do not require live GitHub mutation.
  - Cover payload manifest readers/builders, selected feedback detail lookup, resolve-batch payload builders, checkpoint recording, finalization summaries, and stack plan/diff builders where they can be driven by fixtures or fakes.
  - Policy: directly executable after preview with fake filesystem/process gateways. Ask before changing artifact layout or payload defaults.
  - Evidence should include fake-driven tests plus golden/contract parity for payload manifests, batch payloads, checkpoints, finalization, and stack planning/diff outputs.
- [ ] Port GitHub/git-backed read-only feedback collection behind adapter-neutral gateways.
  - Cover current-branch PR lookup, reviews, review comments, discussion comments, `get-feedback`, `prepare-run`, and compact payload artifacts.
  - Use capability-shaped gateways and in-memory fakes for git, GitHub, filesystem, process, and payload behavior.
  - Policy: directly executable after preview for fake-driven behavior and safe read-only smoke probes. Ask before adding Graphite-specific runtime dependencies outside explicitly Graphite-named stack inputs.
  - Evidence should include fake-driven unit/scenario tests, compact payload parity, and limited safe real-adapter smoke evidence when useful.
- [ ] Port mutation/reply helpers without weakening safety gates.
  - Cover reply builders, thread resolution/unresolution helpers, issue comments, reactions, review-thread replies, batch resolution, and stack resolution payload generation.
  - Preserve validation-before-action semantics, explicit decision requirements, durable resolution modes, planned provenance validation, and no-push behavior.
  - Policy: builder and fake mutation paths are directly executable after preview. Live GitHub writes require explicit user confirmation for the exact operation and target.
  - Evidence should include fake-driven mutation-gateway tests, payload/golden parity, and scenario tests that fail closed for missing or invalid decisions.
- [ ] Cut over public skill, wrapper, plugin, and distribution paths to TypeScript default.
  - Update wrappers and docs to TypeScript/npm paths while preserving installed-skill and local-checkout behavior.
  - Decide and implement the `asdl pr-address ...` compatibility path only after standalone TypeScript behavior is proven.
  - Policy: docs, wrapper tests, local checkout behavior, and plugin compatibility scaffolding are directly executable after preview. npm publishing or installed global rollout requires explicit confirmation.
  - Evidence should include wrapper local/prod checks, installed-skill compatibility evidence where practical, and documentation updates.
- [ ] Retire active Python fallback paths after the explicit compatibility window.
  - Delete, archive, or remove Python from active invocation paths once callers, docs, and tests no longer depend on it.
  - Policy: ask before broad Python deletion or irreversible fallback removal; small fallback-scope reductions are directly executable when the affected operation has TypeScript parity and tests.
  - Evidence should include operation parity coverage, wrapper/distribution cutover evidence, and docs showing no active invocation path depends on the retired Python surface.
- [ ] Feed lessons into the umbrella porting playbook.
  - Record reusable migration guidance for later `brmem`, `handoff`, `objective`, and other capability ports.
  - Policy: directly executable after enough repeated evidence exists; do not generalize from only one operation slice.
  - Evidence should include concrete seams proven by `pr-address`, portability limits, and guidance for when future ports should avoid or reuse the same patterns.

## Parked

- Full public API shape for a shared JS/TS clinkr-style framework until repeated seams prove it.
- Direct browser execution for workflows that depend on local git, shell, filesystem, or authenticated GitHub state.
- Broad TypeScript rewrites of Python `asdl-core` concepts not needed by this vertical slice.
- User-facing workflow redesigns beyond explicit compatibility decisions.
