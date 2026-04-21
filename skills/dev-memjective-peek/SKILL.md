---
name: dev-memjective-peek
description: "Lightweight read-only status inspector for memjectives. Resolves the active memjective from the current branch body, otherwise the nearest ancestor branch body in commit history, otherwise a master seed body; reports a short status summary (title, status, completion-criteria progress, checklist state) and a source label; then suggests a kebab-case branch slug for the next PR-sized slice. Reads sibling `meta.json` when present but does not require it. Warns on missing metadata and on slug collisions with existing branches or master seeds. Writes nothing and does not touch the working tree or assess the codebase. Use when the user wants a quick peek at the current memjective before deciding whether to open a new branch."
allowed-tools:
  - "Bash(git rev-parse *)"
  - "Bash(git for-each-ref *)"
  - "Bash(git merge-base *)"
  - "Bash(git rev-list *)"
  - "Bash(brmem check *)"
  - "Bash(brmem get *)"
  - "Bash(brmem list *)"
  - "Bash(rg *)"
  - "Read"
metadata:
  internal: true
---

<!-- INTERNAL SKILL: twerk-only. Local-first memjective prototype on top of brmem. -->

# dev-memjective-peek

Read-only status inspector + slug suggester for the memjective prototype.

See the `dev-memjective` spec skill for shared vocabulary (seed vs. snapshot,
body authority, repairable metadata, invalid states, carry-forward).

## Goal

Resolve the active memjective, report a short status summary so the user can
confirm it, and suggest a kebab-case branch slug for the next PR-sized slice.
Never write brmem, never touch the working tree, never assess the codebase.

`peek` is optional in the memjective lifecycle. Users who already know the
state can skip straight to creating a branch and running `dev-memjective-next`.

## Core rules

- **Read-only.** No `brmem put`, no branch creation, no git refs written, no
  checkbox edits, no file writes. Every output is advisory.
- **Body-first resolution.** Resolve memjectives from `*/body.md` only.
  `meta.json` may be read when present but is never required for resolution.
- **Missing metadata is a warning, not a blocker.** If a resolved body lacks
  sibling metadata, continue using the body and warn that metadata is missing.
- **Invalid structure is a blocker.** Abort on legacy flat `^[^/]+\.md$`
  memjective keys, orphaned `meta.json`, or multiple body entries on a branch.
- **Document-only, not repo-wide.** Peek is state-of-the-document, not
  state-of-the-repo. It does not open or grep source files to check progress.
- **Label the source.** Every output names where the memjective was read
  from: current-branch snapshot, ancestor-branch snapshot, master seed, or
  local file.
- **Branch continuity first.** If the current branch has no body, prefer the
  nearest ancestor branch body in commit history. Consult `master` only when no
  ancestor body exists.
- **Collision-safe slugs.** Before finalizing a slug, probe for existing
  branches and existing master seed bodies with that name. On a collision,
  warn and ask.
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
current-branch body, then fallback discovery.

#### 2a. Explicit user source

If the user explicitly names a source, resolve that directly instead of
guessing:

- a branch name: require exactly one `*/body.md` entry on that branch, no
  legacy flat keys, and no orphaned metadata
- a master seed slug: require `<slug>/body.md` on `master`, no legacy flat
  `<slug>.md`, and no orphaned `<slug>/meta.json`
- a local file path: read the file directly and label the source as
  _local file_

If the explicit source is invalid, stop and surface the problem instead of
falling through to discovery.

#### 2b. Current-branch body

```bash
brmem list --namespace memjectives
```

`--branch` omitted so the current branch is used implicitly.

Classify the results into:

- `*/body.md`
- `*/meta.json`
- legacy flat `^[^/]+\.md$`

Decision rules:

- **any legacy flat key** → abort with an unsupported-layout error
- **any `meta.json` without sibling `body.md`** → abort; invalid state
- **0 body matches** → continue to 2c
- **1 body match** → record the slug; label as _snapshot (current branch)_;
  skip to step 3
- **2+ body matches** → abort; invalid state

#### 2c. Fallback discovery

When the current branch has no body, first look for ancestor branch bodies and
continue from the nearest one in commit history. Only fall back to master seeds
if no ancestor body exists.

##### Ancestor bodies

Enumerate every memjective body ref:

```bash
git for-each-ref --format='%(refname)' refs/brmem/memjectives/
```

Keep only refnames ending in `/body.md`. Each refname is:

```text
refs/brmem/memjectives/<encoded-branch>/<slug>/body.md
```

Extract `<encoded-branch>` (the 4th path component), decode `---` → `/` to
recover the real branch name, and extract `<slug>` from the remaining path.

Filter the list:

- drop entries where the branch is `master` (handled below as a seed)
- drop entries where the branch equals the current `<branch>`
- drop entries where the branch no longer exists:
  ```bash
  git rev-parse --verify --quiet refs/heads/<B>
  ```
- keep only entries where the branch is an ancestor of `HEAD`:
  ```bash
  git merge-base --is-ancestor <B> HEAD
  ```

Before accepting any ancestor candidate, inspect that branch's namespace state
and abort if it contains:

- a legacy flat key
- more than one `*/body.md`
- `meta.json` without sibling `body.md`

