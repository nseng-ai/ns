# roaster Architecture Deepening Audit

Subagent session: `/var/folders/9r/wfby6pcs4mgbfb_lg0ndgb180000gn/T/pi-runner-subagents/session-7nzpAg/64da767f-cf4a-4c48-8852-35208b9ed990.jsonl`

Did: inspected `CONTEXT.md`, `CONTEXT-MAP.md`, `packages/asdl-core/CONTEXT.md`, and `packages/roaster/src` + tests. No edits.  
Validation: no test suite run; this was a read-only evidence audit.

## 1. Package map

`roaster` is mostly healthy and seam-heavy.

- **CLI module**: `roaster.cli.*`
  - Standalone/plugin wiring via `build_cli()` and `build_roaster_plugin()` (`packages/roaster/src/roaster/cli/main.py`, `packages/roaster/src/roaster/cli/plugin.py`).
  - Typed context assembles real adapters (`packages/roaster/src/roaster/cli/roaster/context.py:23-34`).
  - Hidden `exec` subgroup mixes Clinkr operations and raw Click commands (`packages/roaster/src/roaster/cli/roaster/exec/group.py:20-28`).

- **Review definition / review workflow module**
  - `review_definition.py`: YAML frontmatter + markdown parser.
  - `review_selection.py`: changed-path selection.
  - `workflow.py`: deep orchestration module for `run_review_by_key` and `list_matching_reviews` (`packages/roaster/src/roaster/workflow.py:47`, `:109`).
  - Good depth: callers provide `ReviewCatalogGateway`, `LocalDiffGateway`, `HarnessRuntime`; implementation hides catalog loading, model/harness resolution, diff loading, and execution.

- **Harness module**
  - `harness/invocation.py` is a large adapter/runtime module: `HarnessDefinition` (`:64`), Claude Code invocation (`:173`), output parsing (`:366`), `HarnessRuntime` (`:483`).
  - Current harness seam is partly real, partly hypothetical: one built-in harness definition (`_DEFAULT_HARNESSES`, `:476`) plus `FakeHarnessRuntime` for tests (`harness/fake.py:16`).

- **Gateway seams/adapters**
  - Real seams exist for:
    - `LocalDiffGateway` + fake + real (`local_diff/gateway.py:10`, `fake.py:9`, `real.py:14`).
    - `ReviewCatalogGateway` + fake + real (`review_catalog/gateway.py:10`, `fake.py:16`, `real.py:32`).
    - `AgentRunnerGateway` + fake + guarded real (`agent_runner/gateway.py:51`, `fake.py:14`, `real.py:13`).
    - `GraphiteStackGateway` + fake + real (`graphite_stack/gateway.py:77`, `fake.py:22`, `real.py:21`).
  - External/shared seams:
    - `asdl_core.gh.PRGateway` for GitHub PR operations.
    - `brmem.BranchMemoryGateway` for stack-run artifacts.

- **Findings publication / inline commentability**
  - `inline_commentability.py`: PR diff-line commentability and classification (`:56`, `:89`).
  - `findings_publication.py`: findings envelope parsing, summary comment rendering, inline markers/body (`:85`, `:218`, `:233`, `:242`).
  - `exec/post_inline_findings.py`: orchestration over PRGateway, duplicate markers, classification, inline draft creation (`:52-89`).
  - Good pure modules, but locality is split.

- **Stack workflow subdomain**
  - `stack_workflow.py` is the largest orchestration module, 858 lines, with dry-run and mutating execution (`:114`, `:260`).
  - Supporting modules are relatively deep: stack output parsing, dashboard projection/rendering/publication, run storage, run persistence, dry-run projection, Graphite planning, slug validation.
  - This subdomain has real seams but high orchestration density.

## 2. Initial clues validated/refuted

### Clue: “Strong seams already: Fake adapters exist.”

**Validated.** This is one of the package’s strengths.

Evidence:

- Local diff has interface/fake/real: `LocalDiffGateway` (`local_diff/gateway.py:10`), `FakeLocalDiffGateway` (`fake.py:9`), `RealLocalDiffGateway` (`real.py:14`).
- Review catalog has interface/fake/real: `ReviewCatalogGateway` (`review_catalog/gateway.py:10`), fake (`fake.py:16`), real (`real.py:32`).
- Agent runner has interface/fake/guarded real: `AgentRunnerGateway` (`agent_runner/gateway.py:51`), fake (`fake.py:14`), real fails closed (`real.py:24-25`).
- Graphite stack has interface/fake/real: `GraphiteStackGateway` (`graphite_stack/gateway.py:77`), fake (`fake.py:22`), real (`real.py:21`).
- Scenario and unit tests exercise these seams using fakes, e.g. review CLI context uses fake catalog/diff/harness/PR gateway (`tests/scenario/test_review_cli.py:75-91`), stack CLI uses fake Branch Memory / agent / Graphite (`tests/scenario/test_stack_cli.py:74-83`).

Deletion test: deleting these gateway modules would push subprocess, filesystem, GitHub, Branch Memory, and Graphite setup across workflow and scenario tests. They earn their keep.

