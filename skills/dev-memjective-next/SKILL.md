---
name: dev-memjective-next
description: "Run on a slice branch: carry the memjective snapshot forward onto the current branch via `brmem put`, choose the next slice from the roadmap, and implement it in-session. If the current branch already has a snapshot, propose a slug for the next slice, create a fresh branch using the project's branch-creation convention, and continue from there. See `dev-memjective` for the subsystem overview."
allowed-tools:
  - "Bash(git rev-parse *)"
  - "Bash(git for-each-ref *)"
  - "Bash(git merge-base *)"
  - "Bash(git rev-list *)"
  - "Bash(git checkout *)"
  - "Bash(git branch *)"
  - "Bash(gt create *)"
  - "Bash(gt branch *)"
  - "Bash(gt track *)"
  - "Bash(brmem check *)"
  - "Bash(brmem get *)"
  - "Bash(brmem list *)"
  - "Bash(brmem put *)"
  - "Read"
  - "Write"
  - "Edit"
  - "Bash"
metadata:
  internal: true
---

<!-- INTERNAL SKILL: twerk-only. Local-first memjective subsystem on top of brmem. -->

# dev-memjective-next

Carry the memjective snapshot onto a slice branch (cutting a new one from
the current branch if needed), then implement the next chunk of work.

> For shared concepts — vocabulary (`snapshot`, `master-branch snapshot`,
> `per-branch snapshot`), the storage model, the one-memjective-per-branch
> invariant, carry-forward semantics, the lifecycle, and the mutation-contract
> summary — see `../dev-memjective/SKILL.md`.

## Goal

Run **on a slice branch** — either a fresh branch the user just created, or
the previous slice branch in which case this skill will help cut a new one.
This skill:

1. Checks whether the current branch already has a memjective snapshot. If
   so, proposes a slug for the next slice, asks the user to confirm, creates
   a new branch using the project's branch-creation convention, and
   continues from that fresh branch.
2. Resolves the active memjective from an ancestor branch snapshot, or from
   the master-branch snapshot when no ancestor snapshot exists.
3. Copies the resolved memjective text verbatim onto the current branch via
   `brmem put` (the carry-forward write).
4. Picks the next PR-sized slice from the roadmap.
5. Implements the slice directly in the current session using normal
   tooling.

For a lightweight status check with no writes, use `dev-memjective-peek`
instead. For recording work after a slice has landed, use
`dev-memjective-update`.

## Core rules

- **One memjective per branch.** Carry-forward only ever writes to a branch
  that currently has zero entries in the `memjectives` namespace. If the
  current branch already has an entry, cut a new slice branch first (see
  step 0) and continue the rest of the workflow from there.
- **Invalid state aborts hard.** If the current branch has 2+ entries in
  the `memjectives` namespace, abort — do not try to branch out of it.
- **Writes exactly one brmem entry: the carry-forward.** The only brmem
  mutation this skill performs is the exact-copy carry-forward of the
  resolved source onto the (post-branching) current branch. No edits to the
  text at attach time; no writes to the master-branch snapshot; no writes
  to any other branch.
- **Label the source.** The final report names where the memjective was
  read from: ancestor-branch snapshot (with branch name), master-branch
  snapshot, or local file.
- **Branch creation defers to the project convention.** When step 0 needs
  to create a new slice branch, follow the project's stated convention —
  for twerk that's `gt create` per the `graphite` skill. Fall back to
  `git checkout -b <slug>` only when `gt` cannot express the operation
  (e.g., no staged changes and `gt create` refuses without a commit).
- **No Graphite dependency for source discovery.** Ancestor enumeration
  uses raw git plumbing only; `gt` is used only for branch creation when
  appropriate.
- **Implement in-session.** After the carry-forward lands, do the slice's
  work here using Edit / Write / Bash as the task requires. Do not defer
  implementation back to the user.

## Workflow

### 0. Branch state check — fresh branch, or cut one

