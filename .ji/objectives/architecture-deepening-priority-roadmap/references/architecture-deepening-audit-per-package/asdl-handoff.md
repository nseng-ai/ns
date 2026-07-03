# asdl-handoff Architecture Deepening Audit

Subagent session: `/var/folders/9r/wfby6pcs4mgbfb_lg0ndgb180000gn/T/pi-runner-subagents/session-nQ2zgN/98faf7e0-d3ed-4ca2-8e75-8129e690f848.jsonl`

## Summary

Read-only audit completed for `packages/asdl-handoff`. No files changed.

Validation run:

```bash
uv run pytest packages/asdl-handoff/tests/scenario/test_handoff_cli.py
# 40 passed in 0.08s
```

Inspected:

- `CONTEXT.md`, `CONTEXT-MAP.md`
- `packages/asdl-handoff/CONTEXT.md`
- `packages/asdl-handoff/src/asdl_handoff/**`
- `packages/asdl-handoff/tests/scenario/test_handoff_cli.py`
- Minimal dependency context: `packages/brmem/CONTEXT.md`, `packages/brmem/AGENTS.md`, `packages/brmem/src/brmem/gateway.py`, `packages/asdl-core/src/asdl_core/git/git_gateway.py`

---

## 1. Package map

### Package role

`asdl-handoff` owns “directed handoff artifact vocabulary and user-facing handoff inventory over Branch Memory storage” (`packages/asdl-handoff/CONTEXT.md:3`). The domain concepts are clear:

- **Handoff Artifact**, **Continuation Focus** (`packages/asdl-handoff/CONTEXT.md:7`, `:11`)
- **Handoff Slug / Handoff Key / Handoff Namespace** (`packages/asdl-handoff/CONTEXT.md:23`, `:27`, `:31`)
- **Handoff Summary**, **Branch State**, **List Scope**, **All-Branches Inventory** (`packages/asdl-handoff/CONTEXT.md:35`, `:47`, `:51`, `:55`)
- **Delete a Handoff**, **Handoff Garbage Collection** (`packages/asdl-handoff/CONTEXT.md:59`, `:63`)

The implemented package is currently narrower than the vocabulary: the CLI group exposes only `list`, `delete`, and `gc` (`packages/asdl-handoff/src/asdl_handoff/cli/handoff/group.py:11-15`). Create/pickup are domain terms but not package operations here.

### Major modules

- `cli/main.py`, `cli/plugin.py`: standalone CLI and plugin adapter (`main.py:8-15`, `plugin.py:8-12`).
- `cli/handoff/context.py`: typed context and real adapter assembly for `BranchMemoryGateway` + `GitGateway` (`context.py:14-29`).
- `cli/handoff/group.py`: Clinkr group registration (`group.py:11-15`).
- `cli/handoff/inventory.py`: central inventory module. Converts brmem `EntryRef`s into `HandoffSummary`s, applies handoff key filtering, branch-state lookup, timestamp loading/parsing, dedupe, and sorting (`inventory.py:30-82`).
- `cli/handoff/list.py`: list operation + human/markdown renderers. Calls brmem listing and `collect_handoff_summaries` (`list.py:127-160`).
- `cli/handoff/delete.py`: exact-slug delete operation, slug→key validation, branch resolution, brmem check/delete (`delete.py:67-105`, `:116-168`).
- `cli/handoff/gc.py`: garbage-collection operation. Loads all summaries, previews deleted-branch candidates, optionally deletes them (`gc.py:93-116`, `:125-162`).

### Real seams / adapters

Real seams exist at the gateway context:

- `HandoffCliContext` depends on `BranchMemoryGateway` and `GitGateway` interfaces (`context.py:14-20`).
- Real adapters are assembled in `build_handoff_context` via `RealBranchMemoryGateway` and `RealGitGateway` (`context.py:23-29`).
- Tests use `FakeBranchMemoryGateway` and `FakeGitGateway` through the same context seam (`tests/scenario/test_handoff_cli.py:41-59`).

This is a real seam because there are at least two adapters: real and fake.

Dependency categories:

- `asdl_core.clinkr`, render helpers: in-process framework.
- `brmem.gateway.BranchMemoryGateway`: local-substitutable; real/fake adapters; backed by local git refs.
- `asdl_core.git.GitGateway`: local-substitutable; real/fake adapters; backed by local git.
- No remote-owned dependency in this package.
- `click`: true external library, but not the architectural pressure point.

### Depth assessment

