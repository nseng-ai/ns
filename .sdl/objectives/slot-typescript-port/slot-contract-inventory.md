# slot — Contract Inventory (durable vs incidental)

Pre-port classification of the Python `slot` capability, separating durable user-facing/storage
contract from incidental Python implementation detail. All claims cite `packages/asdl-slots/src/
asdl_slots/` unless noted. This is the read-only drift anchor for the `prework/` specs and the
implementation slices; the `prework/` docs carry the deeper per-area detail.

Evidence sources: `packages/asdl-slots/README.md`; `cli/slot/group.py`, `cli/slot/gt/group.py`;
`lifecycle/outcomes.py`; `inventory.py`, `naming.py`, `checkout_planning.py`, `repo_context.py`,
`context.py`; `lifecycle/{pool,checkout,claim,free,gc}.py`; `shell_integration.py`,
`cli/slot/shell.py`, `cli/slot/completion.py`; `gateway/{clipboard,storage,real_clipboard}.py`;
`cli/slot/gt/{up,down,free_stack,navigation}.py`, `cli/slot/gt/exec/{stack_branches,stack_map_branches}.py`;
`pyproject.toml`; and `tests/{scenario,unit,integration}/`.

---

## 1. CLI surface

Group registration: `cli/slot/group.py:17-35` mounts the eight top-level operations plus the
`completion`, `gt`, and `shell` subgroups. Standalone entry `cli/main.py:8-21`; plugin entry
`cli/plugin.py:8-12`; `pyproject.toml:11-15` declares `slot = asdl_slots.cli.main:main` and the
`asdl.plugins` `slots` entry point.

**Durable contract**

- The 17 commands and their names/aliases:
  - `init` (`--size`), `list`/`ls`, `resize` (`--size`).
  - `checkout`/`co` (`[BRANCH] | --current | -b NEW [BASE]`, `--no-clipboard`), `claim` (`BRANCH`,
    `--no-clipboard`), `goto` (`-n/--num | -w/--wt`, `--no-clipboard`).
  - `free` (`-n` *, `-w`*, `-b`*, `-c/--current`, `--all`, `--dry-run`, `-y/--yes`), `gc`
    (`--dry-run`, `-f/--force`, `--delete-branches`).
  - `gt up`, `gt down`, `gt free-stack` (`--downstack`); hidden `gt exec stack-branches`
    (`--downstack`), `gt exec stack-map-branches` (`--recent-limit`, default 40).
  - `shell show|install` (`--shell`), `completion show|install` (`--shell`).
- The `--format json` machine envelope and `--json-schema` on every operation (Clinkr canonical
  envelope `{"exit_code", "data"|"error_type"|"message"}` — shared with all ported CLIs).
- The result/outcome field names in `lifecycle/outcomes.py` and the gt result models, which are the
  JSON `data` payloads (see §2 / §3 below for specifics).
- Selector rules: `goto` requires exactly one of `-n`/`-w`; `free` accepts multiple selectors,
  deduplicated and processed in order.

**Likely incidental**

- Rich markup / console styling in the `render_*` functions (e.g. `cli/slot/gt/navigation.py:111-134`,
  `cli/slot/shell.py:127-136`) — human formatting, not contract; re-author idiomatically.
- Click/Clinkr help-text rendering format (commander-style in TS) — framework divergence, accepted.
- Exact ordering of keys within the JSON envelope.

---

## 2. Domain model & storage

**Durable contract**

- **`git worktree list` is the sole source of truth.** Inventory is derived per-invocation; there is
  no persisted branch↔slot map. `build_slot_inventory` (`inventory.py:87-123`) reads
  `git.list_worktrees()` + `git.list_branch_occupancies()`, filters managed `slot-NN` dirs, sorts by
  number, and attaches in-progress `operation` from occupancies (`inventory.py:104-117`).
- **Slot naming** (`naming.py`): `generate_slot_name(n)` → `f"slot-{n:02d}"` (`naming.py:11-13`);
  `extract_slot_number` requires the `slot-` prefix and exactly two digits (`naming.py:16-23`). The
  two-digit zero-pad and the `slot-` prefix are contract.
