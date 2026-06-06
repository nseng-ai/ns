# asdl-objectives Architecture Deepening Audit

Subagent session: `/var/folders/9r/wfby6pcs4mgbfb_lg0ndgb180000gn/T/pi-runner-subagents/session-R2Empp/8cd6c198-70e4-4e87-96b6-d1cfae9502af.jsonl`

Read-only audit completed. No files edited. No tests run; validation was static inspection with `read`, `find`, and `rg`.

## 1. Package map

### Domain concepts

Root context defines:

- **Objective** as a checked-in documentation workstream (`CONTEXT.md:7`).
- **Active Objective Root** as `.asdl/objectives/` (`CONTEXT.md:23`).
- **Objective Archive Root** as `.asdl/objective-archive/` (`CONTEXT.md:27`).
- **Objective Archive** as a directory move between those roots without editing prose/status (`CONTEXT.md:59-60`).
- **Closure Marker** as `closed.md` (`CONTEXT.md:63`).

`CONTEXT-MAP.md` says `asdl-objectives` should stay on checked-in Markdown storage and not regain a `brmem` storage dependency (`CONTEXT-MAP.md:51`, `CONTEXT-MAP.md:59`).

### Major modules

| Module | Role | Depth assessment |
| --- | --- | --- |
| `objective_paths.py` | Constants/path helpers/slug validation for active/archive records (`objective_paths.py:7-19`) | Small but earns its keep as locality for path spelling. |
| `context.py` | Builds `ObjectiveCliContext` with `GitGateway` and `RealGitGateway` (`context.py:12`, `context.py:27-43`) | Real seam already exists for git; tests use `FakeGitGateway`. |
| `group.py`, `main.py`, `plugin.py`, `exec/group.py` | Clinkr registration and hidden `exec` group (`exec/group.py:10-15`) | Intentionally shallow wiring. |
| `list.py` | Orchestrates checkout inventory, status filtering, git touches, dirty marker (`list.py:57-83`) | Moderate depth; interface is `ObjectiveListResult`. |
| `list_inventory.py` | Discovers active Objective directories and `closed.md` status (`list_inventory.py:29-40`) | Shallow alone; strong candidate to fold into deeper storage module. |
| `list_status.py` | Four-value status filter (`list_status.py:7-14`) | Micro-shallow; deletion makes complexity vanish into one caller. |
| `list_models.py` | Clinkr/Pydantic request/result models (`list_models.py:14-66`) | Shallow but serves command interface/test surface. |
| `list_render.py` | Human/Markdown rendering | Reasonable separation; renderer interface is `ObjectiveListResult`. |
| `list_updates.py` | Timestamp parsing plus older branch-attribution model (`list_updates.py:13-89`) | Partly deep algorithm, partly likely vestigial. Current source only uses `touch_updated_iso`. |
| `archive.py` | Safe active/archive directory move (`archive.py:111-177`) | Moderate depth; no storage seam. |
| `exec/inventory.py` | File presence/update file facts (`exec/inventory.py:31-74`) | Storage-layout helper; belongs with storage candidate. |
| `exec/read_objective.py` | Hidden exec reader; raw Markdown rendering (`read_objective.py:82-125`, `read_objective.py:166-197`) | Useful command, but filesystem knowledge is local to implementation and duplicated elsewhere. |
| `exec/runner_subagent_usage.py` | Pi runner subagent JSONL usage summarizer (`runner_subagent_usage.py:152-203`, `runner_subagent_usage.py:271-352`) | Deep enough; large but honest extraction. |

### Intended seams/adapters

- **Git seam**: `GitGateway` is already a real seam with `RealGitGateway` in production (`context.py:43`) and `FakeGitGateway` in tests (`test_list.py:8`, `test_list.py:20-29`).
- **Markdown storage seam**: not present. Implementations use `Path`, `Path.cwd()`, `repo_root / relative_path`, `read_text`, `rename` directly across modules (`list_inventory.py:31`, `archive.py:113-177`, `read_objective.py:83-125`, `read_objective.py:174`).
- **CLI seam**: Clinkr operation models/results are the test surface.
- **Pi JSONL seam**: no formal adapter; currently local filesystem plus defensive parsing.

## 2. Initial clues

### Clue A: Markdown storage is scattered with no adapter

**Validated. Strong evidence.**

Storage layout is known in several places:

