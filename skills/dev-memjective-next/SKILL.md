---
name: dev-memjective-next
description: "Decide what to work on next for a local-first memjective, and suggest a branch slug for the work. Resolves the active memjective by walking sources in order: current-branch snapshot → nearest ancestor branch with a snapshot (raw git, no Graphite dependency) → master-branch seed → ask. Reads the memjective, lightly assesses the codebase, proposes the next PR-sized slice (with user feedback when non-obvious), and prints a kebab-case slug plus a suggested follow-up (`dev-memjective-update`, a branch-creation skill, or manual `brmem put` for carry-forward). Warns on slug collisions with existing branches or seeds and asks the user how to proceed. Read-only — writes nothing to brmem or git. Use when the user wants to plan the next slice of a memjective, pick what to work on next, or prep a branch for the next step without committing to implementation. Does **not** implement work (do that between `next` and `update`) and does **not** rewrite the memjective snapshot (that's `dev-memjective-update`)."
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

Advisory, **read-only** planning skill for the memjective prototype.

See the `dev-memjective` spec skill for shared vocabulary (seed vs. snapshot,
carry-forward, one-per-branch invariant).

## Goal

Given the active memjective for the current branch (from wherever it can be
read), decide what to work on next and suggest a branch slug for the work.

The skill never mutates brmem, never creates branches, and never implements
work. It produces advice the user can act on.

## Core rules

- **Read-only.** No `brmem put`, no branch creation, no git refs written, no
  checkbox toggling in the memjective document. If the user wants a change
  landed, they run `dev-memjective-update` after the work is complete (or
  edit the snapshot manually via `brmem put`).
- **Label the source.** Every output names where the memjective was read
  from: current-branch snapshot, ancestor-branch snapshot (with branch name
  and distance), or master seed.
- **One snapshot per branch.** If any candidate source branch has more than
  one entry in the `memjectives` namespace, abort and surface the invalid
  state instead of guessing.
- **Collision-safe slugs.** Before suggesting a slug, probe for existing
  branches and existing master seeds with that name. On a collision, warn
  and ask.
- **No Graphite dependency.** Parent detection uses raw git plumbing only.
- **No carry-forward side-effect.** If the current branch has no snapshot,
  this skill reads the source directly and prints the exact `brmem put`
  command the user can run to attach it. It does not attach on the user's
  behalf.

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

Walk these steps in order. Stop at the first one that succeeds.

#### 2a. Current-branch snapshot

```bash
brmem list --namespace memjectives
```

`--branch` omitted so the current branch is used implicitly.

Decision rules:

- **0 matches** → continue to 2b.
- **1 match** → record the slug; label as _snapshot (current branch)_; skip
  to step 3.
- **2+ matches** → abort; the branch is in an invalid v0 state.

#### 2b. Nearest ancestor branch with a snapshot

Enumerate every branch that has a memjective entry:

```bash
git for-each-ref --format='%(refname)' refs/brmem/memjectives/
```

Each refname is `refs/brmem/memjectives/<encoded-branch>/<key>`. Extract the
`<encoded-branch>` segment (the 4th path component), deduplicate, and decode
`---` → `/` to recover the real branch name.

For each candidate branch `B`:

1. Skip `B == master` (master is handled in step 2c as a seed, not a
   snapshot).
2. Skip `B == <branch>` (the current branch was already checked).
3. Confirm the branch still exists:
   ```bash
   git rev-parse --verify --quiet refs/heads/<B>
   ```
   Drop stale refs where this fails.
4. Confirm `B` is an ancestor of `HEAD`:
   ```bash
   git merge-base --is-ancestor <B> HEAD
   ```
   Drop non-ancestors.
5. Measure distance:
   ```bash
   git rev-list --count <B>..HEAD
   ```

Rank the surviving candidates by distance ascending. The smallest wins.
Tie-break: prefer the branch whose tip is itself an ancestor of the other
tied candidates (topologically closest); if still tied, lexicographic order.

Before using the winner, confirm it has exactly one memjective entry:

```bash
brmem list --namespace memjectives --branch <winner>
```

