# asdl-core Architecture Deepening Audit

Subagent session: `/var/folders/9r/wfby6pcs4mgbfb_lg0ndgb180000gn/T/pi-runner-subagents/session-ztnVNz/d9c9ae1c-5dff-4966-bef5-8c7fbb0e406a.jsonl`

## Read-only architecture audit: `packages/asdl-core`

### 1. Package map

`asdl-core` is explicitly the “shared substrate” for CLI, Git, Graphite, GitHub, sessions, plugin, repository config, and presentation vocabulary (`packages/asdl-core/CONTEXT.md:3`). Its local `AGENTS.md` frames it as a labs/incubator package with extractable subpackages and names `clinkr` as the graduation candidate (`packages/asdl-core/AGENTS.md:3`, `packages/asdl-core/AGENTS.md:19`).

| Module area | Actual seam / adapters | Dependency category | Depth assessment |
|---|---|---:|---|
| `clinkr` | `@clinkr_operation` + `ClinkrGroup`; Click is the only concrete adapter today (`clinkr/group.py:38`, `clinkr/group.py:72`) | in-process | Deep. Small operation interface generates Click params, JSON envelope, schema, failure translation, aliases, renderers. |
| `git` | `GitGateway` with `RealGitGateway` and `FakeGitGateway` (`git_gateway.py:23`, `real_git_gateway.py:488`, `testing.py:65`) | local-substitutable | Deep seam, but real adapter has scattered parser helpers and brittle subprocess tests. |
| `gh` | `PRGateway` with `RealPRGateway` and `FakePRGateway` (`pr_gateway.py:45`, `pr_gateway.py:140`, `pr_testing.py:28`) | remote-owned via `gh`/GitHub | Deep seam; real helper module mixes command construction, response parsing, and failure mapping. |
| `gt` | `GtGateway` with `RealGtGateway` and `FakeGtGateway` (`gt/gateway.py:15`, `gt/real_gateway.py:326`, `gt/testing.py:15`) | local-substitutable / Graphite-owned metadata | Good seam; metadata-store stack reader is deeper than CLI-output parsing. |
| `sessions` | `SessionSource` with `PiJsonlSessionSource` and `FakeSessionSource` (`sessions/source.py:10`, `sessions/adapters/pi_jsonl.py:163`, `sessions/testing.py:15`) | local-substitutable | Real seam. Harness adapter isolation is explicit (`sessions/AGENTS.md:9`). Evidence aggregation is deep at the public function but repetitive internally. |
| `payloads` | `PayloadStore` (`payloads/store.py:34`) | local filesystem / in-process | Deep enough: private dirs, sequence, exclusive writes, safe references behind small interface. |
| `prompts` | `resolve_prompt` (`prompts/resolver.py:14`) | local filesystem / in-process | Deep enough: safe prompt names, symlink checks, embedded fallback behind one interface. |
| top-level utilities | `plugin.py`, `console.py`, `format.py`, root `__init__.py` | in-process | Mixed. `plugin.py`/`console.py` earn their keep. Root `__init__.py` re-export is shallow and creates non-canonical imports. |

---

### 2. Initial clues

#### Clue A: `asdl-core` has highest leverage

**Validated.** Context map shows downstream edges from `brmem`, `asdl-handoff`, `asdl-pr-address`, `roaster`, `asdl-slots`, `asdl-objectives`, and `aretro` into `asdl-core` (`CONTEXT-MAP.md:54`-`CONTEXT-MAP.md:61`). A quick import scan found `asdl-pr-address`, `asdl-slots`, `roaster`, `brmem`, `aretro`, `asdl-handoff`, `asdl-objectives`, `areg`, and `asdl-dispatcher` importing `asdl_core`.

#### Clue B: parse-helper extraction across Git/GH/GT

**Validated, but refine the shape.** There is repeated “external output → domain type” implementation:

