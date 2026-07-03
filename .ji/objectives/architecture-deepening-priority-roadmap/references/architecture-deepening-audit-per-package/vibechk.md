# vibechk Architecture Deepening Audit

Subagent session: `/var/folders/9r/wfby6pcs4mgbfb_lg0ndgb180000gn/T/pi-runner-subagents/session-hHm30g/2e9061b7-77ca-44dd-8439-ca5f94e81b71.jsonl`

Read-only architecture audit completed. No files changed.

## 1. Package map

**Domain:** standalone agent-context evaluation: baseline/treatment workdirs, plan source, runner adapter, run id, run bundle/store/status, git provenance, metrics, transcript, diff patch, result branch, run/comparison reports. `CONTEXT-MAP.md` explicitly says `vibechk` is standalone/no-`asdl-core` and owns “git + runner/store boundaries” locally (`CONTEXT-MAP.md:62`).

**Major modules**

- `cli.py` — Click interface. Thin command adapter from CLI args to workflow/store/report modules (`packages/vibechk/src/vibechk/cli.py:28`, `:85`, `:123`, `:153`, `:175`).
- `workflow.py` — core run execution module. One deep interface, `execute_run`, hides plan resolution, git provenance, clean check, runner execution, transcript/diff storage, result branch creation, bundle writing, and error/status handling (`workflow.py:29-152`).
- `runners.py` — runner seam. `Runner` ABC + `RunnerRegistry` + one production adapter, `ClaudeRunner` (`runners.py:24-49`, `:98-99`).
- `git.py` — git seam/adapter. `GitGateway` ABC + one production adapter, `RealGitGateway` (`git.py:10-48`).
- `store.py` — local run store module: store-root resolution, run-id allocation, bundle writing, prefix lookup, bundle/artifact loading/listing (`store.py:20-148`).
- `models.py` — in-process DTO/schema module for metrics, provenance, run bundle, loaded bundle, JSON conversion (`models.py:11-144`).
- `reports.py` — in-process rendering module for run/comparison/list reports (`reports.py:19-203`).
- `ids.py`, `errors.py`, `deps.py` — small support modules; `deps.py` wires production adapters (`deps.py:13-28`).

**Seams/adapters/dependency category**

- Runner seam: remote-owned behavior through a true external local CLI (`claude`) (`runners.py:58-66`, `:86-95`). One production adapter; fake test adapter exists (`tests/scenario/test_cli.py:400-430`).
- Git seam: true external local git/repo process (`git.py:140-150`). One production adapter; no fake adapter observed.
- Store seam: local-substitutable filesystem. Current interface is functions + leaked constants.
- Report/model modules: in-process.

## 2. Initial clues

### RunnerRegistry/Runner ABC may be over-abstraction

**Partly validate.**

Evidence:

- Only `ClaudeRunner` is registered in production (`runners.py:98-99`).
- README confirms only the `claude` runner exists today and `codex`/`pi` are not implemented (`README.md:26-38`).
- Tests use a fake runner through the same interface (`tests/scenario/test_cli.py:400-430`) and inject it via `RunnerRegistry` (`tests/scenario/test_cli.py:433-439`).

Deletion test:

- Deleting `RunnerRegistry` mostly makes complexity vanish: one name lookup and “available runners” error move into `deps.py`/`cli.py`.
- Deleting the runner seam itself makes complexity reappear in tests and `workflow.py`, because tests would need to fake `subprocess.Popen` or execute `claude`.

Verdict: keep a runner seam, but collapse or simplify `RunnerRegistry`/ABC ceremony until there are two production adapters.

### GitGateway ABC with single RealGitGateway may be over-abstraction

**Validate for the ABC, not for the module.**

Evidence:

- `GitGateway` declares nine abstract methods (`git.py:10-45`).
- Only `RealGitGateway` implements it (`git.py:48`).
- Production deps always use `RealGitGateway` (`deps.py:25`).
- Scenario tests use real git repos, not a fake git adapter (`tests/scenario/test_cli.py:433-437`).
- Gateway tests directly exercise `RealGitGateway` (`tests/gateways/test_git_gateway.py:12-66`).

Deletion test:

- Deleting the ABC makes complexity vanish; callers still need the same concrete git operations.
- Deleting `RealGitGateway` makes complexity reappear across `workflow.py` and tests, because it localizes git command details, detached HEAD rejection, diff capture, branch commit, and checkout (`git.py:52-150`).

Verdict: collapse `GitGateway` ABC; keep the concrete git adapter module.

### `store.py` mixes deep read/list with shallow helpers

**Validate.**

Evidence:

- Shallow config helper: `resolve_store_root` mostly encodes env precedence (`store.py:20-32`).
- Deep store behavior: `read_bundle`, `list_bundles`, prefix resolution, JSON validation, optional artifact loading (`store.py:65-148`).
- Workflow imports store layout constants and writes artifacts directly (`workflow.py:10-17`, `:55-57`, `:95-96`), so the store interface leaks implementation details.

Deletion test:

- Deleting `read_bundle`/`list_bundles` spreads prefix matching, JSON validation, artifact loading, and sort behavior into CLI/tests.
- Deleting `resolve_store_root` or constants mostly removes small pass-throughs.

Verdict: `store.py` has real depth, but its interface should be deepened around “run store” instead of exposing layout pieces.

### `workflow.py execute_run` may be a god-function

**Partly validate, with caution.**

Evidence:

