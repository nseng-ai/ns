# 02 — Pure Core & Naming Spec

The pure, I/O-free heart of `slot`: naming, inventory derivation, allocation/redirect planning, and
`~/.slots` path resolution. These translate to TS as pure functions over gateway-returned data and
carry the bulk of the testable logic. Slices: roadmap rows 3 and 5.

Python source: `naming.py`, `inventory.py`, `checkout_planning.py`, `repo_context.py`.

## Naming (`naming.py` → `naming.ts`)

- `SLOT_NAME_PREFIX = "slot"` (`naming.py:8`).
- `generateSlotName(n)` → `slot-` + 2-digit zero-padded number (`naming.py:11-13`):
  `` `slot-${String(n).padStart(2, "0")}` ``.
- `extractSlotNumber(name)` → the two-digit suffix string or `null` (`naming.py:16-23`): require the
  `slot-` prefix, then exactly 2 chars that are all digits; otherwise `null`. **Contract:** names
  like `slot-1`, `slot-100`, `slot-ab`, `worktree-01` are NOT managed slots.

## Inventory (`inventory.py` → `inventory.ts`)

Types (`inventory.py:16-51`):

- `SlotRecord { slotName, slotNumber, path, branch: string|null, operation: string|null }`.
  - `status`: `"assigned"` if `branch !== null` else `"available"` (`:24-26`).
  - `isAvailable`: `branch === null && operation === null` (`:28-30`).
- `SlotInventory { records: SlotRecord[], mainWorktree: WorktreeInfo|null, branchOccupancies: WorktreeOccupancy[] }`.
  - `poolSize = records.length` (`:53-55`).

Methods (pure except `lowestAvailable`, which queries the git gateway for dirtiness):

- `findByBranch(branch)` → `{kind:"slot", record}` | `{kind:"main", worktree}` | `null`; checks
  records first, then the main worktree (`:57-63`). (Python uses `SlotMatch`/`MainWorktreeMatch`
  dataclasses — model as a TS discriminated union.)
- `findOccupancyByBranch(branch)` → `WorktreeOccupancy|null` (`:65-69`).
- `findBySlot(slotName)` → `SlotRecord|null` (`:71-75`).
- `lowestAvailable(git)` → first record that `isAvailable` **and** not
  `git.hasUncommittedChanges(record.path)` (`:77-84`). This is the allocation primitive.

Derivation `buildSlotInventory(git, { mainRepoRoot })` (`inventory.py:87-123`):

1. `branchOccupancies = git.listBranchOccupancies()`; index by path (`:94-95`).
2. For each `wt` in `git.listWorktrees()`:
   - If `mainRepoRoot` set and `wt.path === mainRepoRoot`: record as `mainWorktree`, skip (`:97-99`).
   - `suffix = extractSlotNumber(wt.path.name)`; if `null`, skip (non-managed) (`:100-102`).
   - `branch = wt.branch`, `operation = null`; if an occupancy exists for the path whose
     `operation !== "checked-out"`, override `branch = occupancy.branch` and
     `operation = occupancy.operation` (this is how rebasing/bisecting shows up) (`:103-108`).
   - push `SlotRecord{ slotName: wt.path.name, slotNumber: Number(suffix), path, branch, operation }`.
3. Sort records by `slotNumber` ascending (`:118`).

## Allocation & redirect planning (`checkout_planning.py` → `planning.ts`)

Tagged-union plans (`checkout_planning.py:32-71`) — model as a TS discriminated union on a `kind`
field:

- `ReuseAssignment{record}` — branch already in a managed slot; reuse without touching git.
- `BranchInMainWorktree{mainPath}` — branch on the main worktree; redirect there.
- `AssignToSlot{record}` — allocate the lowest clean detached slot.
- `BranchInUse{occupancy}` — branch held elsewhere (checked out / rebasing / bisecting); surfaced up
  front for a clean message.
- `PoolFull{assigned}` — no clean detached slot; carries the assigned `(slot, branch)` pairs.

`planCheckout(inventory, git, branchName)` (`:122-140`):

1. `match = findByBranch(branchName)`.
2. If slot match: if the record has an in-progress operation (`_operationOccupancy`, `:100-107`) →
   `BranchInUse`; else `ReuseAssignment`.
3. If main-worktree match → `BranchInMainWorktree`.
4. Else if `findOccupancyByBranch` non-null → `BranchInUse`.
5. Else `_assignToAvailableSlot` → `AssignToSlot(lowestAvailable)` or `PoolFull(assigned)` where
   `assigned = records with branch !== null` (`:110-119`).

`--current` redirect planning (`planCurrentWtRedirect`, `:143-201`) — how the caller worktree gets
off the moving branch. Strategy in order:

