# 04 — Graphite Subgroup & Gateways Spec

The `slot gt` Graphite-named boundary and the full gateway/fake split. Slice: roadmap row 7 (gt);
gateways underpin all rows. The Graphite boundary is policy-load-bearing: **only `slot gt` /
`slot gt exec` may depend on Graphite; plain `slot` must not.**

Python source: `cli/slot/gt/{group,up,down,free_stack,navigation,stack_walk}.py`,
`cli/slot/gt/exec/{group,stack_branches,stack_map_branches}.py`, `cli/slot/gt/context.py`.

## Graphite policy boundary (repo `AGENTS.md`)

- `slot gt` is the canonical opt-in Graphite command group — its name is the contract.
- Use Graphite **plumbing** only: `GtGateway.parent_of` / `children_of` / `trunk` / `stack`
  (interface `asdl_core/gt/gateway.py:19-43`). Never parse human `gt ls` / `gt log` output for
  topology.
- The TS port defines a **package-local** `GtGateway` (`gateways/gt.ts`) whose method set mirrors the
  Python interface; it is constructed only inside the `slot gt` context loader, never in the plain
  `slot` context.

## Group wiring (`cli/slot/gt/group.py:10-25`)

`build_gt_group()` mounts `up`, `down`, `free-stack`, and the hidden `exec` subgroup
(`build_exec_group()`). The `exec` subgroup MUST be `hidden=True` (repo convention for skill-invoked
commands); operations live under `gt/exec/`.

## navigation helper (`cli/slot/gt/navigation.py`)

Shared by `up`/`down`. Types: `WorktreeTarget{slot_name?, branch_name, worktree_path}`
(`navigation.py:18-22`); `GtNavigationTarget` result with the clipboard tri-state fields
(`navigation.py:24-34`).

- `find_worktree_for_branch(ctx, branch)` (`navigation.py:42-52`): scan `git.list_worktrees()`; a
  match in a `slot-NN` dir sets `slot_name`, otherwise `slot_name=None` (main/other worktree).
- `resolve_or_checkout_worktree_for_branch(ctx, branch)` (`navigation.py:55-74`): reuse if found
  (`already_assigned=true`), else `checkout_branch(ctx, branch, new_branch=false, base=None)` and
  wrap the outcome.
- `build_navigation_result(ctx, target, no_clipboard, { write_cd_directive, already_assigned })`
  (`navigation.py:77-108`): compute `cd_command = "cd <path>"`; call
  `write_cd_directive_if_active(path, enabled=write_cd_directive)` (see `05`); unless `no_clipboard`,
  `clipboard.copy(cd_command)` and map success/failure into the tri-state fields.

> **cd-suppression-in-JSON rule:** `up`/`down` pass `write_cd_directive = not is_machine_mode(ctx)`
> (`up.py:89`). In `--format json` / `--json-schema`, `is_machine_mode` is true, so no cd directive is
> written. This rule is contract — reproduce it (the TS clinkr equivalent of `is_machine_mode`).

## up / down (`cli/slot/gt/up.py`, `down.py`)

`run_gt_up` (`up.py:41-92`): load gt context (`not_in_repo` if sentinel); `git.get_current_branch`
(map `GitFailure`→`git_current_branch_failed`, `DetachedHead`→`detached_head`); `gt.children_of(root)`:

- `UntrackedBranch` → `untracked_branch`; `GtCommandFailure` → `gt_children_failed`;
- `len == 0` → `ClinkrExit.negative("No upstack branch ...")` (exit 1);
- `len > 1` → negative with the candidate list (ambiguous fork);
- exactly one child → `resolve_or_checkout_worktree_for_branch(child)` then `build_navigation_result`.

`down` is the mirror using `gt.parent_of(root)` (`NoParent` → negative "no downstack branch").

## free-stack (`cli/slot/gt/free_stack.py:63-180`)

1. Load gt context; `git.get_current_branch` (failure/detached → error).
2. `gt.trunk(root)` (`gt_trunk_failed` on failure). If `current == trunk` → ok with
   `noop_reason="on_trunk"` (`free_stack.py:98-107`).
3. Build inventory; `pool_size == 0` → `pool_empty`.
4. `gt.stack(root)` (`gt_stack_failed`; `UntrackedBranch` → `gt_untracked_branch`).
5. `collect_stack_branches(stack, current, trunk, downstack_only=request.downstack)` excludes current
   and trunk (double-checked, `free_stack.py:133-147`); for each stack branch with a `SlotMatch`,
   collect the slot name (dedup).
6. No targets → ok `noop_reason="no_slots"`; else `free_slots(ctx, targets, trunk_branch=trunk)`
   (reuses the `free` engine), map failure to its error type, return
   `SlotGtFreeStackResult{current_branch, trunk_branch, freed[], noop_reason:null, downstack}`.

## exec stack-branches / stack-map-branches (hidden, skill-ready JSON)