- `inventory.collect_handoff_summaries` is the deepest module. Its interface is still somewhat leaky because callers provide raw `EntryRef`s plus two gateways, but deleting it would force list/gc to duplicate namespace filtering, handoff key shape, branch-state caching, timestamp failure semantics, and sorting (`inventory.py:30-82`; list caller at `list.py:156-160`; gc caller at `gc.py:125-127`).
- `is_handoff_key` and `handoff_slug_from_key` are shallow private primitives. Their interface is nearly the implementation (`inventory.py:116-126`).
- `delete.py`, `list.py`, and `gc.py` are operation modules with acceptable locality for a small CLI package. They mix orchestration and rendering, but the interface is the CLI/Clinkr operation, and tests hit that interface.

---

## 2. Initial clues

### Clue A: shallow primitives in `inventory.py`

**Validated partially.**

- `is_handoff_key` is used only inside `collect_handoff_summaries` (`inventory.py:42`, `:116-122`).
- `handoff_slug_from_key` is used only inside `collect_handoff_summaries` (`inventory.py:54`, `:125-126`).

Deletion test:

- Deleting these two helpers makes complexity vanish into the one caller. They are shallow.
- Deleting `collect_handoff_summaries` does **not** make complexity vanish. It would reappear in both `list` and `gc`, especially:
  - filtering namespace/key shape (`inventory.py:42`)
  - branch-state filtering before timestamp lookup (`inventory.py:50-56`)
  - timestamp error handling (`inventory.py:56-65`)
  - branch/newest/slug sorting (`inventory.py:80-82`)
  - shared callers in list/gc (`list.py:156-160`, `gc.py:125-127`)

Verdict: collapse tiny helpers or fold them into a deeper handoff-key contract; keep/deepen `collect_handoff_summaries`.

### Clue B: `_resolve_branch` duplicated in `delete.py` and `list.py`

**Validated, but low severity.**

- `delete._resolve_branch` validates explicit branch and current branch (`delete.py:143-158`).
- `list._resolve_branch` assumes explicit-branch validation already happened and only resolves omitted branch (`list.py:139-146`, `:214-226`).
- Detached-head messages intentionally differ by operation (`delete.py:149-153`, `list.py:219-223`).

Deletion test:

- Deleting both helpers would reintroduce branch/current-branch/detached-head handling in two callers.
- That is only N=2, and the divergence is meaningful enough that an over-general helper could reduce locality.

Verdict: worth a small shared helper only if another operation appears. Today it is cleanup, not deep architecture.

### Clue C: high score but low stakes/leverage

**Validated.**

The package is small: three operations (`group.py:15`), one scenario test file with 40 passing tests, and a real gateway seam already in place. The most important domain/storage seam belongs to brmem and git gateways, not to `asdl-handoff`.

Final assessment: useful cleanup opportunities, but not a serious architecture target.

---

## 3. Top candidates

### 1. Concentrate Handoff Slug / Handoff Key contract

- **Files:** `inventory.py`, `delete.py`, `tests/scenario/test_handoff_cli.py`
- **Evidence:** suffix/key rules are split:
  - inventory suffix and key predicate (`inventory.py:15-16`, `:116-126`)
  - delete suffix and slug→key validation (`delete.py:24`, `:116-140`)
  - tests repeat raw storage keys like `"alpha.md"` (`tests/scenario/test_handoff_cli.py:110-127`, `:288-294`)
- **Deletion test:** current tiny helpers are shallow, but the key/slug contract itself is real. If removed, `.md`, flat-key, slash rejection, and check-key knowledge reappears in inventory, delete, and tests.
- **Dependency category:** in-process.
- **Proposed shape:** local `handoff_key.py` module owning suffix, `key_from_slug`, `slug_from_key`, and `is_handoff_key`.
- **Tests affected:** delete invalid slug tests (`tests/scenario/test_handoff_cli.py:212-283`), list filtering tests (`:288-309`).
- **Strength:** Worth exploring.
- **Risk:** Don’t over-object-model this; a few functions are enough.

### 2. Deepen inventory loading around List Scope

- **Files:** `inventory.py`, `list.py`, `gc.py`
- **Evidence:** callers still know how to ask brmem for handoff entries:
  - list calls `list_entries(namespace=HANDOFF_NAMESPACE, branch=branch)` (`list.py:146-150`)
  - gc calls `list_entries(namespace=HANDOFF_NAMESPACE, branch=None)` (`gc.py:125-127`)
  - inventory then owns filtering, branch state, timestamp loading, and sorting (`inventory.py:30-82`)