- **Pool bounds**: `MIN_POOL_SIZE = 1`, `MAX_POOL_SIZE = 99` (`pool.py:18-19`); `--size` outside
  these → `invalid_size` (`pool.py:33-37,64-65,100-101`).
- **Status derivation** (`inventory.py:24-30`): `assigned` iff `branch is not None`; `available` iff
  `branch is None and operation is None`. `lowest_available` skips non-available and dirty slots
  (`inventory.py:77-84`).
- **Allocation order**: lowest-numbered clean detached slot wins (`inventory.lowest_available` +
  `checkout_planning._assign_to_available_slot:110-119`).
- **Host filesystem layout** (`repo_context.py`): `SLOTS_ROOT = ~/.slots` (`repo_context.py:15`);
  `repo_dir = ~/.slots/repos/<repo_name>` and `worktrees_dir = repo_dir/worktrees`
  (`repo_context.py:62-63`); `repo_name` derives from the **main** repo root so paths stay stable
  across worktrees (`repo_context.py:58-61`). `not_in_repo` sentinel when cwd is not in a git repo
  (`repo_context.py:35-39,49-56`). Metadata dirs created via `ensure_slots_metadata_dir`
  (`repo_context.py:74-81`).

**Likely incidental**

- The `dataclasses.replace`-based inventory adjustment in
  `checkout_planning.inventory_without_caller_branch_occupancy:217-247` — internal mechanism for
  `--current` planning; reproduce the behavior, not the structure.
- The tagged-union plan dataclass names (`ReuseAssignment`, etc.) — internal; the observable contract
  is the resulting outcome/exit, not the class identity.

---

## 3. Per-command observable contract (outcomes)

Source: `lifecycle/outcomes.py`. These field sets are the durable JSON `data` payloads.

- `SlotInitOutcome` (`outcomes.py:41-45`): `created[]`, `pool_size`, `worktrees_dir`. Refuses when a
  pool already exists → `pool_already_initialized` (`pool.py:71-78`).
- `SlotResizeOutcome` (`outcomes.py:48-54`): `previous_pool_size`, `pool_size`, `created[]`,
  `removed[]`, `worktrees_dir`. Grow fills numbering gaps then extends (`pool.py:47-56`); shrink
  removes highest-numbered detached clean slots (`pool.py:57-58`); unsafe shrink → `resize_unsafe`
  reporting **all** offenders (assigned / dirty / operation-in-progress) (`pool.py:119-125,151-178`).
- `SlotCheckoutOutcome` (`outcomes.py:12-19`): `slot_name`, `branch_name`, `worktree_path`,
  `already_assigned`, `created_branch`, `current_wt_note`. Plan union + error types in `checkout.py`:
  `branch_exists` (`checkout.py:44-51`), `base_missing` (`checkout.py:52-56`), `branch_missing`
  (`checkout.py:63-69`), `pool_full` (`checkout.py:76-77`), `branch_in_use` (`checkout.py:78-79,
  142-152`), `checkout_failed` (`checkout.py:182-190`). `--current` adds `detached_head` /
  `dirty_worktree` refusals (`checkout.py:104-119`) and redirect planning
  (`checkout_planning.plan_current_wt_redirect:143-201`: reflog-previous → slot-detach-at-trunk →
  trunk-or-detach-at-moving-branch).
- `SlotClaimOutcome` (`outcomes.py:28-38`): `slot_name`, `branch_name`, `worktree_path`,
  `replaced_branch_name`, `source_slot_name`, `source_worktree_path`, `already_current`,
  `main_worktree_path`, `main_checkout_branch`. (Detail in `lifecycle/claim.py`.)
- `goto` → `SlotGotoResult` (`cli/slot/goto.py`): `slot_name`, `branch_name`, `operation`,
  `worktree_path`, `cd_command`, clipboard tri-state. Requires exactly one selector.
- `free` → `SlotFreeOutcome` + `SlotFreeCleanupResult` (`outcomes.py:70-87`): freed slots plus
  per-action cleanup (`pr` / `local_branch`, status `planned`/`success`/`skipped`/`error`). Validation
  refusals: not-assigned, operation-in-progress, dirty (`free.py:100-132`); partial-failure messaging
  (`free.py:135-167`); `invalid_slot_args` aggregation (`free.py:38-42`).
