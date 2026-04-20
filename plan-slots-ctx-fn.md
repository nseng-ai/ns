# Plan: Replace `load_slots_context` lazy loading with pass-from-above `ctx_fn`

## Goal

Eliminate the lazy-build logic in `load_slots_context`. The Click `ctx.obj` becomes a callable (`ctx_fn`) that returns a `SlotsCliContext | NoRepoSentinel`. The real CLI entry point (`main()`) installs the real factory; tests install a trivial `lambda: ctx` that returns a pre-built fake. Help paths are unaffected because they never invoke operations.

## Contract

- `ctx.obj: Callable[[], SlotsCliContext | NoRepoSentinel]` — always a callable when an operation runs.
- `load_slots_context(ctx)` unpacks the callable, calls it once, type-checks, returns. No caching, no None branch.
- Help (`slot -h`, `slot list -h`, `slot json list --schema`) never calls `load_slots_context`, so `obj=None` in help tests remains fine.
- Tests and prod use the same mechanism: both pass a callable via `obj=`.

## Source changes (2 files)

### 1. `packages/twerk-slots/src/twerk_slots/cli/slot/context.py`

- `load_slots_context` becomes:

  ```python
  def load_slots_context(ctx: click.Context) -> SlotsCliContext | NoRepoSentinel:
      ctx_fn = ctx.obj
      if not callable(ctx_fn):
          raise RuntimeError(
              "ctx.obj must be a Callable[[], SlotsCliContext | NoRepoSentinel]; "
              "the CLI entry point and tests are responsible for installing it."
          )
      result = ctx_fn()
      if not isinstance(result, SlotsCliContext | NoRepoSentinel):
          raise RuntimeError(
              f"ctx_fn returned {type(result).__name__}, expected SlotsCliContext or NoRepoSentinel."
          )
      return result
  ```

- Rewrite docstring to describe the pass-from-above contract. Drop the "built lazily on first access" paragraph.
- `build_slots_context()` is unchanged — it is the real factory passed to `main()`.

### 2. `packages/twerk-slots/src/twerk_slots/cli/main.py`

- `main()` changes from:

  ```python
  def main() -> None:
      build_cli()()
  ```

  to:

  ```python
  def main() -> None:
      build_cli()(obj=build_slots_context)
  ```

- Add the `build_slots_context` import.

## Test changes (6 files, 74 call sites)

Two patterns exist in the test suite; each gets its own minimal change.

### Pattern A — helper returns `SlotsCliContext`, call sites pass `obj=ctx` (24 sites)

Files:

- `packages/twerk-slots/tests/scenario/test_slot_cli.py` (10)
- `packages/twerk-slots/tests/scenario/test_slot_gc_cli.py` (9)
- `packages/twerk-slots/tests/integration/test_list_checkout_roundtrip.py` (5)

Change each call site: `obj=ctx` → `obj=lambda: ctx`.

Extra: in `test_list_checkout_roundtrip.py`, the local variable is named `obj`, which would make `obj=lambda: obj` confusing to read. Rename that local to `ctx` first, then wrap.

### Pattern B — per-file helper `_make_obj(fakes, slots_root)` returns a `SlotsCliContext` (50 sites)

Files:

- `packages/twerk-slots/tests/scenario/test_slot_checkout_cli.py` (24)
- `packages/twerk-slots/tests/scenario/test_slot_free_cli.py` (16)
- `packages/twerk-slots/tests/scenario/test_slot_goto_cli.py` (10)

Change each file's `_make_obj` helper to return `Callable[[], SlotsCliContext]`:

```python
def _make_obj(fakes: _SlotFakes, slots_root: Path) -> Callable[[], SlotsCliContext]:
    repo = discover_repo_or_sentinel(Path.cwd(), slots_root=slots_root, git=fakes.git)
    assert isinstance(repo, RepoContext), f"expected RepoContext, got {repo!r}"
    ctx = SlotsCliContext(
        repo=repo,
        git=fakes.git,
        storage=fakes.storage,
        pool_state=fakes.pool_state,
        clipboard=fakes.clipboard,
        pr=FakePRGateway(),
        slots_root=slots_root,
    )
    return lambda: ctx
```

Call sites (e.g. `obj=_make_obj(fakes, slots_root)`) stay textually unchanged — the name still reads naturally as "make the thing we pass as obj".

## Order of operations

1. Edit `context.py` and `main.py`.
2. Update Pattern A call sites (3 files).
3. Update Pattern B helpers (3 files).
4. Run `just` in `packages/twerk-slots` (lint, type, tests).
5. If any test failure surfaces a Pattern-B side effect from build-once-vs-build-per-call, inspect and fix.

## Deliberately out of scope

- No new helper wrapper (`as_ctx_fn`, `invoke_slot_cli`, etc.). Inline `lambda: ctx` is the pattern; tests that need a Pattern-B helper already have one per file.
- No changes to `SlotsCliContext` shape.
- No changes to `twerk_core.clinkr`.
- No doc / CLAUDE.md / AGENTS.md updates.
- No capability declaration system.

## Risks

- **Pattern-B gateway identity change.** Today, each `_make_obj` call rebuilds a fresh `FakePRGateway()`. Under the new helper, a single `FakePRGateway` is created per `_make_obj` call and reused across every `load_slots_context` invocation inside the surrounding test. A multi-invoke test that relied on per-invoke gateway freshness could see different behavior. Scan suggests no tests rely on this, but `just` will surface any regression.
- **Help tests.** `test_slot_help`, `test_slot_list_help`, `test_slot_version` invoke without `obj=`. They never call `load_slots_context` (help short-circuits before the operation callback), so they keep passing. Confirmed by grepping the operation wrappers — no help-time path touches `ctx.obj`.
- **`obj=None` now raises.** Any test that invokes a real operation without `obj=` will now error at `load_slots_context`. This is the intended contract. Verified by `just` run.

## Acceptance

- `just` passes cleanly in `packages/twerk-slots`.
- `grep -n "ctx.obj is None" packages/twerk-slots/src` returns no matches.
- `grep -n "obj=ctx\b\|obj=fakes\b\|obj=obj\b" packages/twerk-slots/tests` returns no matches (all wrapped or routed through Pattern-B helper).
