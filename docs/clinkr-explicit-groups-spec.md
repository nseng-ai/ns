# Clinkr Explicit Group Spec

Status: draft

## Summary

This document specifies a replacement direction for clinkr group authoring on
top of the current `master` codebase.

The new direction is:

- Define every CLI group in a `group.py` module.
- Keep package `__init__.py` files empty or docstring-only.
- Register operations and nested groups explicitly in `group.py`.
- Import group-builder functions directly from entrypoints and parent groups.
- Remove package scanning, stack inspection, and decorator-based group
  discovery from clinkr once migration is complete.

This is a change in authoring model, not a change in command semantics. It is
orthogonal to other clinkr work such as `ClinkrExit` and `--format`.

## Motivation

The current group-authoring model has two properties that are poor fits for
this repo:

- Group wiring lives in `__init__.py` files, while the repo's package rules
  prefer `__init__.py` to be empty or docstring-only.
- clinkr discovers command trees through a mix of package scanning, stack
  inspection, and `@clinkr_group` metadata, which makes the exposed CLI
  surface harder to read and reason about.

For a private, agent-oriented framework, legibility is more valuable than
avoiding a few explicit imports. An agent should be able to answer "what does
this group expose?" by reading one obvious file.

## Design Goals

- No real group-building code in package `__init__.py` files.
- One obvious source file per CLI group.
- Explicit, grep-able command and subgroup wiring.
- No package scanning or stack inspection.
- Canonical imports from real source modules rather than package re-exports.
- Incremental migration from the current `master` shape.
- No behavior change to command help, args, or output solely because a group
  moved from `__init__.py` to `group.py`.

## Non-Goals

- Preserving package autodiscovery as a steady-state authoring model.
- Preserving `@clinkr_group` or `discover_group(...)` as permanent public APIs.
- Reworking operation definitions in the same migration.
- Changing command names, help text, or output contracts as part of the move.
- Re-exporting group builders from package `__init__.py`.

## Core Convention

The central rule is:

> directory = namespace, `group.py` = CLI surface

That means:

- A package may contain operation modules, helper modules, and nested group
  packages.
- The group's public CLI surface is defined only in `group.py`.
- `__init__.py` is not a control plane.

## Steady-State Layout

Example:

```text
twerk_core/
  brmem/
    __init__.py
    group.py
    check.py
    get.py
    list.py
    put.py
    branch/
      __init__.py
      group.py
      check.py
```

The corresponding authoring model is:

```python
# twerk_core/brmem/group.py
from twerk_core.brmem.branch.group import build_branch_group
from twerk_core.brmem.check import run_check_branch_memory
from twerk_core.brmem.get import run_get_branch_memory
from twerk_core.brmem.list import run_list_branch_memory
from twerk_core.brmem.put import run_put_branch_memory
from twerk_core.clinkr.group import ClinkrGroup


def build_brmem_group() -> ClinkrGroup:
    group = ClinkrGroup(
        name="brmem",
        help="Manage branch-scoped memory stored in git refs.",
        operations=[
            run_put_branch_memory,
            run_get_branch_memory,
            run_list_branch_memory,
        ],
    )
    group.add_command(build_branch_group())
    return group
```

```python
# twerk_core/brmem/main.py
import click

from twerk_core.brmem.group import build_brmem_group


def build_cli():
    group = build_brmem_group()
    group.context_settings = {"help_option_names": ["-h", "--help"]}
    click.version_option(package_name="twerk-core")(group)
    return group
```

## Builder Convention

Each `group.py` module defines one builder function with a canonical name:

- top-level group: `build_brmem_group`
- hyphenated CLI group: `build_pr_address_group`
- nested group: `build_branch_group`, `build_review_group`,
  `build_harness_group`

Rules:

- The function returns a fully configured `ClinkrGroup`.
- The function name uses Python identifiers.
- The CLI-visible name is passed explicitly to `ClinkrGroup(name="...")`.
- Consumers import the builder from the canonical `group.py` module.

Examples:

