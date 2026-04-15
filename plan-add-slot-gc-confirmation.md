# Plan: Add confirmation + `-f`/`--force` flag to `slot gc`

## Context

Today `slot gc` frees slots whose branches have merged/closed PRs **immediately**, with no chance to review the proposed actions before mutating state. This is unsafe for a destructive sweep across many worktrees.

Desired behaviour:
- `slot gc -f` (or `--force`) — current behaviour: classify and free in one shot, no prompt.
- `slot gc` — classify assignments first, show a preview of which slots *would* be freed, prompt with `click.confirm(...)`, only free on `y`. On `n`, return without mutating state.
- `slot gc --dry-run` — unchanged. Incompatible with `--force`.

## Key files

- `packages/twerk-slots/src/twerk_slots/gc.py` — core sweep logic (`run_gc`).
- `packages/twerk-slots/src/twerk_slots/cli/slot/gc.py` — clinkr operation wrapping the sweep (`run_slot_gc`, `render_slot_gc`, `SlotGcRequest`, `SlotGcResult`).
- `packages/twerk-slots/tests/unit/test_gc.py` — unit tests for `run_gc`.
- `packages/twerk-slots/tests/scenario/test_slot_gc_cli.py` — CLI-level tests using `click.testing.CliRunner`.

## Design notes

clinkr separates operation from rendering (`twerk_core/clinkr/group.py:118-172` and `command.py`). A single operation function is invoked for both the human command and the `json` subcommand; it knows nothing about the mode. Neither `click.confirm` nor `get_console()` are currently used from any operation. Two constraints follow:

1. The operation must still return a normal result; the prompt lives **inside** the operation.
2. JSON mode consumes stdin for request JSON, so any `click.confirm` there would hit EOF. That's acceptable — JSON users pass `force: true`, and the default of `force=False` combined with EOF will cleanly abort. We treat JSON-mode without `force=true` as "user must be explicit."

To avoid calling `gh pr view` twice and to keep the preview-then-execute flow clean, split `run_gc` into two phases: a pure `plan_gc(ctx)` that classifies, and an `execute_gc_plan(ctx, plan)` that mutates. `run_gc(ctx, *, dry_run=...)` remains as a thin wrapper for existing callers/tests.

## Implementation

### 1. `packages/twerk-slots/src/twerk_slots/gc.py` — split plan from execute

Add a `SlotGcPlan` frozen dataclass:

```python
@dataclass(frozen=True)
class SlotGcPlan:
    entries: tuple[SlotGcEntry, ...]       # classifications only; no "freed"/"skipped_dirty"/SlotNotAssignedError yet
    would_free_count: int                   # number of entries with action == "would_free"
```

Factor the classification loop (today: `gc.py:71-146`) into `plan_gc(ctx) -> SlotGcPlan`:

- Exactly like today up to and including the OPEN-PR / no-PR / error branches.
- For MERGED/CLOSED PRs, always record `action="would_free"` (ignore `dry_run`; planning is pure).
- No calls to `free_slot_assignment` — this function is side-effect-free (aside from the `gh pr view` and `sync_pool_assignments` reads that `run_gc` already does).

Factor the free branch (today: `gc.py:148-194`) into `execute_gc_plan(ctx, plan) -> SlotGcOutcome`:

- Iterate `plan.entries`.
- For non-`would_free` entries, copy through unchanged (preserve counts).
- For `would_free` entries, call `free_slot_assignment(ctx, slot_name=...)` and translate `SlotFreeOutcome` → `freed`, `DirtyWorktreeError` → `skipped_dirty`, `SlotNotAssignedError` → `error` (same mapping as today).
- Tally `freed_count`/`skipped_count`/`error_count`; `dry_run=False`.

Rewrite `run_gc`:

```python
def run_gc(ctx: SlotsCliContext, *, dry_run: bool) -> SlotGcOutcome:
    plan = plan_gc(ctx)
    if dry_run:
        return _outcome_from_plan(plan, dry_run=True)
    return execute_gc_plan(ctx, plan)
```

