# Plan: `slot free --current` / `-c`

## Context

The `slot free` command currently identifies the slot to release via `--num N` or `--wt slot-NN`. When you're already inside a slot's worktree, the natural action is "free this slot I'm in," which today still requires typing the slot number or name. Add a `-c` / `--current` flag that detects the current slot from the cwd's worktree directory name and frees it. The flag must be mutually exclusive with `--num` and `--wt`.

Detection semantics (confirmed): use the cwd's directory name. The slot to free is the one whose worktree is the current working directory. If cwd is not a slot worktree (e.g. main repo), error out. This matches `slot checkout`'s use of `slots_ctx.repo.root` — `repo.root` is the resolved current worktree root, so its `.name` is the slot name when you're inside one.

## Files to modify

1. `packages/twerk-slots/src/twerk_slots/cli/slot/free.py` — add the flag, validate mutual exclusion, resolve slot name from cwd when `--current` is set.
2. `packages/twerk-slots/tests/scenario/test_slot_free_cli.py` — add scenario tests for `--current`.

`packages/twerk-slots/src/twerk_slots/cli/slot/slot_target.py` is **not** modified — `--current` is local to `slot free`, so the shared `resolve_slot_target` helper (also used by `slot goto`) keeps its current `--num` / `--wt`-only contract.

## Implementation

### 1. Add `current` field to `SlotFreeRequest` (`free.py:21-24`)

```python
@dataclass(frozen=True)
class SlotFreeRequest:
    num: Annotated[int | None, click.Option(["--num"], type=click.INT, default=None)] = None
    wt: Annotated[str | None, click.Option(["--wt"], type=click.STRING, default=None)] = None
    current: Annotated[
        bool, click.Option(["-c", "--current"], is_flag=True, default=False)
    ] = False
```

### 2. Resolve slot name in `run_free_slot` (`free.py:60-79`)

Replace the current call to `resolve_slot_target` with branching logic:

```python
inputs_provided = sum(
    (request.num is not None, request.wt is not None, request.current)
)
if inputs_provided > 1:
    return ClinkrCommandError(
        error_type="conflicting_slot_args",
        message="Pass exactly one of --num, --wt, or --current.",
    )
if inputs_provided == 0:
    return ClinkrCommandError(
        error_type="missing_slot_arg",
        message="Pass one of --num, --wt, or --current to identify the slot.",
    )

if request.current:
    cwd = slots_ctx.repo.root
    if extract_slot_number(cwd.name) is None:
        return ClinkrCommandError(
            error_type="not_in_slot_wt",
            message=(
                f"--current requires running from a slot worktree; "
                f"cwd '{cwd}' is not a slot directory (e.g. 'slot-01')."
            ),
        )
    slot_name = cwd.name
else:
    slot_name_or_error = resolve_slot_target(
        num=request.num, wt=request.wt, pool_size=state.pool_size
    )
    if isinstance(slot_name_or_error, ClinkrCommandError):
        return slot_name_or_error
    slot_name = slot_name_or_error
```

Add the import: `from twerk_slots.naming import extract_slot_number`.

The downstream `free_slot_assignment` already returns `SlotNotAssignedError` when the cwd is a slot directory but pool.json has no assignment for it, so no extra validation is needed there.

### 3. Tests in `tests/scenario/test_slot_free_cli.py`

Build on the existing `_fake_for_repo` / `_seed_assigned` / `_make_obj` helpers. To simulate "cwd is inside a slot worktree," override the `FakeGitGateway`'s `repository_root_by_cwd` mapping so `Path.cwd()` resolves to the slot's worktree path (which exists at line 79 of the file already):

- `test_slot_free_current_happy_path`: seed slot-01 → feat/x; rewire `fakes.git._repository_root_by_cwd[Path.cwd().resolve()] = <slot-01 worktree>`; invoke `["free", "--current"]`; assert exit 0, "Freed", placeholder checkout call, pool.json now empty.
- `test_slot_free_current_short_flag`: same but `-c`.
- `test_slot_free_current_outside_slot_errors`: leave `repo.root` pointing at the main repo (default helper behavior); invoke `["free", "--current"]`; assert exit 1 and message contains "not a slot directory".
- `test_slot_free_current_unassigned_errors`: rewire cwd to a `slot-02` worktree path that exists on disk but isn't in pool.json; assert exit 1 and "not currently assigned".
- `test_slot_free_current_conflicts_with_num`: invoke `["free", "--current", "--num", "1"]`; assert exit 1 and "exactly one of --num, --wt, or --current".
- `test_slot_free_current_conflicts_with_wt`: same with `--wt slot-01`.
- Update `test_slot_free_missing_flag_errors` (`free.py:267`) message assertion to match the new "--num, --wt, or --current" wording.
- Update `test_slot_free_conflicting_flags_errors` (`free.py:282`) message assertion similarly (current text checks for "not both" which will no longer be present).

## Verification

```bash
just check                                          # lint, format, ty, full test suite
uv run pytest packages/twerk-slots/tests/scenario/test_slot_free_cli.py -v
uv run pytest packages/twerk-slots/tests/unit/test_slot_target.py -v   # confirm shared helper unchanged

# Manual smoke (in a real twerk repo with a slot pool):
slot checkout some-existing-branch
cd "$(slot goto --num <N>)"
slot free --current        # should free this slot, switch wt to placeholder branch
slot list                  # confirm slot is now unassigned
```

Edge cases covered by tests:
- cwd is a slot worktree but slot has no assignment → `SlotNotAssignedError` (existing path).
- cwd is the main repo or a non-slot subdir → `not_in_slot_wt` error.
- `--current` combined with `--num` or `--wt` → `conflicting_slot_args` error.

## Self-destruct

This plan file is a durable spec for the branch it lives on, not a
permanent artifact. Once the plan is fully implemented, the final
commit of this branch must delete this file (`plan-add-slot-free-current-flag.md`). A
merged PR whose branch still contains its own plan file is evidence
the plan was not fully carried out.
