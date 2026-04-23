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

1. Checks whether the current branch already has any memjective files. If
   so, proposes a slug for the next slice, asks the user to confirm, creates
   a new branch using the project's branch-creation convention, and
   continues from that fresh branch.
2. Resolves the active memjective from an ancestor branch snapshot, or from
   the master-branch snapshot when no ancestor snapshot exists.
3. Copies every file under the resolved source's `<slug>/` verbatim onto
   the current branch via `brmem put` — `body.md` always, and each of
   `roadmap.md` / `notes.md` that exists on the source.
4. Picks the next PR-sized slice from the roadmap.
5. Implements the slice directly in the current session using normal
   tooling.

For a lightweight status check with no writes, use `dev-memjective-peek`
instead. For recording work after a slice has landed, use
`dev-memjective-update`.

## Arguments

The skill accepts an optional **slug argument** as a free-text fragment of
the invoking prompt — e.g., _"run dev-memjective-next for `widget-rewrite`"_
or _"progress the `foo-bar` memjective"_. There is no CLI flag; parse it
out of the prompt text the user invoked the skill with.

When a slug arg is present, use it to auto-select at three decision
points that would otherwise prompt:

- Step 0 multi-slug picker (current branch has 2+ memjective slugs).
- Step 2b multi-ancestor tie (multiple ancestor branches have
  memjective snapshots).
- Step 2c multi-master picker (`master` has 2+ memjective snapshots).

If a slug arg is present but does **not** match any candidate at the
relevant decision point, surface the mismatch (list the available slugs)
and fall back to the interactive prompt. Do not silently ignore the
arg, and do not silently fall through as if no arg was given.

When no slug arg is present, behavior at single-candidate decision points
is unchanged and multi-candidate decision points use the interactive
prompt flows described below.

## Core rules

- **One memjective per branch.** Carry-forward only ever writes to a branch
  that currently has zero entries under `memjectives/<slug>/`. If the
  current branch already has any file for the slug, cut a new slice branch
  first (see step 0) and continue the rest of the workflow from there.
  When the current branch carries 2+ distinct slugs, step 0 lets the user
  pick which slug to progress — the newly cut slice branch still holds
  exactly one memjective, preserving the invariant for new work.
- **Carry-forward copies every file under the slug.** The brmem mutations
  this skill performs are exact-copy carry-forwards — one `brmem put` per
  file (`body.md`, and any of `roadmap.md` / `notes.md` that exist on the
  source). No edits to the text at attach time; no writes to the
  master-branch snapshot; no writes to any other branch.
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

`--branch` omitted so the current branch is used implicitly. Group the
returned keys by their `<slug>/` prefix — each distinct slug is one
memjective, regardless of how many files (body.md / roadmap.md / notes.md)
are attached.

Decision rules:

- **0 distinct slugs** → fresh branch, continue to step 1.
- **1 distinct slug** → current branch already holds a memjective. Do
  **not** abort. Instead, treat that slug as the **active slug** and run
  the "cut a new slice branch" flow below, then restart at step 1 on the
  newly-created branch.
- **2+ distinct slugs** → do **not** abort. Present the slugs to the user
  and let them pick which memjective to progress:
  - For each slug, read `body.md`'s Title line so the list is meaningful,
    e.g., `brmem get <slug>/body.md --namespace memjectives | head -n 5`
    to get the heading. Render a short list: `<slug> — <title>`.
  - If a slug arg was provided in the invoking prompt (see **Arguments**
    above) and matches one of the listed slugs, auto-select it without
    prompting. If the arg does not match any listed slug, list what is
    available, flag the mismatch, and fall back to the interactive
    picker.
  - Otherwise ask the user to choose one.
  - Once a slug is chosen, treat it as the **active slug** and run the
    "cut a new slice branch" flow below against it. The branch's other
    memjective files stay attached to `<prev>` untouched — the user can
    come back and progress them in a future session.

#### 0a. Cut a new slice branch (active-slug case)

The current branch — call it `<prev>` — holds a memjective snapshot for
the **active slug** (`<slug>`) picked above (either the only slug, or the
one chosen from a 2+-slug picker), with `body.md` and possibly sibling
`roadmap.md` / `notes.md`. To continue the workstream, cut a new branch
off `<prev>` and let discovery (step 2b) pick up `<prev>`'s snapshot for
`<slug>` as the ancestor source.

