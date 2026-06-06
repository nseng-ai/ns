# aretro Architecture Deepening Audit

Subagent session: `/var/folders/9r/wfby6pcs4mgbfb_lg0ndgb180000gn/T/pi-runner-subagents/session-ln3b96/16943c5c-7ec0-42fd-8ca9-9a7ea9815f0d.jsonl`

Read-only audit only. No files changed. Validation: not run, to preserve read-only scope.

## 1. Package map: modules, concepts, seams, adapters, depth

### Domain boundary

`aretro` is intentionally narrow: it exposes branch-retrospective evidence, not recommendations. The docs state that Python “collects, normalizes, counts, filters, and compresses evidence” while the language model interprets it, and Python must not emit diagnoses like `missing_docs`, `bad_architecture`, or `skill_gap` (`docs/aretro.md:5-18`). The role split is explicit: `asdl-core` parses sessions and aggregates deterministic evidence; `aretro` renders the CLI envelope; `branch-retro` applies judgment (`docs/aretro.md:53-58`).

### Major modules

- `aretro.context`
  - Builds typed CLI context with `GitGateway` and `SessionSource`.
  - Real adapters: `RealGitGateway`, `PiJsonlSessionSource` (`packages/aretro/src/aretro/context.py:13-26`).
  - Depth: medium. Small interface, but useful locality for runtime wiring.

- `aretro.gateway_access`
  - Two pass-through getters over `load_typed_context` (`packages/aretro/src/aretro/gateway_access.py:13-20`).
  - Depth: shallow.

- `aretro.group` / `aretro.main` / `aretro.exec.group`
  - Clinkr/Click mounting, hidden `exec` group (`packages/aretro/src/aretro/exec/group.py:10-16`).
  - Depth: appropriate shallow framework glue. Deleting these would move required Clinkr/plugin mounting elsewhere.

- `aretro.exec.collect_evidence`
  - Main operation module. Owns request/result DTOs, branch/repo resolution, session query, compact summaries, aggregate metrics, evidence DTO conversion, and payload-mode dispatch (`packages/aretro/src/aretro/exec/collect_evidence.py:38-210`, `238-340`).
  - Interface: `aretro exec collect-evidence`, `CollectEvidenceRequest`, `CollectEvidenceResult`.
  - Depth: mixed. Operation interface is deep; several private DTO proxy helpers are shallow.

- `aretro.exec.evidence_payload`
  - Builds sanitized detailed payload artifact data and pointer links from compact evidence to supporting events (`packages/aretro/src/aretro/exec/evidence_payload.py:120-140`, `345-373`).
  - Depth: good. Small interface gives privacy, truncation, schema, and JSON-pointer leverage.

- `aretro.exec.read_evidence_detail`
  - Reads one JSON Pointer under `/data` from a raw payload artifact, with schema checks (`packages/aretro/src/aretro/exec/read_evidence_detail.py:40-56`, `59-115`).
  - Depth: good. Concentrates payload lookup invariants.

### Seams and adapters

- `GitGateway`: local-substitutable seam. `aretro` uses repo root/current branch/git-common-dir; `asdl-core` supplies `GitGateway`, `RealGitGateway`, and `FakeGitGateway` (`packages/asdl-core/src/asdl_core/git/git_gateway.py:23-40`, `packages/asdl-core/src/asdl_core/git/testing.py:65-75`, `191-201`).
- `SessionSource`: local-substitutable seam. Interface is `source_info` + `query` (`packages/asdl-core/src/asdl_core/sessions/source.py:10-20`); adapters are `PiJsonlSessionSource` and `FakeSessionSource` (`packages/asdl-core/src/asdl_core/sessions/adapters/pi_jsonl.py:163-185`, `packages/asdl-core/src/asdl_core/sessions/testing.py:15-44`). Production has one adapter, so multi-harness is still partly hypothetical, but the test seam is real.
- Clinkr/plugin: in-process shared CLI substrate. `aretro.main` builds an `AsdlPluginSpec` (`packages/aretro/src/aretro/main.py:21-25`) over the shared plugin interface (`packages/asdl-core/src/asdl_core/plugin.py:17-35`).

## 2. Initial clues validated/refuted

### Clue: `collect_evidence.py` has 8 `_*_to_dto` proxy functions

