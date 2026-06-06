# brmem Architecture Deepening Audit

Subagent session: `/var/folders/9r/wfby6pcs4mgbfb_lg0ndgb180000gn/T/pi-runner-subagents/session-DWtzL4/dfd1e4e3-9698-4c84-b623-bbec8751591f.jsonl`

## 1. Package map

`brmem` is a low-level Branch Memory System: branch-scoped, Git-ref-backed text Entries for higher-level workflows. Domain terms are cleanly separated: Namespace, Base Namespace, Entry, Entry Key, Snapshot, Snapshot Ref, Entry Locator, Namespace Copy, Copy Conflict, Export.

Major modules:

- **Interface seam:** `packages/brmem/src/brmem/gateway.py`
  - `BranchMemoryGateway` defines the test surface: `list_entries`, `list_all_entries`, `put`, `get`, `check`, `get_entry_updated_at`, `delete`, `copy_entries` (`gateway.py:47-147`).
- **Adapters:** real seam is earned.
  - `RealBranchMemoryGateway` in `real.py:166`.
  - `FakeBranchMemoryGateway` in `fake.py:63`.
  - CLI context injects the interface and wires the real adapter (`context.py:15-28`).
  - Scenario tests inject the fake through `BrmemCliContext` (`test_brmem_cli.py:32-42`).
- **Storage layout module:** `ref_layout.py`
  - Owns `EntryRef`, `SnapshotRef`, Snapshot Ref names, Entry Locators, encoding/decoding, branch/namespace validation (`ref_layout.py:29`, `51`, `124`, `142`, `154`, `238`, `253`).
- **CLI operation modules:** `put.py`, `get.py`, `list.py`, `check.py`, `delete.py`, `copy.py`, `export.py`.
- **Implementation-heavy modules:**
  - `real.py` owns local Git plumbing: `hash-object`, `commit-tree`, `update-ref`, `for-each-ref`, tree building/enumeration (`real.py:71`, `143`, `200`, `368`, `550`).
  - `copy.py` owns CLI planning/dry-run/conflict UX before delegating mutation to the gateway (`copy.py:130-263`).
  - `export.py` owns filesystem materialization and preflight safety (`export.py:116`, `193`, `240`, `332`).

Dependency categories:

- **In-process:** validation, ref layout, Clinkr request/result/rendering, fake gateway.
- **Local-substitutable:** Git repository/Git CLI through `RealBranchMemoryGateway`; filesystem export; current-branch lookup through `asdl_core.git`.
- **Remote-owned:** none.
- **True external:** no network service; only local Git executable/filesystem behavior.

## 2. Initial clues validated/refuted

### Clue: “brmem is a negative control: already well-layered BranchMemoryGateway with real.py + fake.py = real seam.”

**Validated.** This is a real seam by the “two adapters = real seam” rule.

Evidence:

- Interface: `BranchMemoryGateway` (`gateway.py:47`) defines operations and behavior-rich docstrings, especially `copy_entries` (`gateway.py:136`).
- Real adapter: `RealBranchMemoryGateway` (`real.py:166`).
- Fake adapter: `FakeBranchMemoryGateway` (`fake.py:63`).
- Tests hit the seam:
  - fake gateway tests cover behavior through the interface (`test_fake_brmem_gateway.py:13+`, copy coverage starts `:254`).
  - real integration tests cover same storage behavior against Git (`test_real_brmem_gateway.py:48`, `272`, `427`, `640`).
  - scenario CLI tests inject fake gateway via context (`test_brmem_cli.py:32-42`).

Deletion test: deleting `BranchMemoryGateway` would not make complexity vanish; it would reappear across brmem CLI tests, handoff, roaster, and adapter-specific tests. The module earns its keep.

### Clue: “Large files real.py, export.py, copy.py, ref_layout.py may be legitimately complex, not god-modules.”

**Mostly validated.**