1. **Load the current body + roadmap** to pick the next slice and derive a
   slug.

   ```bash
   brmem get <slug>/body.md --namespace memjectives > /tmp/<slug>-body.md
   brmem get <slug>/roadmap.md --namespace memjectives > /tmp/<slug>-roadmap.md  # if present
   ```

   Read the files. Identify the next unchecked roadmap item in
   `roadmap.md` that still matches `body.md`'s `How to Make Progress`.
   Follow the slice-sizing guidance in step 5 (coherent, landable in one
   session, steelthreaded for large memjectives).

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

   Expect 0 matches. If the new branch somehow already has any entry
   under a `<slug>/` prefix (extremely unlikely — would mean the slug
   collided with an existing refs/brmem path), abort and surface the
   collision so the user can pick a different slug.

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

- a branch name: require exactly one memjective slug on that branch (the
  slug may have multiple files under it)
- a master-branch snapshot slug: read every file under `<slug>/` from
  `master` (at minimum `body.md`, plus any of `roadmap.md` / `notes.md`
  that are present)
- a local file path: read the file directly and label the source as
  _local file_ — the file's content becomes the carried-forward `body.md`

If the explicit source is invalid, stop and surface the problem instead of
falling through to discovery.

#### 2b. Ancestor snapshots

Enumerate every `(branch, key)` pair that has a memjective entry:

```bash
git for-each-ref --format='%(refname)' refs/brmem/memjectives/
```

Each refname is
`refs/brmem/memjectives/<encoded-branch>/<slug>/<filename>`. Extract the
`<encoded-branch>` segment (the 4th path component), decode `---` → `/` to
recover the real branch name, and pair it with the trailing
`<slug>/<filename>` key. Group keys by `<slug>` per branch — one memjective
per (branch, slug) regardless of how many files are attached.

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

Invariant: if any single ancestor branch surfaces with more than one
distinct slug in the `memjectives` namespace, abort and surface the
invalid state instead of presenting it as a candidate.

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

**Slug argument hook.** If a slug arg was provided in the invoking prompt
(see **Arguments** above), filter the candidate list to ancestors whose
memjective slug equals the arg _before_ applying the distance-ranking /
tie-break rules above:

- If exactly one ancestor carries that slug, use it (label it
  _snapshot (ancestor branch `<B>`)_) and skip straight past the
  multi-candidate tie-break.
- If multiple ancestors carry that slug, keep only those and continue
  with distance ranking over the filtered list.
- If no ancestor carries that slug, the arg doesn't match anything here —
  surface the mismatch (list the slugs available on ancestor candidates)
  and fall through to step 2c. Do not silently ignore the arg.

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

**Slug argument hook.** If a slug arg was provided in the invoking prompt
(see **Arguments** above) and matches the slug of a master-branch
snapshot, use that snapshot directly and label it as
_master-branch snapshot_ — no prompt. If the arg does not match any
master-branch snapshot slug, surface the mismatch (list the available
master-branch slugs) and fall through to the decision rules above. Do
not silently ignore the arg.

### 3. Load the memjective

Read every file that exists under the resolved source's `<slug>/`. Always
read `body.md`; probe for sibling files and read them when present:

```bash
brmem get <slug>/body.md --namespace memjectives --branch <source-branch> > /tmp/<slug>-body.md
brmem check <slug>/roadmap.md --namespace memjectives --branch <source-branch> \
  && brmem get <slug>/roadmap.md --namespace memjectives --branch <source-branch> > /tmp/<slug>-roadmap.md
brmem check <slug>/notes.md --namespace memjectives --branch <source-branch> \
  && brmem get <slug>/notes.md --namespace memjectives --branch <source-branch> > /tmp/<slug>-notes.md
```

`<source-branch>` is the branch chosen in 2a, the nearest ancestor chosen
in 2b, or `master` for 2c snapshots. If step 2a resolved to a local file,
copy that file into the appropriate temp path instead.