- `gc` → `SlotGcOutcome` + `SlotGcEntry` (`outcomes.py:89-133`): per-slot `action`
  (`freed`/`would_free`/`kept_open_pr`/`kept_no_pr`/`skipped_dirty`/`skipped_operation`/`error`),
  PR number/state/url, and aggregate `freed_count`/`kept_count`/`skipped_count`/`error_count`/
  `cleanup_error_count`/`dry_run`.
- gt navigation → `GtNavigationTarget` (`cli/slot/gt/navigation.py:24-34`): `slot_name`,
  `branch_name`, `worktree_path`, `cd_command`, `already_assigned`, and clipboard tri-state fields
  (`clipboard_copied`/`clipboard_skipped`/`clipboard_failure_reason`/`clipboard_failure_detail`).
  `free-stack` → `SlotGtFreeStackResult` (`cli/slot/gt/free_stack.py:34-39`): `current_branch`,
  `trunk_branch`, `freed[]`, `noop_reason` (`on_trunk`/`no_slots`), `downstack`.

---

## 4. External boundaries (gateways)

Context bundle: `SlotsCliContext` carries `repo`, `git`, `storage`, `clipboard`, `pr`, `slots_root`
(`context.py:20-27`).

**Durable contract**

- **Git (plain)** — required by every command. Methods actually consumed (grep over `src`):
  `add_detached_worktree`, `branch_exists`, `checkout_branch`, `create_branch`, `delete_local_branch`,
  `detach_head`, `get_current_branch`, `get_git_common_dir`, `get_trunk_branch`,
  `has_uncommitted_changes`, `list_local_branch_tips`, `list_local_branches`, `list_worktrees`,
  `remove_worktree`. Source: `asdl_core.git.git_gateway.GitGateway`.
- **Graphite (`gt`)** — used **only** by `slot gt` / `slot gt exec`. Methods: `gt.parent_of`,
  `gt.children_of`, `gt.stack`, `gt.trunk` (interface `asdl_core/gt/gateway.py:19-43`). Per repo
  `AGENTS.md`, `slot gt` is the canonical Graphite-named boundary; plain `slot` must not touch `gt`.
- **GitHub PR** — used only by `free --all` and `gc` (close PR / read PR state). Source
  `asdl_core.gh.pr_gateway.PRGateway` (`context.py:13`). `PRState` typed in `outcomes.py:9`.
- **Clipboard** — `ClipboardGateway.copy(text) -> ClipboardCopySuccess | ClipboardCopyFailure`
  (`gateway/clipboard.py:38-49`); failure reasons `backend_missing` / `subprocess_error`
  (`gateway/clipboard.py:19`). Real impl shells to `pbcopy`, mapping `FileNotFoundError` →
  `backend_missing` and `CalledProcessError` → `subprocess_error` (`gateway/real_clipboard.py:24-44`).
  Clipboard failure is non-fatal — commands still print the `cd` fallback.
- **Slots storage** — `SlotsStorageGateway.path_exists` / `ensure_dir` (`gateway/storage.py:13-18`),
  isolating `~/.slots` directory presence from git state.

**Likely incidental**

- The `pbcopy` argv specifics and `subprocess.run(..., capture_output=True)` mechanics — reproduce the
  tri-state result contract via an injected process runner, not the exact Python call.

---

## 5. Shell integration & cd-directive (novel surface — full detail in prework/05)

**Durable contract**

- **cd-directive protocol** (`shell_integration.py`): env var name `SLOT_CD_DIRECTIVE_FILE`
  (`shell_integration.py:11`); `active_cd_directive_path` treats unset/empty as inactive
  (`:22-27`); `write_cd_directive_if_active` writes the destination string to the file, returning
  `inactive` (disabled or no env), `failed` (missing parent dir or `OSError`), or `written`
  (`:30-51`). Navigation only writes when the command is human-format — `--format json` /
  `--json-schema` MUST NOT trigger a cd (objective contract; enforced at the command layer, e.g.
  `navigation.build_navigation_result` passes `write_cd_directive` and the JSON path suppresses it).
