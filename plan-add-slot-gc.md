# Plan: `slot gc` subcommand — free slots whose PR is merged or closed

## Context

`twerk-slots` manages a pool of worktrees (one per "slot") assigned to branches. When a branch's PR lands or is closed, its slot stays assigned until someone runs `slot free` by hand. In practice this means the pool slowly fills with stale assignments and manual cleanup is the only remedy.

`slot gc` sweeps all assignments and frees any whose branch has a **merged or closed** PR, leaving only slots whose work is still in flight. It is the natural companion to `slot free` — same terminal state, different driver (PR status vs. manual invocation).

**Outcome**: `slot gc` runs on demand, reuses the existing `free_slot_assignment` primitive for each reclaimed slot, is safe to re-run (idempotent), and has a `--dry-run` mode for previews.

## Design decisions

1. **Classification rules** (decided with user):
   - Branch has an **OPEN** PR → keep.
   - Branch has a **MERGED** or **CLOSED** PR → free.
   - `gh pr view <branch>` returns "no PR found" (returncode 1) → **keep** (user may have local-only work).
   - `gh` CLI broken (non-1 non-zero returncode) → mark slot as `error`, continue sweeping.
   - Slot's worktree is dirty with uncommitted changes → **skip with warning**, continue sweeping.
   - `--dry-run` → emit `would_free` without mutating.

2. **`PRSummary.state` becomes `Literal["OPEN","CLOSED","MERGED"]`**. Mirrors the existing `PRReviewState` pattern in `twerk_core/gh/types.py:10`. All 5 construction sites updated (enumerated below).

3. **Introduce a separate `PRGateway` hierarchy; share implementation via composition, not inheritance**. The existing `IssueGateway` is a mixed bag (issue queries + PR queries + PR mutations). Instead of entangling slots with that mixed surface, we build a parallel narrow hierarchy:
   - `PRGateway(ABC)` — narrow new ABC with just `get_pr_for_branch(branch) -> PRSummary | PRLookupError`.
   - `RealPRGateway(PRGateway)` — new concrete real implementation.
   - `FakePRGateway(PRGateway)` — new concrete fake.
   - `IssueGateway` and its implementations stay **untouched** — no inheritance link to `PRGateway`.
   - **Code reuse via composition**: extract the `gh pr view <branch> --json ...` subprocess call into a module-level helper `fetch_pr_summary_for_branch(branch) -> PRSummary | PRLookupError` (in `pr_gateway.py`). Both `RealPRGateway.get_pr_for_branch` and `RealIssueGateway.get_pr_for_branch` call it — zero duplicated subprocess logic, zero coupling between the ABCs.
   - `SlotsCliContext.pr: PRGateway` joins `git`, `storage`, `pool_state`, `clipboard` as a first-class gateway field. `build_slots_context` injects `RealPRGateway()`. Tests inject `FakePRGateway()`.
   - The churn is mechanical: two new files (ABC + real + fake, plus shared helper), one extraction in `real_issue_gateway.py`, one field on `SlotsCliContext`, one injection in `build_slots_context`, one added kwarg on every test-side `SlotsCliContext(...)` call.

4. **Pure logic in `twerk_slots/gc.py`; Click wiring in `cli/slot/gc.py`** — mirrors `allocation.py` / `cli/slot/free.py` split.

5. **Reuse `free_slot_assignment`** from `allocation.py:402` for each reclaimed slot. Don't duplicate the placeholder-branch dance. Map its `DirtyWorktreeError` to a `skipped_dirty` entry; `SlotNotAssignedError` can't happen in the gc flow but handle defensively as `error`.

## Files

### Modify — `packages/twerk-core/src/twerk_core/gh/types.py`

Add `PRState` literal and `state` field on `PRSummary`:

```python
PRState = Literal["OPEN", "CLOSED", "MERGED"]

@dataclass(frozen=True)
class PRSummary:
    number: int
    title: str
    url: str
    head_ref_name: str
    base_ref_name: str
    state: PRState  # NEW
```

### Modify — `packages/twerk-core/src/twerk_core/gh/real_issue_gateway.py` (`get_pr_for_branch`, lines 271-296)

- Append `state` to the `--json` list: `"number,title,url,headRefName,baseRefName,state"`.
- Pass `state=data["state"]` to `PRSummary(...)`. `gh pr view` already returns `OPEN|CLOSED|MERGED`.