```bash
brmem list --namespace memjectives
```

`--branch` omitted so the current branch is used implicitly.

Decision rules:

- **0 matches** → fresh branch, continue to step 1.
- **1 match** → current branch already holds a memjective. Do **not** abort.
  Instead, run the "cut a new slice branch" flow below, then restart at
  step 1 on the newly-created branch.
- **2+ matches** → abort; the branch is in an invalid state. Tell the user
  to clean it up before retrying.

#### 0a. Cut a new slice branch (1-match case)

The current branch — call it `<prev>` — already has a memjective snapshot
(`<slug>/body.md`). To continue the workstream, cut a new branch off
`<prev>`
and let discovery (step 2b) pick up `<prev>`'s snapshot as the ancestor
source.

1. **Load the current snapshot** to pick the next slice and derive a slug.

   ```bash
   brmem get <slug>/body.md --namespace memjectives > /tmp/<slug>-body.md
   ```

   Read `/tmp/<slug>-body.md`. Identify the next unchecked roadmap item that
   still matches `How to Make Progress`. Follow the slice-sizing guidance
   in step 5 (coherent, landable in one session, steelthreaded for large
   memjectives).

2. **Propose a kebab-case slug** for the new branch derived from the
   chosen roadmap item. Keep it short and descriptive — e.g., if the next
   roadmap item is _"Wire up the repo-discovery CLI command"_, a good slug
   is `wire-repo-discovery-cli`. Respect the project's branch-naming
   convention if there is one (the `graphite` skill recommends
   `feature-stack/terse-description` for grouped stacks, but a single-token
   slug is also fine for standalone slices).

3. **Ask the user to confirm.** Present: the next slice title, a one-line
   rationale, the proposed slug, and the branch name that will be created.
   Wait for confirmation. Accept a user-supplied slug and use it verbatim
   if provided.

   If the roadmap choice is non-obvious (multiple unchecked items at
   similar priority, recent Notes suggesting the plan should be reshaped,
   or material drift between the memjective and the codebase), offer 2–3
   candidate slices with slug suggestions and let the user pick.

4. **Create the branch** using the project's convention. In twerk, that's
   `gt` per the `graphite` skill:

   ```bash
   gt create <slug>
   ```

   If `gt create` refuses because there are no staged changes to commit,
   fall back to plain git to create an empty slice branch off `<prev>`:

   ```bash
   git checkout -b <slug>
   ```

   Do not stage or commit anything on the user's behalf just to satisfy
   `gt create` — the slice's actual work comes later (step 6) and will be
   committed by the user.

   > **TODO:** make branch creation pluggable per project (config-driven
   > command, e.g. `gt create`, `git checkout -b`, `jj new`, etc.) rather
   > than hard-coding the twerk/graphite flow here. Acceptable to keep
   > hard-coded while this skill carries the `dev-` prefix; revisit before
   > graduating to a published (`memjective-next`) skill.

5. **Re-verify the precondition** on the new branch before proceeding:

   ```bash
   brmem list --namespace memjectives
   ```

   Expect 0 matches. If the new branch somehow already has an entry
   (extremely unlikely — would mean the slug collided with an existing
   refs/brmem path), abort and surface the collision so the user can pick
   a different slug.

6. **Continue at step 1** on the new branch. Discovery in step 2b will see
   `<prev>` as an ancestor, find its snapshot, and carry it forward.

### 1. Pre-flight: confirm repo + current branch

```bash
git rev-parse --show-toplevel
git rev-parse --abbrev-ref HEAD
```

Call the branch `<branch>`.

Abort if:

- not in a git repo
- the current branch is detached (`HEAD`)

### 2. Resolve the memjective source

Step 0 guarantees the current branch has zero memjective entries (either
because it was already fresh, or because step 0a cut a new one). Two
sources remain, in order.

#### 2a. Explicit user source

If the user explicitly names a source, resolve that directly instead of
guessing:

- a branch name: require exactly one memjective entry on that branch
- a master-branch snapshot slug: read `<slug>/body.md` from `master`
- a local file path: read the file directly and label the source as
  _local file_

If the explicit source is invalid, stop and surface the problem instead of
falling through to discovery.

#### 2b. Ancestor snapshots

Enumerate every `(branch, key)` pair that has a memjective entry:

```bash
git for-each-ref --format='%(refname)' refs/brmem/memjectives/
```

Each refname is `refs/brmem/memjectives/<encoded-branch>/<slug>/body.md`.
Extract the `<encoded-branch>` segment (the 4th path component), decode
`---` → `/` to recover the real branch name, and pair it with the trailing
`<slug>/body.md` key.

Filter the list:

- Drop entries where the branch is `master` (handled below as the
  master-branch snapshot, not an ancestor snapshot).
- Drop entries where the branch equals the current `<branch>` (already
  ruled out by the precondition).
- Drop entries where the branch no longer exists:
  ```bash
  git rev-parse --verify --quiet refs/heads/<B>
  ```
- Keep only entries where the branch is an ancestor of `HEAD`:
  ```bash
  git merge-base --is-ancestor <B> HEAD
  ```

Invariant: if any single ancestor branch surfaces with more than one entry
in the `memjectives` namespace, abort and surface the invalid state
instead of presenting it as a candidate.

Decision rules for ancestor candidates:

- **0 candidates** → continue to master-branch snapshots.
- **1 candidate** → use it automatically and label it as
  _snapshot (ancestor branch `<B>`)_.
- **2+ candidates** → rank them by commit distance from `HEAD` and use the
  nearest one automatically.

Measure distance with:

```bash
git rev-list --count refs/heads/<B>..HEAD
```

The smallest count wins. If multiple candidates tie for the smallest
distance, list those tied candidates and ask the user to choose.

#### 2c. Master-branch snapshots

```bash
brmem list --namespace memjectives --branch master
```

Decision rules:

- **0 snapshots** → ask the user to name a branch, a master-branch slug, or
  a local memjective file.
- **1 snapshot** → use it automatically and label it as
  _master-branch snapshot_.
- **2+ snapshots** → list them and ask the user to choose.

### 3. Load the memjective

Read the resolved memjective text:

```bash
brmem get <slug>/body.md --namespace memjectives --branch <source-branch> > /tmp/<slug>-body.md
```

`<source-branch>` is the branch chosen in 2a, the nearest ancestor chosen
in 2b, or `master` for 2c snapshots. If step 2a resolved to a local file,
copy that file to the temp path instead.

Interpret the document's sections per the spec skill's **Document anatomy**.

### 3a. Brief summary to the user

Before carrying forward, write a short summary back to the user so they can
confirm the source:

- Title and Status.
- Source label (from step 2).
- The current state of the roadmap (which items are checked vs. open).

Keep the summary tight. If the user disagrees with the chosen source, return
to step 2 and let them pick a different candidate.

### 4. Carry-forward: attach the snapshot to the current branch

Capture the prior commit state of the namespace on the current branch for
the report:

```bash
brmem list --namespace memjectives
```

(Expected: still empty per the precondition.)

Then copy the resolved text onto the current branch, using the same
`<slug>/body.md` key under namespace `memjectives`:

```bash
brmem put <slug>/body.md --namespace memjectives --file /tmp/<slug>-body.md
```

`--branch` omitted so the current branch is used implicitly. The content
must be a verbatim copy of the source text — no edits, no section
rewrites, no section renames. Any reshaping belongs to
`dev-memjective-update` after work lands, not to carry-forward.

Capture the new commit SHA reported by `brmem put` for the final report.

### 5. Decide the next slice

Default to the first unchecked roadmap item that still matches
`How to Make Progress`.

