---
name: dev-memjective-update
description: Command
allowed-tools:
  - "Bash(git rev-parse *)"
  - "Bash(git log *)"
  - "Bash(brmem check *)"
  - "Bash(brmem get *)"
  - "Bash(brmem list *)"
  - "Bash(brmem put *)"
  - "Read"
  - "Write"
metadata:
  internal: true
---

<!-- INTERNAL SKILL: twerk-only. Local-first memjective subsystem on top of brmem. -->

# dev-memjective-update

Rewrite the current slice branch's memjective snapshot after a slice of
work lands.

> For shared concepts — vocabulary (`snapshot`, `master-branch snapshot`,
> `per-branch snapshot`), the storage model, the document anatomy, the
> lifecycle, and the per-operation mutation contract — see
> `../dev-memjective/SKILL.md` and
> `../dev-memjective/references/mutation-contract.md`. This skill does not
> redefine those concepts; it documents the workflow that implements
> `update`'s row of the mutation contract.

## Goal

On a slice branch carrying `<slug>/`, load every file under that slug,
update each file conservatively to reflect what landed in the slice's
commits, write any changed file back to brmem, and report old/new commit
SHAs so prior snapshots are recoverable.

This skill does **not** choose the next slice and does **not** implement
anything. `dev-memjective-next` handles read-only inspection + slug
recommendation, and `dev-memjective-claim` handles carry-forward onto a
fresh slice branch.

## Arguments