- `real.py` is large because Git snapshot-tree behavior is intrinsically local-substitutable implementation complexity: tree build/enumeration (`real.py:71`, `143`), `put` (`:200`), `copy_entries` (`:368`), `_copy_snapshot` (`:425`), `_copy_with_glob` (`:474`), ref enumeration (`:550`).
- `copy.py` is large because it owns CLI interface/UX, dry-run planning, source SHA reporting, and conflict messaging before mutation (`copy.py:130-263`).
- `export.py` is large because filesystem safety is real behavior, not pass-through: prepare, preflight, write, path safety (`export.py:193`, `240`, `252`, `266`, `287`, `311`, `332`).
- `ref_layout.py` is moderately broad but conceptually cohesive around Snapshot Ref / Entry Locator layout.

No god-module finding. The large modules mostly hide complexity behind small interfaces and improve locality.

### Clue: “Minor candidate: ref_layout.py mixes ref encoding with branch/namespace validation; could split validators out.”

**Partially validated, but weak.**

`ref_layout.py` does mix layout construction/parsing with branch/namespace validators (`ref_layout.py:124`, `142`, `154`, `220`, `225`, `238`, `253`). However, branch validation is not generic validation; it is an invariant of the flat branch encoding (`/ -> ---`) and Snapshot Ref layout (`ref_layout.py:220-225`, `260-265`). Unit tests explicitly frame branch validation as a brmem storage invariant that downstream consumers should not duplicate (`test_brmem_branch_validation.py:1-8`).

Deletion test: extracting validators would not remove complexity; callers would still need the same rules. Split only if `ref_layout.py` grows further or if another module needs branch/namespace validation without ref-layout concepts.

### Clue: “Avoid making namespace schema/slug rules into brmem concerns; workflows own those.”

**Validated strongly.**

Evidence:

- Package instruction: Namespace is a parameter, not a brmem concern; brmem must remain agnostic of Namespace schema, slug rules, workflow (`packages/brmem/AGENTS.md:3`).
- Domain context: named Namespaces are owned by higher-level workflows (`packages/brmem/CONTEXT.md:15-17`).
- Roaster owns its namespace and slug/key schema (`stack_run_storage.py:28`, `86-117`).
- Handoff owns handoff namespace/key filtering (`inventory.py:12`, `14`, `85+`).

Do not push handoff/roaster/planned-branch schema into brmem.

## 3. Top candidates / no-action candidates

### 1. No-action: keep `BranchMemoryGateway` seam as-is

- **Files:** `gateway.py`, `real.py`, `fake.py`, brmem/handoff/roaster contexts.
- **Deletion test:** deleting the interface spreads complexity across CLI, handoff, roaster, and tests.
- **Dependency category:** interface is in-process; real adapter hides local-substitutable Git.
- **Proposed shape:** no change.
- **Tests affected:** none.
- **Strength:** Strong no-action.
- **Risk:** Interface inflation. Avoid adding workflow-specific methods.

### 2. Worth exploring: extract Git snapshot-tree plumbing from `real.py`

- **Files:** `real.py:71`, `real.py:143`, `tests/unit/test_brmem_tree_helpers.py`.
- **Problem:** tests import private helpers from `real.py`, and those tests are Git-backed despite living under unit tests.
- **Deletion test:** helpers earn their keep; deleting them would duplicate tree plumbing in `put`, `delete`, and glob copy.
- **Dependency category:** local-substitutable Git implementation.
- **Proposed shape:** an internal implementation module like `snapshot_tree.py` for `_build_tree_from_entries` / `_enumerate_tree_entries`; keep `BranchMemoryGateway` unchanged.
- **Tests affected:** move/update `test_brmem_tree_helpers.py`; possibly classify as integration.
- **Strength:** Worth exploring.
- **Risk:** mostly churn; no user leverage unless `real.py` becomes harder to navigate.

### 3. Speculative/no-action: split branch/namespace validators from `ref_layout.py`