**Validated, with nuance.** There are exactly eight `_...to_dto` helpers in `collect_evidence.py`: `_query_to_dto`, `_evidence_item_to_dto`, `_source_info_to_dto`, `_warning_to_dto`, `_association_to_dto`, `_source_ref_to_dto`, `_optional_source_ref_to_dto`, `_message_counts_to_dto` (`packages/aretro/src/aretro/exec/collect_evidence.py:527-597`).

Most are mechanical field copies. However, the deletion test is not uniformly damning:

- `_source_ref_to_dto`, `_association_to_dto`, and `_message_counts_to_dto` preserve path-to-string normalization and compactness (`packages/aretro/src/aretro/exec/collect_evidence.py:565-597`).
- `summarize_session` is not just proxying; it intentionally counts event arrays and omits raw details (`packages/aretro/src/aretro/exec/collect_evidence.py:346-361`). Tests assert raw command/tool text is absent (`packages/aretro/tests/unit/test_collect_evidence.py:105-115`).
- `_result_from_query_result` is close to the proposed “one session_query_result_to_dto boundary”: it builds summaries, warnings, aggregate metrics, and evidence items from `SessionQueryResult` (`packages/aretro/src/aretro/exec/collect_evidence.py:389-405`).

**Verdict:** cleanup candidate, not a deep architecture flaw. Best shape is probably to make `_result_from_query_result`/a renamed compact-result builder the meaningful module interface and keep leaf DTO helpers private.

### Clue: `gateway_access.py` is a 21 LOC single-adapter indirection to inline

**Validated.** It only wraps `load_typed_context(ctx, AretroCliContext).git_gateway/session_source` (`packages/aretro/src/aretro/gateway_access.py:13-20`), and appears to have one consumer: `run_collect_evidence` (`packages/aretro/src/aretro/exec/collect_evidence.py:242-243`).

Deletion test: deleting the module makes complexity vanish. The two calls become one local context load in `collect_evidence.py`; complexity does not reappear across N callers.

**Verdict:** strong cleanup collapse.

### Clue: may be cleanup, not architecture; deterministic evidence should remain separate from recommendation judgment

**Validated.** The package boundary is documented and reinforced by tests. Evidence kinds are factual (`docs/aretro.md:40-51`), raw outputs are omitted in compact and payload modes (`packages/aretro/tests/scenario/test_aretro_cli.py:140-172`, `175-204`), and branch-retro owns semantic judgment (`docs/aretro.md:58`).

**Verdict:** do not move recommendation judgment into `aretro`.

## 3. Top deepening/collapse candidates

### 1. Collapse `gateway_access.py`

- **Files:** `packages/aretro/src/aretro/gateway_access.py`, `packages/aretro/src/aretro/exec/collect_evidence.py`
- **Deletion test:** Strong pass-through. Deleting it removes an interface; no complexity reappears across callers.
- **Dependency category:** in-process Clinkr context access.
- **Proposed shape:** inline typed context loading in `run_collect_evidence`.
- **Tests affected:** likely none beyond import updates.
- **Strength:** Strong.
- **Risks:** minimal.

### 2. Rename/consolidate compact result conversion around one interface

- **Files:** `packages/aretro/src/aretro/exec/collect_evidence.py`, `packages/aretro/tests/unit/test_collect_evidence.py`
- **Deletion test:** Individual DTO helpers are shallow, but deleting all conversion locality would spread privacy/path/counting rules into operation code.
- **Dependency category:** in-process DTO conversion over `asdl-core.sessions`.
- **Proposed shape:** make one private “compact evidence result builder” module/interface, e.g. `build_collect_evidence_result(request, repo, query_result)`, with leaf copies hidden behind it.
- **Tests affected:** private-helper tests around `_result_from_query_result` (`packages/aretro/tests/unit/test_collect_evidence.py:118-190`) should target the chosen builder or scenario CLI.
- **Strength:** Worth exploring.
- **Risks:** over-factoring if only renaming; avoid generic reflection-based DTO copying because privacy rules are explicit.

### 3. Clarify branch scope vs repo-session scope

