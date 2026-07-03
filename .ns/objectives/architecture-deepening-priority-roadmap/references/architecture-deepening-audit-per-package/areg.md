# areg Architecture Deepening Audit

Subagent session: `/var/folders/9r/wfby6pcs4mgbfb_lg0ndgb180000gn/T/pi-runner-subagents/session-d8yQjM/7877eeef-c564-4d08-b607-132f93347a2e.jsonl`

**What I did:** inspected root context, context map, `packages/areg/src`, `packages/areg/tests`, README/pyproject, and package stats.\
**Files changed:** none.\
**Validation run:** no test suite run; only read/stat inspection.\
**Blockers:** no `packages/areg/CONTEXT.md` exists yet; `CONTEXT-MAP.md` lists it as planned.

---

## 1. Package map

### Major modules and domain concepts

`areg` is a skill/agent-resource bootstrap package. Its main concepts match `CONTEXT-MAP.md`: `areg init`, `areg check`, `update-skills`, `skillx`, target agents, managed instruction blocks, installed skill directories, lockfile source types, skill metadata/issues, transient skill fetch/cleanup.

### Command modules

- `areg.cli`: Click command root; constructs real adapters and mounts commands (`init`, `check`, hidden `exec`, `update-skills`) at `packages/areg/src/areg/cli.py:16-31`.
- `areg.init_project`: `areg init`; installs bootstrap skills, writes `asdl.toml`, `AGENTS.md`, `CLAUDE.md`, `.claude/settings.local.json` (`init_project.py:503-567`).
- `areg.update_skills`: temporary workaround around `npx skills update`; explicitly marked deletable once upstream bug is fixed (`update_skills.py:1-20`).
- `areg.skillx`: hidden `exec skillx` subgroup for parse/list/fetch/cleanup transient skill execution (`skillx.py:270-322`).

### Check subsystem

- Interface seam: `SkillCheck` and `ProjectCheck` (`check/base.py:9-21`).
- Data model/test surface: `SkillIssue`, `CheckResult`, `SkillMeta`, `LockfileSkill`, `CheckContext` (`check/models.py:39-67`).
- Runner: builds context, runs skill checks gated by `source_types`, then project checks (`check/runner.py:14-27`).
- Registry: one static list of six check implementations (`check/registry.py:11-21`).
- Check implementations:
  - local skill structure (`local_skill.py:9-109`)
  - GitHub/git/gitlab skill structure (`github_skill.py:9-77`)
  - skill frontmatter (`skill_md.py:20-68`)
  - lockfile consistency (`checks/lockfile.py:12-41`)
  - orphan directories (`orphans.py:16-61`)
  - AGENTS/CLAUDE pairing (`pairing.py:33-101`)

### External seams and adapters

These are real seams: each has at least a real adapter and a fake adapter.

- `AregEnvironment`: `require_tool`, `require_git_root` interface (`gateways/environment/gateway.py:34-39`), with real subprocess/PATH adapter (`real.py:17-40`) and fake adapter (`fake.py:16-50`).
- `NpxSkills`: `add(repo, skills, agents, cwd)` interface (`gateways/npx_skills/gateway.py:14-39`), real `npx skills add` adapter (`real.py:11-31`) and fake recorder (`fake.py:21-51`).
- `GhCli`: `list_directory(repo, path)` interface (`gateways/gh/gateway.py:20-30`), real `gh api` adapter (`real.py:10-29`) and fake catalog (`fake.py:8-40`).
- `SkillxWorkspaceInstaller`: transient workspace interface (`gateways/skillx_workspace/gateway.py:32-37`), real tempdir+npx+validation adapter (`real.py:18-87`) and fake virtual workspace adapter (`fake.py:25-74`).

### Depth assessment

- **Deep modules:** gateway interfaces/adapters, especially `SkillxWorkspaceInstaller`, hide true external behavior and tempdir cleanup behind small interfaces.
- **Moderately deep:** `check_project` provides leverage by making the check interface the test surface.
- **Shallow modules:** many `check/checks/*` leaf files are small single-class modules; their *check algorithms* are useful, but their file/module seams add little locality.
- **High-locality but bulky:** `init_project.py` has good command-level depth but low internal locality: managed block, symlink safety, TOML section replacement, template writing, and command orchestration live in one 567-line module.

---

## 2. Initial clues validated/refuted

### Clue: “Package has sprawl: many small files, ~65 LOC/file.”

**Validated, with nuance.**

- `packages/areg/src/areg`: 40 `.py` files, 2,589 LOC, average 64.7 LOC/file, median 40.5.
- Excluding empty `__init__.py`: 32 files, average 80.8 LOC/file, median 53.
- Some small files are justified by real seams: gateway `gateway.py`/`real.py`/`fake.py` triads each have two adapters.
- The sprawl concern is strongest in `check/checks/*`, not gateways.