Interpret the documents per the spec skill's **Document anatomy** —
`body.md` is the stable spine, `roadmap.md` holds the slice plan,
`notes.md` holds durable findings.

### 3a. Brief summary to the user

Before carrying forward, write a short summary back to the user so they can
confirm the source:

- Title and Status.
- Source label (from step 2).
- The current state of the roadmap (which items are checked vs. open).

Keep the summary tight. If the user disagrees with the chosen source, return
to step 2 and let them pick a different candidate.

### 4. Carry-forward: attach every file to the current branch

Capture the prior commit state of the namespace on the current branch for
the report:

```bash
brmem list --namespace memjectives
```

(Expected: still empty per the precondition.)

For every file read in step 3, copy it onto the current branch at the
matching `<slug>/<filename>` key under namespace `memjectives`:

```bash
brmem put <slug>/body.md --namespace memjectives --file /tmp/<slug>-body.md
# Only if the source had roadmap.md:
brmem put <slug>/roadmap.md --namespace memjectives --file /tmp/<slug>-roadmap.md
# Only if the source had notes.md:
brmem put <slug>/notes.md --namespace memjectives --file /tmp/<slug>-notes.md
```

`--branch` omitted so the current branch is used implicitly. Each file's
content must be a verbatim copy of the source text — no edits, no section
rewrites, no section renames, no splitting or merging across files. Any
reshaping belongs to `dev-memjective-update` after work lands, not to
carry-forward.

Capture every new commit SHA reported by `brmem put` for the final report.

### 5. Decide the next slice

Default to the first unchecked item in `roadmap.md` that still matches
`body.md`'s `How to Make Progress`.

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
  branch), which files were written (`body.md`, and optionally
  `roadmap.md` / `notes.md`), and each new `brmem put` commit SHA, so the
  user can recover the attached snapshot if needed.
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
- **Current branch has files for 2+ distinct memjective slugs** → step 0
  presents a picker; the user chooses which slug to progress. If a slug
  arg was provided in the invoking prompt and matches one of the slugs,
  step 0 auto-selects it. Either way, step 0a cuts a fresh slice branch
  for the chosen slug and the other memjectives stay on `<prev>`
  untouched. Not an abort.
- **Slug arg does not match any candidate** at the relevant decision
  point (step 0 multi-slug, step 2b multi-ancestor, step 2c multi-master)
  → list what is available, flag the mismatch, and fall back to the
  interactive flow. Do not silently ignore the arg.
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
- **Branch with >1 distinct memjective slug** (ancestor or master) →
  abort and surface; never pick silently. (The current-branch case is
  handled by the step 0 picker above; this rule still applies to
  ancestor branches enumerated in step 2b and to master-branch handling
  in step 2c.)
- **Worktrees** — `git for-each-ref refs/brmem/...` is repo-global, so
  ancestor enumeration works correctly from any worktree.
- **Multiple ancestor snapshots on the branch stack** → choose the one
  with the smallest `git rev-list --count <branch>..HEAD`. If a slug
  arg was provided, filter to ancestors carrying that slug first (see
  step 2b's slug-argument hook).
- **User explicitly names a slug** that exists only on master → use the
  master-branch snapshot; label as _master-branch snapshot_.
- **No memjectives anywhere** → ask the user for a source rather than
  silently returning nothing.

## Anti-patterns

- Aborting when the current branch already has a memjective snapshot.
  That's now step 0a's job to resolve — cut a new slice branch and
  continue, don't push the user back to a shell. This applies whether
  the branch carries one slug or multiple; 2+ slugs is a picker, not a
  dead end.
- Silently ignoring a slug arg supplied in the invoking prompt. If the
  arg matches a candidate at the relevant decision point, auto-select
  it. If it doesn't, surface the mismatch and fall back — never drop
  the arg on the floor.
- Creating the new slice branch without user confirmation of the slug.
  Always surface the proposed slug and the next slice first; accept the
  user's override.
- Staging or committing throwaway content just to make `gt create` happy.
  Use `git checkout -b` as the fallback when `gt` refuses an empty
  branch.
- Carrying forward only `body.md` when the source also has `roadmap.md`
  and/or `notes.md`. Carry-forward copies every file under `<slug>/`.
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