`update` requires the **memjective slug** as an explicit positional
argument, parsed from the invoking prompt (e.g., _"run dev-memjective-update
for `widget-rewrite`"_). The slug is always explicit — many-to-many is
allowed in the storage model, so a single branch can carry multiple
distinct slugs, and `update` does not auto-pick.

If the invoking prompt does not contain a slug, abort and ask the user
which memjective to update.

## Core rules

- **Slice branches only.** `update` aborts on master with a pointer to
  `dev-memjective-reconcile`. Master-snapshot rewrites use sibling
  evidence and live in a separate skill.
- **Conservative in-place edits.** Follow the per-file mutation contract
  in `../dev-memjective/references/mutation-contract.md`. Do not
  regenerate any file from scratch.
- **No-op when in sync.** If the snapshot's max `head_date` across
  present files for `<slug>` is at-or-after branch HEAD's commit time,
  `update` reports "in sync" and exits without writing.
- **Preserve history.** brmem keeps prior snapshots by commit; report
  the old SHA for every file you rewrite so the user can recover it.

See `../dev-memjective/references/mutation-contract.md`
("Per-file rules for `dev-memjective-update`") for the per-file contract
this workflow obeys.

## Workflow

### 1. Pre-flight: confirm repo + current branch

```bash
git rev-parse --show-toplevel
git rev-parse --abbrev-ref HEAD
```

Call the branch `<branch>`.

Abort if:

- not in a git repo,
- the current branch is detached (`HEAD`),
- the invoking prompt did not name a memjective slug (see **Arguments**).

### 2. Pre-flight: abort if on master

If `<branch>` is `master`, abort with exit code 1 and print:

> `dev-memjective-update` runs on slice branches only. Use
> `dev-memjective-reconcile <slug>` to update master against sibling
> evidence.

Master-snapshot rewrites are grounded by sibling-branch evidence and
live in a separate skill. Do not proceed past this guard on master.

### 3. Confirm the slug is attached to the current branch

```bash
brmem list --namespace memjectives
```

`--branch` is omitted so the current branch is used implicitly. Confirm
that at least one returned key starts with `<slug>/`. If not, abort and
direct the user to run `dev-memjective-claim <slug>` on this branch
first to attach the snapshot.

Other slugs on the same branch are fine and ignored — many-to-many is
allowed in the storage model. `update` operates on the explicit slug
only.

Note which files exist under `<slug>/` (always `body.md`; optionally
`roadmap.md` and/or `notes.md`).

### 4. No-op when the snapshot is already in sync with HEAD

For each file under `<slug>/` present on the branch, fetch its commit
metadata:

```bash
brmem check <slug>/body.md --namespace memjectives --format json
brmem check <slug>/roadmap.md --namespace memjectives --format json   # if present
brmem check <slug>/notes.md --namespace memjectives --format json     # if present
```

Extract `.data.head_date` from each result. Take the **maximum**
`head_date` across the present files — call it `<snapshot-head-date>`.

Read branch HEAD's commit time:

```bash
git log -1 --format=%cI HEAD
```

Call this `<branch-head-date>`. Compare via ISO 8601 lexicographic
sort. If `<snapshot-head-date>` is at-or-after `<branch-head-date>`,
print:

> memjective `<slug>` is in sync with HEAD on `<branch>` — no update
> needed

and exit 0. Do not load the files, do not rewrite, do not write back.

Otherwise, the snapshot is behind HEAD; continue.

### 5. Capture the prior file commits

Before rewriting, capture the current commit of each existing file for
the report:

```bash
brmem check <slug>/body.md --namespace memjectives
brmem check <slug>/roadmap.md --namespace memjectives   # if present
brmem check <slug>/notes.md --namespace memjectives     # if present
```

### 6. Load the active files

```bash
brmem get <slug>/body.md --namespace memjectives > /tmp/<slug>-body.md
brmem get <slug>/roadmap.md --namespace memjectives > /tmp/<slug>-roadmap.md  # if present
brmem get <slug>/notes.md --namespace memjectives > /tmp/<slug>-notes.md      # if present
```

Interpret the files per the spec skill's **Document anatomy**:

- `body.md` — Title, Status, Description, Goals, Completion Criteria, How
  to Make Progress.
- `roadmap.md` — ordered PR-sized slices.
- `notes.md` — durable findings.

If any file is badly malformed, consult the corresponding template under
`../dev-memjective/templates/` for intended shape, but preserve the
existing content rather than regenerating it.

### 7. Rewrite conservatively, per file

Apply the per-file mutation contract in
`../dev-memjective/references/mutation-contract.md`. In practice, keep
each rewrite narrow.

**`body.md`** — the stable spine; touch sparingly:

- Preserve the title unless the user explicitly asked to rename it.
- Update `Status` if the branch state changed.
- Mark completed `Completion Criteria` items and keep them visible.
- Update `Description` or `Goals` only for small clarifications.
- Update `How to Make Progress` only when the actual recipe changed.

**`roadmap.md`** — where most of the motion happens:

- Check completed items; keep completed items visible.
- Add only nearby follow-up items when the work split more finely than
  expected.
- Reorder items when the remaining slice order materially changed.
- Never add manual-only or observation-only bullets (e.g., "live testing
  session", "manual smoke-test").

**`notes.md`** — append-only with obsolete annotations:

- Append durable findings, constraints, pointers.
- Annotate obsolete notes in place (e.g.,
  `~~…~~ — superseded by slice 3`) rather than deleting them.
- Create `notes.md` for the first time when there is a durable finding
  worth recording and none existed before.

The intended cost reduction is explicit here: normal update sessions
should mostly touch `Status` + `Completion Criteria` in `body.md`,
checkboxes in `roadmap.md`, and appends to `notes.md`. `body.md`'s
top-of-document context should stay mostly stable over time.

**Sourcing "what landed" signal.** `git log --oneline master..HEAD`
(or just the branch's own commit log since `<snapshot-head-date>`) is
usually enough — squash-merged PRs appear as `Title (#N)` commits.
When a commit title is terse or a file cites PR numbers that need
cross-checking, consulting GitHub directly via `gh pr view <N>` or
`gh pr list --state merged --search ...` is encouraged — reading
GitHub is allowed. Do not synthesize new document content from PR
bodies; use GitHub signal only to ground the conservative edits the
mutation contract already allows.

### 8. Persist the updated files

Write each file that you changed to a temp file, then store it back to the
same brmem key:

```bash
brmem put <slug>/body.md --namespace memjectives --file <temp-body>
# If roadmap.md changed:
brmem put <slug>/roadmap.md --namespace memjectives --file <temp-roadmap>
# If notes.md changed (including a first-time append):
brmem put <slug>/notes.md --namespace memjectives --file <temp-notes>
```

Capture the new commit SHAs. Skip `brmem put` for any file that did not
change in this session.

### 9. Report

Summarize:

- memjective slug
- branch (`<branch>`)
- files touched (`body.md`, `roadmap.md`, `notes.md`) and a one-line note
  for each — e.g., "body.md: status → done; 2 criteria checked",
  "roadmap.md: Slice 2 items checked", "notes.md: appended threading
  gotcha"
- per-file old commit SHA → new commit SHA
- recovery hint:

```text
Recover a prior file with:
brmem get <slug>/<file> --namespace memjectives --at <old-sha>
```

## Edge cases

- **Detached HEAD** → abort.
- **Current branch is `master`** → abort with the on-master pointer
  (§2). Use `dev-memjective-reconcile <slug>` instead.
- **Slug not attached to the current branch** → abort and direct the
  user at `dev-memjective-claim <slug>` to attach the snapshot first.
- **Snapshot at-or-after branch HEAD** → no-op (§4); print the
  in-sync message and exit 0 without writing.
- **Branch carries other slugs in addition to `<slug>/`** → fine.
  Many-to-many is allowed; `update` operates on the explicit slug only.

## Anti-patterns

- **Running `update` on master.** Master-snapshot rewrites go through
  `dev-memjective-reconcile`, which gathers sibling evidence. `update`
  on master aborts on purpose.
- Auto-picking a slug because the branch carries only one. The slug is
  always explicit.
- Regenerating any file from memory or from the original user brief
  when a real snapshot already exists.
- Silently deleting completed roadmap items or notes.
- Rewriting `body.md`'s Completion Criteria because the plan drifted.
  If the criteria no longer match the work, the memjective has
  outgrown the subsystem.
- Using `update` to rename sections or rebuild files wholesale.
- Doing any implementation work from inside this skill. Implementation
  happens with normal tooling outside the skill, not here.
- Attaching a memjective onto a branch that has none. That is
  `dev-memjective-claim`'s job; `update` refuses to attach.
