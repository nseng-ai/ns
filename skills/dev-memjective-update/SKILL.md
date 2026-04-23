---
name: dev-memjective-update
description: "Rewrite the current branch's memjective files after a slice of work lands. Requires exactly one memjective slug under `memjectives/<slug>/` on the branch. Applies conservative in-place edits per the per-file mutation contract, writes back to brmem, and reports old/new commit SHAs for recovery. See `dev-memjective` for the subsystem overview."
allowed-tools:
  - "Bash(git rev-parse *)"
  - "Bash(brmem *)"
  - "Read"
  - "Write"
metadata:
  internal: true
---

<!-- INTERNAL SKILL: twerk-only. Local-first memjective subsystem on top of brmem. -->

# dev-memjective-update

Rewrite the current branch's memjective snapshot after a slice of work lands.

> For shared concepts — vocabulary (`snapshot`, `master-branch snapshot`,
> `per-branch snapshot`), the storage model, the one-memjective-per-branch
> invariant, carry-forward semantics, the lifecycle, and the mutation-contract
> summary — see `../dev-memjective/SKILL.md`.

## Goal

On the current branch, confirm there is exactly one memjective slug, load
every file under its `<slug>/`, update each file conservatively to reflect
the completed slice, write any changed file back to brmem, and report
old/new commit SHAs so prior snapshots are recoverable.

This skill does **not** choose the next slice and does **not** implement
anything. `dev-memjective-peek` handles the lightweight status check + slug
suggestion, and `dev-memjective-next` handles carry-forward + implementation on
a fresh slice branch.

## Core rules

- **Conservative in-place edits.** Follow the per-file mutation contract in
  `../dev-memjective/references/mutation-contract.md`. Do not regenerate any
  file from scratch.
- **Preserve history.** brmem keeps prior snapshots by commit; report the
  old SHA for every file you rewrite so the user can recover it.

## Workflow

### 1. Pre-flight: confirm repo + current branch

```bash
git rev-parse --show-toplevel
git rev-parse --abbrev-ref HEAD
```

Call the branch `<branch>`.

Abort if:

- not in a git repo
- the current branch is detached (`HEAD`)

### 2. Confirm exactly one memjective slug on the current branch

```bash
brmem list --namespace memjectives
```

`--branch` is omitted so the current branch is used implicitly. Group the
returned keys by their `<slug>/` prefix — each distinct slug is one
memjective regardless of how many files are attached.

Decision rules:

- **0 distinct slugs** → abort; this skill does not attach a memjective
  onto a branch that has none. Tell the user to run `dev-memjective-next`
  on this branch to carry the snapshot forward and implement the next
  slice, or to run `dev-memjective-create` if this is a brand-new
  memjective.
- **1 distinct slug** → that is the active memjective. Continue. Note
  which files exist under `<slug>/` (always `body.md`; optionally
  `roadmap.md` and/or `notes.md`).
- **2+ distinct slugs** → abort; the branch is in an invalid state.

### 3. Capture the prior file commits

Before rewriting, capture the current commit of each existing file for
the report:

```bash
brmem check <slug>/body.md --namespace memjectives
brmem check <slug>/roadmap.md --namespace memjectives   # if present
brmem check <slug>/notes.md --namespace memjectives     # if present
```

### 4. Load the active files

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

### 5. Rewrite conservatively, per file

Apply the per-file mutation contract in
`../dev-memjective/references/mutation-contract.md`. In practice, keep
each rewrite narrow:

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

**Sourcing "what landed" signal.** For simple rewrites, `git log --oneline
master` is usually enough — squash-merged PRs appear as `Title (#N)`
commits on master. When the commit title is terse or a file cites PR
numbers that need cross-checking, consulting GitHub directly via `gh pr
view <N>` or `gh pr list --state merged --search ...` is encouraged —
reading GitHub is allowed. Do not synthesize new document content from PR
bodies; use GitHub signal only to ground the conservative edits the
mutation contract already allows.

### 6. Persist the updated files

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

### 7. Report

Summarize:

- memjective slug
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
- **Current branch has no memjective files** → abort; direct the user to
  run `dev-memjective-next` on this branch to carry-forward and implement
  a slice before re-running `update`.
- **Current branch has files for 2+ distinct memjective slugs** → abort;
  invalid state.
- **User wants the master-branch snapshot updated** → refuse; the
  master-branch snapshot is frozen during the normal lifecycle.

## Anti-patterns

- Updating the master-branch memjective files.
- Regenerating any file from memory or from the original user brief when a
  real snapshot already exists.
- Silently deleting completed roadmap items or notes.
- Rewriting `body.md`'s Completion Criteria because the plan drifted. If
  the criteria no longer match the work, the memjective has outgrown the
  subsystem.
- Using `update` to rename sections or rebuild files wholesale.
- Doing any implementation work from inside this skill. Implementation
  happens inside `dev-memjective-next`, not here.
- Attaching a memjective onto a branch that has none. That is explicitly
  outside this skill's scope; `dev-memjective-next` performs the
  carry-forward as part of its workflow on a fresh slice branch.