- Roots and slug paths: `objective_paths.py:7-16`.
- Active checkout inventory: active root, direct child directories, direct `closed.md` marker (`list_inventory.py:31-40`).
- Exec file facts: `objective.md`, `roadmap.md`, `updates/`, `closed.md` (`exec/inventory.py:31-36`), update glob/sort/path shaping (`exec/inventory.py:49-62`).
- Archive/unarchive: source/destination construction and `Path.rename` (`archive.py:111-177`).
- Read-objective: uses `Path.cwd()` and raw Markdown reads (`read_objective.py:82-125`, `read_objective.py:166-197`).

Tests duplicate the same layout heavily:

- Scenario helper writes `objective.md`, `roadmap.md`, `updates/`, `closed.md` (`test_objective_cli.py:1314-1330`).
- Read-objective expected JSON encodes root/path/file names (`test_objective_cli.py:890-910`).
- Empty read helper hardcodes `.asdl/objectives` and file booleans (`test_objective_cli.py:1256-1278`).
- List tests construct `.asdl/objectives/<slug>` directly (`test_list.py:151-155`).
- Inventory tests assert direct/nested `closed.md` semantics (`test_list_inventory.py:38-56`).

**Deepening:** `ObjectiveRecordStorage` / `FilesystemObjectiveStorage(repo_root)` is a good candidate if the interface becomes the test surface. A `FakeObjectiveStorage` would make the seam real for tests. If production remains the only adapter and tests keep using `tmp_path`, prefer a concrete `objective_storage.py` module over a protocol.

### Clue B: `exec/runner_subagent_usage.py` is large but may be honest extraction

**Validated. Do not deepen yet.**

Evidence:

- One command entry (`runner_subagent_usage.py:131-149`) delegates to summarization functions (`runner_subagent_usage.py:152-164`).
- Implementation has real behavior: file existence/read errors (`runner_subagent_usage.py:164-187`), JSONL parse errors with line number (`runner_subagent_usage.py:188-200`), assistant usage aggregation (`runner_subagent_usage.py:206-269`), cross-session aggregate (`runner_subagent_usage.py:271-307`), token/cost/model extraction (`runner_subagent_usage.py:329-365`).
- Unit tests cover semantic cases rather than just helper shape: missing/not file/invalid JSON/no usage/aggregate (`test_runner_subagent_usage.py:113-186`).
- Source search shows no second production consumer.

Deletion test: deleting it would move parsing, error modes, aggregation, rendering, and tests into the command or another module. Complexity reappears, so the module earns its keep.

Recommendation: keep as-is unless a second consumer appears or Pi JSONL schema churn makes a `RunnerSubagentSessionReader` adapter worthwhile.

### Clue C: `list_status.py` + `list_models.py` may be micro-shallow cleanup

**Mostly validated.**

- `list_status.py` is only literals plus a 4-branch predicate (`list_status.py:7-14`). Deleting it moves little complexity into `list.py`.
- `list_models.py` is shallow implementation, but it is also the command interface/test surface: request options (`list_models.py:14-34`), JSON result contract (`list_models.py:36-66`), private dirty marker excluded from JSON (`list_models.py:41-58`; tested at `test_list.py:125-147`).

Recommendation: collapse `list_status.py` only if touching list code anyway. Do not spend architecture budget on `list_models.py`.

## 3. Top candidates

### 1. Deepen Objective Markdown storage

- **Files:** `objective_paths.py`, `list_inventory.py`, `exec/inventory.py`, `archive.py`, `exec/read_objective.py`, related tests.
- **Deletion test:** deleting current small storage helpers pushes root/path/file/status logic into `list.py`, `archive.py`, `read_objective.py`, and many tests. Complexity reappears across 3 commands and scenario helpers.
- **Dependency category:** local-substitutable.
- **Proposed shape:** internal storage module with a compact interface for:
  - list active Objective records,
  - read active record facts/content,
  - move active ↔ archive with collision/error facts,
  - compute relative paths for git touch/dirty checks.
- **Tests affected:** move layout-specific unit tests to storage tests; keep CLI scenario tests as command contract; replace some path-heavy list/read tests with fake-storage tests.
- **Strength:** Strong.
- **Risks:** `exec read-objective` currently uses `Path.cwd()` and does not require git context (`read_objective.py:82-83`, `read_objective.py:110-111`); preserving that behavior matters.

### 2. Collapse or quarantine vestigial branch-attribution code in `list_updates.py`

