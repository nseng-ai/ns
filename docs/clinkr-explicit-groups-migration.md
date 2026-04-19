# Clinkr Explicit Group Migration

Status: in progress

Tracks the migration from the current `master` clinkr group-authoring model to
explicit `group.py` builders. See
[`docs/clinkr-explicit-groups-spec.md`](./clinkr-explicit-groups-spec.md) for
the target architecture.

This migration is independent from the `ClinkrExit` / `--format` work. A group
can be migrated to `group.py` without changing its operation semantics.

## Naming Decision

Use `group.py` inside each group package.

Examples:

- `twerk_core/brmem/group.py`
- `twerk_core/brmem/branch/group.py`
- `twerk_reviewer/cli/reviewer/group.py`
- `twerk_reviewer/cli/reviewer/review/group.py`

We are explicitly not using `<group_name>.py` for group assembly.

Rationale:

- A sibling file and package with the same name cannot coexist, so shapes like
  `cli/reviewer.py` alongside `cli/reviewer/` are not viable.
- A repeated in-package module name such as `brmem/brmem.py` or
  `review/review.py` is legal but produces awkward canonical imports like
  `twerk_core.brmem.brmem` and
  `twerk_reviewer.cli.reviewer.review.review`.
- `group.py` gives one stable, grep-able location for CLI assembly without
  colliding with operation modules or nested group packages.
- The convention scales cleanly from top-level groups to nested groups.

## What "migrated" means

A group is considered migrated when all of the following hold:

1. The package has a `group.py` module with a canonical `build_*_group()`
   function that returns the full `ClinkrGroup`.
2. The package `__init__.py` is empty or docstring-only.
3. `group.py` imports its operations and nested groups explicitly; it does not
   use `ClinkrGroup.discover_subcommands()`, `discover_operations(...)`, or
   `discover_group(...)`.
4. All consumers import the builder directly from the canonical `group.py`
   module rather than relying on autodiscovery.
5. Help text, command names, and behavior remain unchanged apart from any
   intentional ordering cleanup.

The framework migration is complete when, in addition:

6. `twerk_core.clinkr.group` no longer contains the autodiscovery APIs.
7. `twerk_core.clinkr.__init__.py` no longer re-exports clinkr symbols.
8. The clinkr README and unit tests describe and verify the explicit
   `group.py` model instead of the autodiscovery model.

## Migration Units

The current `master` surface consists of:

- 8 group packages that need explicit `group.py` builders
- 5 standalone CLI entrypoints that should import builders directly
- 1 framework module (`twerk_core.clinkr.group`) that still contains
  autodiscovery APIs

## Status Checklist

This checklist is ordered by likely PR sequence. It is meant to be read from
top to bottom as landable work, not grouped by subsystem ownership.

Some early PRs intentionally update the current parent group's `__init__.py`
to import a leaf builder from `group.py`. That transitional wiring keeps the
tree working until the parent group itself is migrated in a later PR.

### PR 0 — Planning Docs

- [x] Add replacement spec and migration tracker docs

### PR 1 — `twerk-core` `brmem branch`

- [x] Create `packages/twerk-core/src/twerk_core/brmem/branch/group.py`
- [x] Reduce `packages/twerk-core/src/twerk_core/brmem/branch/__init__.py` to
      a docstring or empty file
- [x] Update current `packages/twerk-core/src/twerk_core/brmem/__init__.py`
      to import `build_branch_group` from `twerk_core.brmem.branch.group`

### PR 2 — `twerk-core` `brmem`

- [x] Create `packages/twerk-core/src/twerk_core/brmem/group.py`
- [x] Reduce `packages/twerk-core/src/twerk_core/brmem/__init__.py` to a
      docstring or empty file
- [x] Update `packages/twerk-core/src/twerk_core/brmem/main.py` to import
      `build_brmem_group`

### PR 3 — `twerk-objectives` `objective`

- [x] Create
      `packages/twerk-objectives/src/twerk_objectives/cli/objective/group.py`
- [x] Reduce
      `packages/twerk-objectives/src/twerk_objectives/cli/objective/__init__.py`
      to a docstring or empty file
- [x] Update `packages/twerk-objectives/src/twerk_objectives/cli/main.py` to
      import `build_objective_group`

### PR 4 — `twerk-slots` `slot` and `twerk-reviewer` `review`, `harness`, `reviewer`

These four packages are small enough that they land as a single PR. Within
the PR, `build_review_group` and `build_harness_group` must be defined
before the top-level `reviewer` group imports them.

