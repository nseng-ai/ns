# Memjective Mutation Contract

Per-operation, per-file, per-section table of what each memjective skill may
and may not change. Each operation skill defers to this file rather than
restating the rules inline.

## Overview

| Operation               | Master-branch snapshot                                                             | Current-branch snapshot                                           | Other-branch snapshot |
| ----------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------- |
| `dev-memjective-create` | **Writes** `body.md` (one-time); `roadmap.md` when a slice plan is already drafted | **Writes** `body.md` (one-time); `roadmap.md` when drafted        | Never touches         |
| `dev-memjective-peek`   | Never writes                                                                       | Never writes                                                      | Never touches         |
| `dev-memjective-next`   | Never writes                                                                       | **Writes** each file present on the source (carry-forward)        | Never touches         |
| `dev-memjective-update` | Never writes                                                                       | **Rewrites** `body.md` / `roadmap.md` / `notes.md` (conservative) | Never touches         |

Carry-forward (copying the source verbatim onto the current branch) is
exclusively the job of `dev-memjective-next`, which is designed to run on a
fresh slice branch. The carry is an exact copy of every file under the
source slug — never a merge or synthesis. `dev-memjective-update` refuses
to run on a branch that has no memjective entries; it does not
carry-forward on behalf of the user.

Only `body.md` is required. A slug with only `body.md` is a valid
memjective; `roadmap.md` and `notes.md` appear when there is content for
them.

## Per-file rules for `dev-memjective-update`

`update` is the only normal-lifecycle operation that rewrites existing
branch files. The rules below keep those rewrites honest. They apply to the
current-branch snapshot only; the master-branch snapshot is never touched
during `update`.

### `body.md` — the stable spine

| Section              | Allowed                                                 | Forbidden                                             |
| -------------------- | ------------------------------------------------------- | ----------------------------------------------------- |
| Title                | Leave as-is                                             | Rename unless the user explicitly asks                |
| Status               | Update (`in progress` / `blocked` / `done`)             | Turning it into a prose progress log                  |
| Description          | Small clarifications; small factual append-only updates | Rewriting it every slice to restate roadmap progress  |
| Goals                | Small clarifications only                               | Turning Goals into a checklist or per-PR progress log |
| Completion Criteria  | Check items; add brief evidence notes                   | Delete criteria; rewrite criteria casually; renumber  |
| How to Make Progress | Edit when the actual recipe changed                     | Edit just because one roadmap item finished           |

`body.md` should be the quietest file — most normal `update` sessions touch
only `Status` and check items in `Completion Criteria`.

### `roadmap.md` — the evolving progress surface

| Allowed                                                                                                                       | Forbidden                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Check completed items; add nearby follow-ups; split items when work turned out more granular than expected; reorder if needed | Erase completed items; drop progress history; wholesale reshuffle; add manual-only or observation-only bullets (e.g., "live testing session", "manual smoke-test") |

Every `roadmap.md` bullet must be codified work that lands in a PR — code,
tests, docs, config, or a deliberate delete. Verification belongs in the
PR's test plan, not as a standalone roadmap bullet.

### `notes.md` — durable findings

| Allowed                                                         | Forbidden                            |
| --------------------------------------------------------------- | ------------------------------------ |
| Append findings, constraints, pointers; annotate obsolete notes | Silently delete notes; strip context |

`notes.md` grows over time. When a note becomes obsolete, annotate it in
place (e.g., `~~...~~ — superseded by slice 3`) instead of deleting it.

## Rules for `dev-memjective-peek`

`peek` writes nothing. It reports a status summary (title, status, optional
description/goals summary, completion-criteria progress, roadmap state,
notes presence) and suggests a kebab-case slug for the next slice, but all
output is advisory. If the user wants to act on `peek`'s suggestion, they
open a new branch with the suggested slug and run `dev-memjective-next`
inside it.

`peek` is intentionally the lightest-weight memjective operation and has no
obligation to look past the memjective documents themselves (no codebase
assessment).

## Rules for `dev-memjective-next`

`next` writes the carry-forward of the resolved source memjective onto the
current branch. For every file present under `<slug>/` on the source
(`body.md`, and any of `roadmap.md` / `notes.md`), `next` writes an exact
copy to the same key on the current branch. `next` may not edit, reshape,
or annotate any file while attaching it. Any reshaping of the documents
(checking completed items, splitting newly granular roadmap items,
appending notes, amending `How to Make Progress`) is `update`'s
responsibility after a slice lands.

`next` does not rewrite the snapshot a second time after implementation;
the post-implementation rewrite is `update`'s job. `next` also never
touches the master-branch snapshot or any other branch's snapshot.

`next` refuses to run if the current branch already has any entry under
`memjectives/<slug>/` for the target slug. The precondition exists because
`next` is the "fresh slice branch" skill; if files are already attached,
the user wants `update` (to record progress) or `peek` (to inspect).

## Rules for `dev-memjective-create`

`create` drafts `body.md` and writes it twice — as the master-branch
snapshot and as the initial per-branch snapshot. When the conversation
already contains a concrete slice plan, `create` also drafts `roadmap.md`
and writes it to both snapshots. `notes.md` is not written by `create`;
it appears the first time `update` records a durable finding.

After `create` runs, the master-branch files are treated as frozen during
the normal lifecycle. The per-branch files are the working documents from
that point forward.

`create` always writes the canonical shape per
`../templates/body-template.md` (and, when applicable,
`../templates/roadmap-template.md`).

## Anti-patterns

- Letting `update` edit `body.md`'s Completion Criteria because the plan
  drifted. If the completion criteria no longer match the work, the
  memjective has outgrown the subsystem — graduate to an `objective` or
  start a new memjective.
- Repeating roadmap progress in `body.md`'s Description.
- Using `body.md`'s Goals as a second roadmap.
- Storing progress history in the `Status:` line.
- Using `update` to rewrite the master-branch snapshot.
- Letting `next` edit any file while carrying it forward. Carry-forward is
  always an exact copy of a single source; any reshaping belongs to
  `update` after implementation lands.
- Letting ordinary `update` or `next` runs rename sections or rebuild a
  snapshot wholesale.
- Having `peek` write to brmem "just this once" as a convenience. Breaks
  the advisory-only contract.
- Running `next` on a branch that already has files for the target slug.
  The precondition exists on purpose.
- Carry-forward that copies only `body.md` and drops sibling files. Always
  carry every file under `<slug>/`.
- Adding manual-only or observation-only items to `roadmap.md`. Every
  roadmap bullet must be codified work that lands in a PR. Verification
  belongs in the PR's test plan, not as a standalone memjective bullet.