- **Files:** `list_updates.py`, `test_list_updates.py`.
- **Deletion test:** current source only uses `touch_updated_iso` (`list.py:25`, `list.py:82`). The richer branch-attribution implementation has tests but no production caller.
- **Dependency category:** local-substitutable git seam.
- **Proposed shape:** either remove unused attribution functions/tests, or move them behind a clearly named future/legacy module if branch projection is expected to return.
- **Strength:** Worth exploring.
- **Risks:** pycache and tests suggest recently removed Graphite/branch projection behavior; confirm with branch intent before deleting.

### 3. Fold `exec/inventory.py` into the storage module

- **Files:** `exec/inventory.py`, `exec/read_objective.py`, storage candidate.
- **Deletion test:** as a standalone module, it mostly names file facts and formats presence; if deleted during storage deepening, behavior should reappear inside storage, not callers.
- **Dependency category:** local-substitutable.
- **Proposed shape:** `ObjectiveRecordFiles` and update listing live beside storage read operations.
- **Strength:** Strong if doing candidate 1; weak standalone.
- **Risks:** hidden exec JSON names are skill-facing contract.

### 4. Leave `runner_subagent_usage.py` intact; extract only on second adapter

- **Files:** `exec/runner_subagent_usage.py`, `test_runner_subagent_usage.py`.
- **Deletion test:** complexity reappears; module is deep.
- **Dependency category:** local-substitutable files; Pi telemetry schema is external to this package.
- **Proposed shape:** no change now. If a second consumer appears, introduce a reader adapter for JSONL records and keep aggregation as the interface.
- **Strength:** Speculative / no-action.
- **Risks:** premature seam would add interface cost without leverage.

### 5. Optional micro-collapse: `list_status.py`

- **Files:** `list_status.py`, `list.py`, `list_render.py`, `list_models.py`, `test_list_status.py`.
- **Deletion test:** complexity mostly vanishes; predicate could live near list request/result handling.
- **Dependency category:** in-process.
- **Proposed shape:** inline predicate/types if list modules are already being touched.
- **Strength:** Speculative.
- **Risks:** tiny churn; low leverage.

## 4. Test analysis

Tests currently duplicate storage/file-layout knowledge in:

- `test_objective_cli.py` helper `_write_objective` (`test_objective_cli.py:1314-1330`).
- `test_objective_cli.py` read-objective expected records (`test_objective_cli.py:890-910`, `test_objective_cli.py:1256-1278`).
- `test_list.py` helper `_objective_dir` (`test_list.py:151-155`).
- `test_list_inventory.py` direct active/archive roots and `closed.md` placement (`test_list_inventory.py:18-80`).

Tests that should survive at a deeper interface:

- CLI scenario tests for user/skill contract: help hidden exec (`test_objective_cli.py:681-699`), archive JSON/human safety, read-objective JSON/Markdown, list JSON/Markdown.
- Git seam tests asserting `path_last_touched` / dirty checks only for filtered records (`test_list.py:47-58`, `test_list.py:109-121`).
- Storage conformance tests for active/archive roots, direct `closed.md`, update sorting, incomplete records, collision refusal.

Tests that can shrink:

- Low-level path construction tests if storage owns path semantics.
- Repeated `tmp_path / ".asdl" / ...` setup in list/read tests once fake storage becomes the interface.

## 5. Cross-package leverage/disruption

- Leverage is local and good: `asdl-objectives` has one package, one CLI, and one checked-in Markdown domain.
- Disruption should be low if the storage seam stays internal.
- Do not introduce `brmem`; context explicitly says Objectives remain checked-in Markdown (`CONTEXT-MAP.md:51`) and the package edge is to `asdl-core.git`, `clinkr`, console/format/plugin (`CONTEXT-MAP.md:59`).
- Existing `asdl-core.git` seam is already healthy; do not replace it.
- Hidden `exec` commands are skill-facing, so keep JSON/Markdown result shape stable even if implementation changes.

## 6. Final verdict

Yes: `packages/asdl-objectives` is a clean single-package target, with high confidence.

Rationale:

- The strongest win is self-contained: deepen Objective Markdown storage without crossing package seams.
- The package has clear domain terms and stable checked-in file layout.
- Existing tests are rich enough to protect behavior, but many currently test through filesystem layout instead of a deeper interface.
- Main caution: avoid turning every shallow module into a protocol. The real architecture win is storage locality, not broad abstraction.