- **0 matches** → should not happen (we found a ref). Treat as stale and
  drop.
- **1 match** → record the slug; label as
  _snapshot (ancestor branch `<winner>`, N commits behind HEAD)_; skip to
  step 3.
- **2+ matches** → abort; the ancestor branch is in an invalid v0 state.

If no ancestor candidates survive, continue to 2c.

#### 2c. Master-branch seed

```bash
brmem list --namespace memjectives --branch master
```

- **0 matches** → continue to 2d.
- **1 match** → record the slug; label as _seed (master)_; skip to step 3.
- **2+ matches** → if the user named a slug explicitly, use that one; else
  list the available slugs and ask.

If the user named a slug explicitly for any reason, prefer reading from the
master seed with that slug (step 2c) over an ancestor snapshot — an explicit
slug signals the user wants the canonical starting point.

#### 2d. Ask the user

If none of 2a–2c succeeded, ask the user to name a source — a branch, a
slug on master, or a path to a local memjective file.

### 3. Load the memjective

Read the resolved memjective text:

```bash
brmem get <slug>.md --namespace memjectives --branch <source-branch>
```

`<source-branch>` is the current branch for 2a, the ancestor for 2b, or
`master` for 2c.

Interpret the document's sections per the spec skill's **Document anatomy**.

### 4. Assess the codebase lightly

The goal is to ground the next-slice choice, not to audit the whole repo.
Skim the files mentioned in the memjective's Status Checklist or Notes and
confirm the current state matches what the memjective claims. Surface
drift in the report if it is material.

### 5. Decide the next slice

Prefer the first unchecked item on the Status Checklist that matches the
`How to Make Progress` recipe.

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

- **Source** — label + slug (e.g., _snapshot (ancestor branch `clinkr-m1`, 3
  commits behind HEAD)_, slug `clinkr-migration`).
- **Chosen slice** — title + 1–2 sentence rationale. If the user picked
  from multiple candidates, name the alternatives that were considered.
- **Codebase drift** — only if material drift was found during step 4.
- **Suggested branch slug** — with the collision-check result.
- **Suggested follow-up** —
  - If the user plans to work on the current branch, run the work, then
    `dev-memjective-update`.
  - If the user plans to spin up a new branch for the slice, name a
    branch-creation tool the user already uses (e.g., `gt create`,
    `dev-plan-to-branch`, `dev-workbr-create`) — pick based on how heavy
    the slice is.
  - If carry-forward is needed (step 2 resolved to an ancestor snapshot or
    master seed and the user intends to work on the current branch), print
    the exact command:
    ```bash
    brmem get <slug>.md --namespace memjectives --branch <source-branch> > /tmp/<slug>.md
    brmem put <slug>.md --namespace memjectives --file /tmp/<slug>.md
    ```
    so the user can attach the memjective onto the current branch before
    running `dev-memjective-update`.

## Edge cases

- **Detached HEAD** → abort in step 1.
- **Stale brmem refs** for deleted branches → dropped during step 2b by the
  `git rev-parse --verify` filter.
- **Tied ancestor distances** → topological proximity first, then
  lexicographic.
- **Branch with >1 memjective entry** (current, ancestor, or master) →
  abort and surface; never pick silently.
- **Worktrees** — `git for-each-ref refs/brmem/...` is repo-global, so
  ancestor enumeration works correctly from any worktree.
- **User explicitly names a slug** that exists only on master (no ancestor
  snapshot) → use the master seed; label as _seed (master)_.
- **No memjectives anywhere** → step 2d asks the user for a source rather
  than silently returning nothing.

## Anti-patterns

- Writing anything to brmem. This skill is advisory only.
- Auto-resolving slug collisions. Always ask.
- Silently picking among ancestor branches when any of them has multiple
  memjective entries — abort instead.
- Letting the slug name the whole memjective instead of the current slice.
  Sibling slices need distinguishing names.
- Using Graphite plumbing (`gt parent`, `gt ls`, graphite branch-config
  reads) for parent detection. Raw git only.
- Barrelling ahead when the next slice is genuinely non-obvious. Present
  candidates and wait for the user.
