---
name: dev-memjective-claim
description: Command
allowed-tools:
  - "Bash(git rev-parse *)"
  - "Bash(git for-each-ref *)"
  - "Bash(git merge-base *)"
  - "Bash(git rev-list *)"
  - "Bash(brmem check *)"
  - "Bash(brmem copy *)"
  - "Bash(brmem put *)"
  - "Bash(brmem list *)"
  - "Read"
metadata:
  internal: true
---

<!-- INTERNAL SKILL: twerk-only. Local-first memjective subsystem on top of brmem. -->

# dev-memjective-claim

Carry-forward primitive for the memjective subsystem. `claim` attaches a
memjective snapshot to a target branch by copying every file under
`<slug>/` from a resolved source onto that branch, **verbatim**.

> For shared concepts — vocabulary (`snapshot`, `master-branch snapshot`,
> `per-branch snapshot`), the storage model, the document anatomy, the
> lifecycle, and the per-operation mutation contract — see
> `../dev-memjective/SKILL.md` and
> `../dev-memjective/references/mutation-contract.md`. This skill does not
> redefine those concepts; it documents the workflow that implements
> `claim`'s row of the mutation contract.

## Goal

Resolve a source for the requested slug (an ancestor branch's snapshot,
the master-branch snapshot, an explicit branch, or a local file) and
write an exact copy of every file under `<slug>/` to the target branch's
per-branch snapshot.

`claim` is the **only** writer of carry-forward snapshots. It never
reshapes files while attaching them — that work belongs to
`dev-memjective-update` (slice branches) or `dev-memjective-reconcile`
(master).

## Arguments