- `execute_run` spans validation, adapter lookup, provenance, clean check, store allocation, runner execution, transcript handling, diff capture, branch creation, checkout restoration, bundle creation, and exit-code mapping (`workflow.py:29-152`).
- It is called as one deep interface from CLI (`cli.py:85-92`).
- Scenario tests use the CLI as the test surface and validate whole-run behavior: success/diff/report (`tests/scenario/test_cli.py:40-122`), dirty workdir rejection (`:125-148`), failed runner bundle persistence (`:243-282`).

Deletion test:

- Deleting `execute_run` would reintroduce orchestration complexity in `cli.py`; it earns its keep.
- Extracting tiny step functions would reduce depth and hurt locality.
- Extracting concept modules for “run store writer” or “result branch capture” may improve locality if new workflows appear.

Verdict: not a bad module yet; deepen by extracting concepts, not by mechanically splitting steps.

## 3. Top deepening/collapse candidates

### 1. Collapse `GitGateway` ABC, keep concrete git adapter

- **Files:** `src/vibechk/git.py`, `src/vibechk/deps.py`, tests that import types.
- **Deletion-test result:** ABC deletion makes complexity vanish; `RealGitGateway` deletion does not.
- **Dependency category:** true external local git process/repo.
- **Proposed shape:** remove abstract `GitGateway`; keep `RealGitGateway` or rename to a domain name like `GitWorkdir`.
- **Tests affected:** minimal; gateway tests already target `RealGitGateway`.
- **Strength:** Strong.
- **Risks:** If a future fake git adapter becomes necessary, reintroduce a seam then.

### 2. Deepen store into a run-store module/interface

- **Files:** `store.py`, `workflow.py`, `cli.py`, `tests/unit/test_store.py`, scenario tests.
- **Deletion-test result:** current deep read/list behavior earns its keep; shallow constants/root helpers leak layout.
- **Dependency category:** local-substitutable filesystem.
- **Proposed shape:** introduce a `RunStore`/`RunBundleStore` module with methods like allocate/write/read/list, keeping artifact filenames and prefix resolution inside the implementation.
- **Tests affected:** store unit tests should move from helper-level assertions to run-store interface assertions; scenario tests remain high-level.
- **Strength:** Strong.
- **Risks:** Avoid over-classing; the interface should be smaller than today’s constants + functions surface.

### 3. Simplify runner registry/ABC ceremony while preserving runner seam

- **Files:** `runners.py`, `deps.py`, `tests/scenario/test_cli.py`.
- **Deletion-test result:** `RunnerRegistry` mostly collapses; runner seam itself earns keep via fake runner and external Claude CLI.
- **Dependency category:** remote-owned runner behavior through true external local CLI.
- **Proposed shape:** keep `RunnerRequest`/runner adapter shape, but replace ABC/registry with a simple mapping or protocol-style duck type until `codex`/`pi` exist.
- **Tests affected:** fake runner setup in scenario tests.
- **Strength:** Worth exploring.
- **Risks:** README already promises future adapters; premature collapse may need reversal soon.

### 4. Extract result-branch capture only if workflow variants grow

- **Files:** `workflow.py`, `git.py`, possibly `store.py`.
- **Deletion-test result:** current branch-capture sequence would reappear if `run`, `publish`, retry, or compare workflows need it; today only `execute_run` uses it.
- **Dependency category:** true external git + local store.
- **Proposed shape:** a small deep module around “capture diff/result branch/restore start branch” rather than many step helpers.
- **Tests affected:** scenario tests; gateway tests may gain focused coverage.
- **Strength:** Speculative.
- **Risks:** Could make `workflow.py` shallower but increase total interface surface.

## 4. Test analysis

Good:

- Scenario tests use `build_cli()` as the user-facing test surface (`tests/scenario/test_cli.py:59-60`).
- Runner fake is a useful local-substitutable adapter for the runner seam (`tests/scenario/test_cli.py:400-430`).
- Git behavior is tested through real repos, which is appropriate for a true external local git adapter (`tests/gateways/test_git_gateway.py:12-66`).
- Report tests hit pure in-process interfaces (`tests/unit/test_reports.py:10-59`).

Friction:

- No fake git adapter exists, so `GitGateway` is currently hypothetical.
- Store tests are partly helper-shaped (`resolve_store_root`, `resolve_run_id`, `create_run_dir`) rather than one deep run-store interface (`tests/unit/test_store.py:21-127`).
- No direct `execute_run` unit tests; scenario tests cover it indirectly, which is acceptable while `execute_run` remains the core workflow interface.

## 5. Cross-package leverage/disruption

- `vibechk` is standalone/no-`asdl-core` per context map (`CONTEXT-MAP.md:62`) and package deps only list `click` (`packages/vibechk/pyproject.toml:7-9`).
- Do not import `asdl-core.git` just to reuse a git gateway; that would disrupt the standalone package shape.
- Cross-package leverage is mostly vocabulary/reporting consistency, not code sharing.

## 6. Final verdict

**Both: collapse and deepen.**

- **Collapse:** `GitGateway` ABC and possibly `RunnerRegistry` ceremony.
- **Deepen:** store interface around run bundles/artifacts; maybe branch capture if more workflows appear.
- **Do not over-split:** `execute_run` is long but currently a meaningful workflow module with a small interface.

**Confidence:** High for `GitGateway` collapse and store deepening; medium for runner simplification; low/speculative for workflow extraction.

Validation: read-only inspection only; no tests run. Blockers: none.