### Update `PRSummary` construction sites (5 total)

- `packages/twerk-core/src/twerk_core/gh/real_issue_gateway.py:290` — pass through from API.
- `packages/twerk-core/tests/gateways/test_real_issue_gateway.py:581-587` — add `"state": "OPEN"` to the fixture; parametrize over `OPEN|MERGED|CLOSED` for coverage.
- `packages/twerk-core/tests/gateways/test_fake_pr_gateway.py:70` — add `state="OPEN"`.
- `packages/twerk-pr-address/tests/scenario/test_operations.py:718` and `:1058` — add `state="OPEN"`.

Optionally add `state` to `packages/twerk-pr-address/src/twerk_pr_address/cli/pr_address/get_pr_for_branch.py`'s result `to_json_dict` so pr-address's JSON surface stays aligned with the gateway. Small, additive, avoids silent schema drift.

### Create — `packages/twerk-core/src/twerk_core/gh/pr_gateway.py`

New narrow ABC plus shared helper plus real impl:

```python
from __future__ import annotations

import json
import subprocess
from abc import ABC, abstractmethod

from twerk_core.gh.types import PRLookupError, PRSummary


def fetch_pr_summary_for_branch(branch: str) -> PRSummary | PRLookupError:
    """Shell out to `gh pr view <branch>` and return a PRSummary.

    Shared helper used by both RealPRGateway and RealIssueGateway so the
    subprocess logic lives in one place.
    """
    result = subprocess.run(
        [
            "gh", "pr", "view", branch,
            "--json", "number,title,url,headRefName,baseRefName,state",
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return PRLookupError(stderr=result.stderr.strip(), returncode=result.returncode)
    data = json.loads(result.stdout)
    return PRSummary(
        number=data["number"],
        title=data["title"],
        url=data["url"],
        head_ref_name=data["headRefName"],
        base_ref_name=data["baseRefName"],
        state=data["state"],
    )


class PRGateway(ABC):
    """Narrow gateway for PR lookups by branch.

    Separate from IssueGateway so consumers that only need PR-by-branch
    lookup (e.g. twerk-slots gc) can depend on a minimal surface.
    """

    @abstractmethod
    def get_pr_for_branch(self, branch: str) -> PRSummary | PRLookupError: ...


class RealPRGateway(PRGateway):
    """Real implementation backed by the `gh` CLI via `fetch_pr_summary_for_branch`."""

    def get_pr_for_branch(self, branch: str) -> PRSummary | PRLookupError:
        return fetch_pr_summary_for_branch(branch)
```

### Create — `packages/twerk-core/src/twerk_core/gh/pr_testing.py` (or extend `testing.py`)

New `FakePRGateway`:

```python
from __future__ import annotations

from twerk_core.gh.pr_gateway import PRGateway
from twerk_core.gh.types import PRLookupError, PRSummary


class FakePRGateway(PRGateway):
    """In-memory fake for PRGateway; seeds via constructor only."""

    def __init__(self, *, prs_by_branch: dict[str, PRSummary] | None = None) -> None:
        self._prs_by_branch = prs_by_branch or {}

    def get_pr_for_branch(self, branch: str) -> PRSummary | PRLookupError:
        pr = self._prs_by_branch.get(branch)
        if pr is None:
            return PRLookupError(stderr="no PR found", returncode=1)
        return pr
```

### Modify — `packages/twerk-core/src/twerk_core/gh/real_issue_gateway.py`

Replace the body of `RealIssueGateway.get_pr_for_branch` (lines 271-296) with a one-line delegation:

```python
from twerk_core.gh.pr_gateway import fetch_pr_summary_for_branch
...
def get_pr_for_branch(self, branch: str) -> PRSummary | PRLookupError:
    return fetch_pr_summary_for_branch(branch)
```

This is how composition "shares common code" here — both real classes call the module-level helper. `IssueGateway` ABC is unchanged, and `FakeIssueGateway` stays as-is (separate fake, separate `prs_by_branch` state).

### (No change to) — `packages/twerk-core/src/twerk_core/gh/issue_gateway.py`

`IssueGateway` ABC is untouched. `get_pr_for_branch` remains part of its abstract surface (for backward compatibility with `pr-address`, `objective-list`, and any other consumer). The two ABCs are siblings with no inheritance relationship.

### Modify — `packages/twerk-slots/src/twerk_slots/context.py`

