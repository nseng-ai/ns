---
name: dev-memjective-next
description: "Read-only planning skill for memjectives. Resolve the active memjective from the current branch snapshot, otherwise the nearest ancestor branch snapshot in commit history, otherwise a master seed; summarize it so the user can confirm; lightly assess the codebase; then suggest the next PR-sized slice and a kebab-case branch slug. Warn on slug collisions, and when carry-forward is needed, print the exact `brmem put` command instead of writing anything. Use when the user wants to decide what to work on next, plan the next memjective slice, or prep a branch without starting implementation, especially on Graphite-style branch stacks."
allowed-tools:
  - "Bash(git rev-parse *)"
  - "Bash(git for-each-ref *)"
  - "Bash(git merge-base *)"
  - "Bash(git rev-list *)"
  - "Bash(brmem check *)"
  - "Bash(brmem get *)"
  - "Bash(brmem list *)"
  - "Read"
metadata:
  internal: true
---

<!-- INTERNAL SKILL: twerk-only. Local-first memjective prototype on top of brmem. -->

# dev-memjective-next

Read-only planning skill for the memjective prototype.

See the `dev-memjective` spec skill for shared vocabulary (seed vs. snapshot,
carry-forward, one-per-branch invariant).

## Goal

Resolve the active memjective, choose the next slice, and suggest a branch
slug for it. The skill never writes brmem, never creates branches, and never
implements work.

## Core rules

- **Read-only.** No `brmem put`, no branch creation, no git refs written, no
  checkbox edits. After the work lands, use `dev-memjective-update` (or edit
  the snapshot manually via `brmem put`).
- **Label the source.** Every output names where the memjective was read
  from: current-branch snapshot, ancestor-branch snapshot (with branch
  name), master seed, or local file.
- **Branch continuity first.** If the current branch has no snapshot, prefer
  the nearest ancestor branch snapshot in commit history. Consult `master`
  only when no ancestor snapshot exists.
- **One snapshot per branch.** If any candidate source branch has more than
  one entry in the `memjectives` namespace, abort and surface the invalid
  state instead of guessing.
- **Collision-safe slugs.** Before suggesting a slug, probe for existing
  branches and existing master seeds with that name. On a collision, warn
  and ask.
- **No Graphite dependency.** Parent detection uses raw git plumbing only.
- **Manual carry-forward.** If the current branch has no snapshot, this skill
  reads the source directly and prints the exact `brmem put` command to
  attach it. It does not attach anything on the user's behalf.

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

### 2. Resolve the memjective source

Use the strongest source available in this order: explicit user input,
current-branch snapshot, then fallback discovery.

#### 2a. Explicit user source

If the user explicitly names a source, resolve that directly instead of
guessing:

- a branch name: require exactly one memjective entry on that branch
- a master seed slug: read `<slug>.md` from `master`
- a local file path: read the file directly and label the source as
  _local file_

If the explicit source is invalid, stop and surface the problem instead of
falling through to discovery.

#### 2b. Current-branch snapshot

```bash
brmem list --namespace memjectives
```

`--branch` omitted so the current branch is used implicitly.

Decision rules:

- **0 matches** → continue to 2c.
- **1 match** → record the slug; label as _snapshot (current branch)_; skip
  to step 3.
- **2+ matches** → abort; the branch is in an invalid v0 state.

#### 2c. Fallback discovery

When the current branch has no snapshot, first look for ancestor branch
snapshots and continue from the nearest one in commit history. Only fall
back to master seeds if no ancestor snapshot exists.

##### Ancestor snapshots

Enumerate every `(branch, key)` pair that has a memjective entry:

```bash
git for-each-ref --format='%(refname)' refs/brmem/memjectives/
```

Each refname is `refs/brmem/memjectives/<encoded-branch>/<key>`. Extract
the `<encoded-branch>` segment (the 4th path component), decode `---` → `/`
to recover the real branch name, and pair it with `<key>`.

Filter the list:

- Drop entries where the branch is `master` (handled in step 2c as a seed,
  not a snapshot).
- Drop entries where the branch equals the current `<branch>` (already
  checked in 2b).
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
instead of presenting it as a candidate. This is the same
one-snapshot-per-branch rule already enforced in 2b.

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

The smallest count wins. This makes stacked branches behave naturally: if
`HEAD` descends from `a`, then `b`, then `c`, and only `b` and `c` have
snapshots, `c` wins because it is the closest in-flight state. If multiple
candidates tie for the smallest distance, list those tied candidates and ask
the user to choose.