Decision rules for ancestor candidates:

- **0 candidates** → continue to master seeds
- **1 candidate** → use it automatically and label it as
  _snapshot (ancestor branch `<B>`)_
- **2+ candidates** → rank them by commit distance from `HEAD` and use the
  nearest one automatically

Measure distance with:

```bash
git rev-list --count refs/heads/<B>..HEAD
```

The smallest count wins. If multiple candidates tie for the smallest distance,
list those tied candidates and ask the user to choose.

##### Master seeds

List master seed bodies only:

```bash
brmem list --namespace memjectives --branch master | rg '/body\.md$'
```

Before accepting a master seed, abort if the relevant slug on `master` also has
legacy flat state or orphaned metadata.

Decision rules:

- **0 seeds** → ask the user to name a branch, a master slug, or a local
  memjective file
- **1 seed** → use it automatically and label it as _seed (master)_
- **2+ seeds** → list them and ask the user to choose

### 3. Load the memjective

Read the resolved body:

```bash
brmem get <slug>/body.md --namespace memjectives --branch <source-branch>
```

`<source-branch>` is the branch chosen in 2a, the current branch for 2b, the
nearest ancestor chosen in 2c, or `master` for 2c fallback seeds. If step 2a
resolved to a local file, read that file directly instead.

Then try to read sibling metadata:

```bash
brmem get <slug>/meta.json --namespace memjectives --branch <source-branch>
```

If metadata is present, use it as advisory context. If it is missing, continue
from the body and warn that metadata is missing.

Interpret the body sections per the spec skill's **Document anatomy**.

### 4. Report a status summary

Write a short summary back to the user so they can confirm:

- **Source** — the label from step 2 and the slug
- **Title** — from the body
- **Status** — from the `Status:` line
- **Completion Criteria** — count checked vs. open, and list any remaining open
  criteria
- **Status Checklist** — the current state of the checklist, with unchecked
  items clearly flagged
- **Metadata warning** — only when `meta.json` was missing

Keep this tight. The goal is enough signal for the user to recognize the state
at a glance; it is not a full re-print of the document.

If the user disagrees with the chosen source, return to step 2 and let them
pick a different candidate.

### 5. Suggest a branch slug

Default to naming the slug after the first unchecked checklist item that still
matches `How to Make Progress`. If the choice is genuinely non-obvious
(multiple unchecked items at similar priority, recent Notes suggesting the plan
should be reshaped), present 2–3 candidate slugs with a one-line rationale
each and ask the user to pick.

Slug rules:

- lowercase ASCII, hyphen-separated
- concise and specific to the slice, not the whole memjective
- no `.md` suffix
- usually ≤50 characters
- do not add redundant prefixes like `memjective-` or duplicate the parent
  memjective's slug verbatim

### 6. Collision-check the slug

Probe for collisions:

```bash
git rev-parse --verify --quiet refs/heads/<slug>
brmem check <slug>/body.md --namespace memjectives --branch master
```

If either returns success, warn the user and ask how to proceed:

- pick a different slug
- append a numeric suffix (for example `<slug>-2`)
- proceed anyway

Do not auto-resolve the collision.

### 7. Report + next-step hint

Output:

- **Source** — label + slug
- **Status summary** — from step 4
- **Suggested branch slug** — with the collision-check result
- **Next steps** — tell the user, in this order:
  1. create a new branch with the suggested slug
  2. inside the new branch, run `dev-memjective-next` to carry the body
     forward, synthesize fresh metadata, and implement the slice
  3. after the slice lands, run `dev-memjective-update` to rewrite the body
     conservatively and refresh the metadata

## Edge cases

- **Detached HEAD** → abort in step 1.
- **Stale brmem refs** for deleted branches → dropped during step 2c by the
  `git rev-parse --verify` filter.
- **Branch with >1 body entry** (current, ancestor, or master) → abort and
  surface; never pick silently.
- **Branch with orphaned metadata** → abort and surface.
- **Branch with legacy flat keys** → abort with an unsupported-layout error.
- **Worktrees** — `git for-each-ref refs/brmem/...` is repo-global, so ancestor
  enumeration works correctly from any worktree.
- **Multiple ancestor bodies on the branch stack** → choose the one with the
  smallest `git rev-list --count <branch>..HEAD`.
- **User explicitly names a slug** that exists only on master → use the master
  seed body; label as _seed (master)_.
- **No memjectives anywhere** → ask the user for a source rather than silently
  returning nothing.

## Anti-patterns

- Writing anything to brmem. `peek` is advisory only.
- Treating `meta.json` as required for resolution. The body is authoritative.
- Treating orphaned metadata or legacy flat keys as warnings. They are hard
  errors.
- Auto-resolving slug collisions. Always ask.
- Falling back to the master seed when a nearer ancestor body exists.
- Ranking ancestor candidates by timestamp or branch name instead of commit
  distance from `HEAD`.
- Skipping the status summary. The user needs to see what got loaded before
  accepting the slug suggestion.
- Doing a codebase assessment or a file-level drift audit. That is
  `dev-memjective-next`'s job once implementation is starting.
- Running `peek` in place of `dev-memjective-next` on a freshly created slice
  branch. Once the branch exists, the user wants carry-forward + work.
