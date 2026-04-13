# Plan: Progress objective #39 — Port `slot repair` + diagnostics (Roadmap 3)

## Context

Objective #39 ports erk's worktree pool manager ("slots") to twerk as a
standalone `twerk-slots` package. Roadmaps 1, 2, and 4 are complete
(PRs #67, #70, #72, #73). This session finishes the last remaining
roadmap item — **Roadmap 3: Diagnostics + `slot repair`** — which closes
the final two pending completion criteria:

- `twerk slot repair` detects and fixes pool.json ↔ git inconsistencies
- Tests cover diagnostics

The objective body is also mildly stale: it still lists `slot goto` as
pending even though it shipped in PR #73. The reconciliation step will
fix that.

Approach: port erk's `diagnostics.py` + `repair_cmd.py` with two
simplifications confirmed by the user:

1. **No interactive prompt.** Default `slot repair` previews; `--force`
   applies. Matches twerk's existing no-prompt pattern (assign/free/goto)
   and works cleanly in JSON mode.
2. **No `closed-pr` check.** Explicitly scoped out in the objective's
   Non-Goals (would require coupling to the GitHub gateway).

Six diagnostic codes ported (all except `closed-pr`): `orphan-state`,
`orphan-dir`, `missing-branch`, `branch-mismatch`, `git-registry-missing`,
`untracked-worktree`.

## Design decisions

### Repair UX

- `slot repair` → preview only (no mutation). Lists issues, shows what
  `--force` would remove.
- `slot repair --force` → applies repairs (removes stale assignments,
  saves pool.json).
- `slot repair --dry-run` → explicit alias for default preview behavior
  (satisfies the objective's "Supports `--dry-run`" criterion; makes
  scripting intent clear). `--force` and `--dry-run` are mutually
  exclusive.

### Repairable vs. informational codes

**Repairable** (auto-removed by `--force`): `orphan-state`,
`missing-branch`, `git-registry-missing`, `branch-mismatch`. The fix is
the same in every case — drop the stale assignment from pool.json.

**Informational** (printed with manual remediation): `orphan-dir`,
`untracked-worktree`. These need filesystem or git-state action that
twerk-slots shouldn't take automatically.

### Gateway surface

Twerk's `GitGateway` already has everything needed: `list_worktrees()`,
`path_exists()`, `branch_exists()`. No additions needed there.

One small addition to `SlotsStorageGateway` for `orphan-dir` detection:

```python
def list_subdirs(self, path: Path) -> tuple[str, ...]: ...
```

Returns names (not paths) of immediate subdirectories. Empty tuple if
`path` doesn't exist. Added to the ABC, `RealSlotsStorageGateway`, and
`FakeSlotsStorageGateway`.

## Files to create / modify

### New files

- `packages/twerk-slots/src/twerk_slots/diagnostics.py`
  - `SyncIssueCode = Literal["orphan-state","orphan-dir","missing-branch","branch-mismatch","git-registry-missing","untracked-worktree"]`
  - `@dataclass(frozen=True) class SyncIssue: code, message, slot_name`
    (adding `slot_name` to the dataclass — cleaner than erk's string-split
    extraction from `message`)
  - Helper `_check_*` functions (pure, take gateway + state args)
  - `run_sync_diagnostics(*, state, repo, git, storage) -> tuple[SyncIssue, ...]`

- `packages/twerk-slots/src/twerk_slots/repair.py`
  - `REPAIRABLE_CODES: frozenset[SyncIssueCode]`
  - `@dataclass(frozen=True) class RepairableAssignment: assignment, issue_code`
  - `find_stale_assignments(state, issues) -> tuple[RepairableAssignment, ...]`
  - `execute_repair(state, stale) -> PoolState`

- `packages/twerk-slots/src/twerk_slots/cli/slot/repair.py`
  - `SlotRepairRequest` dataclass: `force: bool`, `dry_run: bool`
  - `SyncIssueRow`, `RepairRow` result sub-dataclasses
  - `SlotRepairResult` with `issues`, `repairable`, `applied`, `dry_run`,
    plus `to_json_dict()`
  - `render_slot_repair(result)` using `get_console()` + rich markup
  - `run_repair_slot(request) -> SlotRepairResult | ClinkrCommandError`
    decorated with `@clinkr_operation(name="repair", ...)`
  - Error types: `not_in_repo`, `pool_not_configured`,
    `conflicting_flags` (force + dry_run)

### Modified files

- `packages/twerk-slots/src/twerk_slots/gateway/storage.py` — add
  `list_subdirs` abstract method
- `packages/twerk-slots/src/twerk_slots/gateway/real_storage.py` —
  implement via `pathlib.Path.iterdir()` + `is_dir()`
- `packages/twerk-slots/src/twerk_slots/gateway/testing/storage.py` —
  fake implementation derived from `existing_paths` (return names of
  entries whose parent matches `path`)

### New tests

- `packages/twerk-slots/tests/unit/test_diagnostics.py` — one test per
  check function plus `run_sync_diagnostics` integration; clean + each
  issue flavor + mixed issues.
- `packages/twerk-slots/tests/unit/test_repair.py` — `find_stale_assignments`
  filtering by repairable codes, `execute_repair` immutability + correct
  filter.
- `packages/twerk-slots/tests/scenario/test_slot_repair_cli.py` — via
  `CliRunner` on `build_cli()`. Cases:
  - No pool configured → error
  - Clean state → "✓ No issues found"
  - Each of 6 issue codes in isolation (preview mode)
  - `--force` actually mutates and saves pool state
  - `--dry-run` does not mutate
  - `--force --dry-run` → conflict error
  - Mixed repairable + informational issues
  - `slot json repair` returns structured result with `success: true`,
    issues array, applied array

### Gateway test additions

- `packages/twerk-slots/tests/gateways/test_fakes.py` — extend with
  `list_subdirs` behavior.
- `packages/twerk-slots/tests/gateways/test_real_gateways.py` — exercise
  `RealSlotsStorageGateway.list_subdirs` against `tmp_path`.

## Reuse / existing building blocks

- `twerk_slots.naming.generate_slot_name` — for building expected slot
  name sets in `_check_orphan_dirs` / `_check_git_worktree_mismatch`.
- `twerk_slots.naming.extract_slot_number` — to detect whether a
  directory / worktree name follows the slot convention.
- `twerk_slots.repo_context.RepoContext` / `discover_repo_or_sentinel`
  — for CLI-side repo discovery (same pattern as `list.py`/`assign.py`).
- `twerk_slots.cli.slot.context.build_slots_context` — standard context
  builder used by all other subcommands; reuse verbatim.
- `twerk_slots.cli.slot.gateway_access` — gateway injection helpers.
- `twerk_core.get_console`, `twerk_core.make_table` — rendering.
- `ClinkrCommandError`, `@clinkr_operation` — already used by every
  existing subcommand; same pattern.
- Fake construction helpers in `tests/scenario/test_slot_cli.py`
  (`_fake_for_repo`, `_make_obj`) — copy/adapt for the repair scenario
  tests. Consider extracting to a shared helper if reuse warrants.

## Implementation sequence

1. **Storage gateway**: add `list_subdirs` to ABC, real, fake; test.
2. **Pure diagnostics**: `diagnostics.py` with all 6 check functions.
   Unit-test exhaustively with fakes.
3. **Pure repair**: `repair.py` with `find_stale_assignments` +
   `execute_repair`. Unit-test.
4. **CLI command**: `cli/slot/repair.py`. Wire request/result/renderer/
   operation. Auto-discovery picks it up via `discover_group`.
5. **Scenario tests**: full CliRunner coverage including `--force`,
   `--dry-run`, conflict, JSON mode.
6. **Run `just fast-ci`**: fix lint / type / test failures.
7. **Commit** with `Objective: #39` trailer. Open PR targeting `master`.
8. **Reconcile objective #39**:
   - Rewrite the issue body: mark `slot goto` ✅ (stale from PR #73),
     mark `slot repair` ✅, mark diagnostics test coverage ✅, mark
     Roadmap 3 ✅.
   - Post a reconciliation comment with artifacts, findings, next
     steps, and completion-criteria table.
   - All 5 outstanding criteria will be met → offer to close the
     objective per the skill's Step 6b.

## Verification

End-to-end verification before reconciling:

1. `uv run just fast-ci` from repo root — lint, ty, test all green.
2. From within a twerk clone with an initialized slot pool:
   - `uv run slot list` — confirm baseline works.
   - Manually break pool state (e.g., delete a branch from an
     assignment, rename a worktree dir) to produce each issue code.
   - `uv run slot repair` — observe issue listing + preview.
   - `uv run slot repair --force` — observe mutation; re-run `slot
     list` to confirm stale assignments gone.
   - `uv run slot repair --dry-run` — confirm no mutation.
   - `uv run slot json repair --force` — confirm JSON envelope + fields.
3. Confirm standalone `slot repair` behaves identically to `twerk slot
   repair` (tests cover standalone via `build_cli()`; spot-check both
   entry points manually).