- **Files:** `ref_layout.py`, `test_brmem_ref_layout.py`, `test_brmem_branch_validation.py`.
- **Deletion test:** complexity does not vanish; encoding invariants stay coupled to Snapshot Ref layout.
- **Dependency category:** in-process.
- **Proposed shape:** only split if a new module name preserves the concept, e.g. “ref layout validation,” not generic workflow validation.
- **Tests affected:** unit imports.
- **Strength:** Speculative.
- **Risk:** creates a shallow pass-through module and weakens locality.

### 4. Speculative: factor `copy.py` planning without expanding gateway interface

- **Files:** `copy.py:130-263`, `gateway.py:136`, `real.py:368`, `fake.py:243`.
- **Problem:** CLI precomputes conflicts/source plan, while adapters also enforce conflicts.
- **Deletion test:** CLI planning is real because dry-run/reporting needs it; gateway enforcement is also real because mutation must be atomic.
- **Dependency category:** in-process over gateway seam.
- **Proposed shape:** if copy behavior grows, extract an in-process `copy_plan` module used by CLI only. Do not add a broad planning method to `BranchMemoryGateway` unless a second consumer appears.
- **Tests affected:** scenario copy tests around dry-run/glob/conflict.
- **Strength:** Speculative.
- **Risk:** reducing gateway depth by exposing implementation details.

### 5. No-action: keep `export.py` as operation-local filesystem logic

- **Files:** `export.py`, scenario export tests.
- **Deletion test:** deleting export helpers moves filesystem safety checks into `run_export`; complexity remains.
- **Dependency category:** local-substitutable filesystem.
- **Proposed shape:** no change now.
- **Tests affected:** none.
- **Strength:** Strong no-action.
- **Risk:** premature seam. One adapter only; no second export adapter exists.

## 4. Test analysis

Good test surfaces:

- `BranchMemoryGateway` is the main test surface.
  - fake gateway tests cover behavior quickly.
  - real integration tests verify Git ref/tree invariants.
  - CLI scenario tests use `build_cli()` and inject `BrmemCliContext` with `FakeBranchMemoryGateway`, which is the right seam (`test_brmem_cli.py:24`, `32-42`).
- Real Git tests intentionally assert refs/tree behavior, e.g. Snapshot Ref history and no working-tree mutation (`test_real_brmem_gateway.py:48-69`), malformed ref skipping (`:207-219`), snapshot copy SHA reuse (`:427-449`), glob-copy parent pointer (`:640-681`).

Minor over-coupling / cleanup:

- `tests/unit/test_brmem_tree_helpers.py` imports private `real.py` helpers and says it is “integration-style” despite living under unit tests. This is the clearest test-layout smell.
- Scenario tests hardcode Entry Locator strings. That is acceptable where the locator is user-facing output, but ref encoding itself should remain primarily owned by `test_brmem_ref_layout.py`.

## 5. Cross-package leverage/disruption

- **asdl-handoff:** directly consumes `BranchMemoryGateway`, `RealBranchMemoryGateway`, `EntryRef`, and key validation. It owns `HANDOFF_NAMESPACE = "handoff"` and handoff key rules (`inventory.py:11-14`, `85+`). Gateway/interface changes would disrupt handoff list/delete/gc flows.
- **roaster:** uses Branch Memory as stack-run persistence. It owns `ROASTER_RUNS_NAMESPACE = "roaster-runs"` and stack-run key/slug validation (`stack_run_storage.py:28`, `86-117`, `179+`). Tightening brmem key/branch rules could disrupt roaster.
- **asdl-core:** brmem only depends on allowed `asdl_core.clinkr` and `asdl_core.git` surfaces. Keep it that way (`packages/brmem/AGENTS.md:7`).
- **Disruption risk:** low for internal refactors that keep `BranchMemoryGateway` and Entry Locator semantics stable; high for interface or validation changes.

## 6. Final verdict

`brmem` is mostly a **negative control**, not a major architecture target. It already has a real seam, meaningful adapters, and good locality around Git storage complexity.

Best follow-up, if any: extract/name Git snapshot-tree plumbing or move its tests to integration. Otherwise leave the package alone.

**Confidence:** high.

Validation run: `uv run pytest packages/brmem/tests` → **335 passed**. No files edited.