### Clue: “Redundant `git_toplevel()` per-call in real gateways; maybe cache repo root once in `RoasterCliContext`.”

**Validated, but not severe.**

Evidence:

- `RealLocalDiffGateway.load_diff()` resolves repo root on every call (`local_diff/real.py:21`) via `_repo_root()` → `git_toplevel(cwd=self._cwd)` (`:66-67`).
- `RealReviewCatalogGateway._reviews_dir()` resolves repo root every time (`review_catalog/real.py:81-85`).
- `git_toplevel()` shells out to `git rev-parse --show-toplevel` (`git_toplevel.py:26-28`).
- `list_matching_reviews()` loads all review keys and then loads each source (`workflow.py:141-147`), so catalog listing can become N+1 repo-root resolution.

Proposed shape: cache a **Repository root** once in the real CLI context/factory, or pass `repo_root` into the real adapters. Consider using `asdl-core` `GitGateway.get_repository_root()` vocabulary rather than maintaining roaster’s own `git_toplevel` helper.

Strength: **Worth exploring**. Locality improves; leverage is modest unless review catalogs grow.

### Clue: “Harness parse helpers duplicated by exec CLI parsing.”

**Mostly refuted.**

Evidence:

- Harness parsing handles Claude Code result formats and structured output (`harness/invocation.py:335`, `:366`, `:387`).
- Exec parsing handles Clinkr machine envelopes with top-level `exit_code` (`findings_publication.py:85-103`).
- Both eventually validate `ReviewFinding.from_json_dict` (`harness/invocation.py:231`, `findings_publication.py:358`), but the input interfaces are different.

Actual issue is not duplication; it is **two adapter formats**:

- Harness adapter format: Claude Code stdout.
- Exec publication format: roaster Clinkr envelope.

Deletion test: deleting either parser makes its complexity reappear in the adapter that owns that external format. Both modules mostly earn their keep.

### Clue: “Inline-marker/classification split across `inline_commentability.py`, `findings_publication.py`, `exec/post_inline_findings.py`.”

**Validated.**

Evidence:

- Classification lives in `inline_commentability.py` (`commentable_right_side_lines` at `:56`, `classify_inline_findings` at `:89`).
- Marker and inline body live in `findings_publication.py` (`_INLINE_MARKER_PREFIX` at `:21`, marker/body helpers at `:218`, `:233`, `:242`).
- PR orchestration and duplicate suppression live in CLI code (`post_inline_findings.py:63-89`).

Deletion test: deleting `post_inline_findings.py`’s orchestration would push marker extraction, duplicate suppression, fallback accounting, and PR draft creation into tests/CLI callers. A deeper `InlineFindingsPublication` module would concentrate locality.

## 3. Top deepening/collapse candidates

### 1. Cache repository root / repo facts in real context

- **Files**: `cli/roaster/context.py`, `context.py`, `git_toplevel.py`, `gateways/local_diff/real.py`, `gateways/review_catalog/real.py`.
- **Deletion test**: `git_toplevel.py` currently earns some keep, but duplicated per-call repo-root resolution is shallow at the adapter level.
- **Dependency category**: local-substitutable (`git` subprocess + filesystem config).
- **Proposed shape**: resolve `repo_root` once in `build_roaster_context()` and construct real adapters with `repo_root`; optionally use shared `asdl_core.git.GitGateway`.
- **Tests affected**: real gateway tests that monkeypatch `git_toplevel` (`tests/gateways/test_real_gateways.py:47`, `:80`, `:124`); git helper unit tests may shrink.
- **Strength**: Worth exploring.
- **Risk**: context construction must stay lazy so help/schema paths do not shell out.

### 2. Deepen inline findings publication module

- **Files**: `inline_commentability.py`, `findings_publication.py`, `cli/roaster/exec/post_inline_findings.py`, exec scenario tests.
- **Deletion test**: current split makes publication complexity reappear in CLI orchestration; a single module would improve locality.
- **Dependency category**: remote-owned via `PRGateway`; in-process for rendering/classification.
- **Proposed shape**: add a module function/class like `publish_inline_findings(payload, pr_number, pr_gateway)` returning `PostInlineFindingsResult`-like data. CLI should parse stdin and load context only.
- **Tests affected**: move many `post-inline-findings` assertions from scenario-only tests to unit tests at this interface; keep one CLI smoke path.
- **Strength**: Strong.
- **Risk**: avoid hiding the useful pure `classify_inline_findings` interface; it is already a good test surface.

### 3. Revisit harness module depth after second real harness exists

- **Files**: `harness/invocation.py`, `harness/fake.py`, `tests/unit/test_harness_invocation.py`.
- **Deletion test**: `HarnessDefinition` is partly hypothetical today: one real harness definition (`_DEFAULT_HARNESSES`, `harness/invocation.py:476`) plus fake runtime.
- **Dependency category**: true external/local-substitutable hybrid: local `claude` process backed by model provider behavior.
- **Proposed shape**: either keep as-is until a second real harness lands, or split a `ClaudeCodeHarnessAdapter` module so `HarnessRuntime` owns dispatch while Claude-specific parse/argv details have locality.
- **Tests affected**: adapter tests currently assert argv and process details (`tests/unit/test_harness_invocation.py:187`, `:231`).
- **Strength**: Speculative.
- **Risk**: premature seam multiplication; current module is large but coherent.