Plugin entry-point note: PR 4 bumps the `twerk.plugins` entry-point format
for `slots` and `reviewer` to `module:function` (pointing directly at the
builder). `src/twerk/cli/plugins.py` now accepts both the new
`module:function` form and the legacy bare module-path form, so
`objectives` and `pr_address` keep working unchanged and PR 5 will bump
`pr_address` the same way.

`twerk-slots` `slot`:

- [x] Create `packages/twerk-slots/src/twerk_slots/cli/slot/group.py`
- [x] Reduce `packages/twerk-slots/src/twerk_slots/cli/slot/__init__.py` to a
      docstring or empty file
- [x] Update `packages/twerk-slots/src/twerk_slots/cli/main.py` to import
      `build_slot_group`

`twerk-reviewer` `review`:

- [x] Create
      `packages/twerk-reviewer/src/twerk_reviewer/cli/reviewer/review/group.py`
- [x] Reduce
      `packages/twerk-reviewer/src/twerk_reviewer/cli/reviewer/review/__init__.py`
      to a docstring or empty file
- [x] Register `review` operations explicitly in `review/group.py`

`twerk-reviewer` `harness`:

- [x] Create
      `packages/twerk-reviewer/src/twerk_reviewer/cli/reviewer/harness/group.py`
- [x] Reduce
      `packages/twerk-reviewer/src/twerk_reviewer/cli/reviewer/harness/__init__.py`
      to a docstring or empty file
- [x] Register `harness` operations explicitly in `harness/group.py`

`twerk-reviewer` `reviewer` (top-level):

- [x] Create
      `packages/twerk-reviewer/src/twerk_reviewer/cli/reviewer/group.py`
      that imports `build_review_group` and `build_harness_group` directly
      and preserves the existing `_populate_ctx_obj` callback
- [x] Reduce
      `packages/twerk-reviewer/src/twerk_reviewer/cli/reviewer/__init__.py`
      to a docstring or empty file
- [x] Update `packages/twerk-reviewer/src/twerk_reviewer/cli/main.py` to
      import `build_reviewer_group`

### PR 5 — `twerk-pr-address` `pr-address`

- [ ] Create
      `packages/twerk-pr-address/src/twerk_pr_address/cli/pr_address/group.py`
- [ ] Reduce
      `packages/twerk-pr-address/src/twerk_pr_address/cli/pr_address/__init__.py`
      to a docstring or empty file
- [ ] Register the `exec` subgroup explicitly in `pr_address/group.py`
- [ ] Register all `pr-address` operations explicitly in `pr_address/group.py`
- [ ] Update `packages/twerk-pr-address/src/twerk_pr_address/cli/main.py` to
      import `build_pr_address_group`

### PR 6 — Framework and Shared Cleanup

- [ ] Rewrite `packages/twerk-core/src/twerk_core/clinkr/README.md` for the
      `group.py` model
- [ ] Remove `ClinkrGroup.discover_subcommands()`
- [ ] Remove `discover_operations(...)`
- [ ] Remove `discover_group(...)`
- [ ] Remove `@clinkr_group`, `ClinkrGroupMeta`, and `get_group_meta(...)`
- [ ] Remove autodiscovery-focused unit tests
- [ ] Reduce `packages/twerk-core/src/twerk_core/clinkr/__init__.py` to a
      docstring or empty file

## Planning a Single-Group Migration

Before writing code, answer these questions:

### 1. What is the current surface?

- Which operations are currently exposed by the package?
- Which nested groups does it mount?
- Does it use `discover_subcommands()`, `discover_group(...)`, or only
  `ClinkrGroup(operations=[...])`?

### 2. What will the builder be called?

Choose a canonical builder name:

- `build_brmem_group`
- `build_pr_address_group`
- `build_review_group`

The function should live in `group.py` and be the only intended import target
for group assembly.

### 3. What imports move into `group.py`?

List:

- all operation functions
- all registration helpers
- all nested group builders
- any callbacks or context helpers currently living in `__init__.py`

The point of the migration is that the import list itself becomes the visible
command inventory.

### 4. Which consumers need to change?

Check:

- the package's standalone `main.py`
- parent `group.py` modules
- tests that import discovery helpers or old package modules directly

### 5. What gets deleted afterward?

For a migrated group, the old `__init__.py` logic should be removed entirely.
Do not leave behind compatibility wrappers or re-exports.

## Deliverables for a Migration PR

Each migration PR should contain:

1. A new `group.py` file for the migrated package
2. A reduced `__init__.py` with only a docstring or nothing
3. Consumer updates to import `build_*_group()` directly
4. Any necessary test updates
5. A checked box in the status checklist above

The migration is structural. Avoid mixing in unrelated command-behavior
changes unless they are required to preserve the existing CLI surface.
