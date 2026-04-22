# Memjective Mutation Contract

Per-operation, per-section table of what each memjective skill may and may not
change. Each operation skill defers to this file rather than restating the
rules inline.

## Overview

| Operation               | Master-branch snapshot | Current-branch snapshot          | Other-branch snapshot |
| ----------------------- | ---------------------- | -------------------------------- | --------------------- |
| `dev-memjective-create` | **Writes** (one-time)  | **Writes** (one-time)            | Never touches         |
| `dev-memjective-peek`   | Never writes           | Never writes                     | Never touches         |
| `dev-memjective-next`   | Never writes           | **Writes** (carry-forward, once) | Never touches         |
| `dev-memjective-update` | Never writes           | **Rewrites** (conservative)      | Never touches         |

Carry-forward (copying another source verbatim onto the current branch) is
the explicit job of `dev-memjective-next`, which is designed to run on a
fresh slice branch. `dev-memjective-update`'s preflight carry-forward remains
as a belt-and-suspenders safety net for users who skip `next` and land work
directly on a bare branch. In both cases the carry is an exact copy — never
a merge or synthesis.

## Section-by-section rules for `dev-memjective-update`

`update` is the only normal-lifecycle operation that rewrites an existing
branch snapshot. The rules below keep those rewrites honest. They apply to the
current-branch snapshot only; the master-branch snapshot is never touched
during `update`.

| Section              | Allowed                                                                                                                       | Forbidden                                                                                                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Title                | Leave as-is                                                                                                                   | Rename unless the user explicitly asks                                                                                                                             |
| Status               | Update (`in progress` / `blocked` / `done`)                                                                                   | Turning it into a prose progress log                                                                                                                               |
| Description          | Small clarifications; small factual append-only updates                                                                       | Rewriting it every slice to restate roadmap progress                                                                                                               |
| Goals                | Small clarifications only                                                                                                     | Turning Goals into a checklist or per-PR progress log                                                                                                              |
| Completion Criteria  | Check items; add brief evidence notes                                                                                         | Delete criteria; rewrite criteria casually; renumber                                                                                                               |
| Roadmap              | Check completed items; add nearby follow-ups; split items when work turned out more granular than expected; reorder if needed | Erase completed items; drop progress history; wholesale reshuffle; add manual-only or observation-only bullets (e.g., "live testing session", "manual smoke-test") |
| How to Make Progress | Edit when the actual recipe changed                                                                                           | Edit just because one roadmap item finished                                                                                                                        |
| Notes                | Append findings, constraints, pointers; annotate obsolete notes                                                               | Silently delete notes; strip context                                                                                                                               |

## Section-by-section rules for `dev-memjective-peek`

`peek` writes nothing. It reports a status summary (title, status, optional
description/goals summary, completion-criteria progress, roadmap state) and
suggests a kebab-case slug for the next slice, but all output is advisory. If
the user wants to act on `peek`'s suggestion, they open a new branch with the
suggested slug and run `dev-memjective-next` inside it.

`peek` is intentionally the lightest-weight memjective operation and has no
obligation to look past the memjective document itself (no codebase
assessment).

## Section-by-section rules for `dev-memjective-next`

`next` writes exactly one brmem entry: the carry-forward of the resolved
source memjective onto the current branch, under namespace `memjectives`,
key `<slug>/body.md`. The carry-forward is strictly an **exact copy** — `next`
may not edit, reshape, or annotate the text while attaching it. Any
reshaping of the document (checking completed items, splitting newly
granular roadmap items, appending Notes, amending `How to Make Progress`) is
`update`'s responsibility after a slice lands.

`next` does not rewrite the snapshot a second time after implementation;
the post-implementation rewrite is `update`'s job. `next` also never
touches the master-branch snapshot or any other branch's snapshot.

`next` refuses to run if the current branch already has a `memjectives/*`
entry. The precondition exists because `next` is the "fresh slice branch"
skill; if a snapshot is already attached, the user wants `update` (to
record progress) or `peek` (to inspect).

## Section-by-section rules for `dev-memjective-create`

`create` writes the full document twice (master-branch snapshot + initial
per-branch snapshot). It is responsible for drafting every section per the
template at `../templates/memjective-template.md`.

After `create` runs, the master-branch snapshot is treated as frozen during
the normal lifecycle. The per-branch snapshot is the working document from
that point forward.

`create` always writes the canonical `Description / Goals / Completion
Criteria / Roadmap / How to Make Progress / Notes` shape.

## Anti-patterns

- Letting `update` edit Completion Criteria because the plan drifted. If the
  completion criteria no longer match the work, the memjective has outgrown
  the subsystem — graduate to an `objective` or start a new memjective.
- Repeating roadmap progress in `Description`.
- Using `Goals` as a second roadmap.
- Storing progress history in the `Status:` line.
- Using `update` to rewrite the master-branch snapshot.
- Letting `next` edit the memjective text while carrying it forward.
  Carry-forward is always an exact copy of a single source; any reshaping
  belongs to `update` after implementation lands.
- Letting ordinary `update` or `next` runs rename sections or rebuild a
  snapshot wholesale.
- Having `peek` write to brmem "just this once" as a convenience. Breaks
  the advisory-only contract.
- Running `next` on a branch that already has a memjective snapshot. The
  precondition exists on purpose.
- Carry-forward that is a partial copy or a merge. Always exact-copy.
- Adding manual-only or observation-only items to the Roadmap. Every roadmap
  bullet must be codified work that lands in a PR. Verification belongs in
  the PR's test plan, not as a standalone memjective bullet.
