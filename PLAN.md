# Monorepo refactor: thread typed CLI context through Click

## Context

PR #83 review (Thread A on `tests/scenario/test_slot_checkout_cli.py:28`)
flagged that `twerk-slots` builds a `SlotsCliContext` dataclass but does
not store it on `click.Context.obj`. Instead, individual gateways live in
a loose `dict[str, Any]` on `ctx.obj`, and `build_slots_context()`
re-assembles the dataclass on every command. Tests hand-roll the dict via
a `_make_obj()` helper, duplicating the schema across four scenario
files.

A monorepo survey shows the same anti-pattern in every twerk CLI group:

| Package | Keys on `ctx.obj` today | Has context dataclass? |
|---|---|---|
| `twerk-slots` | 5 (`git_gateway`, `storage_gateway`, `pool_state_gateway`, `clipboard_gateway`, `slots_root`) | Yes (`SlotsCliContext`) but unused on `ctx.obj` |
| `twerk-pr-address` | 1 (`gh_issue_gateway`) | No |
| `twerk-objectives` | 1 (`gh_issue_gateway`) | No |

The clinkr framework in `packages/twerk-core/src/twerk_core/clinkr/` is
intentionally context-agnostic (see `clinkr/AGENTS.md`) — it makes no
promises about `ctx.obj`. Each application owns its own context shape.

## Goal

Each CLI package stores a single typed `*CliContext` dataclass on
`click.Context.obj`. Operations pull a typed context via one helper.
Tests construct the dataclass directly and pass `obj=ctx` to
`CliRunner().invoke(...)`. No more dict lookups; no more per-gateway
shims.

## Shared shape (apply to all three packages)

1. **Frozen `*CliContext` dataclass** lives in the package, not in
   twerk-core. (Pr-address and objectives may diverge; a 1-field shared
   base is over-engineering today.)
2. **Click root group callback** in `cli/main.py` builds the real
   context and assigns it to `ctx.obj` only if `ctx.obj is None`. Test
   injection wins.
3. **Single `get_cli_context()` helper** replaces every per-gateway
   `get_*_gateway()` shim.
4. **Test helpers** construct the typed context directly. No
   `_make_obj()` returning `dict[str, object]`.

## Commit 1 — `twerk-slots` (lands on `slot-checkout` as Batch 2 of PR #83)

Addresses Thread A directly.

### Files

- `packages/twerk-slots/src/twerk_slots/context.py`
  - Add `slots_root: Path` field to `SlotsCliContext` (today the path
    leaks via a separate `ctx.obj["slots_root"]` key).
- `packages/twerk-slots/src/twerk_slots/cli/slot/context.py`
  - `build_slots_context()` keeps its signature
    (`-> SlotsCliContext | NoRepoSentinel`) and its body. Only change:
    pass `slots_root` into the constructor.
- `packages/twerk-slots/src/twerk_slots/cli/main.py`
  - Add a group callback that calls `build_slots_context()` and stashes
    the result on `ctx.obj` when `ctx.obj is None`.
- `packages/twerk-slots/src/twerk_slots/cli/slot/gateway_access.py`
  - Collapse five helpers into one: `get_slots_cli_context() ->
    SlotsCliContext | NoRepoSentinel`, returning `ctx.obj`.
  - Remove `get_git_gateway`, `get_slots_root`, `get_storage_gateway`,
    `get_pool_state_gateway`, `get_clipboard_gateway`.
- `packages/twerk-slots/src/twerk_slots/cli/slot/{checkout,free,goto,list}.py`
  - Replace `build_slots_context()` calls with `get_slots_cli_context()`.
    The `NoRepoSentinel` branch stays the same.
- Tests
  - `tests/scenario/test_slot_cli.py`
  - `tests/scenario/test_slot_checkout_cli.py`
  - `tests/scenario/test_slot_free_cli.py`
  - `tests/scenario/test_slot_goto_cli.py`
  - `_make_obj()` returns `SlotsCliContext(...)` instead of a 5-key dict.
    `_SlotFakes` stays (tests still assert on individual fakes after
    invocation), but `slots_root` becomes a context field, not a
    separate parameter.