- **Files:** `packages/aretro/src/aretro/exec/collect_evidence.py`, `packages/asdl-core/src/asdl_core/sessions/types.py`, `packages/asdl-core/src/asdl_core/sessions/adapters/pi_jsonl.py`, scenario tests.
- **Evidence:** `CollectEvidenceRequest` accepts `--branch` (`collect_evidence.py:50-58`) and resolves current branch (`collect_evidence.py:473-524`), but `SessionQuery` only carries `repo_root`, `session_root`, `max_sessions`, dates, and harnesses — no branch (`packages/asdl-core/src/asdl_core/sessions/types.py:27-36`). `PiJsonlSessionSource` associations currently set `branch=None` (`packages/asdl-core/src/asdl_core/sessions/adapters/pi_jsonl.py:491-522`). Tests assert explicit branch does not involve Graphite/stack metadata and leaves session association branch `None` (`packages/aretro/tests/scenario/test_aretro_cli.py:396-429`, plus assertion at `test_collect_evidence_uses_explicit_branch...`).
- **Deletion test:** This is a missing/deceptive seam, not a shallow module. If branch specificity matters, complexity will appear in consumers trying to decide whether evidence actually belongs to a branch.
- **Dependency category:** local-substitutable session source; Pi JSONL format is remote-owned by the Pi runtime.
- **Proposed shape:** either document/rename the interface as repo-scoped evidence with branch context, or extend session query/association when reliable branch facts exist.
- **Tests affected:** scenario JSON contract, `FakeSessionSource` query assertions, Pi missing-root scenario.
- **Strength:** Worth exploring only if retrospectives show cross-branch evidence contamination.
- **Risks:** cross-package disruption; current logs may not reliably contain branch.

### 4. Keep `evidence_payload.py` separate; only consider tiny shared source-ref helpers

- **Files:** `collect_evidence.py`, `evidence_payload.py`
- **Deletion test:** `evidence_payload.py` earns its keep: deleting it would force payload schema, privacy, command truncation, and pointer-index logic back into `collect_evidence.py` (`evidence_payload.py:120-172`, `257-315`, `345-373`).
- **Dependency category:** in-process + local filesystem payload artifacts.
- **Proposed shape:** no major collapse. At most, consider whether duplicated source-ref DTO conversion should remain intentionally duplicated for independent compact/payload schema evolution.
- **Tests affected:** `test_evidence_payload.py` covers sanitized arrays, raw-error omission, command bounding, and pointers (`packages/aretro/tests/unit/test_evidence_payload.py:33-113`).
- **Strength:** Speculative.
- **Risks:** sharing DTOs could couple public compact envelope and raw payload schema unnecessarily.

## 4. Test analysis

- Strong scenario coverage for CLI contract: help/version/hidden exec, JSON envelope, payload mode, reader command, error cases, query passing, real Pi missing-root warning (`packages/aretro/tests/scenario/test_aretro_cli.py:65-172`, `216-393`, `396-429`, `503-626`).
- Unit tests protect key privacy invariants: compact summaries omit raw commands/errors (`packages/aretro/tests/unit/test_collect_evidence.py:105-115`, `173-190`), payload omits raw errors and bounds commands (`packages/aretro/tests/unit/test_evidence_payload.py:57-83`).
- Some tests import private implementation (`_result_from_query_result`). This makes the current private conversion shape part of the test surface. If refactoring, prefer testing through `run_collect_evidence` or a deliberately named builder interface.
- Empty `tests/gateways` and `tests/integration` are fine; current seams use `asdl-core` fakes and scenario tests.

## 5. Cross-package leverage/disruption

- `asdl-core.sessions` gives `aretro` major leverage: normalized `ParsedSession`, `SessionSource`, `SessionQueryResult`, and deterministic `collect_session_evidence` (`packages/asdl-core/src/asdl_core/sessions/evidence.py:31-43`, `142-180`). Keep aggregation there; do not duplicate evidence-kind logic in `aretro`.
- `asdl-core.git` is the right seam for branch/repo facts; no Graphite dependency appears, matching repo guidance and tests.
- `asdl-core.clinkr/plugin` mounting is conventional and low-risk (`packages/asdl-core/CONTEXT.md:339-352`; `packages/aretro/src/aretro/main.py:21-25`).
- Any change to branch filtering/scope would disrupt `asdl-core.sessions`, not just `aretro`, because the current session query interface has no branch field.

## 6. Final verdict

Mostly **cleanup**, not deep architecture.

- Strong cleanup: inline `gateway_access.py`.
- Moderate cleanup: reduce the apparent surface of DTO conversion around one compact-result builder.
- Preserve architecture: deterministic evidence collection must stay separate from recommendation judgment.
- Only possible architecture question: branch-scoped naming vs repo-scoped session query. Worth investigating with real retrospective failures before changing seams.

Confidence: **0.82**.
