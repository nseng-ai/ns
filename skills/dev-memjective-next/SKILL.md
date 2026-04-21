---
name: dev-memjective-next
description: "Run on a fresh slice branch to carry a memjective snapshot forward and implement the next PR-sized chunk of work. Use right after creating or checking out the next slice branch. First refuse to run if the current branch already has a `memjectives` entry; that means the branch is not fresh and the user should use `dev-memjective-peek` or `dev-memjective-update` instead. Otherwise resolve the memjective from the nearest ancestor branch snapshot or a `master` seed, copy it verbatim onto the current branch with `brmem put`, choose the next slice, and implement it in-session."
allowed-tools:
  - "Bash(git rev-parse *)"
  - "Bash(git for-each-ref *)"
  - "Bash(git merge-base *)"
  - "Bash(git rev-list *)"
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

<!-- INTERNAL SKILL: twerk-only. Local-first memjective prototype on top of brmem. -->

# dev-memjective-next

Carry the memjective snapshot onto a freshly created slice branch, then
implement the next chunk of work.

See the `dev-memjective` spec skill for shared vocabulary (seed vs. snapshot,
carry-forward, one-per-branch invariant).

## Goal

Run **on a fresh slice branch** — the branch the user just created to hold
the next slice. This skill:

1. Refuses to run if the current branch already has a memjective snapshot
   (precondition check).
2. Resolves the active memjective from an ancestor branch snapshot, or from
   a master seed when no ancestor snapshot exists.
3. Copies the resolved memjective text verbatim onto the current branch via
   `brmem put` (the carry-forward write).
4. Picks the next PR-sized slice.
5. Implements the slice directly in the current session using normal
   tooling.

For a lightweight status check with no writes, use `dev-memjective-peek`
instead. For recording work after a slice has landed, use
`dev-memjective-update`.

## Core rules

- **Strict precondition: must be run on a fresh slice branch.** If the
  current branch already has any entry in the `memjectives` namespace,
  abort with the message:

  > `dev-memjective-next` must be run on a fresh slice branch. Current
  > branch `<B>` already has a memjective snapshot (`<slug>.md`). Use
  > `dev-memjective-peek` to inspect, `dev-memjective-update` to record
  > progress, or check out a new branch.

- **Writes exactly one brmem entry: the carry-forward.** The only brmem
  mutation this skill performs is the exact-copy carry-forward of the
  resolved source onto the current branch. No edits to the text at attach
  time; no writes to the master seed; no writes to any other branch.
- **Label the source.** The final report names where the memjective was
  read from: ancestor-branch snapshot (with branch name) or master seed.
- **Branch continuity first.** Prefer the nearest ancestor branch snapshot
  in commit history. Consult `master` only when no ancestor snapshot exists.
- **One snapshot per branch.** If any candidate source branch has more than
  one entry in the `memjectives` namespace, abort and surface the invalid
  state instead of guessing.
- **No Graphite dependency.** Parent detection uses raw git plumbing only.
- **Implement in-session.** After the carry-forward lands, do the slice's
  work here using Edit / Write / Bash as the task requires. Do not defer
  implementation back to the user.

## Workflow

### 0. Precondition: current branch must have no memjective snapshot

```bash
brmem list --namespace memjectives
```

`--branch` omitted so the current branch is used implicitly.

Decision rules:

- **0 matches** → continue. This is the fresh-slice-branch state the skill
  expects.
- **1 match** → abort with the precondition error message above (naming
  the branch and existing slug).
- **2+ matches** → abort; the branch is in an invalid v0 state. Tell the
  user to clean it up before retrying.

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

The precondition in step 0 already ruled out the current-branch case. Two
sources remain, in order.

#### 2a. Explicit user source

If the user explicitly names a source, resolve that directly instead of
guessing:

- a branch name: require exactly one memjective entry on that branch
- a master seed slug: read `<slug>.md` from `master`
- a local file path: read the file directly and label the source as
  _local file_

If the explicit source is invalid, stop and surface the problem instead of
falling through to discovery.

#### 2b. Ancestor snapshots

Enumerate every `(branch, key)` pair that has a memjective entry:

```bash
git for-each-ref --format='%(refname)' refs/brmem/memjectives/
```

Each refname is `refs/brmem/memjectives/<encoded-branch>/<key>`. Extract
the `<encoded-branch>` segment (the 4th path component), decode `---` → `/`
to recover the real branch name, and pair it with `<key>`.