### Risks / sequencing

- `slots_root` lifecycle changes — bootstrap callback handles the
  `~/.slots` fallback once, instead of every helper falling back
  separately.
- Sequenced **after** Batch 1 (clipboard success/failure objects, already
  landed at `302c3ea`) so the test helpers mirror the new clipboard
  return type without rework.

## Commit 2 — `twerk-pr-address` (separate branch, separate PR)

Out of scope for PR #83. Independent monorepo cleanup.

### Files

- New: `packages/twerk-pr-address/src/twerk_pr_address/cli/context.py`
  ```python
  @dataclass(frozen=True)
  class PrAddressCliContext:
      gh_issue: IssueGateway
  ```
- `packages/twerk-pr-address/src/twerk_pr_address/cli/main.py`
  - Group callback builds
    `PrAddressCliContext(gh_issue=RealIssueGateway())` when
    `ctx.obj is None`.
- `packages/twerk-pr-address/src/twerk_pr_address/cli/pr_address/gateway_access.py`
  - Replace `get_gh_issue_gateway()` with
    `get_cli_context() -> PrAddressCliContext` returning `ctx.obj`.
  - Optionally retain `get_gh_issue_gateway()` as a one-line shim that
    returns `get_cli_context().gh_issue` to minimize call-site churn
    across the 10 operations.
- 10 operations under `cli/pr_address/*.py` — no change if the shim
  stays; otherwise one-line update at each call site (lines listed in
  the survey).
- `tests/scenario/test_operations.py`
  - `_invoke()` builds `obj=PrAddressCliContext(gh_issue=fake)` instead
    of `obj={"gh_issue_gateway": fake}`. Affects ~20 invocations.

## Commit 3 — `twerk-objectives` (separate branch, separate PR)

Mirrors Commit 2 exactly. Smaller scope.

### Files

- New: `packages/twerk-objectives/src/twerk_objectives/cli/context.py`
  ```python
  @dataclass(frozen=True)
  class ObjectivesCliContext:
      gh_issue: IssueGateway
  ```
- `packages/twerk-objectives/src/twerk_objectives/cli/main.py`
  - Group callback builds the context when `ctx.obj is None`.
- `packages/twerk-objectives/src/twerk_objectives/cli/objective/gateway_access.py`
  - Replace `get_gh_issue_gateway()` with `get_cli_context()` (or keep
    it as a shim).
- `cli/objective/list.py` — one call-site update (or none, if shim
  stays).
- `tests/scenario/test_objective_cli.py`
  - `_make_fake()` returns `ObjectivesCliContext(gh_issue=...)` instead
    of a single-key dict.

## Verification (per commit)

- `just` from repo root (lint, format, dprint, ty, pytest).
- Commit 1: confirm `_SlotFakes` still lets each scenario test assert on
  individual fakes (`fakes.clipboard.copy_calls`, etc.) after invocation.
- Commits 2–3: smoke-test against real GitHub from a checkout
  (`pr-address exec get-pr-for-branch …`, `objective list`) — not in CI.

## Open decisions before execution

1. **Scope of PR #83**: keep Commit 1 on `slot-checkout` (matches
   Thread A) — recommended — or split it to a separate branch too?
2. **Shim or no shim**: keep `get_gh_issue_gateway()` /
   `get_*_gateway()` as one-line shims for minimal call-site churn, or
   rip them out and have operations access the typed context directly?
3. **Land order**: stacked branches (Graphite-style) for all three, or
   land Commit 1 in PR #83 and treat 2–3 as independent follow-ups?

## Out of scope

- Changes to clinkr (`packages/twerk-core/src/twerk_core/clinkr/`). The
  framework remains context-agnostic.
- Introducing a shared base context in twerk-core. Each package owns
  its own dataclass.
- Domain logic changes (allocation, GitHub I/O, command behavior) —
  this is purely a CLI plumbing refactor.
