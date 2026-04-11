# Incremental refactor roadmap

## What it is

Items are a sequence of **small, independently-landable, risk-free changes**
that restructure existing code without changing behavior. Each item is
reviewable in isolation, leaves the tree working, and can be landed
independently. Behavior is preserved throughout.

## When to use it

- Broad refactors of existing code: extract-a-module, rename-a-concept,
  split-a-large-file, introduce-a-new-pattern-alongside-the-old, collapse
  duplication.
- The work is largely mechanical — each step is obvious and safe in isolation.
- You want reviewability and revertability more than speed of integration.

## When NOT to use it

- The work adds new behavior that spans layers — use `steelthread.md`.
- The work requires a substrate that doesn't exist yet — use `layered.md`.
- The items are truly independent and can be done in any order — use
  `parallel.md`.

## Item 1 guidance

The first item should be the **smallest safe change that unblocks the next
one**. Common starters: introduce the new structure alongside the old (no
callers migrated), add a seam/interface, move one file with no code changes,
rename one concept across the tree. Avoid making item 1 "set up the whole
refactor" — that defeats the purpose.

## Example

Objective: "Split the 1200-line `src/twerk/gateway.py` into four smaller
modules without changing behavior."

1. Introduce `src/twerk/gateway/` as a package with `__init__.py` that
   re-exports everything currently in `gateway.py`. No callers change.
2. Move the issue-related classes into `gateway/issues.py`, keeping
   re-exports from `__init__.py`. Tests pass unchanged.
3. Move the PR-related classes into `gateway/prs.py`. Re-exports unchanged.
4. Move the label-related helpers into `gateway/labels.py`. Re-exports unchanged.
5. Delete the now-empty `gateway.py` shim and update imports across the tree.