- Git has many public parse helpers: porcelain, branch tips, worktree list, path touch, log range, patch id, name-status (`real_git_gateway.py:35`, `:56`, `:123`, `:295`, `:373`, `:392`, `:452`).
- GH maps JSON/GraphQL/REST responses in helper functions (`real_gateway_helpers.py:148`, `:180`, `:297`, `:350`, `:377`, `:401`, `:431`).
- GT parses children JSON and reads Graphite metadata rows (`gt/real_gateway.py:102`, `:145`, `:292`).

**Refinement:** a generic `parse_helper` module would likely be shallow: Git NUL output, GitHub JSON/GraphQL, and Graphite SQLite metadata have different domain contracts. Better deep module shape: named domain converters/readers, e.g. `GitOutputParser`, `PRResponseMapper`, `GraphiteMetadataReader`.

#### Clue C: `sessions/evidence.py` has near-identical helpers

**Validated, but current public interface is already deep.** `collect_session_evidence` hides six evidence kinds behind one interface (`sessions/evidence.py:142`), while handler functions repeat group/accumulator/item construction (`:188`, `:225`, `:270`, `:312`, `:364`, `:407`). Worth exploring an internal collector/handler shape only if more evidence kinds are coming.

#### Clue D: `clinkr/group.py` reflection/Click/render/failure paths

**Validated as complex, but not obviously a problem.** `_register_operation` combines request reflection, Click param build, JSON/human dispatch, and failure translation (`clinkr/group.py:72`); param building is separate but still in same module (`:172`, `:193`, `:253`). However the interface is deep and tests exercise it through `ClinkrGroup` and `CliRunner`, not internals. A second non-CLI adapter would justify a new internal seam; today it is speculative.

---

### 3. Top candidates

#### 1. Domain output converters for real adapters

- **Files:** `git/real_git_gateway.py`, `gh/real_gateway_helpers.py`, `gt/real_gateway.py`; tests in `tests/gateways/test_real_git_gateway.py`, `test_real_pr_gateway.py`, `test_real_gt_gateway.py`.
- **Current interface:** deep external seams (`GitGateway`, `PRGateway`, `GtGateway`), but shallow parser helper locality.
- **Deletion test:** deleting individual parser helpers mostly inlines complexity back into real adapters. A true domain converter earns keep only if multiple methods/tests call semantic conversion names.
- **Dependency category:** Git/GT local-substitutable; GH remote-owned.
- **Proposal:** split by domain, not generic parse-helper.
- **Tests affected:** raw parser tests and subprocess-patching tests (`test_real_git_gateway_log_range.py:15`-`:83`; `test_real_pr_gateway.py:73`-`:188`).
- **Strength:** Strong for Git/GH; Worth exploring for GT because metadata reader is already relatively cohesive.
- **Risk:** extraction that only moves functions without changing test surface is churn.

#### 2. Reduce real adapter subprocess test brittleness

- **Files:** same real gateway tests.
- **Evidence:** tests assert exact command arrays and patch `subprocess.run` directly (`test_real_git_gateway.py:25`-`:31`, `:72`-`:85`; `test_real_pr_gateway.py:217`, `:239`, `:317`).
- **Deletion test:** deleting these tests loses adapter contract coverage; but current interface is partly subprocess details, not semantic gateway behavior.
- **Proposal:** keep a small adapter-contract layer that tests command construction, but push most tests through gateway semantic outputs and converter modules.
- **Strength:** Strong.
- **Risk:** over-faking can miss real CLI drift; keep live/conformance tests like PR lookup (`live_conformance/github/test_readonly_pr_gateway.py:11`).

#### 3. Internal `EvidenceCollector` / handler list