Add `pr: PRGateway` field to `SlotsCliContext`. Import `from twerk_core.gh.pr_gateway import PRGateway`.

### Modify — `packages/twerk-slots/src/twerk_slots/cli/slot/context.py` (`build_slots_context`)

Import `RealPRGateway` from `twerk_core.gh.pr_gateway` and pass `pr=RealPRGateway()` in the `SlotsCliContext(...)` call at line 32.

### Update every `SlotsCliContext(...)` test construction (mechanical)

- `packages/twerk-slots/tests/integration/test_list_checkout_roundtrip.py:34`
- `packages/twerk-slots/tests/unit/test_allocation.py:230, 267, 298, 326, 353, 382, 421, 459` (plus any more `_make_obj`-style helpers in scenario tests: `test_slot_free_cli.py`, `test_slot_checkout_cli.py`, `test_slot_cli.py`, `test_slot_goto_cli.py`)

Each gets an added `pr=FakePRGateway()` (default-constructed — existing tests don't exercise PR lookups, so empty `prs_by_branch` is fine).

### Create — `packages/twerk-slots/src/twerk_slots/gc.py`

Pure logic. Shape:

```python
SlotGcAction = Literal[
    "freed", "would_free", "kept_open_pr", "kept_no_pr", "skipped_dirty", "error",
]

@dataclass(frozen=True)
class SlotGcEntry:
    slot_name: str
    branch_name: str
    worktree_path: Path
    action: SlotGcAction
    pr_number: int | None
    pr_state: PRState | None
    pr_url: str | None
    message: str | None  # set for skipped_dirty / error

@dataclass(frozen=True)
class SlotGcOutcome:
    entries: tuple[SlotGcEntry, ...]
    freed_count: int
    kept_count: int
    skipped_count: int
    error_count: int
    dry_run: bool

def run_gc(ctx: SlotsCliContext, *, dry_run: bool) -> SlotGcOutcome: ...
```

Algorithm:

1. Load pool state; run `sync_pool_assignments` (same prelude as `free_slot_assignment`).
2. For each assignment, call `ctx.pr.get_pr_for_branch(assignment.branch_name)`.
3. Classify per rules in Design Decisions §1.
4. For `freed` action, invoke `free_slot_assignment(ctx, slot_name=...)`; translate its `DirtyWorktreeError` to `skipped_dirty`.
5. For `would_free` (dry-run hits), emit the entry without calling `free_slot_assignment`.
6. Tally counts; return `SlotGcOutcome`.

### Create — `packages/twerk-slots/src/twerk_slots/cli/slot/gc.py`

Click command wrapper mirroring `cli/slot/free.py`:

```python
@dataclass(frozen=True)
class SlotGcRequest:
    dry_run: Annotated[bool, click.Option(["--dry-run"], is_flag=True, default=False)] = False

@dataclass(frozen=True)
class SlotGcResult:
    entries: tuple[SlotGcEntry, ...]
    freed_count: int
    kept_count: int
    skipped_count: int
    error_count: int
    dry_run: bool

    def to_json_dict(self) -> dict[str, Any]: ...

def render_slot_gc(result: SlotGcResult) -> None:
    # one line per entry with action-specific glyph/colour, then summary line
    ...

@clinkr_operation(
    name="gc",
    help="Free slots whose branch has a merged or closed PR.",
    human_renderer=render_slot_gc,
)
def run_slot_gc(ctx, request) -> SlotGcResult | ClinkrCommandError:
    slots_ctx = load_slots_context(ctx)
    if isinstance(slots_ctx, NoRepoSentinel):
        return ClinkrCommandError(error_type="not_in_repo", message=slots_ctx.message)
    state = slots_ctx.pool_state.load()
    if state is None:
        return ClinkrCommandError(
            error_type="pool_empty",
            message="No pool configured. Run `slot checkout` first.",
        )
    outcome = run_gc(slots_ctx, dry_run=request.dry_run)
    return SlotGcResult(...from outcome...)
```

Auto-registration: `discover_group("twerk_slots.cli.slot")` at `cli/main.py:22` picks up the new module with no extra wiring.

## Tests

### Unit — create `packages/twerk-slots/tests/unit/test_gc.py`

Drive `run_gc` directly with fakes:

- Empty pool → empty entries, all zero counts.
- One slot, OPEN PR → `kept_open_pr`, pool unchanged.
- One slot, MERGED PR → `freed`; `pool_state.load().assignments == ()`; placeholder checkout happened.
- One slot, CLOSED PR → `freed`.
- One slot, no PR (returncode 1) → `kept_no_pr`.
- One slot, gh broken (returncode 4) → `error` entry; other slots still swept.
- One slot, MERGED PR + dirty worktree → `skipped_dirty`; pool unchanged.
- `dry_run=True` + MERGED PR → `would_free`; pool unchanged; no checkout calls.
- Mixed pool (merged + open + no-pr + dirty) → per-slot actions correct, counts correct.

### Scenario — create `packages/twerk-slots/tests/scenario/test_slot_gc_cli.py`

Mirror `test_slot_free_cli.py` shape. Extend `_make_obj` to accept a `FakePRGateway`:

- `gc -h` help renders.
- `gc` appears in group help.
- `gc` outside a repo → `not_in_repo` error.
- `gc` with no pool state → `pool_empty` error.
- `gc` with one MERGED slot → exit 0, "Freed" in output, state updated.
- `gc --dry-run` with one MERGED slot → exit 0, output signals dry-run, state unchanged.
- `slot json gc` JSON mode payload has counts and per-entry actions.
- `slot json gc --schema` returns all three schemas (request/result/error).

### Gateway — update existing + add new

- `test_real_issue_gateway.py`: parametrize the `get_pr_for_branch` happy-path fixture over `OPEN|MERGED|CLOSED`; assert `result.state`.
- `test_fake_pr_gateway.py` (existing `FakeIssueGateway` tests): assert `state` round-trips.
- New `test_real_pr_gateway.py`: smoke-test `RealPRGateway.get_pr_for_branch` by mocking subprocess (same pattern as `test_real_issue_gateway.py`); assert both happy path and the `PRLookupError` returncode-1 branch.
- New `test_fake_pr_gateway_dedicated.py` (or similar name, sibling to the existing file): basic round-trip tests for `FakePRGateway`.

## Verification

1. `uv run pytest packages/twerk-core -n auto` — gateway layer green with new `state` field.
2. `uv run pytest packages/twerk-pr-address -n auto` — downstream PRSummary consumers compile and pass.
3. `uv run pytest packages/twerk-slots -n auto` — new gc logic + CLI tests green, plus all existing context-construction updates.
4. `just check` — lint, format-check, dprint, ty, full test suite green.
5. End-to-end smoke in a live worktree (e.g., this repo):
   - `slot list` to see current assignments.
   - `slot gc --dry-run` — verify the report matches expectations on merged branches visible via `gh pr view`.
   - `slot gc` — verify `pool.json` shrinks, worktrees switch to placeholder branches, re-running is a no-op.
   - `slot json gc` — verify JSON schema round-trips.

## Sequencing (commit-per-step, each green)

1. Add `PRState` + `PRSummary.state`; update `RealIssueGateway.get_pr_for_branch`; fix all 5 `PRSummary(...)` construction sites. Green twerk-core + twerk-pr-address.
2. Create `PRGateway` ABC + `RealPRGateway` + `FakePRGateway` + shared `fetch_pr_summary_for_branch` helper. Refactor `RealIssueGateway.get_pr_for_branch` to delegate to the helper. Green twerk-core.
3. Add `pr: PRGateway` to `SlotsCliContext`; thread through `build_slots_context` and every test-side constructor. Green twerk-slots existing tests.
4. Implement `twerk_slots/gc.py` + unit tests.
5. Implement `cli/slot/gc.py` + scenario tests.
6. `just check`.

## Critical files to modify

- `packages/twerk-core/src/twerk_core/gh/types.py`
- `packages/twerk-core/src/twerk_core/gh/real_issue_gateway.py` (delegate `get_pr_for_branch` to shared helper)
- `packages/twerk-core/src/twerk_core/gh/pr_gateway.py` (new — ABC + RealPRGateway + shared helper)
- `packages/twerk-core/src/twerk_core/gh/pr_testing.py` (new — FakePRGateway; or add to existing `testing.py`)
- `packages/twerk-slots/src/twerk_slots/context.py`
- `packages/twerk-slots/src/twerk_slots/cli/slot/context.py`
- `packages/twerk-slots/src/twerk_slots/gc.py` (new)
- `packages/twerk-slots/src/twerk_slots/cli/slot/gc.py` (new)
