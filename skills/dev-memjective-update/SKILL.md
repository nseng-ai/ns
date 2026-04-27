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

- **Slug, required.** The prompt must name the memjective slug. Do not infer
  it from "the only memjective" on a branch; one branch may carry multiple
  slugs. If the prompt does not name a slug, abort and ask which memjective
  to update.

## Core Rules

- **Branch snapshots only.** `update` writes only to the current branch's
  `<slug>/` snapshot. Abort on `master` or detached `HEAD`.
- **Slug always explicit.** No auto-pick from "the only slug on the branch."
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

Abort if not in a git repo, on detached `HEAD`, on `master`, or missing the
slug. On `master`, print:

```text
dev-memjective-update runs on branch snapshots only. Use
dev-memjective-reconcile <slug> to update canonical state.
```

### 2. Confirm the branch snapshot exists

```bash
brmem list --namespace memjectives
```

Confirm at least one returned key starts with `<slug>/`. If not, abort and
direct the user to run `dev-memjective-claim <slug>` on this branch first.

Other slugs on the branch are ignored.

### 3. Freshness check

For each present file under `<slug>/`, fetch metadata:

```bash
brmem check <slug>/body.md --namespace memjectives --format json
brmem check <slug>/roadmap.md --namespace memjectives --format json
brmem check <slug>/notes.md --namespace memjectives --format json
```

Only run checks for files that exist. Take the maximum `.data.head_date`
across present files.

Read the branch's latest author date since master:

```bash
git log --format=%aI master..HEAD | sort -r | head -1
```

Use **author** date over `master..HEAD`, not committer date over `HEAD`.
`gt restack` and other pure rebases re-stamp committer time without moving
author date, so this avoids false-stales after a restack. If `master..HEAD`
is empty, treat the branch as in sync.

Caveat: `git commit --amend --reset-author` does move author date. If this
becomes a recurring source of false-stales, switch to patch-id bookkeeping
(Change B, deferred).

If the snapshot max `head_date` is at-or-after the branch's max author date,
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

### 5. Triage: net-new content?

Before drafting edits, classify each commit collected in step 4:

- **Already-documented** — subject and stat match a roadmap item that's
  already checked off, or a `notes.md` section that already names the same
  types/methods/tests. Typical causes: rebase with `--reset-author`, late
  cherry-pick of an already-folded commit, squash-merge of a substack.
- **Net-new** — introduces work not yet reflected in body/roadmap/notes.

If every post-snapshot commit is already documented, skip steps 6–7 and
report no-op at step 8. Do not draft "freshening" edits to a snapshot whose
content already covers the work.

### 6. Rewrite conservatively

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

### 7. Persist changed files

Write changed content to temporary files, then store only changed files back
to the same branch snapshot:

```bash
brmem put <slug>/body.md --namespace memjectives --file <temp-body>
brmem put <slug>/roadmap.md --namespace memjectives --file <temp-roadmap>
brmem put <slug>/notes.md --namespace memjectives --file <temp-notes>
```

Skip `brmem put` for unchanged files. Capture new commit SHAs.

### 8. Report

Include:

- slug and branch
- files touched with one-line notes
- old SHA to new SHA for each changed file
- branch evidence used
- recovery hint:

```text
brmem get <slug>/<file> --namespace memjectives --at <old-sha>
```

When no files were rewritten, report:

- slug, branch
- `snapshot already documents all post-snapshot commits`
- the commit list checked, with a one-line rationale per commit (e.g.,
  `<sha> <subject>` → matches Slice N already in `notes.md`)
- the snapshot's current commit SHA so the user can audit / recover

## Edge Cases and Anti-Patterns

- Detached `HEAD`: abort.
- Current branch is `master`: abort and point to `reconcile`.
- Slug not attached: abort and point to `claim`.
- Snapshot fresh relative to HEAD: report in sync and write nothing.
- Multiple slugs on the branch: fine; operate only on the explicit slug.
- Never implement work, attach a snapshot, rewrite canonical state, delete
  completed roadmap items, or rebuild files wholesale during `update`.
