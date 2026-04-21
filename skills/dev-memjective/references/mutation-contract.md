# Memjective Mutation Contract

Per-operation, per-section table of what each memjective skill may and may not
change. Each operation skill defers to this file rather than restating the
rules inline.

## Overview

| Operation               | Master seed           | Current-branch snapshot                                                                 | Other-branch snapshot |
| ----------------------- | --------------------- | --------------------------------------------------------------------------------------- | --------------------- |
| `dev-memjective-create` | **Writes** (one-time) | **Writes** (one-time)                                                                   | Never touches         |
| `dev-memjective-next`   | Never writes          | Never writes                                                                            | Never touches         |
| `dev-memjective-update` | Never writes          | **Writes** (preflight carry-forward, when branch is bare) + **Rewrites** (conservative) | Never touches         |

Carry-forward (copying another source verbatim onto the current branch) is
allowed for `update` as a preflight when the current branch has no snapshot.
The carry is an exact copy — never a merge or synthesis.

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

## Section-by-section rules for `dev-memjective-next`

`next` writes nothing. It may **propose** changes in its output, but they are
advisory only. If the user wants a change landed, they run `update` after the
work is complete, or edit the branch snapshot manually via `brmem put`.

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
- Having `next` write to brmem "just this once" as a convenience. Breaks the
  advisory-only contract and makes source-resolution non-deterministic.
- Carry-forward that is a partial copy or a merge. Always exact-copy.