- `from twerk_core.brmem.group import build_brmem_group`
- `from twerk_pr_address.cli.pr_address.group import build_pr_address_group`
- `from twerk_reviewer.cli.reviewer.review.group import build_review_group`

## Group Construction Rules

Within `group.py`, all wiring is explicit.

Allowed:

- `ClinkrGroup(name=..., help=..., operations=[...])`
- helper-based registration such as `add_check_operation(...)`
- helper-based registration such as `add_format_operation(...)`
- `group.add_command(build_child_group())`
- assigning callbacks or other normal Click configuration directly

Disallowed in the steady state:

- `ClinkrGroup.discover_subcommands()`
- `discover_operations(...)`
- `discover_group(...)`
- `@clinkr_group`
- package scanning as an implicit source of commands

This spec intentionally does not force one operation-registration style. A
group may continue to use `operations=[...]`, `add_check_operation(...)`,
`add_format_operation(...)`, or a mix, depending on the other clinkr work in
flight. This migration only governs where group wiring lives and how it is
discovered.

## Nested Groups

Nested groups follow the same rule recursively.

For example, `twerk_reviewer.cli.reviewer.group` should import:

- `build_review_group` from `twerk_reviewer.cli.reviewer.review.group`
- `build_harness_group` from `twerk_reviewer.cli.reviewer.harness.group`

and wire them explicitly with `outer.add_command(...)`.

Leaf groups such as `review` and `harness` own their own operation lists in
their own `group.py` files.

## Entry Points

Standalone CLI entrypoints should import the group builder directly.

Preferred:

```python
from twerk_reviewer.cli.reviewer.group import build_reviewer_group
```

Not preferred:

```python
group = discover_group("twerk_reviewer.cli.reviewer")
```

Direct imports are better because they:

- use canonical source-module imports
- remove stringly-typed module paths
- make refactors easier for editors and static tooling
- keep failures loud and local

## Framework API After Migration

At the end of the migration, clinkr should keep the primitives that still
matter:

- `ClinkrGroup`
- operation registration helpers
- operation decorators and request/result plumbing

The following APIs should be removed:

- `ClinkrGroup.discover_subcommands()`
- `discover_operations(...)`
- `discover_group(...)`
- `@clinkr_group`
- `ClinkrGroupMeta` / `get_group_meta(...)`

The `twerk_core.clinkr.__init__.py` re-exports should also be removed so the
package follows the repo rule that `__init__.py` is not a public re-export
surface.

## Migration Strategy

This migration can be done incrementally.

### Phase 1: Add explicit group modules

For each existing CLI group package:

1. Create `group.py`.
2. Move the current group-building code out of `__init__.py` into
   `group.py`.
3. Replace discovery with explicit imports of operations and nested groups.
4. Reduce `__init__.py` to a docstring or empty file.

### Phase 2: Cut consumers over

Update:

- standalone `main.py` entrypoints
- parent group builders
- any tests importing discovery helpers

to import builder functions from `group.py` directly.

### Phase 3: Delete discovery APIs

Once no production call sites remain:

- remove the discovery APIs from `twerk_core.clinkr.group`
- remove related tests
- rewrite the clinkr README
- clean up `twerk_core.clinkr.__init__.py`

## Expected Benefits

- One file gives the complete group surface.
- Group composition becomes ordinary Python rather than framework magic.
- The repo's import rules and CLI-authoring rules stop fighting each other.
- Static search for `build_*_group` shows the command tree directly.
- Adding a nested group remains straightforward without relying on directory
  scanning.

## Tradeoffs

- Explicit import lists are more verbose than package scanning.
- Large groups such as `pr-address` will have longer `group.py` files and may
  see more merge conflicts.
- The framework loses some "drop a file into a package and it appears"
  convenience.

These tradeoffs are acceptable here because clarity is the primary goal and
the CLI surface is authored by humans and agents working inside the repo.

## Decision

Adopt explicit `group.py` builders as the clinkr group-authoring model and
migrate away from package autodiscovery.