### Clue: “`check/checks/*` may be six single-adapter modules instantiated once in `registry.py`; possible consolidate into `checks.py`.”

**Mostly validated.**

Evidence:

- Registry statically instantiates exactly six check classes once (`check/registry.py:11-21`).
- The check interface exists in `base.py` (`check/base.py:9-21`), and runner dispatches by `source_types` (`check/runner.py:21-26`).
- Each check file is small: 41–109 LOC.
- The modules are shallow as file seams, but the **interface** is real enough: six adapters behind `SkillCheck` / `ProjectCheck`.

Deletion test:

- Deleting the individual files and consolidating would mostly make file-navigation complexity vanish.
- Deleting the check interface would push source-type gating and issue collection back into runner/callers, so the interface earns its keep.

### Clue: “`skillx.py` has near-identical Result DTOs.”

**Validated, but low severity.**

Evidence:

- Four DTOs all carry `success`, optional data, optional `error`, and hand-written `to_dict`: `ParseResult`, `ListResult`, `FetchResult`, `CleanupResult` (`skillx.py:29-100`).
- They are the machine interface for hidden exec commands via `_emit(result_obj.to_dict())` (`skillx.py:266-267`).

Deletion test:

- Deleting per-operation DTOs would require re-expressing result shape in each command or helper.
- Some duplication is the cost of an explicit machine interface/test surface. Collapse only if more exec operations are coming.

### Clue: “`init_project.py` is large with many helpers; reusable TOML/managed-block logic may be locked in one command.”

**Validated.**

Evidence:

- `init_project.py` is 567 LOC.
- It contains:
  - plan DTOs (`init_project.py:61-80`)
  - path/symlink/project-root safety (`init_project.py:118-188`)
  - managed block detection/replacement (`init_project.py:198-286`)
  - AGENTS/CLAUDE block planning (`init_project.py:289-376`)
  - `asdl.toml` `[areg]` section rendering/replacement (`init_project.py:380-461`)
  - settings/template planning (`init_project.py:464-500`)
  - command orchestration (`init_project.py:503-567`)
- TOML parsing uses `asdl_core.project_config` for validation (`init_project.py:380-397`), but areg owns string-level section replacement locally (`init_project.py:411-461`).

Deletion test:

- Deleting the private helpers would not remove complexity; it would reappear in the command and tests.
- This module earns its command-level keep, but its internal implementation has low locality.

---

## 3. Top deepening/collapse candidates

### 1. Collapse check leaf file seams, keep the check interface

- **Files:** `packages/areg/src/areg/check/checks/*.py`, `check/registry.py`, possibly `tests/integration/test_check.py`.
- **Deletion-test result:** deleting the individual modules makes complexity vanish into fewer files; deleting `SkillCheck`/`ProjectCheck` would spread complexity into runner/callers.
- **Dependency category:** in-process filesystem inspection.
- **Proposed shape:** consolidate into `checks.py` or grouped modules like `skill_structure.py`, `project_structure.py`, `pairing.py`. Keep `SkillCheck`/`ProjectCheck`, `IssueKind`, `CheckContext`.
- **Tests affected:** mostly import paths; `test_check.py` imports `areg.check.checks.pairing` for monkeypatching (`tests/integration/test_check.py:7`, pairing monkeypatch around `test_check.py:810+` in inspected file).
- **Strength:** Worth exploring.
- **Risks:** over-collapsing could hurt locality for pairing, which has real traversal complexity (`pairing.py:33-56`).

### 2. Extract an init planning module around text-file plans and safety

- **Files:** `init_project.py`, `tests/scenario/test_init_project.py`.
- **Deletion-test result:** current helper complexity would reappear in command if deleted; it deserves a deeper internal module.
- **Dependency category:** in-process plus local filesystem.
- **Proposed shape:** keep Click command thin; move `TextWritePlan`, `SkippedTextWrite`, `InitPlan`, target validation, symlink safety, and `_apply_text_file_plan` into a package-local init planning module.
- **Tests affected:** scenario tests can remain CLI-facing; optional unit tests could hit the planning interface directly.
- **Strength:** Strong.
- **Risks:** avoid inventing public interfaces; this should be an internal locality refactor.

### 3. Extract managed-block editing as a reusable package-local module

- **Files:** `init_project.py`; possibly `check/checks/pairing.py`.
- **Deletion-test result:** managed marker parsing/replacement appears conceptually reusable; deleting it from `init_project.py` would not eliminate complexity.
- **Dependency category:** in-process text transformation.
- **Proposed shape:** `ManagedBlock` / `ManagedBlockPlan` with start/end markers, append/update/no-append policy, malformed-marker error.
- **Tests affected:** many init scenarios around prompts, malformed markers, replacement, and no-append (`test_init_project.py:535-604`, `650-666`).
- **Strength:** Worth exploring.
- **Risks:** only one production adapter today; two adapters would make it a real seam. Keep it simple.