`claim` requires the **memjective slug** as an explicit positional
argument, parsed from the invoking prompt (e.g., _"run dev-memjective-claim
for `widget-rewrite`"_). The slug is always explicit — many-to-many is
allowed in the storage model, so a single branch can carry multiple
distinct slugs, and `claim` does not auto-pick.

If the invoking prompt does not contain a slug, abort and ask the user
which memjective to attach.

Optional flags:

- `--target <branch>` — branch to write the carry-forward to. Defaults to
  the current branch.
- `--from <source-branch>` — explicit source branch. Skips discovery.
  Mutually exclusive with `--from-file`.
- `--from-file <path>` — treat a local file as the `body.md` source for a
  single `brmem put`. Mutually exclusive with `--from`. `roadmap.md` and
  `notes.md` are not synthesized from a local file source.

## Core rules

- **Carry-forward is verbatim.** Every file under `<slug>/` on the source
  is copied to the same key on the target. No edits, no section
  rewrites, no annotations.
- **One slug per claim invocation.** To attach two memjectives to a
  branch, run `claim` twice. `claim` never operates on multiple slugs in
  a single run.
- **Slug is always explicit.** `claim` does not auto-pick a slug.
- **Writes only to the target branch.** `claim` never writes to master
  and never writes to other branches. The `--target` flag (or the
  current branch by default) is the sole write destination.
- **Target precondition.** The target branch must NOT already carry any
  entry under `<slug>/`. To advance an attached memjective, use
  `dev-memjective-update` (slice branch) or `dev-memjective-reconcile`
  (master).
- **Single source.** Carry-forward is always single-source. `claim`
  never fuses files from multiple snapshots — that would be a rewrite,
  not a copy. Cross-snapshot fusion is `dev-memjective-reconcile`'s
  job.
- **No Graphite dependency.** Source discovery uses raw git plumbing
  only; `gt` is never invoked.

See `../dev-memjective/references/mutation-contract.md` ("Rules for
`dev-memjective-claim`") for the per-file contract this workflow obeys.

## Workflow

### 1. Pre-flight: confirm repo + resolve target branch

```bash
git rev-parse --show-toplevel
git rev-parse --abbrev-ref HEAD
```

Call the current branch `<current>`. The target branch `<target>` is
`<current>` unless the invoking prompt provided `--target <branch>`.

Abort if:

- not in a git repo,
- the current branch is detached (`HEAD`) and no `--target` was given,
- the invoking prompt did not name a memjective slug (see **Arguments**),
- both `--from` and `--from-file` were given (mutually exclusive),
- `<target>` is `master` (claim never writes to master).

### 2. Precondition: target must not already carry the slug

```bash
brmem list --namespace memjectives --branch <target> --format json
```

Inspect the resulting key list. Abort if any key starts with `<slug>/`.
Surface the conflict so the user can choose between attaching a
different slug or running `dev-memjective-update <slug>` on `<target>`
to advance the already-attached snapshot.

If `<target>` has no snapshot at all (empty list or missing ref), that
is fine — `claim` is creating the first entry on `<target>`.

### 3. Resolve the source

The slug arg fixes _which_ memjective to attach; this step decides
_which copy_ of that memjective to read. Resolution is in order:

#### 3a. `--from-file <path>`

If `--from-file` was given, skip all discovery. Read the file directly
and treat it as the `body.md` source for a single `brmem put` (step 4b).
Validate the file exists and is readable; otherwise abort and surface
the path.

`--from-file` carries only `body.md`. `roadmap.md` and `notes.md` are
not synthesized.

#### 3b. `--from <branch>`

If `--from <branch>` was given, use it directly. Validate that the
source carries at least `<slug>/body.md`:

```bash
brmem check <slug>/body.md --namespace memjectives --branch <from>
```

Abort if the source lacks `<slug>/body.md`. Other slugs on the same
branch are fine and ignored — many-to-many is allowed in the storage
model.

#### 3c. Discovery (no flag given)

Discover the nearest ancestor branch carrying `<slug>/`, then fall back
to the master-branch snapshot.

Enumerate snapshot refs:

```bash
git for-each-ref --format='%(refname)' refs/brmem/ns/memjectives/
```

Each refname is `refs/brmem/ns/memjectives/<encoded-branch>`. Decode
`---` → `/` to recover the real branch name. Filter the list:

- Drop `master` (handled separately as the master fallback).
- Drop `<target>` (the precondition in step 2 already rules out a
  collision).
- Drop branches that no longer exist:
  ```bash
  git rev-parse --verify --quiet refs/heads/<B>
  ```
- Keep only ancestors of `HEAD`:
  ```bash
  git merge-base --is-ancestor <B> HEAD
  ```
- Keep only branches whose snapshot carries at least `<slug>/body.md`.

Decision rules:

- **0 ancestor candidates** → fall through to the master-branch snapshot:
  ```bash
  brmem check <slug>/body.md --namespace memjectives --branch master
  ```
  - **Present** → use master as the source; label _master snapshot_.
  - **Absent** → abort. Ask the user to name an explicit `--from`
    branch, an explicit `--from-file`, or to run
    `dev-memjective-create` first if the slug is genuinely new.
- **1 ancestor candidate** → use it; label _ancestor branch `<B>`_.
- **2+ ancestor candidates** → rank by commit distance from `HEAD` and
  use the nearest:
  ```bash
  git rev-list --count refs/heads/<B>..HEAD
  ```
  Smallest count wins. If multiple candidates tie, list the tied
  branches and ask the user to pick — never auto-resolve a tie.

### 4. Carry-forward

#### 4a. Branch source (3b or 3c)

Single atomic copy:

```bash
brmem copy --namespace memjectives \
  --from-branch <source> --to-branch <target> \
  --key-glob '<slug>/*'
```

This carries every file present under `<slug>/` on the source —
`body.md` always, plus `roadmap.md` and `notes.md` when they exist.
Capture the destination ref + the resulting commit SHA from the `brmem
copy` output for the report.

#### 4b. Local file source (3a)

Single put:

```bash
brmem put <slug>/body.md --namespace memjectives \
  --branch <target> --file <path>
```

Capture the destination ref + commit SHA. Sibling files are not written.

### 5. Report

Output a tight summary:

- **Memjective slug** — `<slug>`.
- **Source label** — one of:
  - _ancestor branch `<B>`_
  - _master snapshot_
  - _branch `<B>` (explicit `--from`)_
  - _local file `<path>`_
- **Files carried** — `body.md` always; `roadmap.md` / `notes.md` if
  present on a branch source. Local-file sources carry only `body.md`.
- **Target** — `<target>`.
- **Destination ref + commit SHA** — captured from step 4.
- **Next-step hint** —
  > _Run `dev-memjective-next <slug>` to inspect the attached snapshot,
  > or proceed with implementation._

## Edge cases

- **Detached HEAD with no `--target`** → abort in step 1; ask the user
  to name a target branch.
- **Target is master** → abort in step 1. Master snapshots are written
  by `dev-memjective-create` (initial) and `dev-memjective-reconcile`
  (rewrite); never by `claim`.
- **Target already carries `<slug>/`** → step 2 aborts. Direct the user
  at `dev-memjective-update` (slice branch) or `dev-memjective-reconcile`
  (master).
- **Target carries other slugs but not `<slug>/`** → fine. Many-to-many
  is allowed; step 2's precondition is per-slug.
- **`--from <branch>` lacks `<slug>/body.md`** → abort in step 3b. Do
  not silently fall through to discovery — the user named an explicit
  source, so surface that the source is invalid.
- **`--from-file <path>` does not exist** → abort in step 3a; surface
  the path.
- **Discovery finds 2+ ancestor candidates tied at the same commit
  distance** → ask the user to pick. Never auto-resolve.
- **Slug exists only on master** → 3c finds 0 ancestor candidates,
  falls through to the master snapshot.
- **Slug exists nowhere** → 3c's master fallback aborts. Likely the user
  meant `dev-memjective-create` for a slug that does not exist yet.
- **Stale brmem refs for deleted branches** → dropped in 3c by the
  `git rev-parse --verify` filter.
- **Worktrees** — `git for-each-ref refs/brmem/ns/...` is repo-global,
  so ancestor discovery works correctly from any worktree.

## Anti-patterns

- **Editing any file while carrying it forward.** Carry-forward is
  always an exact copy. Reshaping belongs to `dev-memjective-update`
  (slice) or `dev-memjective-reconcile` (master).
- **Carrying only `body.md` and dropping sibling files** when the source
  is a branch. `roadmap.md` and `notes.md` are part of the snapshot;
  the `--key-glob '<slug>/*'` pattern carries them all.
- **Synthesizing `roadmap.md` or `notes.md`** from a `--from-file`
  source. Local-file sources carry exactly `body.md`.
- **Auto-picking a slug because the source has only one.** The slug is
  always explicit; many-to-many is allowed.
- **Auto-resolving a tie** between equidistant ancestor candidates in
  step 3c. Always ask the user.
- **Falling back to the master snapshot when a nearer ancestor carries
  the slug.** 3c filters and ranks ancestors before falling through to
  master on purpose.
- **Writing to master** — even with `--target master`. Master rewrites
  go through `dev-memjective-reconcile`; the master snapshot is seeded
  by `dev-memjective-create`.
- **Fusing files from multiple snapshots.** Single source only.
  Cross-snapshot fusion is `dev-memjective-reconcile`'s job.
- **Using Graphite plumbing** (`gt parent`, `gt ls`, branch-config
  reads) for source discovery. Raw git only.
- **Doing implementation work or running `update` "while we're here"**
  during a `claim` run. `claim` only attaches.
