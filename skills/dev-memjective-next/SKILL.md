---
name: dev-memjective-next
description: "Run on a freshly created slice branch to carry the memjective body forward, synthesize fresh metadata, and implement the next chunk of work. Strict precondition: aborts if the current branch already has any `*/body.md` entry in namespace `memjectives`, any orphaned `meta.json`, or any legacy flat `<slug>.md` key. Resolves the memjective from the nearest ancestor branch body in commit history, otherwise a master seed body (raw git only, no Graphite dependency). Copies the resolved body verbatim onto the current branch at `memjectives/<slug>/body.md`, writes fresh branch metadata to `memjectives/<slug>/meta.json`, picks the next PR-sized slice, and then implements the slice in the current session using normal tooling."
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

Carry the memjective body onto a freshly created slice branch, synthesize fresh
metadata, then implement the next chunk of work.

See the `dev-memjective` spec skill for shared vocabulary (seed vs. snapshot,
body authority, repairable metadata, invalid states, carry-forward).

## Goal

Run **on a fresh slice branch** — the branch the user just created to hold the
next slice. This skill:

1. Refuses to run if the current branch already has a memjective body, orphaned
   metadata, or legacy flat memjective keys.
2. Resolves the active memjective from an ancestor branch body, or from a
   master seed body when no ancestor body exists.
3. Copies the resolved body verbatim onto the current branch.
4. Writes fresh metadata for the destination branch.
5. Picks the next PR-sized slice.
6. Implements the slice directly in the current session using normal tooling.

For a lightweight status check with no writes, use `dev-memjective-peek`
instead. For recording work after a slice has landed, use
`dev-memjective-update`.

## Core rules

- **Strict precondition: must be run on a fresh slice branch.** If the current
  branch already has any `*/body.md` entry in `memjectives`, abort with a clear
  fresh-branch error.
- **Legacy flat keys are unsupported.** If the current branch contains any
  `^[^/]+\.md$` memjective key, abort with an unsupported-layout error.
- **Orphaned metadata is invalid.** If the current branch contains
  `*/meta.json` without sibling `*/body.md`, abort.
- **Writes exactly two brmem entries.** The only brmem mutations this skill
  performs are:
  - exact-copy carry-forward of the resolved source body to
    `<slug>/body.md`
  - fresh destination metadata at `<slug>/meta.json`
- **Body copy is exact.** No edits to the body at attach time. Any reshaping
  belongs to `dev-memjective-update` after work lands.
- **Label the source.** The final report names where the memjective was read
  from: ancestor-branch snapshot, master seed, or local file.
- **Branch continuity first.** Prefer the nearest ancestor branch body in
  commit history. Consult `master` only when no ancestor body exists.
- **No Graphite dependency.** Parent detection uses raw git plumbing only.
- **Implement in-session.** After the carry-forward lands, do the slice's work
  here using Edit / Write / Bash as the task requires.

## Workflow

### 0. Precondition: current branch must have no memjective body

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
- **0 body matches** → continue. This is the fresh-slice-branch state the
  skill expects.
- **1 body match** → abort with a message like:

  ```text
  dev-memjective-next must be run on a fresh slice branch. Current branch
  <branch> already has memjective body <slug>/body.md. Use
  dev-memjective-peek to inspect, dev-memjective-update to record progress,
  or check out a new branch.
  ```

- **2+ body matches** → abort; invalid state

### 1. Pre-flight: confirm repo + current branch

```bash
git rev-parse --show-toplevel
git rev-parse --abbrev-ref HEAD
git rev-parse HEAD
```

Call the branch `<branch>` and the current HEAD `<baseline-head-sha>`.

Abort if:

- not in a git repo
- the current branch is detached (`HEAD`)

### 2. Resolve the memjective source

The precondition in step 0 already ruled out the current-branch case. Sources
remain in this order.

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

#### 2b. Ancestor bodies

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
- drop entries where the branch equals the current `<branch>` (already ruled
  out by the precondition)
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

#### 2c. Master seeds

List master seed bodies only:

```bash
brmem list --namespace memjectives --branch master | rg '/body\.md$'
```

Before accepting a master seed, abort if the relevant slug on `master` also has
legacy flat state or orphaned metadata.

Decision rules:

- **0 seeds** → ask the user to name a branch, a master slug, or a local file
- **1 seed** → use it automatically and label it as _seed (master)_
- **2+ seeds** → list them and ask the user to choose

### 3. Load the memjective

Read the resolved body into a temp file:

```bash
brmem get <slug>/body.md --namespace memjectives --branch <source-branch> > /tmp/<slug>-body.md
```

If metadata exists, read it too:

```bash
brmem get <slug>/meta.json --namespace memjectives --branch <source-branch> > /tmp/<slug>-meta.json
```

If source metadata is missing, continue using the body and note that
`body_updated_at` will be synthesized during carry-forward.

If step 2a resolved to a local file, copy that file to the temp body path and
proceed without source metadata unless the user explicitly provided it.

