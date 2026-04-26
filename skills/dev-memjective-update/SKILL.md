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

Refresh the current branch's memjective snapshot before another branch claims
from it.

> For the canonical-vs-branch model, document anatomy, lifecycle, and shared
> rewrite rules, see `../dev-memjective/SKILL.md` and
> `../dev-memjective/references/mutation-contract.md`.

## Goal

Given an explicit memjective slug, update the branch-local snapshot under
`<slug>/` to reflect commits on the current branch. Write only changed files
back to `brmem`, and report old/new commit SHAs so prior snapshots are
recoverable.

`update` mutates a **branch snapshot**, not the canonical memjective. In the
current implementation, canonical state is stored on `master`, so `update`
aborts on `master` and points to `dev-memjective-reconcile`.

This is normally needed only for stacked PRs, when a later branch will claim
from this branch before this branch lands. For a simple single-PR path, merge
the PR and run `dev-memjective-reconcile` on `master` instead.

## Memjective Content

A branch snapshot is stored under `<slug>/` in namespace `memjectives` on
the current branch. Files:

- `body.md` (required): stable workstream spine and progress guidance.
- `roadmap.md` (optional): ordered slice plan and progress surface.
- `notes.md` (optional): durable findings from this branch's work.

`update` reads every present file under `<slug>/` on the current branch and
rewrites only files whose content changed. It never reads or writes other
branch snapshots and never touches canonical state.

## Inputs

- **Slug, usually required.** Parse the slug from the prompt and use it
  directly. If the prompt names no slug, defer to Step 2 to enumerate slugs
  attached to the current branch: a single slug auto-resolves, multiple
  slugs still requires the user to choose, zero slugs aborts and points at
  `dev-memjective-claim`. Never derive the slug from the branch name —
  branches commonly carry a parent memjective whose slug differs from the
  branch's slice slug.

## Core Rules

- **Branch snapshots only.** `update` writes only to the current branch's
  `<slug>/` snapshot. Abort on `master` or detached `HEAD`.
- **Slug auto-pick is single-slug only.** When the prompt names a slug, use
  it. When it doesn't, auto-resolve only when the current branch carries
  exactly one slug under namespace `memjectives`; surface that resolved
  slug in the final report. Multiple attached slugs still require the user
  to pick — never guess between slices that happen to coexist on a branch.
- **One slug per invocation.** Multiple slugs on the branch are fine; operate
  only on the explicit slug.
- **No-op when in sync.** If the snapshot's max `head_date` is at-or-after
  branch HEAD's commit time, report in sync and exit without writing.
- **Conservative per-file rewrites.** Apply the shared rules in
  `../dev-memjective/references/mutation-contract.md`. Do not regenerate
  files from the original brief, rename sections, delete history, or rebuild
  files wholesale.
- **Never attach a missing snapshot.** If `<slug>/` is not present on the
  branch, abort and point at `dev-memjective-claim`. Use `claim`, not
  `update`, to attach.
- **Never implement work.** `update` records progress; it does not write
  code or perform the slice's engineering.

## Workflow

### 1. Preflight

```bash
git rev-parse --show-toplevel
git rev-parse --abbrev-ref HEAD
```

Abort if not in a git repo, on detached `HEAD`, or on `master`. Slug
presence is checked in Step 2. On `master`, print:

```text
dev-memjective-update runs on branch snapshots only. Use
dev-memjective-reconcile <slug> to update canonical state.
```

### 2. Resolve the slug against branch snapshots

List slugs attached to the current branch:

```bash
brmem list --namespace memjectives
```

Split each returned key on `/` and take the first segment. Deduplicate to
get the set of attached slugs.

- **Slug provided in the prompt**: confirm at least one returned key
  starts with `<slug>/`. If not, abort and point the user at
  `dev-memjective-claim <slug>` on this branch first.
- **No slug in the prompt, single attached slug**: use it. Surface the
  resolved slug name in the final report so a wrong-slug guess is visible.
- **No slug in the prompt, multiple attached slugs**: list them with
  one-line context (e.g., the title from each `body.md` if cheap to fetch)
  and ask which to update. Never auto-pick; multiple slugs may be a parent
  memjective plus an in-flight slice, and updating the wrong one is
  destructive.
- **No slug in the prompt, zero attached slugs**: abort and direct the
  user to run `dev-memjective-claim <slug>` on this branch first. `update`
  never attaches a missing snapshot.

Other slugs on the branch beyond the resolved one are ignored.

### 3. Freshness check

For each present file under `<slug>/`, fetch metadata:

```bash
brmem check <slug>/body.md --namespace memjectives --format json
brmem check <slug>/roadmap.md --namespace memjectives --format json
brmem check <slug>/notes.md --namespace memjectives --format json
```

Only run checks for files that exist. Take the maximum `.data.head_date`
across present files.

Read branch HEAD's commit time:

```bash
git log -1 --format=%cI HEAD
```

If the snapshot max `head_date` is at-or-after branch HEAD's commit time,
print:

```text
memjective <slug> is in sync with HEAD on <branch> - no update needed
```

Exit without loading or writing files.

### 4. Load target files and collect evidence

Capture old SHAs for present files:

```bash
brmem check <slug>/body.md --namespace memjectives
brmem check <slug>/roadmap.md --namespace memjectives
brmem check <slug>/notes.md --namespace memjectives
```

Load present files:

```bash
brmem get <slug>/body.md --namespace memjectives > /tmp/<slug>-body.md
brmem get <slug>/roadmap.md --namespace memjectives > /tmp/<slug>-roadmap.md
brmem get <slug>/notes.md --namespace memjectives > /tmp/<slug>-notes.md
```

Use the branch's own commits as evidence:

```bash
git log --oneline master..HEAD
git log --since=<snapshot-head-date> --oneline HEAD
```

The first command is usually enough; the second is useful when the snapshot
was updated after the branch diverged.

### 5. Rewrite conservatively

Apply the shared conservative rewrite rules in
`../dev-memjective/references/mutation-contract.md`.

Typical update work:

- check completed roadmap items
- check completion criteria that this branch actually satisfied
- move `Status:` only when the branch state changed categorically
- append durable findings to `notes.md`
- create `notes.md` only when there is a durable finding worth preserving

Do not regenerate files from the original brief, rename sections, delete
history, or attach a missing snapshot.

### 6. Persist changed files

Write changed content to temporary files, then store only changed files back
to the same branch snapshot:

```bash
brmem put <slug>/body.md --namespace memjectives --file <temp-body>
brmem put <slug>/roadmap.md --namespace memjectives --file <temp-roadmap>
brmem put <slug>/notes.md --namespace memjectives --file <temp-notes>
```

Skip `brmem put` for unchanged files. Capture new commit SHAs.

### 7. Report

Include:

- slug and branch
- files touched with one-line notes
- old SHA to new SHA for each changed file
- branch evidence used
- recovery hint:

```text
brmem get <slug>/<file> --namespace memjectives --at <old-sha>
```

## Edge Cases and Anti-Patterns

- Detached `HEAD`: abort.
- Current branch is `master`: abort and point to `reconcile`.
- Slug not attached: abort and point to `claim`. (Applies whether the
  slug was named in the prompt or the current branch has zero attached
  slugs at auto-resolve time.)
- Multiple attached slugs with no slug in the prompt: ask the user to
  choose. Never auto-pick to break the tie.
- Snapshot fresh relative to HEAD: report in sync and write nothing.
- Multiple slugs on the branch: fine; operate only on the explicit slug.
- Never implement work, attach a snapshot, rewrite canonical state, delete
  completed roadmap items, or rebuild files wholesale during `update`.