1. **reflog previous**: if `git.getPreviousBranch(cwd)` exists, isn't the moving branch, and
   `git.branchExists(previous)`, and no other worktree holds `previous` → `CheckoutCurrentWorktreeBranch{branch:previous, role:"previous"}` (`:156-169`).
2. else `trunk = git.getTrunkBranch()`; if cwd looks like a slot dir (`extractSlotNumber(cwd.name)`) →
   `DetachCurrentWorktree{ref:trunk}` (mirrors `slot free`) (`:171-176`).
3. else if `trunk === movingBranch` → `DetachCurrentWorktree{ref:movingBranch}` (`:177-181`).
4. else if no other worktree holds trunk → `CheckoutCurrentWorktreeBranch{branch:trunk, role:"trunk"}`
   (`:183-194`); else `DetachCurrentWorktree{ref:movingBranch}` with an explanatory `note` (`:195-201`).

`planCurrentCheckout(git, { cwd, mainRepoRoot })` (`:250-287`):

1. `current = git.getCurrentBranch(cwd)`; on `GitCommandFailure` throw `SlotAllocationError`; on
   `DetachedHead` return `DetachedHeadError{cwd}` (`:257-263`).
2. Build inventory; if current branch already in a slot → `CurrentCheckoutPlan{plan:ReuseAssignment, redirect:null}` (`:265-272`).
3. If `git.hasUncommittedChanges(cwd)` → `DirtyCurrentWorktreeError{cwd}` (`:274-275`).
4. Else compute `redirect`, build an inventory view that ignores the caller's own branch hold
   (`inventoryWithoutCallerBranchOccupancy`, `:217-247`), and return
   `CurrentCheckoutPlan{plan: planCheckout(adjusted, git, current), branchName: current, redirect}`.

> `inventoryWithoutCallerBranchOccupancy` (`:217-247`) clears `branch`/`operation` on the caller's
> own record/main-worktree and drops the caller's occupancy so the branch being moved doesn't count
> as "in use" against itself. Reproduce the behavior; the Python uses `dataclasses.replace`, TS uses
> object spread.

## Repo context & `~/.slots` paths (`repo_context.py` → `repo-context.ts`)

- `SLOTS_ROOT = ~/.slots` (`repo_context.py:15`). Inject `slotsRoot` for testability (it's already a
  param to `discover_repo_or_sentinel`).
- `RepoContext { root, mainRepoRoot, repoName, repoDir, worktreesDir }` (`:18-31`).
- `discoverRepoOrSentinel(cwd, { slotsRoot, git })` (`:42-71`):
  - if `!git.pathExists(cwd)` → `NoRepoSentinel{message:"Start path '<cwd>' does not exist"}`.
  - `gitCommonDir = git.getGitCommonDir(cwd.resolve())`; if `null` →
    `NoRepoSentinel{message:"Not inside a git repository (no .git found up the tree)", errorType:"not_in_repo"}`.
  - `mainRepoRoot = gitCommonDir.parent.resolve()`; `root = git.getRepositoryRoot(cwd)`.
  - `repoName = mainRepoRoot.name`; `repoDir = slotsRoot/repos/<repoName>`;
    `worktreesDir = repoDir/worktrees` (`:58-63`).
- `ensureSlotsMetadataDir(repo, storage)` → `storage.ensureDir(repoDir)` then `ensureDir(worktreesDir)`
  (`:74-81`).

## TS test checklist (port from `test_naming.py`, `test_inventory.py`, `test_checkout_planning.py`, `test_repo_context.py`)

- naming: `generateSlotName(1)==="slot-01"`, `generateSlotName(99)==="slot-99"`; `extractSlotNumber`
  accepts `slot-07`→`"07"`, rejects `slot-7`, `slot-100`, `slot-xx`, `feature-01`, `slot-`.
- inventory: derivation skips main worktree and non-`slot-NN` dirs; attaches `operation` from a
  non-`checked-out` occupancy; `status`/`isAvailable` truth table; `lowestAvailable` skips assigned,
  skips dirty (via fake git `hasUncommittedChanges`), returns lowest number; records sorted.
- planning: each `planCheckout` branch (reuse / main / in-use-by-operation / in-use-by-occupancy /
  assign / pool-full); `planCurrentWtRedirect` all four strategies incl. the trunk-busy note;
  `planCurrentCheckout` detached-head, dirty, already-in-slot, and happy redirect; the
  caller-occupancy-removal view.
- repo-context: sentinel on missing path; sentinel on no-git; `repoName` from main root (stable across
  a slot worktree cwd); `repoDir`/`worktreesDir` composition; `ensureSlotsMetadataDir` calls.