**When the choice is non-obvious** — multiple unchecked items at similar
priority, recent Notes suggesting the plan should be reshaped, or material
drift between the memjective and the codebase — present 2–3 candidate
slices with short rationales and wait for the user to pick. Do not barrel
ahead.

Keep the chosen slice:

- Coherent and landable in one session.
- Steelthreaded (end-to-end) when the memjective is an architectural
  redesign or other large multi-slice effort and an end-to-end slice is
  possible.
- Small enough that a future `dev-memjective-update` session can
  conservatively reflect it in the snapshot.

### 6. Implement the slice

With the memjective snapshot attached and a slice chosen, implement the
slice directly in the current session using standard tooling (Edit, Write,
Bash, etc.). Follow the existing codebase conventions and any project-level
rules (lint, format, tests).

The session will typically end with the user committing the resulting
changes themselves. This skill does not commit or push on the user's
behalf.

### 7. Report

After implementation, summarize:

- **Source** — label + slug (e.g., _snapshot (ancestor branch `clinkr-m1`)_,
  slug `clinkr-followups`).
- **Carry-forward** — old state (namespace was empty on the current
  branch) and the new `brmem put` commit SHA, so the user can recover the
  attached snapshot if needed.
- **Chosen slice** — title + 1–2 sentence rationale. If the user picked
  from multiple candidates, name the alternatives that were considered.
- **What was implemented** — a brief summary of the files touched and the
  behavior changed.
- **Next step** — tell the user to run `dev-memjective-update` on this
  branch after committing (or once they are satisfied with the slice) to
  rewrite the branch snapshot conservatively to reflect what landed.

## Edge cases

- **Detached HEAD** → abort in step 1.
- **Current branch already has a memjective snapshot** → do not abort.
  Run step 0a to cut a new slice branch, then continue at step 1 on the
  new branch.
- **Current branch has 2+ memjective snapshots** → abort in step 0;
  invalid state. Do not try to branch out of it — clean up first.
- **`gt create` refuses because there are no staged changes** → fall back
  to `git checkout -b <slug>` in step 0a. Never stage throwaway content
  just to satisfy `gt`.
- **User rejects the proposed slug** → take the user's slug verbatim and
  use it in step 0a.
- **User wants a different next slice** than the one proposed → present
  alternatives in step 0a, let the user pick, then derive the slug from
  their choice.
- **Stale brmem refs** for deleted branches → dropped during step 2b by
  the `git rev-parse --verify` filter.
- **Branch with >1 memjective entry** (ancestor or master) → abort and
  surface; never pick silently.
- **Worktrees** — `git for-each-ref refs/brmem/...` is repo-global, so
  ancestor enumeration works correctly from any worktree.
- **Multiple ancestor snapshots on the branch stack** → choose the one
  with the smallest `git rev-list --count <branch>..HEAD`.
- **User explicitly names a slug** that exists only on master → use the
  master-branch snapshot; label as _master-branch snapshot_.
- **No memjectives anywhere** → ask the user for a source rather than
  silently returning nothing.

## Anti-patterns

- Aborting when the current branch already has a memjective snapshot.
  That's now step 0a's job to resolve — cut a new slice branch and
  continue, don't push the user back to a shell.
- Creating the new slice branch without user confirmation of the slug.
  Always surface the proposed slug and the next slice first; accept the
  user's override.
- Staging or committing throwaway content just to make `gt create` happy.
  Use `git checkout -b` as the fallback when `gt` refuses an empty
  branch.
- Editing the snapshot text while carrying it forward. Carry-forward is
  always an exact copy of a single source. Any reshaping is
  `dev-memjective-update`'s job after implementation lands.
- Using `next` to rename sections or rewrite the document during
  carry-forward. Carry-forward preserves the loaded text exactly.
- Implementing the slice before carrying forward. Attach the snapshot
  first, so the slice's work happens against a branch with a coherent
  memjective record.
- Choosing a source by timestamp or branch name instead of commit distance
  from `HEAD`.