Filter the list:

- Drop entries where the branch is `master` (handled below as a seed, not
  a snapshot).
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
in the `memjectives` namespace, abort and surface the invalid v0 state
instead of presenting it as a candidate.

Decision rules for ancestor candidates:

- **0 candidates** → continue to master seeds.
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

#### 2c. Master seeds

```bash
brmem list --namespace memjectives --branch master
```

Decision rules:

- **0 seeds** → ask the user to name a branch, a master slug, or a local
  memjective file.
- **1 seed** → use it automatically and label it as _seed (master)_.
- **2+ seeds** → list them and ask the user to choose.

### 3. Load the memjective

Read the resolved memjective text:

```bash
brmem get <slug>.md --namespace memjectives --branch <source-branch> > /tmp/<slug>.md
```

`<source-branch>` is the branch chosen in 2a, the nearest ancestor chosen
in 2b, or `master` for 2c seeds. If step 2a resolved to a local file, copy
that file to the temp path instead.

Interpret the document's sections per the spec skill's **Document anatomy**.

### 3a. Brief summary to the user

Before carrying forward, write a short summary back to the user so they can
confirm the source:

- Title and Status.
- Source label (from step 2).
- The current state of the Status Checklist (which items are checked vs.
  open).

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
`<slug>.md` key under namespace `memjectives`:

```bash
brmem put <slug>.md --namespace memjectives --file /tmp/<slug>.md
```

`--branch` omitted so the current branch is used implicitly. The content
must be a verbatim copy of the source text — no edits, no section
rewrites, no section renames. Any reshaping belongs to
`dev-memjective-update` after work lands, not to carry-forward.

Capture the new commit SHA reported by `brmem put` for the final report.

### 5. Decide the next slice

Default to the first unchecked checklist item that still matches
`How to Make Progress`.

**When the choice is non-obvious** — multiple unchecked items at similar
priority, recent Notes suggesting the plan should be reshaped, or material
drift between the memjective and the codebase — present 2–3 candidate
slices with short rationales and wait for the user to pick. Do not barrel
ahead.

Keep the chosen slice:

- Coherent and landable in one session.
- Steelthreaded (end-to-end) when the memjective is an architectural
  redesign or migration and an end-to-end slice is possible.
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
  slug `clinkr-migration`).
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
- **Current branch already has a memjective snapshot** → abort in step 0
  with the precondition error; do not silently proceed.
- **Current branch has 2+ memjective snapshots** → abort in step 0;
  invalid v0 state.
- **Stale brmem refs** for deleted branches → dropped during step 2b by
  the `git rev-parse --verify` filter.
- **Branch with >1 memjective entry** (ancestor or master) → abort and
  surface; never pick silently.
- **Worktrees** — `git for-each-ref refs/brmem/...` is repo-global, so
  ancestor enumeration works correctly from any worktree.
- **Multiple ancestor snapshots on the branch stack** → choose the one
  with the smallest `git rev-list --count <branch>..HEAD`.
- **User explicitly names a slug** that exists only on master → use the
  master seed; label as _seed (master)_.
- **No memjectives anywhere** → ask the user for a source rather than
  silently returning nothing.

## Anti-patterns

- Running on a branch that already has a memjective snapshot. The strict
  precondition exists specifically to catch this mistake; the right skill
  there is `dev-memjective-peek` or `dev-memjective-update`.
- Editing the snapshot text while carrying it forward. Carry-forward is
  always an exact copy of a single source. Any reshaping is
  `dev-memjective-update`'s job after implementation lands.
- Implementing the slice before carrying forward. Attach the snapshot
  first, so the slice's work happens against a branch with a coherent
  memjective record.
- Choosing a source by timestamp or branch name instead of commit distance
  from `HEAD`.
- Skipping the step 3a summary. The user needs to see what got loaded
  before code starts changing.
- Barrelling ahead when the next slice is genuinely non-obvious. Present
  candidates and wait for the user.
- Using Graphite plumbing (`gt parent`, `gt ls`, graphite branch-config
  reads) for parent detection. Raw git only.
- Rewriting the master seed or any other branch's snapshot. `next` only
  writes the current branch's snapshot during carry-forward.
- Committing or pushing on the user's behalf. Leave commits and pushes to
  the user.
