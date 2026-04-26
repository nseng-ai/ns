# Memjective Mutation Contract

Per-operation, per-file, per-section table of what each memjective skill may
and may not change. Each operation skill defers to this file rather than
restating the rules inline.

## Overview

| Operation                  | Master-branch snapshot                             | Current-branch snapshot                                           | Other-branch snapshot |
| -------------------------- | -------------------------------------------------- | ----------------------------------------------------------------- | --------------------- |
| `dev-memjective-create`    | **Writes** `body.md` (+ `roadmap.md` when drafted) | Never                                                             | Never                 |
| `dev-memjective-next`      | Never                                              | Never                                                             | Never                 |
| `dev-memjective-claim`     | Never                                              | **Writes** carry-forward to target (verbatim copy)                | Never                 |
| `dev-memjective-update`    | Never (aborts if invoked on master)                | **Rewrites** `body.md` / `roadmap.md` / `notes.md` (conservative) | Never                 |
| `dev-memjective-reconcile` | **Rewrites** `body.md` / `roadmap.md` / `notes.md` | Never (aborts if invoked off master)                              | Never                 |

Carry-forward (copying the source verbatim onto a target branch) is
exclusively the job of `dev-memjective-claim`. The carry is an exact copy
of every file under the source slug — never a merge or synthesis.
`dev-memjective-update` refuses to run on a branch that has no entries
for the requested slug; it does not carry-forward on behalf of the user.

Only `body.md` is required. A slug with only `body.md` is a valid
memjective; `roadmap.md` and `notes.md` appear when there is content for
them.

## Per-file rules for `dev-memjective-update`

`update` is the slice-branch normal-lifecycle operation that rewrites the
current-branch snapshot. It is grounded by **the branch's own commit log**
since the snapshot's `head_date` — what landed on this branch becomes the
evidence for what to check off, append to notes, or move in status.

`update` aborts when run on master. The master-snapshot rewrite path is
`dev-memjective-reconcile` (see "Rules for `dev-memjective-reconcile`"
below).

`update` is a **no-op when the snapshot is already in sync with branch
HEAD** — when no file under `<slug>/` has a `head_date` older than HEAD's
commit time, `update` reports "in sync" and exits without writing.

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

## Rules for `dev-memjective-reconcile`

`dev-memjective-reconcile` is the master-snapshot rewrite path. It runs
**only on master** (aborts otherwise) and is grounded by **sibling-branch
snapshots** — other refs under `refs/brmem/ns/memjectives/*` carrying the
same slug, including orphaned refs whose branches have been deleted.

The rewrite obeys the same per-file mutation contract as `update` (see
above). Only the evidence source differs: instead of the branch's own
commits, `reconcile` reads sibling `body.md` / `roadmap.md` / `notes.md`
and folds them into a conservative rewrite of master.

Invariants:

- **Sibling snapshots are read-only evidence.** The reconcile reads
  sibling files to ground its rewrite; it never writes back to any
  sibling ref.
- **Rewrite obeys the per-file mutation contract.** Sibling evidence
  informs _which_ roadmap items to check, _what_ durable findings to
  append to `notes.md`, and _whether_ a completion criterion in
  `body.md` has landed — it does not unlock wholesale regeneration.
- **Enumeration is in-repo only.** `git for-each-ref
  refs/brmem/ns/memjectives/` + local `brmem` reads. No `gh`, no
  `git fetch`, no network dependency.
- **Orphaned refs are valid but labeled.** A ref whose branch is
  deleted still holds a readable snapshot. Treat its content as
  evidence; label it `orphaned-ref` in the report; prefer corroboration
  from a live sibling or a merged PR on master before acting on its
  signal alone.
- **Verbatim copy is forbidden.** Carry-forward (exact-copy,
  single-source) is `dev-memjective-claim`'s job; the reconcile fuses
  evidence across siblings into a conservative rewrite, never a copy.
- **No freshness check.** `reconcile` always does the work — sibling
  snapshot changes do not bump master's HEAD, so the no-op-when-in-sync
  short-circuit that `update` uses does not apply here.

See `../../dev-memjective-reconcile/SKILL.md` for the full algorithm.

## Rules for `dev-memjective-next`

