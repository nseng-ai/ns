# Add Codex Variant of Slot GC with Dedicated PRGateway

## Context

`twerk-slots` keeps a pool of assigned worktrees, but an assignment currently
survives after its branch's PR is merged or closed until someone runs
`slot free` manually. The pool therefore accumulates stale assignments.

This workstream adds a `slot gc` subcommand that sweeps assigned slots and
releases only the ones whose current branch tip corresponds to a merged or
closed PR.

This plan is specifically the Codex-side implementation track for this feature.
When `plan-to-branch` generates the slug, it should preserve that distinction so
the resulting branch name clearly reads as the codex variant rather than the
parallel Claude implementation.

The user explicitly wants a dedicated `PRGateway` because there will be
multiple consumers of PR-only lookups. That gateway should stay separate from
the existing mixed `IssueGateway`; the new work should not contort the current
issue/PR gateway hierarchy.

## Outcome

After this work:

- `slot gc` exists as a public subcommand
- `slot gc --dry-run` previews exactly what a real run would do, without
  mutating state
- slots are freed only when the local branch tip matches a PR whose state is
  `MERGED` or `CLOSED`
- open PRs are kept
- missing PRs are kept
- ambiguous matches, missing worktrees, missing local branch refs, and `gh`
  failures are surfaced as per-slot errors without aborting the whole sweep
- a dedicated `PRGateway` exists for reuse by future consumers

## Decisions

### 1. Keep `PRGateway` separate from `IssueGateway`

- Create a new `PRGateway` hierarchy as a sibling to `IssueGateway`
- Do not make `IssueGateway` inherit from `PRGateway`
- Do not make `PRGateway` inherit from `IssueGateway`
- Do not rename existing `IssueGateway` plumbing in this workstream

Rationale:

- the current `IssueGateway` intentionally mixes issue and PR operations
- `slot gc` only needs PR lookup behavior
- future PR-only consumers should depend on a narrow surface
- separating the hierarchies avoids broad mechanical churn in existing issue
  consumers

### 2. Match PRs by branch name and local HEAD SHA

Branch name alone is not safe because a branch name can be reused after an old
PR was merged or closed. `slot gc` must therefore only free a slot when the PR
match is tied to the branch's current local tip.

Concrete rule:

1. read the assigned branch name from pool state
2. resolve the local branch head SHA
3. list PRs for that branch across all states
4. keep only PRs whose `headRefOid` matches the local head SHA
5. if exactly one matching PR remains:
   - `OPEN` -> keep
   - `MERGED` or `CLOSED` -> free / would_free
6. if zero matches remain -> keep as `kept_no_pr`
7. if multiple matches remain -> emit an `ambiguous_pr` error and keep

This is the safety property that prevents `slot gc` from freeing a live slot
because an older PR happened to use the same branch name.

### 3. `--dry-run` must use the same eligibility checks as a real run

`--dry-run` is not just "show what the PR lookup says." It must run the same
preconditions a real free would run, except for the mutation itself.

That means dry-run must still:

- verify the assigned worktree path exists
- check whether the worktree is dirty
- resolve the local branch head SHA
- classify PR lookup outcomes

If a real run would skip a dirty worktree or error on a missing path, dry-run
must report that same outcome rather than `would_free`.

### 4. Missing or broken state should not abort the sweep

Per-slot failures should be recorded and the sweep should continue:

- missing worktree path -> error
- local branch ref missing -> error
- `gh` failure -> error
- ambiguous PR matches -> error
- dirty worktree -> skipped_dirty

The command should return exit 0 when the sweep completes, even with per-slot
errors, because the operation is best-effort and reports structured outcomes.

## Proposed API changes

### `twerk_core.gh.types`

Add:

- `PRState = Literal["OPEN", "CLOSED", "MERGED"]`

Extend `PRSummary` with:

- `state: PRState`
- `head_ref_oid: str`
- optionally `updated_at: str` if helpful for debugging / reporting

Do not remove any existing fields.

### `twerk_core.gh.pr_gateway` (new)

Add a new narrow ABC:

- `class PRGateway(ABC)`
- `find_prs_for_branch(branch: str, *, state: str = "open") -> tuple[PRSummary, ...] | PRLookupError`