##### Master seeds

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
brmem get <slug>.md --namespace memjectives --branch <source-branch>
```

`<source-branch>` is the branch chosen in 2a when the user named a branch,
the current branch for 2b, the nearest ancestor chosen in 2c, or `master`
for 2c fallback seeds. If step 2a resolved to a local file, read that file
directly instead.

Interpret the document's sections per the spec skill's **Document anatomy**.

### 3a. Report a summary to the user

Before planning, write a short summary of the loaded memjective back to the
user:

- Title and Status.
- The Intro paragraph(s).
- The Completion Criteria.
- The current state of the Status Checklist (which items are checked vs.
  open).

Also restate the source label from step 2 (for example
_snapshot (ancestor branch `clinkr-m1`)_, _seed (master)_, _local file_) so
the user can see what was loaded.

Keep the summary tight so the user can confirm the source at a glance. If the
user disagrees with the chosen source, return to step 2 and let them pick a
different candidate.

### 4. Assess the codebase lightly

Ground the next-slice choice; do not audit the whole repo. Skim the files
mentioned in the memjective's Status Checklist or Notes and confirm the
current state still matches the document. Surface only material drift.

### 5. Decide the next slice

Default to the first unchecked checklist item that still matches `How to Make
Progress`.

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

### 6. Suggest a branch slug

Generate a slug that names the slice, not the whole memjective. Slug rules:

- Lowercase ASCII, hyphen-separated.
- Concise and specific to the slice.
- No `.md` suffix.
- Usually ≤50 characters.
- Do not add redundant prefixes like `memjective-` or duplicate the parent
  memjective's slug verbatim. Use something that distinguishes this slice
  from sibling slices.

### 7. Collision-check the slug

Probe for collisions:

```bash
git rev-parse --verify --quiet refs/heads/<slug>
brmem check <slug>.md --namespace memjectives --branch master
```

If either returns success (a local branch already exists or a master seed
already uses that slug), **warn the user and ask how to proceed**:

- pick a different slug,
- append a numeric suffix (e.g., `<slug>-2`),
- proceed anyway (user's call).

Do not auto-resolve the collision.

### 8. Report

Output:

- **Source** — label + slug (e.g., _snapshot (ancestor branch `clinkr-m1`)_,
  slug `clinkr-migration`).
- **Chosen slice** — title + 1–2 sentence rationale. If the user picked
  from multiple candidates, name the alternatives that were considered.
- **Codebase drift** — only if material drift was found during step 4.
- **Suggested branch slug** — with the collision-check result.
- **Suggested follow-up** — tell the user to do the work, then run
  `dev-memjective-update`. If they want a fresh branch, name a
  branch-creation tool they already use (for example `gt create`,
  `dev-plan-to-branch`, or `dev-workbr-create`) based on how heavy the slice
  is.
- **Attach command** — only when the chosen source is not the current-branch
  snapshot, print:
  ```bash
  brmem get <slug>.md --namespace memjectives --branch <source-branch> > /tmp/<slug>.md
  brmem put <slug>.md --namespace memjectives --file /tmp/<slug>.md
  ```
  so the user can attach the memjective onto the current branch before
  running `dev-memjective-update`.

## Edge cases

- **Detached HEAD** → abort in step 1.
- **Stale brmem refs** for deleted branches → dropped during step 2c by the
  `git rev-parse --verify` filter.
- **Branch with >1 memjective entry** (current, ancestor, or master) →
  abort and surface; never pick silently.
- **Worktrees** — `git for-each-ref refs/brmem/...` is repo-global, so
  ancestor enumeration works correctly from any worktree.
- **Multiple ancestor snapshots on the branch stack** → choose the one with
  the smallest `git rev-list --count <branch>..HEAD`.
- **User explicitly names a slug** that exists only on master → use the
  master seed; label as _seed (master)_.
- **No memjectives anywhere** → ask the user for a source rather than
  silently returning nothing.

## Anti-patterns

- Writing anything to brmem. This skill is advisory only.
- Auto-resolving slug collisions. Always ask.
- Falling back to the master seed when a nearer ancestor snapshot exists.
- Ranking ancestor candidates by timestamp or branch name instead of commit
  distance from `HEAD`.
- Skipping the step 3a summary. The user needs to see what got loaded
  before planning continues.
- Letting the slug name the whole memjective instead of the current slice.
  Sibling slices need distinguishing names.
- Using Graphite plumbing (`gt parent`, `gt ls`, graphite branch-config
  reads) for parent detection. Raw git only.
- Barrelling ahead when the next slice is genuinely non-obvious. Present
  candidates and wait for the user.