- **Deletion test:** `collect_handoff_summaries` earns its keep; deleting it duplicates complexity in list/gc.
- **Dependency category:** local-substitutable via brmem/git gateways.
- **Proposed shape:** a deeper inventory module that accepts a List Scope and context/gateways, owns both `list_entries` and summary collection.
- **Tests affected:** list all/current/deleted behavior (`tests/scenario/test_handoff_cli.py:348-481`), timestamp failure/order behavior (`:570-604`), gc preview/delete (`:687-738`).
- **Strength:** Worth exploring if handoff inventory grows beyond list/gc.
- **Risk:** Could hide simple brmem calls behind an unnecessary abstraction if no new operations appear.

### 3. Shared branch resolver for handoff operations

- **Files:** `delete.py`, `list.py`
- **Evidence:** duplicated current-branch and detached-head handling (`delete.py:143-158`, `list.py:214-226`).
- **Deletion test:** complexity reappears in exactly two callers.
- **Dependency category:** local-substitutable via `GitGateway`.
- **Proposed shape:** local helper, not `asdl-core`, parameterized by operation-specific detached-head message and whether explicit branches require validation.
- **Tests affected:** delete/list detached-head and invalid-branch tests (`tests/scenario/test_handoff_cli.py:246-272`, `:628-683`).
- **Strength:** Speculative / low-priority cleanup.
- **Risk:** Generic helper may obscure operation-specific UX.

### 4. Collapse duplicated test storage knowledge

- **Files:** `tests/scenario/test_handoff_cli.py`
- **Evidence:** tests repeatedly seed brmem with namespace/key/branch literals and assert raw locators (`tests/scenario/test_handoff_cli.py:110-133`, `:288-294`, `:687-738`).
- **Deletion test:** deleting those literals without a helper would scatter handoff key/namespace knowledge across many tests.
- **Dependency category:** in-process test support.
- **Proposed shape:** test helper like `seed_handoff(gateway, slug, branch, body)` plus expected locator helper where the locator is part of the user-visible interface.
- **Tests affected:** most scenario tests.
- **Strength:** Strong cleanup, low architecture impact.
- **Risk:** Don’t hide assertions where the public JSON intentionally exposes `key` and `entry_locator`.

### 5. Do not extract GC planning yet

- **Files:** `gc.py`
- **Evidence:** preview, delete, result counting, and rendering are all local to one operation (`gc.py:93-116`, `:130-210`).
- **Deletion test:** extracting a GC-plan module creates a seam with one adapter/caller. Complexity does not gain leverage.
- **Dependency category:** in-process/local-substitutable through existing gateways.
- **Proposed shape:** keep local unless another operation needs GC planning.
- **Tests affected:** gc dry-run/force/prompt/json tests (`tests/scenario/test_handoff_cli.py:687-827`).
- **Strength:** Refute extraction.
- **Risk:** None; current locality is acceptable.

---

## 4. Test analysis

Good:

- Tests hit the right interface: standalone CLI via `build_cli()` (`tests/scenario/test_handoff_cli.py:32-34`).
- Gateway seam is exercised with fakes (`tests/scenario/test_handoff_cli.py:41-59`).
- Coverage is broad: help/version, human/json/markdown output, deleted branches, invalid slugs/branches, timestamp errors, prompt stdout/stderr behavior, gc dry-run/force/cancel.

Friction:

- Tests duplicate handoff namespace/key/storage knowledge with many `gateway.put("handoff", "<slug>.md", ...)` calls.
- Some tests assert brmem Entry Locator layout directly (`tests/scenario/test_handoff_cli.py:123-130`, `:166-169`). This is valid where the CLI promises `entry_locator`, but it couples handoff tests to brmem ref layout.
- No direct inventory tests. That is currently acceptable because “the interface is the test surface” and the package interface is CLI. If inventory becomes deeper, add tests at that new inventory interface.

---

## 5. Cross-package leverage / disruption

- `brmem` must remain workflow-agnostic: its AGENTS file says namespace schema/slug rules are not a brmem concern (`packages/brmem/AGENTS.md:3`). Do **not** move handoff key semantics into brmem.
- `asdl-core.git` already provides the required local-substitutable `GitGateway` seam (`packages/asdl-core/src/asdl_core/git/git_gateway.py:23`, `:39-51`). A handoff-specific branch resolver should stay local unless multiple packages converge on the exact same UX.
- Cross-package leverage is low. Improvements mostly benefit `asdl-handoff` tests and maintainability.
- Disruption risk is highest if changing brmem locator/key behavior; avoid that.

---

## 6. Final verdict

`packages/asdl-handoff` is **mostly cleanup**, not a serious architecture target.

Confidence: **high**.

The real architecture is already in decent shape: the package has a clear domain, a real gateway seam, and CLI scenario tests at the public interface. The best next step would be small locality improvements around the Handoff Slug/Key contract and test helpers, not a broad redesign.