`next` writes nothing. It reports a status summary (title, status, optional
description/goals summary, completion-criteria progress, roadmap state,
notes presence) and suggests a kebab-case slug for the next slice. It
also flags **staleness** — when the resolved source is a non-master
snapshot whose max `head_date` (across present files) is older than the
source branch's HEAD commit time, `next` prints an advisory pointing the
user at `dev-memjective-update` for that branch.

`next` requires the memjective slug as an explicit positional argument.
It does not auto-pick when only one slug is present on the source — the
slug is always explicit.

`next` is intentionally the lightest-weight memjective operation and has
no obligation to look past the memjective documents themselves (no
codebase assessment, no git diff inspection beyond the staleness check).

## Rules for `dev-memjective-claim`

`claim` is the carry-forward primitive. It writes an exact copy of every
file under `<slug>/` from a resolved source onto a target branch. It
never edits, reshapes, or annotates any file while attaching it. Any
reshaping of the documents (checking completed items, splitting newly
granular roadmap items, appending notes, amending `How to Make Progress`)
is `update`'s responsibility after a slice lands.

`claim` requires the memjective slug as an explicit positional argument.
The target branch defaults to the current branch and may be overridden
with `--target <branch>`.

Source resolution:

1. If `--from-file <path>` is given, the file is treated as the `body.md`
   source for a single `brmem put` (mutually exclusive with `--from`).
2. If `--from <branch>` is given, that branch is used directly. The source
   must have at least `<slug>/body.md`.
3. Otherwise: the nearest ancestor branch carrying `<slug>/`, then master.

Carry-forward is **verbatim**:

- Every file present under `<slug>/` on the source is copied to the same
  key on the target.
- A single atomic `brmem copy --namespace memjectives --from-branch <source>
  --to-branch <target> --key-glob '<slug>/*'` is preferred when both source
  and target are branches.
- For `--from-file`, a single `brmem put <slug>/body.md` is performed;
  `roadmap.md` / `notes.md` are not synthesized.

`claim` aborts if the target branch already carries any entry under
`<slug>/`. To advance an attached memjective, use `update` (slice branch)
or `reconcile` (master).

`claim` writes only to the target branch. It never writes to master and
never writes to other branches.

## Rules for `dev-memjective-create`

`create` drafts `body.md` and writes it once, to the **master-branch
snapshot only**. When the conversation already contains a concrete slice
plan, `create` also drafts `roadmap.md` and writes it to the master-branch
snapshot. `notes.md` is not written by `create`; it appears the first time
`update` or `reconcile` records a durable finding.

`create` does **not** attach the memjective to the current working
branch. Users run `dev-memjective-claim <slug>` to attach the snapshot
to whatever branch they are working on (current or otherwise).

After `create` runs, the master-branch files are stable during normal
slice work. The only normal-lifecycle path that rewrites them is
`dev-memjective-reconcile`.

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
- **Running `update` on master.** Master-snapshot rewrites go through
  `dev-memjective-reconcile`, which gathers sibling evidence. `update`
  on master aborts on purpose.
- **Running `reconcile` on a slice branch.** `reconcile` is master-only;
  use `update` to record progress on a slice branch.
- **Using `next` to attach a snapshot.** `next` is read-only — it writes
  nothing. To attach, run `dev-memjective-claim`.
- Copying a sibling snapshot verbatim onto master during reconcile.
  Verbatim copy is the carry-forward primitive (`claim`'s job). Sibling
  text is evidence, not source.
- Letting `claim` edit any file while carrying it forward. Carry-forward
  is always an exact copy of a single source; any reshaping belongs to
  `update` after implementation lands.
- Letting ordinary `update` or `reconcile` runs rename sections or rebuild
  a snapshot wholesale.
- Having `next` write to brmem "just this once" as a convenience. Breaks
  the read-only contract.
- Running `claim` on a branch that already has files for the target slug.
  The precondition exists on purpose — use `update` (slice) or
  `reconcile` (master) to advance an attached memjective.
- Carry-forward that copies only `body.md` and drops sibling files. Always
  carry every file under `<slug>/`.
- Adding manual-only or observation-only items to `roadmap.md`. Every
  roadmap bullet must be codified work that lands in a PR. Verification
  belongs in the PR's test plan, not as a standalone memjective bullet.
- Aborting because a branch has more than one memjective slug. Many-to-many
  is allowed; operations always target one explicit slug. Older guards
  that aborted on multi-slug branches have been removed.
