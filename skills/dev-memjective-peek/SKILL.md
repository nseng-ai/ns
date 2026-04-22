---
name: dev-memjective-peek
description: "Read-only status inspector for memjectives. Resolves the active memjective from the current branch snapshot, the nearest ancestor branch snapshot, or the master-branch snapshot; reports a short status summary and suggests a kebab-case slug for the next slice. Writes nothing. See `dev-memjective` for the subsystem overview."
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

<!-- INTERNAL SKILL: twerk-only. Local-first memjective subsystem on top of brmem. -->

# dev-memjective-peek

Read-only status inspector + slug suggester for the memjective subsystem.

> For shared concepts — vocabulary (`snapshot`, `master-branch snapshot`,
> `per-branch snapshot`), the storage model, the one-memjective-per-branch
> invariant, carry-forward semantics, the lifecycle, and the mutation-contract
> summary — see `../dev-memjective/SKILL.md`.

## Goal

Resolve the active memjective, report a short status summary so the user can
confirm it, and suggest a kebab-case branch slug for the next PR-sized slice.
Never write brmem, never touch the working tree, never assess the codebase.

`peek` is optional in the memjective lifecycle. Users who already know the
state can skip straight to creating a branch and running `dev-memjective-next`.

## Core rules

- **Read-only.** No `brmem put`, no branch creation, no git refs written, no
  checkbox edits, no file writes. Every output is advisory.
- **Document-only, not repo-wide.** Peek is state-of-the-document, not
  state-of-the-repo. It does not open or grep source files to check progress
  — that is `dev-memjective-next`'s job once implementation starts.
- **Label the source.** Every output names where the memjective was read
  from: current-branch snapshot, ancestor-branch snapshot (with branch name),
  master-branch snapshot, or local file.
- **Collision-safe slugs.** Before finalizing a slug, probe for existing
  branches and existing master-branch snapshots with that name. On a
  collision, warn and ask.
- **No Graphite dependency.** Parent detection uses raw git plumbing only.

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
- a master-branch snapshot slug: read `<slug>/body.md` from `master`
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
- **2+ matches** → abort; the branch is in an invalid state.

#### 2c. Fallback discovery

When the current branch has no snapshot, first look for ancestor branch
snapshots and continue from the nearest one in commit history. Only fall
back to the master-branch snapshot if no ancestor snapshot exists.

##### Ancestor snapshots

Enumerate every `(branch, key)` pair that has a memjective entry:

```bash
git for-each-ref --format='%(refname)' refs/brmem/memjectives/
```

Each refname is `refs/brmem/memjectives/<encoded-branch>/<key>`. Extract
the `<encoded-branch>` segment (the 4th path component), decode `---` → `/`
to recover the real branch name, and pair it with `<key>`.

Filter the list:

- Drop entries where the branch is `master` (handled below as the
  master-branch snapshot, not an ancestor snapshot).
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
in the `memjectives` namespace, abort and surface the invalid state
instead of presenting it as a candidate. This is the same
one-snapshot-per-branch rule already enforced in 2b.

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

##### Master-branch snapshots

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
brmem get <slug>/body.md --namespace memjectives --branch <source-branch>
```

`<source-branch>` is the branch chosen in 2a when the user named a branch,
the current branch for 2b, the nearest ancestor chosen in 2c, or `master`
for 2c fallback snapshots. If step 2a resolved to a local file, read that
file directly instead.

Interpret the document's sections per the spec skill's **Document anatomy**.

### 4. Report a status summary

Write a short status summary back to the user so they can confirm:

- **Source** — the label from step 2 (e.g., _snapshot (ancestor branch
  `clinkr-m1`)_, _master-branch snapshot_, _local file_) and the slug.
- **Title** — from the memjective document.
- **Status** — from the `Status:` line.
- **Description / Goals summary** — only if it adds signal; keep it to one
  short sentence or 1–2 bullets.
- **Completion Criteria** — count checked vs. open, and list any remaining
  open criteria.
- **Roadmap** — the current roadmap state, with unchecked items clearly
  flagged so the user can see what is left.

Keep this tight. The goal is enough signal for the user to recognize the
state at a glance; it is not a full re-print of the document.

If the user disagrees with the chosen source, return to step 2 and let them
pick a different candidate.

### 5. Suggest a branch slug

Default to naming the slug after the first unchecked roadmap slice that still
matches `How to Make Progress`.

If the choice is genuinely non-obvious (multiple unchecked items at similar
priority, recent Notes suggesting the plan should be reshaped), present 2–3
candidate slugs with a one-line rationale each and ask the user to pick.

Slug rules:

- Lowercase ASCII, hyphen-separated.
- Concise and specific to the slice, not the whole memjective.
- No `.md` suffix.
- Usually ≤50 characters.
- Do not add redundant prefixes like `memjective-` or duplicate the parent
  memjective's slug verbatim. Use something that distinguishes this slice
  from sibling slices.

### 6. Collision-check the slug

Probe for collisions:

```bash
git rev-parse --verify --quiet refs/heads/<slug>
brmem check <slug>/body.md --namespace memjectives --branch master
```

If either returns success (a local branch already exists or a master-branch
snapshot already uses that slug), **warn the user and ask how to proceed**:

- pick a different slug,
- append a numeric suffix (e.g., `<slug>-2`),
- proceed anyway (user's call).

Do not auto-resolve the collision.

### 7. Report + next-step hint

Output:

- **Source** — label + slug (e.g., _snapshot (ancestor branch `clinkr-m1`)_,
  slug `clinkr-followups`).
- **Status summary** — from step 4.
- **Suggested branch slug** — with the collision-check result.
- **Next steps** — tell the user, in this order:

  1. Create a new branch with the suggested slug (using their preferred
     tool: `gt create <slug>`, `git checkout -b <slug>`, or similar).
  2. Inside the new branch, run `dev-memjective-next` to carry the
     memjective snapshot forward onto that branch and implement the slice.
  3. After the slice lands, run `dev-memjective-update` to snapshot the work.

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
  master-branch snapshot; label as _master-branch snapshot_.
- **No memjectives anywhere** → ask the user for a source rather than
  silently returning nothing.

## Anti-patterns

- Writing anything to brmem. `peek` is advisory only. The carry-forward
  write belongs to `dev-memjective-next`.
- Auto-resolving slug collisions. Always ask.
- Falling back to the master-branch snapshot when a nearer ancestor snapshot
  exists.
- Ranking ancestor candidates by timestamp or branch name instead of commit
  distance from `HEAD`.
- Skipping the status summary. The user needs to see what got loaded before
  accepting the slug suggestion.
- Doing a codebase assessment or a file-level drift audit. That is
  `dev-memjective-next`'s job once implementation is starting. `peek` stays
  document-only.
- Running `peek` in place of `dev-memjective-next` on a freshly created
  slice branch. Once the user has opened the slice branch, they want to
  carry-forward and implement, which is `next`'s job.
- Using Graphite plumbing (`gt parent`, `gt ls`, graphite branch-config
  reads) for parent detection. Raw git only.
- Letting the slug name the whole memjective instead of the current slice.
  Sibling slices need distinguishing names.