### 4. Split mutating stack workflow into a batch execution/checkpoint module

- **Files**: `stack_workflow.py`, `stack_run_persistence.py`, `stack_run_storage.py`, `stack_dashboard*.py`, `stack_triage.py`.
- **Deletion test**: `stack_workflow.py` earns its keep; deleting it would spread sequencing across CLI/tests. But the mutating loop is very dense (`stack_workflow.py:260` onward).
- **Dependency category**: mixed: local-substitutable Graphite/Branch Memory, remote-owned PRGateway, true external agent runner.
- **Proposed shape**: keep `run_stack_workflow_dry_run` as the public interface, but move “for each batch: checkpoint → checkout/create/update → agent → parse → persist → dashboard” into a deeper batch executor module.
- **Tests affected**: `tests/unit/test_stack_workflow.py` exact call-sequence assertions (`:364-370`) may move to batch-executor tests; scenario tests stay stable.
- **Strength**: Worth exploring.
- **Risk**: stack workflow is safety-sensitive; splitting must improve locality, not scatter invariants.

### 5. Align roaster Graphite seam with `asdl-core` Graphite vocabulary

- **Files**: `gateways/graphite_stack/*`, `stack_workflow.py`, possible `asdl_core.gt`.
- **Deletion test**: `GraphiteStackGateway` earns keep because tests and stack workflow depend on it, but its real read operations currently fail closed (`graphite_stack/real.py:24-46`).
- **Dependency category**: local-substitutable external tool metadata (`gt`), explicit Graphite contract.
- **Proposed shape**: reuse or adapt `asdl-core` `GtGateway` for read-current-stack / attach-tip once stable; keep roaster-specific generated branch naming/submission semantics local.
- **Tests affected**: `tests/gateways/test_graphite_stack_gateway.py`, `tests/unit/test_stack_workflow.py`.
- **Strength**: Worth exploring.
- **Risk**: moderate cross-package disruption; do not leak Graphite into generic roaster review paths.

## 4. Test analysis

Good seam tests:

- `tests/unit/test_workflow.py` uses fake catalog/diff/harness runtime and tests `run_review_by_key` as the interface (`:70-82`, `:109-120`).
- Scenario tests correctly use standalone `build_cli()` and fake context (`tests/scenario/test_review_cli.py:101`, `:75-91`).
- Inline commentability tests hit pure domain interfaces (`tests/unit/test_inline_commentability.py`).
- Exec tests use `FakePRGateway`, good for remote-owned GitHub seam (`tests/scenario/test_exec_cli.py:34-38`, `:318`).
- Stack workflow tests exercise the gateway interfaces with fakes and verify safety ordering (`tests/unit/test_stack_workflow.py:210-248`, `:318-371`).

Implementation-detail pressure:

- Harness tests necessarily assert subprocess argv and stream parsing (`tests/unit/test_harness_invocation.py:187`, `:231`); keep those localized to the adapter.
- Real gateway tests monkeypatch `git_toplevel`/`run_git` (`tests/gateways/test_real_gateways.py:47`, `:80-81`, `:124-125`). If repo-root caching changes, these tests should move up to the new context/root interface.
- Stack workflow exact Graphite call-sequence assertions are useful safety tests, but refactors should preserve them at the new batch executor seam rather than at every orchestration level.

## 5. Cross-package leverage/disruption

- **`asdl-core.gh.PRGateway`**: roaster uses the right shared seam for PR changed files, review comments, discussion comments, and inline review creation. Keep using it; do not create a roaster-specific GitHub adapter.
- **`asdl-core.git`**: roaster currently imports `resolve_trunk_branch` and has its own `git_toplevel` helper. There is leverage in moving repository-root/trunk facts toward `GitGateway`, but `LocalDiffGateway` still owns roaster-specific diff text and exclude-glob behavior.
- **`asdl-core.project_config`**: current use is appropriate for `roaster.diff.exclude` (`local_diff/real.py:30`). Cache config only if repeated load becomes measurable.
- **`brmem`**: stack-run persistence uses `BranchMemoryGateway` directly and tests with `FakeBranchMemoryGateway`; good local-substitutable seam.
- **Graphite**: roaster’s `stack` command explicitly names Graphite/`gt`, so the runtime Graphite dependency is acceptable here. Avoid spreading Graphite into generic review/catalog/diff modules.

## 6. Final verdict

`packages/roaster` is **mostly healthy with two serious deepening targets**:

1. Inline findings publication locality.
2. Stack mutating workflow density.

The gateway architecture is strong; fakes are real leverage, not decorative. The repo-root caching issue is worthwhile cleanup, not a deep architectural flaw. Harness parsing duplication is mostly a false alarm.

Confidence: **medium-high**. I inspected the main source/test paths and supporting context, but did not run tests or inspect every stack helper in full detail.