Semantics:

- returns zero or more PR summaries
- returns `PRLookupError` only for actual lookup failures
- does not collapse "no match" into an error

The gateway is intentionally list-shaped rather than single-result-shaped so
consumers can apply their own matching logic without losing information.

### `twerk_core.gh.real_pr_gateway` (new)

Implement `RealPRGateway(PRGateway)` using:

- `gh pr list --head <branch> --state <state> --json number,title,url,headRefName,headRefOid,baseRefName,state`

Parse the JSON array into `PRSummary` tuples.

Notes:

- `slot gc` should call this with `state="all"`
- future consumers that only want open PRs can use the default `state="open"`

### `twerk_core.gh.pr_testing` (new)

Add `FakePRGateway(PRGateway)` with constructor-seeded results:

- `prs_by_branch_state: dict[tuple[str, str], tuple[PRSummary, ...]] | None = None`
- default to empty tuples for missing keys
- allow explicit error injection for lookup-failure tests, e.g.
  `errors_by_branch_state: dict[tuple[str, str], PRLookupError] | None = None`

This fake should be purpose-built for the new gateway rather than overloading
`FakeIssueGateway`.

### `twerk_slots.gateway.git`

Add:

- `get_branch_head_sha(branch: str) -> str | None`

Real implementation:

- `git rev-parse <branch>`
- return `None` when the branch ref does not exist

Fake implementation:

- constructor-seeded `branch_head_by_name: dict[str, str] | None = None`

## Slots design

### `twerk_slots.context`

Extend `SlotsCliContext` with:

- `pr: PRGateway`

Wire `build_slots_context()` to inject `RealPRGateway()`.

Update all slots tests that construct `SlotsCliContext(...)` to pass
`FakePRGateway()`.

### `twerk_slots.gc` (new)

Create a pure logic module that owns the sweep.

Types:

- `SlotGcAction = Literal["freed", "would_free", "kept_open_pr", "kept_no_pr", "skipped_dirty", "error"]`
- `SlotGcEntry`
- `SlotGcOutcome`

Recommended `SlotGcEntry` fields:

- `slot_name: str`
- `branch_name: str`
- `worktree_path: Path`
- `action: SlotGcAction`
- `pr_number: int | None`
- `pr_state: PRState | None`
- `pr_url: str | None`
- `message: str | None`

Algorithm:

1. load pool state; if absent, caller handles that as a CLI-level error
2. run `sync_pool_assignments(...)`
3. iterate assignments in slot order
4. if `worktree_path` does not exist:
   - emit `error`
   - message explains the path is missing
   - continue
5. if worktree has uncommitted changes:
   - emit `skipped_dirty`
   - continue
6. resolve `local_head = ctx.git.get_branch_head_sha(assignment.branch_name)`
7. if `local_head is None`:
   - emit `error`
   - message explains the local branch ref is missing
   - continue
8. call `ctx.pr.find_prs_for_branch(assignment.branch_name, state="all")`
9. if lookup returns `PRLookupError`:
   - emit `error`
   - include stderr / returncode in the message
   - continue
10. filter returned PRs to the ones whose:
    - `head_ref_name == assignment.branch_name`
    - `head_ref_oid == local_head`
11. classify:
    - 0 matches -> `kept_no_pr`
    - >1 matches -> `error` with an ambiguity message
    - 1 match with `OPEN` -> `kept_open_pr`
    - 1 match with `MERGED` or `CLOSED`:
      - dry run -> `would_free`
      - real run -> call `free_slot_assignment(...)`
12. for real frees:
    - map `DirtyWorktreeError` to `skipped_dirty`
    - map `SlotNotAssignedError` defensively to `error`
13. return aggregate counts

Important:

- do not bypass `free_slot_assignment` for the real mutation path
- do not rely on `free_slot_assignment` for dry-run classification
- do not shell out to `gh pr view` for this feature

## CLI design

### `twerk_slots.cli.slot.gc` (new)

Add a new public operation:

- `slot gc`
- `slot gc --dry-run`

Request:

- `dry_run: bool`

Result:

- `entries`
- `freed_count`
- `kept_count`
- `skipped_count`
- `error_count`
- `dry_run`

Human rendering:

- one line per slot with a clear verb and reason
- final summary line with counts
- explicit note when running in dry-run mode

Suggested verbs:

- `Freed`
- `Would free`
- `Kept`
- `Skipped dirty`
- `Error`

JSON mode:

- `slot json gc`
- `slot json gc --schema`

The JSON payload should preserve per-entry action and optional PR metadata so
other tools can consume it.

## Files to modify

### New files

- `packages/twerk-core/src/twerk_core/gh/pr_gateway.py`
- `packages/twerk-core/src/twerk_core/gh/real_pr_gateway.py`
- `packages/twerk-core/src/twerk_core/gh/pr_testing.py`
- `packages/twerk-slots/src/twerk_slots/gc.py`
- `packages/twerk-slots/src/twerk_slots/cli/slot/gc.py`
- `packages/twerk-slots/tests/unit/test_gc.py`
- `packages/twerk-slots/tests/scenario/test_slot_gc_cli.py`
- `packages/twerk-core/tests/gateways/test_real_pr_gateway.py`
- `packages/twerk-core/tests/gateways/test_fake_pr_gateway_dedicated.py`

### Modified files

- `packages/twerk-core/src/twerk_core/gh/types.py`
- `packages/twerk-slots/src/twerk_slots/context.py`
- `packages/twerk-slots/src/twerk_slots/cli/slot/context.py`
- `packages/twerk-slots/src/twerk_slots/gateway/git.py`
- `packages/twerk-slots/src/twerk_slots/gateway/real_git.py`
- `packages/twerk-slots/src/twerk_slots/gateway/testing/git.py`
- slots tests that construct `SlotsCliContext(...)`

### Explicit non-goals

- no rewrite of `IssueGateway`
- no migration of existing `pr-address` code to `PRGateway`
- no `IssueGateway`/`PRGateway` inheritance relationship
- no repo-wide gateway refactor beyond what `slot gc` needs

## Test plan

### Core gateway tests

- `RealPRGateway.find_prs_for_branch(..., state="all")` parses multiple PRs
- `RealPRGateway` returns empty tuple when `gh pr list` returns `[]`
- `RealPRGateway` returns `PRLookupError` on non-zero exit
- `FakePRGateway` returns seeded tuples and seeded errors

### Git gateway tests

- real and fake `get_branch_head_sha()` return the configured SHA
- real and fake return `None` for missing branches

### Unit tests for `run_gc`

- empty pool -> all zero counts
- open PR with matching SHA -> kept_open_pr
- merged PR with matching SHA -> freed
- closed PR with matching SHA -> freed
- merged PR with matching SHA and `dry_run=True` -> would_free
- no PRs for branch -> kept_no_pr
- PR exists for branch name but SHA does not match local head -> kept_no_pr
- multiple matching PRs for same branch+SHA -> error
- missing worktree path -> error
- missing local branch ref -> error
- `gh` failure -> error
- dirty worktree -> skipped_dirty
- mixed pool -> counts and per-slot actions are correct

### Scenario tests for CLI

- `slot gc -h` renders help
- `slot gc` appears in top-level help
- outside repo -> `not_in_repo`
- no pool configured -> `pool_empty`
- merged slot -> output says freed and pool state shrinks
- `--dry-run` merged slot -> output says would free and pool state is unchanged
- open PR slot -> output says kept
- JSON mode returns entries and counts
- schema mode returns request/result/error schemas

### Full verification

1. targeted gateway tests in `twerk-core`
2. targeted `twerk-slots` unit + scenario tests
3. `just check`

## Sequencing

1. Add `PRState` and extend `PRSummary`
2. Add the new `PRGateway` + real/fake implementations and tests
3. Add `get_branch_head_sha()` to the git gateway and tests
4. Thread `pr: PRGateway` through `SlotsCliContext` and update existing tests
5. Implement `twerk_slots.gc` and its unit tests
6. Implement `slot gc` CLI and scenario tests
7. Run `just check`

## Risks to guard against

- freeing a slot because an old PR reused the same branch name
- dry-run reporting `would_free` for a dirty or missing worktree
- crashing the whole sweep on one bad slot
- turning generic `gh` failures into false "no PR" classifications
- creating unnecessary churn in the existing issue gateway stack