- **Parent-shell wrapper** (`cli/slot/shell.py`): the installed `slot()` function mktemps a directive
  file, exports `SLOT_CD_DIRECTIVE_FILE`, runs `command slot "$@"`, and `cd`s to the file's contents
  on success when non-empty (`shell.py:40-59`). Marker block strings
  `# >>> slot shell integration >>>` / `# <<< slot shell integration <<<` (`shell.py:18-19`).
- **`shell show`/`install`** (`shell.py:89-182`): `--shell` zsh|bash, else detect from `$SHELL`,
  default zsh (`shell.py:22-27`); rc path `~/.zshrc` or `~/.bashrc` (`shell.py:30-33`);
  `unsupported_shell` error (`shell.py:36-37,99-103`); idempotent install keyed on the begin marker →
  `already_installed=true` (`shell.py:160-167`); trailing-newline normalization before append
  (`shell.py:171-174`). Result models `ShellShowResult{shell,script}` / `ShellInstallResult{shell,
  rc_path,already_installed}`.
- **`completion show`/`install`** (`cli/slot/completion.py`): activation line
  `eval "$(_SLOT_COMPLETE={shell}_source slot)"` (`completion.py:29-30`); separate markers
  `# >>> slot completion >>>` / `# <<< slot completion <<<` (`completion.py:17-18`); same detect/rc/
  idempotency/newline logic (`completion.py:114-149`).

**Likely incidental**

- The exact inner bytes of the rendered zsh/bash wrapper body (`shell.py:40-59`) — behavior +
  markers are contract; the script text may be idiomatically re-authored if scenario-tested (resolve
  in prework/05).
- Rich-styled install confirmation lines (`shell.py:127-136`, `completion.py:97-106`).

---

## 6. Safety guarantees (must preserve)

- `init` refuses if any managed slot already exists → `pool_already_initialized` (`pool.py:71-78`).
- `resize` shrink refuses assigned / dirty / operation-in-progress slots and reports the **full** set
  of offenders, not the first (`pool.py:151-178`).
- `checkout --current` plans availability before redirecting, refuses dirty/detached, and leaves the
  caller worktree untouched on pool-full / branch-in-use (`checkout.py:89-139`,
  `checkout_planning.plan_current_checkout:250-287`).
- `free` refuses not-assigned / operation-in-progress / dirty targets and reports partial progress on
  mid-run failure (`free.py:100-167`).
- `free --all` (PR close + branch delete) requires confirmation; in `--format json` it requires
  `-y/--yes`. `gc` requires `--force` to skip interactive confirmation.
- Clipboard and cd-directive failures are non-fatal — the `cd` command is always printed
  (`navigation.py:127`, `gateway/real_clipboard.py` graceful failure).

---

## 7. Distribution

- Current: `slot` is installed as an **editable uv tool** by `install-tools`
  (`justfile` ~line 122: `uv tool install --force --editable .../packages/asdl-slots`), unlike the
  already-shimmed siblings (`brmem`/`handoff`/`areg` use `_install-ts-shim`). The cutover replaces the
  uv tool with a `just install-slot` TypeScript source shim and removes the stale uv tool.
- No installed skill currently shells out to `slot` (grep over `.claude/skills` + `.agents/skills`
  found no `slot <cmd>` callers; the hidden `gt exec` JSON commands are skill-ready but unwired). The
  consumer-migration surface for cutover is therefore small — confirm before deletion.

---

## 8. Test surface (parity oracle)

~479 Python test functions across `tests/scenario/`, `tests/unit/`, `tests/integration/`. Highest-
value oracles to port (distilled per-area in the `prework/` TS test checklists): `test_lifecycle.py`,
`test_checkout_planning.py`, `test_release_workflows.py`, `test_inventory.py`, `test_repo_context.py`,
`test_naming.py`, `test_shell_integration.py`, `test_gt_boundary.py`, `test_gt_navigation.py`,
`test_collect_stack_branches.py`, and the per-command scenario files (`test_slot_*_cli.py`). Treat the
Python tests as the parity oracle for **model input and observable behavior**, not as a structure to
mimic; flag fixtures that pin Rich/Click rendering as incidental.
