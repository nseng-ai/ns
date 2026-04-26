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

Refresh the current branch's memjective snapshot after work lands on that
branch.

> For the canonical-vs-branch model, document anatomy, lifecycle, and shared
> rewrite rules, see `../dev-memjective/SKILL.md` and
> `../dev-memjective/references/mutation-contract.md`.

## Goal

Given an explicit memjective slug, update the branch-local snapshot under
`<slug>/` to reflect commits that landed on the current branch. Write only
changed files back to `brmem`, and report old/new commit SHAs so prior
snapshots are recoverable.

`update` mutates a **branch snapshot**, not the canonical memjective. In the
current implementation, canonical state is stored on `master`, so `update`
aborts on `master` and points to `dev-memjective-reconcile`.

## Arguments

The memjective slug is required and explicit. Do not infer it from "the only
memjective" on a branch; one branch may carry multiple slugs.

If the prompt does not name a slug, abort and ask which memjective to update.

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

## Edge cases and anti-patterns

- Detached `HEAD`: abort.
- Current branch is `master`: abort and point to `reconcile`.
- Slug not attached: abort and point to `claim`.
- Snapshot fresh relative to HEAD: report in sync and write nothing.
- Multiple slugs on the branch: fine; operate only on the explicit slug.
- Never implement work, attach a snapshot, rewrite canonical state, delete
  completed roadmap items, or rebuild files wholesale during `update`.