Interpret the body's sections per the spec skill's **Document anatomy**.

### 3a. Brief summary to the user

Before carrying forward, write a short summary back to the user so they can
confirm the source:

- title and status
- source label
- the current state of the status checklist
- metadata warning only when source metadata is missing

Keep the summary tight. If the user disagrees with the chosen source, return to
step 2 and let them pick a different candidate.

### 4. Carry-forward onto the current branch

Write the resolved body verbatim onto the current branch:

```bash
brmem put <slug>/body.md --namespace memjectives --file /tmp/<slug>-body.md
```

Then synthesize fresh destination metadata per
`../dev-memjective/references/meta-schema.md` and write it to a temp file:

```json
{
  "schema_version": 1,
  "slug": "<slug>",
  "kind": "snapshot",
  "branch": "<branch>",
  "parent_branch": "<best-effort-parent-or-null>",
  "source_branch": "<resolved-source-branch-or-null>",
  "baseline_head_sha": "<baseline-head-sha>",
  "body_updated_at": "<source-body-updated-at-or-now>",
  "meta_updated_at": "<now>"
}
```

Rules for the metadata values:

- `kind` is always `"snapshot"`
- `branch` is the current branch
- `source_branch` is the resolved source branch when available, otherwise
  `null`
- `parent_branch` is best-effort, otherwise `null`
- `baseline_head_sha` is the current branch `HEAD` captured in step 1, before
  implementation starts
- `body_updated_at` comes from source metadata when present, otherwise `now`
- `meta_updated_at` is always `now`

Write the metadata:

```bash
brmem put <slug>/meta.json --namespace memjectives --file /tmp/<slug>-meta.json
```

Capture both commit SHAs for the final report.

### 5. Decide the next slice

Default to the first unchecked checklist item that still matches
`How to Make Progress`.

**When the choice is non-obvious** — multiple unchecked items at similar
priority, recent Notes suggesting the plan should be reshaped, or material
drift between the memjective and the codebase — present 2–3 candidate slices
with short rationales and wait for the user to pick. Do not barrel ahead.

Keep the chosen slice:

- coherent and landable in one session
- steelthreaded when the memjective is an architectural redesign or migration
  and an end-to-end slice is possible
- small enough that a future `dev-memjective-update` session can conservatively
  reflect it in the snapshot

### 6. Implement the slice

With the memjective snapshot attached and a slice chosen, implement the slice
directly in the current session using standard tooling. Follow the existing
codebase conventions and any project-level rules.

This skill does not commit or push on the user's behalf.

### 7. Report

After implementation, summarize:

- **Source** — label + slug
- **Carry-forward** — new body and meta commit SHAs, plus a note when
  `body_updated_at` had to be synthesized because source metadata was missing
- **Chosen slice** — title + 1–2 sentence rationale
- **What was implemented** — a brief summary of files touched and behavior
  changed
- **Next step** — tell the user to run `dev-memjective-update` on this branch
  after committing, or once they are satisfied with the slice, to rewrite the
  body conservatively and refresh the metadata

## Edge cases

- **Detached HEAD** → abort in step 1.
- **Current branch already has a memjective body** → abort in step 0 with the
  precondition error; do not silently proceed.
- **Current branch has orphaned metadata** → abort in step 0.
- **Current branch has legacy flat keys** → abort in step 0.
- **Current branch has 2+ memjective bodies** → abort in step 0; invalid state.
- **Stale brmem refs** for deleted branches → dropped during step 2b by the
  `git rev-parse --verify` filter.
- **Ancestor or master source has invalid structure** → abort and surface it;
  never pick silently.
- **Worktrees** — `git for-each-ref refs/brmem/...` is repo-global, so ancestor
  enumeration works correctly from any worktree.
- **Multiple ancestor bodies on the branch stack** → choose the one with the
  smallest `git rev-list --count <branch>..HEAD`.
- **User explicitly names a slug** that exists only on master → use the master
  seed body; label as _seed (master)_.
- **No memjectives anywhere** → ask the user for a source rather than silently
  returning nothing.

## Anti-patterns

- Running on a branch that already has a memjective body. The strict
  precondition exists specifically to catch this mistake.
- Treating legacy flat keys as a valid source.
- Editing the body while carrying it forward. Carry-forward is always an exact
  copy of one source body.
- Writing only the body and forgetting to synthesize destination metadata.
- Implementing the slice before carrying forward. Attach the memjective first.
- Choosing a source by timestamp or branch name instead of commit distance from
  `HEAD`.
- Skipping the step 3a summary. The user needs to see what got loaded before
  code starts changing.
- Barrelling ahead when the next slice is genuinely non-obvious. Present
  candidates and wait for the user.
- Rewriting the master seed or any other branch's entries. `next` only writes
  the current branch's body and metadata.
- Committing or pushing on the user's behalf. Leave commits and pushes to the
  user.