Where `_outcome_from_plan` turns every `would_free` entry into the dry-run outcome (counting them into `freed_count`, consistent with today's `dry_run` semantics at `gc.py:132-146`).

### 2. `packages/twerk-slots/src/twerk_slots/cli/slot/gc.py` — add `--force`, confirm flow

`SlotGcRequest` gains a force flag:

```python
@dataclass(frozen=True)
class SlotGcRequest:
    dry_run: Annotated[bool, click.Option(["--dry-run"], is_flag=True, default=False)] = False
    force: Annotated[bool, click.Option(["-f", "--force"], is_flag=True, default=False)] = False
```

`SlotGcResult` gains a cancelled flag (default `False`), included in `to_json_dict`:

```python
cancelled: bool = False
```

Rewrite `run_slot_gc` body (replacing the single `run_gc(...)` call at `gc.py:121`):

1. Reject conflicting flags: if `request.dry_run and request.force`, return `ClinkrCommandError("conflicting_flags", "--dry-run and --force are mutually exclusive.")`.
2. Always start by calling `plan_gc(slots_ctx)`.
3. If `request.dry_run` → build result from `_outcome_from_plan(plan, dry_run=True)` and return.
4. If `plan.would_free_count == 0` → build result from `_outcome_from_plan(plan, dry_run=False)` (no candidates to prompt about) and return. Counts: `freed_count=0`, kept/error/skipped passthrough.
5. If `request.force` → call `execute_gc_plan(slots_ctx, plan)` and return.
6. Otherwise (interactive path):
   - Render the preview by calling `render_slot_gc` on a `SlotGcResult` built from `_outcome_from_plan(plan, dry_run=True)`. This reuses the existing renderer (entries labelled `→ would free` + summary line "Would free N; kept K; ...").
   - Prompt: `proceed = click.confirm(f"Free {plan.would_free_count} slot(s)?", default=False)`.
   - If `proceed`: call `execute_gc_plan(slots_ctx, plan)`, return the final `SlotGcResult` (cancelled=False).
   - If not: return a `SlotGcResult` with entries from `plan` (with would_free untouched), `freed_count=0`, `cancelled=True`, `dry_run=False`.

Update `render_slot_gc` (around `gc.py:78-102`) to handle the cancelled case at the top:

```python
if result.cancelled:
    console.print("[yellow]Cancelled — no slots freed.[/yellow]")
    return
```

Trade-off (accepted): in the confirm-yes path, `render_slot_gc` runs twice — once as the preview (manually from inside the operation) and once via the clinkr human_renderer afterwards, on the executed outcome. The second render shows the *final* state (`✓ freed` / `! skipped (dirty)` / `✗ error`), so it's informative, not a verbatim duplicate. Entries that stay `kept_*` are printed twice; that's acceptable for a command run infrequently against ≤10 slots.

### 3. Tests

**Unit (`tests/unit/test_gc.py`):**
- Add tests for `plan_gc`: same coverage as existing classification tests, but asserts no call to `free_slot_assignment` (fake's free-call count stays at 0).
- Add `test_execute_gc_plan_frees_would_free_entries`.
- Keep existing `run_gc` tests — they still pass via the thin wrapper.

**Scenario (`tests/scenario/test_slot_gc_cli.py`):**
- `test_gc_force_skips_confirmation`: invoke `["gc", "-f"]`; assert slot is freed, no prompt in output.
- `test_gc_without_force_prompts_and_accepts`: invoke `["gc"]` with `input="y\n"`; assert preview printed, slot freed, result JSON has `cancelled=false` when asked via `--json`… wait, JSON goes through `json gc`; so instead assert in human mode that output contains both "would free" and "freed", and that pool state was updated.
- `test_gc_without_force_prompts_and_declines`: invoke `["gc"]` with `input="n\n"`; assert "Cancelled" in output, pool state unchanged (no assignment freed).
- `test_gc_no_candidates_skips_prompt`: pool with only OPEN-PR slots; invoke `["gc"]`; assert no prompt text, no mutation.
- `test_gc_dry_run_and_force_conflict`: invoke `["gc", "--dry-run", "-f"]`; assert nonzero exit + `conflicting_flags` error message.
- `test_gc_json_mode_without_force_on_mergeable_slot`: pipe `{"force": false, "dry_run": false}` to `json gc` with a MERGED-PR slot; confirm reads EOF and aborts (exit nonzero). Alternatively document that JSON callers must pass `force: true`; verify `{"force": true}` works.

Prior art: `CliRunner.invoke(..., input="y\n")` is the standard way to feed `click.confirm` — no monkeypatching needed.

### 4. Verification

- `just check` (runs ruff lint, ruff format check, dprint check, ty, pytest).
- Manual smoke: from a worktree with known mixed PR states, run `slot gc` (see preview + prompt), answer `n` (state unchanged), re-run and answer `y` (state updated), then `slot gc -f` (no prompt), then `slot gc --dry-run` (no prompt, no mutation), then `slot gc --dry-run -f` (error).
- Verify JSON path: `echo '{"force": true}' | slot json gc` sweeps without prompting.
