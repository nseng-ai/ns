# Memjective Mutation Contract

Per-operation, per-section table of what each memjective skill may and may not
change. Each operation skill defers to this file rather than restating the
rules inline.

## Overview

| Operation               | Master seed           | Current-branch snapshot          | Other-branch snapshot |
| ----------------------- | --------------------- | -------------------------------- | --------------------- |
| `dev-memjective-create` | **Writes** (one-time) | **Writes** (one-time)            | Never touches         |
| `dev-memjective-peek`   | Never writes          | Never writes                     | Never touches         |
| `dev-memjective-next`   | Never writes          | **Writes** (carry-forward, once) | Never touches         |
| `dev-memjective-update` | Never writes          | **Rewrites** (conservative)      | Never touches         |

Carry-forward (copying another source verbatim onto the current branch) is
the explicit job of `dev-memjective-next`, which is designed to run on a
fresh slice branch. `dev-memjective-update`'s preflight carry-forward remains
as a belt-and-suspenders safety net for users who skip `next` and land work
directly on a bare branch. In both cases the carry is an exact copy — never
a merge or synthesis.

## Section-by-section rules for `dev-memjective-update`

`update` is the only operation that rewrites an existing branch snapshot. The
rules below keep those rewrites honest. They apply to the current-branch
snapshot only; the master seed is never touched during `update`.

| Section              | Allowed                                                                                                                     | Forbidden                                                         |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Title                | Leave as-is                                                                                                                 | Rename unless the user explicitly asks                            |
| Status               | Update (`in progress` / `blocked` / `done`)                                                                                 | —                                                                 |
| Intro                | Clarify, append small updates                                                                                               | Replace wholesale; rewrite the origin story                       |
| Completion Criteria  | Check items; add brief evidence notes                                                                                       | Delete criteria; rewrite criteria casually; renumber              |
| Status Checklist     | Check completed items; add follow-ups near the affected slice; split items when work turned out more granular than expected | Erase completed items; drop progress history; wholesale reshuffle |
| How to Make Progress | Edit when the actual recipe changed                                                                                         | Edit just because one checklist item finished                     |
| Notes                | Append findings, constraints, pointers; annotate obsolete notes                                                             | Silently delete notes; strip context                              |

## Section-by-section rules for `dev-memjective-peek`

`peek` writes nothing. It reports a status summary (title, status,
completion-criteria progress, checklist state) and suggests a kebab-case
slug for the next slice, but all output is advisory. If the user wants to
act on `peek`'s suggestion, they open a new branch with the suggested slug
and run `dev-memjective-next` inside it.

`peek` is the same advisory-only contract that `next` used to hold; it is
intentionally the lightest-weight memjective operation and has no obligation
to look past the memjective document itself (no codebase assessment).

## Section-by-section rules for `dev-memjective-next`

`next` writes exactly one brmem entry: the carry-forward of the resolved
source memjective onto the current branch, under namespace `memjectives`,
key `<slug>.md`. The carry-forward is strictly an **exact copy** — `next`
may not edit, reshape, or annotate the text while attaching it. Any
reshaping of the document (checking completed items, splitting newly
granular checklist items, appending Notes, amending `How to Make Progress`)
is `update`'s responsibility after a slice lands.

`next` does not rewrite the snapshot a second time after implementation;
the post-implementation rewrite is `update`'s job. `next` also never
touches the master seed or any other branch's snapshot.

`next` refuses to run if the current branch already has a `memjectives/*`
entry. The precondition exists because `next` is the "fresh slice branch"
skill; if a snapshot is already attached, the user wants `update` (to
record progress) or `peek` (to inspect).

## Section-by-section rules for `dev-memjective-create`

`create` writes the full document twice (master seed + branch snapshot). It
is responsible for drafting every section per the template at
`../templates/memjective-template.md`.

After `create` runs, the master seed is effectively frozen for the lifetime
of the prototype. The branch snapshot is the working document from that point
forward.

## Anti-patterns

- Letting `update` edit Completion Criteria because the plan drifted. If the
  completion criteria no longer match the work, the memjective has outgrown
  the prototype — graduate to an `objective` or start a new memjective.
- Using `update` to rewrite the master seed. Not allowed in v0.
- Letting `next` edit the memjective text while carrying it forward.
  Carry-forward is always an exact copy of a single source; any reshaping
  belongs to `update` after implementation lands.
- Having `peek` write to brmem "just this once" as a convenience. Breaks
  the advisory-only contract.
- Running `next` on a branch that already has a memjective snapshot. The
  precondition exists on purpose.
- Carry-forward that is a partial copy or a merge. Always exact-copy.