### 4. Move `[areg]` TOML section writing closer to `asdl_core.project_config` only if another package needs writes

- **Files:** `init_project.py`, `project_agents.py`, `asdl-core.project_config`.
- **Deletion-test result:** TOML write logic currently belongs to areg because only areg writes `[areg]`.
- **Dependency category:** cross-package in-process config parsing/writing.
- **Proposed shape:** first extract package-local `areg_config_text.py`; only promote to `asdl-core` if another package needs config mutation.
- **Tests affected:** init tests for preserving sections/appending/replacing (`test_init_project.py:154-160` onward).
- **Strength:** Speculative.
- **Risks:** cross-package disruption; `asdl-core.project_config` currently gives parse/load leverage, not necessarily write semantics.

### 5. Normalize `skillx` result serialization only if adding more exec result DTOs

- **Files:** `skillx.py`, `tests/unit/test_skillx.py`, `tests/scenario/test_skillx_cli.py`.
- **Deletion-test result:** repeated `success/error/to_dict` code is shallow, but per-operation result classes define a clear machine interface.
- **Dependency category:** in-process DTO/JSON interface.
- **Proposed shape:** small helper for success/error dict assembly or a protocol; avoid a clever inheritance tree.
- **Tests affected:** unit tests assert DTO fields and `to_dict` shapes (`test_skillx.py:153-165`, CLI JSON tests in `test_skillx_cli.py`).
- **Strength:** Speculative.
- **Risks:** machine JSON shape is the interface; churn may not pay for itself.

---

## 4. Test analysis

### Good interface coverage

- CLI scenario tests exercise the user-facing interface via `CliRunner().invoke(main, ...)`.
- Gateway seams are well tested with real/fake layers:
  - real gateway tests explicitly document they are the only areg tests allowed to mock subprocess/PATH (`test_real_gateways.py:1-6`);
  - real `gh` command construction is tested (`test_real_gateways.py:127-148`);
  - real `npx` command construction is tested (`test_real_gateways.py:210-260`);
  - fake gateways test copy/recording behavior.
- `skillx` unit tests hit in-process interfaces (`parse_skill_input`, `list_skills`, `fetch_skill`, `cleanup_skill_dir`) with fake adapters (`test_skillx.py:60-119`, `176-223`, `231+`).

### Duplicated setup details

- `test_check.py` manually builds lockfiles, local skill dirs, GitHub skill dirs, AGENTS/CLAUDE peers (`test_check.py:21-68`).
- `test_init_project.py`, `test_update_skills.py`, and `test_skillx_cli.py` each define local `_ctx` builders for `AregContext` with fake adapters (`test_init_project.py:25-40`, `test_update_skills.py:23-29`).
- Lockfile JSON builders are duplicated between check/update tests (`test_check.py:21-24`, `test_update_skills.py:32-44`).

This is not a production architecture flaw, but a test locality opportunity: a package-local test builder could make future refactors cheaper.

---

## 5. Cross-package leverage/disruption

### `asdl-core.project_config`

- `project_agents.py` reads target agents from shared config (`project_agents.py:15-32`).
- `init_project.py` validates existing `asdl.toml` with `parse_asdl_project_config` (`init_project.py:394-398`) but performs text replacement itself (`init_project.py:411-461`).
- Best leverage: keep parsing shared; promote writing only if other packages start mutating `asdl.toml`.

### External `gh`

- `areg` uses a narrow local `GhCli.list_directory` seam for GitHub contents listing (`gh/gateway.py:20-30`).
- This does not need `asdl-core` PR vocabulary; it is not PR workflow. The local seam is acceptable.

### External `npx skills`

- `NpxSkills` is a high-value local-substitutable seam. It hides a remote-owned/true external CLI and makes scenario tests deterministic (`npx_skills/gateway.py:14-39`).
- `update-skills` is intentionally temporary and should remain isolated (`update_skills.py:1-20`).

---

## 6. Final verdict

**Verdict:** mostly sprawl cleanup plus one serious locality target.

- The gateway architecture is healthy: real seams have two adapters and good tests.
- The check system’s interface earns its keep, but the file layout is shallow.
- `init_project.py` is the strongest architecture target because important safety and text-planning behavior is locked inside one large command module.
- `skillx` DTO duplication is real but not urgent.

**Confidence:** high for sprawl/locality findings; medium for cross-package TOML leverage because no second writer exists yet.