`stack-branches` (`gt/exec/stack_branches.py`): request `--downstack` (`:33-41`); result
`SlotGtStackBranchesResult{branches, trunk, current, scope:"full"|"downstack", edges[], warnings[]}`
(`:49-55`); human renderer emits compact JSON `{"branches":[...]}` to stdout and warnings to stderr
(`:58-61`). Stack-metadata inconsistencies map to `stack_metadata_inconsistent`
(`:64-68`); the stack-walk helpers (`stack_walk.collect_stack_branches` / `collect_stack_edges`) and
the `StackFork`/`WalkCycle`/`WalkRowMissing`/`TrunkMarkerProblem` render helpers come from
`asdl_core.gt.types` — the TS port needs equivalents in its package-local gt types.

`stack-map-branches` (`gt/exec/stack_map_branches.py`, 323 lines): request `--recent-limit`
(default 40); result `SlotGtStackMapBranchesResult{current, trunk, scope, recent_limit, branches[],
edges[], slots[], warnings[]}` — emits the Graphite branch graph plus slot rows for a stack-map
skill/agent. **No current wired consumer** (see inventory §7); port at full fidelity or park per the
objective's last Open Question — confirm before deciding.

## Gateways (package-local; model on `ts/packages/areg`'s gateways split)

Define interfaces in `gateways/*.ts`, in-memory fakes in `gateways/fakes/*.ts`, and real adapters
that shell out via an injected process runner. The Python interfaces live in `asdl_core`; the TS port
re-declares only the methods slot actually uses.

### Git worktree gateway (`gateways/git.ts`)

Methods consumed by slot (grep over `packages/asdl-slots/src`):

| Method                                                            | Used by                                |
| ----------------------------------------------------------------- | -------------------------------------- |
| `listWorktrees()`                                                 | inventory derivation, navigation       |
| `listBranchOccupancies()`                                         | inventory (operation detection)        |
| `addDetachedWorktree(path, ref)`                                  | init, resize grow                      |
| `removeWorktree(path)`                                            | resize shrink                          |
| `checkoutBranch(path, branch)` → failure\|null                    | checkout, claim                        |
| `detachHead(path, ref)`                                           | claim source detach, redirect, release |
| `createBranch(name, base, {force})`                               | checkout `-b`                          |
| `branchExists(name)`                                              | checkout, claim                        |
| `deleteLocalBranch(name)`                                         | free `--all`, gc `--delete-branches`   |
| `getCurrentBranch(cwd)` → branch\|DetachedHead\|GitCommandFailure | many                                   |
| `getPreviousBranch(cwd)`                                          | `--current` redirect planning          |
| `getTrunkBranch()`                                                | init/resize/free/redirect/gt           |
| `hasUncommittedChanges(path)`                                     | dirty checks everywhere                |
| `getGitCommonDir(cwd)` / `getRepositoryRoot(cwd)`                 | repo-context discovery                 |
| `pathExists(path)`                                                | repo-context discovery                 |
| `listLocalBranches()` / `listLocalBranchTips()`                   | tab-completion, stack-map              |

Mirror the Python result types: `WorktreeInfo{path, branch}`, `WorktreeOccupancy{path, branch,
operation}` where `operation` ∈ {`checked-out`, `rebasing`, `bisecting`, ...}, `DetachedHead`,
`GitCommandFailure`. Real adapter parses `git worktree list --porcelain` and the in-progress-operation
markers; the fake is constructed from an in-memory worktree table for scenario tests.

### Gt gateway (`gateways/gt.ts`) — `slot gt` only

`parentOf(cwd)` → `string|NoParent|UntrackedBranch|GtCommandFailure`; `childrenOf(cwd)` →
`string[]|UntrackedBranch|GtCommandFailure`; `trunk(cwd)` → `string|GtCommandFailure`; `stack(cwd)`
→ `StackInfo|UntrackedBranch|GtCommandFailure` (interface `asdl_core/gt/gateway.py:19-43`). Real
adapter shells `gt parent --no-interactive` / `gt children --no-interactive` / etc. **Constructed
only in the gt context loader.**

### Clipboard gateway (`gateways/clipboard.ts`) — see `05`.

### Storage gateway (`gateways/storage.ts`): `pathExists` / `ensureDir` (`gateway/storage.py:13-18`).

### PR gateway (`gateways/pr.ts`) — `free --all` / `gc` only: `getPrForBranch(branch)` →

`PRSummary|PRLookupMiss|PRGatewayFailure`; `closePr(...)`. Mirror `asdl_core.gh` result types.

## TS test checklist (port from `test_gt_boundary.py`, `test_gt_navigation.py`, `test_collect_stack_branches.py`, gt scenario files)

- gt boundary: plain `slot` context never constructs the gt gateway; only `slot gt` does.
- up/down: reuse existing slot; checkout when absent; `untracked_branch`; `detached_head`;
  zero-child negative; multi-child ambiguous negative; parent `NoParent` negative; cd-directive
  written in human mode, suppressed in JSON mode (`is_machine_mode`).
- free-stack: `on_trunk` noop; `no_slots` noop; frees only stack slots excluding current+trunk;
  `--downstack` ancestor-only; `gt_untracked_branch`; reuses free engine outcomes.
- exec stack-branches: compact JSON to stdout, warnings to stderr; `full` vs `downstack` scope;
  edges; `stack_metadata_inconsistent` on walk problems.
- gateways: fake git worktree table drives inventory/lifecycle tests; real git adapter verified in a
  throwaway repo (create/list/remove detached worktree, dirty detection, occupancy/operation parse).