- **Files:** `sessions/evidence.py`, `tests/unit/sessions/test_evidence.py`.
- **Current interface:** `collect_session_evidence` is deep; tests already hit the right interface (`test_evidence.py:21`, `:37`, `:71`, `:95`, `:143`, `:192`).
- **Deletion test:** public module earns its keep; internal helper deletion would not spread beyond one file yet.
- **Proposal:** introduce internal handler/collector only when evidence kinds grow; otherwise a smaller shared grouped-item builder may be enough.
- **Strength:** Worth exploring.
- **Risk:** premature handler abstraction could reduce locality.

#### 4. `clinkr` operation descriptor / non-CLI adapter seam

- **Files:** `clinkr/group.py`, `clinkr/operation.py`, `clinkr/exit.py`.
- **Current interface:** deep. One operation definition yields human CLI, JSON envelope, schema, aliases, renderers (`clinkr/README.md:3`, `:69`, `:153`, `:159`).
- **Deletion test:** deleting `ClinkrGroup` spreads Click/Pydantic/exit behavior across every CLI package.
- **Proposal:** do nothing unless a second adapter is planned. If Pi/TUI/direct schema execution appears, extract an operation descriptor/invoker seam.
- **Strength:** Speculative.
- **Risk:** adding a seam with only the Click adapter violates “one adapter = hypothetical seam.”

#### 5. Collapse root `asdl_core.__init__` re-export

- **Files:** `src/asdl_core/__init__.py`; downstream `asdl-slots` imports.
- **Current interface:** shallow re-export of `get_console`, `make_table`, `format_relative_time`, `state_badge`.
- **Deletion test:** deleting it mostly makes imports more explicit; complexity vanishes.
- **Proposal:** consumers should import canonical modules (`asdl_core.console`, `asdl_core.format`).
- **Strength:** Strong but small.
- **Risk:** disrupts current downstream imports, especially `asdl-slots` files importing `from asdl_core import get_console`.

---

### 4. Test analysis

**Brittle / implementation-aware tests**

- Git tests know raw NUL formats and exact subprocess commands (`test_real_git_gateway_log_range.py:18`, `:83`-`:103`).
- PR tests embed a large fake `gh` command dispatcher and assert exact `gh` command shapes (`test_real_pr_gateway.py:73`-`:188`, `:217`, `:239`, `:317`).
- Some payload failure tests patch low-level write functions, but that is localized fault-injection rather than broad subprocess coupling.

**Good interface tests**

- `clinkr` tests invoke generated commands via `CliRunner`, exercising the operation interface as test surface (`test_operation_registration.py:44`, `:52`, `:60`, `:166`).
- `sessions/evidence` tests call `collect_session_evidence` directly and assert semantic evidence items (`test_evidence.py:21`-`:260`).
- `FakePRGateway` tests exercise gateway semantics and mutation state (`test_fake_pr_gateway.py:48`, `:122`, `:153`, `:179`).
- `PayloadStore` tests mostly use public store methods and filesystem effects.

---

### 5. Cross-package leverage

- **`asdl-pr-address` / `roaster`:** biggest winners from PR response converter and less brittle `PRGateway` behavior.
- **`asdl-slots`:** sensitive to Git/Gt changes and root re-export collapse; likely disrupted by canonical import cleanup.
- **`brmem`, `asdl-handoff`, `asdl-objectives`:** benefit from safer Git/Clinkr evolution.
- **`aretro`:** benefits from sessions/evidence collector and payload interfaces.
- **`areg`:** only narrow `project_config` exposure.
- **`packagechk`, `vibechk`:** no direct `asdl-core` leverage per context map.

---

### 6. Final verdict

`asdl-core` should outrank `asdl-slots` for architecture leverage, because its seams are reused across most repo CLIs and improvements compound across packages. However, the work should be narrow: real adapter output converters, subprocess-test locality, and small canonical-import cleanup. I would not do a broad `clinkr` redesign without a second adapter.

**Confidence:** medium-high. I audited `asdl-core` deeply but did not perform a comparable internal audit of `asdl-slots`.

**Validation:** read-only audit only; no tests run and no files edited.
