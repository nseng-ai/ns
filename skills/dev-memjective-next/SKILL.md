---
name: dev-memjective-next
description: "Run on a slice branch: carry the memjective snapshot forward onto the current branch via `brmem put`, choose the next slice from the roadmap, and implement it in-session. If the current branch already has a snapshot, propose a slug for the next slice, create a fresh branch using the project's branch-creation convention, and continue from there. See `dev-memjective` for the subsystem overview."
allowed-tools:
  - "Bash(git rev-parse *)"
  - "Bash(git for-each-ref *)"
  - "Bash(git merge-base *)"
  - "Bash(git rev-list *)"
  - "Bash(git log *)"
  - "Bash(git checkout *)"
  - "Bash(git branch *)"
  - "Bash(gt create *)"
  - "Bash(gt branch *)"
  - "Bash(gt track *)"
  - "Bash(brmem check *)"
  - "Bash(brmem copy *)"
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

Run from one of three starting branches:

- a **fresh slice branch** the user just created for the next slice — the
  skill carries the memjective forward and implements here;
- a **previous slice branch** that already holds a memjective snapshot —
  the skill cuts a new slice branch off it and continues there;
- an **off-topic parent branch** that has no memjective of its own but
  sits in a stack the user wants to build on — the skill cuts a new
  slice branch on top of it and continues there.

This skill:

1. Checks whether the current branch already has any memjective files,
   and in the 0-file case asks whether to implement on this branch
   (fresh slice) or stack a new slice branch on top (off-topic parent).
   In both stack-a-new-branch paths, proposes a slug, asks the user to
   confirm, creates the new branch using the project's branch-creation
   convention, and continues from there.
2. **Before cutting a new slice branch off an active `<prev>`** (the
   previous-slice-branch case), runs a cheap freshness check — if
   commits have landed on `<prev>` since the memjective was last
   touched, prompts once to run the `dev-memjective-update` workflow
   inline against `<prev>` before the cut. Silent no-op when already in
   sync; never fires in the off-topic-parent case.
3. Resolves the active memjective from an ancestor branch snapshot, or from
   the master-branch snapshot when no ancestor snapshot exists.
4. Copies every file under the resolved source's `<slug>/` verbatim onto
   the current branch with a single atomic `brmem copy` — `body.md`
   always, and each of `roadmap.md` / `notes.md` that exists on the
   source.
5. Picks the next PR-sized slice from the roadmap.
6. Implements the slice directly in the current session using normal
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

- Step 2 multi-slug picker (current branch has 2+ memjective slugs).
- Step 3b multi-ancestor tie (multiple ancestor branches have
  memjective snapshots).
- Step 3c multi-master picker (`master` has 2+ memjective snapshots).

Step 2b's source picker (0-slug stack-on-top case) reuses step 3b and
step 3c's discovery logic, so the slug arg auto-selects transitively
there too.

The slug arg identifies **which memjective** to progress. It does **not**
disambiguate step 2's here-vs-stack mode choice (fresh-slice vs
off-topic-parent) — that choice is always surfaced to the user when the
current branch has 0 memjective files and at least one carry-forward
source exists somewhere in the repo.

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
  first (see step 2) and continue the rest of the workflow from there.
  When the current branch carries 2+ distinct slugs, step 2 lets the user
  pick which slug to progress — the newly cut slice branch still holds
  exactly one memjective, preserving the invariant for new work.
- **Off-topic branches are valid starting points, but not implement-in-place
  targets.** When the current branch has 0 memjective files, step 2 asks
  whether it's a fresh slice branch (carry-forward writes to it, implement
  here) or an off-topic parent (carry-forward writes to a new slice branch
  stacked on top, implement there). The skill never guesses — it surfaces
  the choice.
- **Update on next.** Before cutting a new slice branch off a `<prev>`
  that holds an active memjective, run a cheap freshness check (brmem
  `head_date` vs branch HEAD commit time). If commits have landed since
  the memjective was last touched, prompt once; on confirmation, run the
  `dev-memjective-update` workflow on `<prev>` before the cut. The hook
  is silent when the memjective is already in sync and does **not** fire
  in the off-topic-parent case (§2b) — updating an ancestor's memjective
  that may belong to a different workstream is out of scope for `next`.

  **Master variant.** When `<prev>` is `master`, the freshness check
  itself is skipped (master's HEAD is virtually always newer than its
  snapshot, so the compare adds no signal) and the hook **always
  prompts** the user. On confirmation, `next` invokes
  `dev-memjective-update`'s **master-reconcile variant** (see that
  skill's §5a) — which gathers evidence from sibling-branch snapshots
  carrying the same slug before rewriting master's files
  conservatively. The user-confirmation gate is preserved; writes to
  master only happen on an explicit `[Y/n]` yes.
- **Carry-forward copies every file under the slug.** The brmem mutation
  this skill performs is an exact-copy carry-forward — one atomic
  `brmem copy` that transfers every file under `<slug>/`
  (`body.md`, and any of `roadmap.md` / `notes.md` that exist on the
  source). No edits to the text at attach time; no writes to the
  master-branch snapshot; no writes to any other branch.
- **Label the source.** The final report names where the memjective was
  read from: ancestor-branch snapshot (with branch name), master-branch
  snapshot, or local file.
- **Branch creation defers to the project convention.** When step 2 needs
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

### 1. Pre-flight: confirm repo + current branch

```bash
git rev-parse --show-toplevel
git rev-parse --abbrev-ref HEAD
```

Call the branch `<branch>`.

Abort if:

- not in a git repo
- the current branch is detached (`HEAD`)

### 2. Branch state check — fresh branch, or cut one

Step 2 is the session's entry-point state check. It runs **once** per
invocation. When §2a or §2b cuts a new slice branch, subsequent steps
(§3 onwards) execute on the new branch — step 2 itself does not re-run,
so its prompts never fire twice.

```bash
brmem list --namespace memjectives
```

`--branch` omitted so the current branch is used implicitly. Group the
returned keys by their `<slug>/` prefix — each distinct slug is one
memjective, regardless of how many files (body.md / roadmap.md / notes.md)
are attached.

Decision rules:

- **0 distinct slugs** → the current branch could be either a fresh slice
  branch the user just cut for the next slice, or an off-topic parent in
  a stack. Ask the user which:

  - **Implement on this branch** (fresh-slice case). Continue to step 3.
    Step 3 will discover the source from ancestors or master.
  - **Stack a new slice branch on top** (off-topic-parent case). Run
    §2b's cut-new-branch flow.

  Two short-circuits skip the prompt:

  - If no memjectives exist anywhere in the repo (no ancestor snapshots,
    no master-branch snapshots), the stack-on-top option is unavailable;
    fall through as fresh-slice and continue to step 3 (step 3c's
    0-snapshots rule will ask the user to name a source — or they
    probably want `dev-memjective-create`, not this skill).
  - If a slug arg was provided, it still does **not** pick the mode —
    the here-vs-stack choice is independent of which memjective is
    being progressed. Surface both options and let the user choose.

- **1 distinct slug** → current branch already holds a memjective. Do
  **not** abort. Instead, treat that slug as the **active slug** and run
  the update-then-cut flow below (§2a) — the cheap freshness check
  decides whether an inline `dev-memjective-update` runs against `<prev>`
  before the new branch is cut.
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
    update-then-cut flow below (§2a) against it. The branch's other
    memjective files stay attached to `<prev>` untouched — the user can
    come back and progress them in a future session.

#### 2a. Update-then-cut (active-slug case)

The current branch — call it `<prev>` — holds a memjective snapshot for
the **active slug** (`<slug>`) picked above (either the only slug, or the
one chosen from a 2+-slug picker), with `body.md` and possibly sibling
`roadmap.md` / `notes.md`. To continue the workstream, first decide
whether `<prev>`'s memjective needs to absorb work that landed since it
was last touched, then cut a new branch off `<prev>` and let discovery
(step 3b) pick up `<prev>`'s (possibly just-updated) snapshot for
`<slug>` as the ancestor source.

1. **Freshness signal.** Three-arm decision:

   - **`<prev>` is `master`** → skip the comparison; always prompt.
     Master's HEAD is virtually always newer than its snapshot (every
     merged PR lands there), so the compare adds no signal. Continue
     to step 2's master-variant prompt.
   - **`<prev>` is any other branch** → run the cheap freshness check:

     ```bash
     latest_mem_ts=$(
       for f in body.md roadmap.md notes.md; do
         brmem check <slug>/$f --namespace memjectives --format json 2>/dev/null \
           | jq -r '.data.head_date // empty'
       done | sort | tail -n1
     )

     head_ts=$(git log -1 --format=%cI HEAD)
     ```

     Compare as ISO 8601 strings (lexicographic sort is correct for
     the `%cI` / `head_date` format). Two sub-outcomes:

     - `head_ts <= latest_mem_ts` → **no update needed.** Log one
       line, e.g. _"memjective is up to date with HEAD"_, and skip
       to step 3.
     - `head_ts > latest_mem_ts` → **update may be warranted.**
       Continue to step 2's active-slug prompt.

2. **Conditional update.** Two variants, depending on `<prev>`.

   **Active-slug variant** (`<prev>` is a slice branch, freshness check
   tripped):

   > _N commits have landed on `<prev>` since the memjective was last
   > touched at `<latest_mem_ts>`. Run `dev-memjective-update` on
   > `<prev>` now? [Y/n]_

   **Master variant** (`<prev>` is `master`):

   > _You're on `master`. Run `dev-memjective-update`'s master-reconcile
   > variant to fold evidence from sibling-branch snapshots into
   > master's `<slug>` snapshot before cutting the slice branch?
   > [Y/n]_

   Default is **yes**. Accept yes/no:

   - **Yes** → run the `dev-memjective-update` workflow inline against
     the current branch (`<prev>`). Follow that skill's relevant steps
     verbatim: capture prior per-file commit SHAs (step 3), load the
     active files (step 4), gather sibling-branch evidence when
     `<prev>` is master (step 5a), apply the conservative rewrite per
     the per-file mutation contract (step 5), and persist any changed
     files back to brmem (step 6). Capture the per-file old → new
     commit SHAs for the §9 report. Do **not** duplicate the
     mutation-contract logic here — reference
     `dev-memjective-update`'s workflow.
   - **No** → skip the update and continue to step 3. Note the skip
     in the §9 report.

   Rationale for the prompt: on a slice branch, the cheap freshness
   signal can be noisy after a rebase or `git commit --amend` on
   `<prev>`, so a single confirmation keeps false positives from
   quietly mutating brmem state. On master, writes to the durable
   starting-point snapshot are higher-stakes and always deserve an
   explicit yes.

3. **Load `body.md` + `roadmap.md`** — read the **post-update** files
   (if step 2 ran an update) to pick the next slice:

   ```bash
   brmem get <slug>/body.md --namespace memjectives > /tmp/<slug>-body.md
   brmem get <slug>/roadmap.md --namespace memjectives > /tmp/<slug>-roadmap.md  # if present
   ```

   Read the files. Identify the next unchecked roadmap item in
   `roadmap.md` that still matches `body.md`'s `How to Make Progress`.
   Follow the slice-sizing guidance in step 7 (coherent, landable in one
   session, steelthreaded for large memjectives).

4. **Propose a kebab-case slug** for the new branch derived from the
   chosen roadmap item. Keep it short and descriptive — e.g., if the next
   roadmap item is _"Wire up the repo-discovery CLI command"_, a good slug
   is `wire-repo-discovery-cli`. Respect the project's branch-naming
   convention if there is one (the `graphite` skill recommends
   `feature-stack/terse-description` for grouped stacks, but a single-token
   slug is also fine for standalone slices).

5. **Ask the user to confirm.** Present: the next slice title, a one-line
   rationale, the proposed slug, and the branch name that will be created.
   Wait for confirmation. Accept a user-supplied slug and use it verbatim
   if provided.

   If the roadmap choice is non-obvious (multiple unchecked items at
   similar priority, recent Notes suggesting the plan should be reshaped,
   or material drift between the memjective and the codebase), offer 2–3
   candidate slices with slug suggestions and let the user pick.

6. **Create the branch** using the project's convention. In twerk, that's
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
   `gt create` — the slice's actual work comes later (step 8) and will be
   committed by the user.

   > **TODO:** make branch creation pluggable per project (config-driven
   > command, e.g. `gt create`, `git checkout -b`, `jj new`, etc.) rather
   > than hard-coding the twerk/graphite flow here. Acceptable to keep
   > hard-coded while this skill carries the `dev-` prefix; revisit before
   > graduating to a published (`memjective-next`) skill.

7. **Re-verify the precondition** on the new branch before proceeding:

   ```bash
   brmem list --namespace memjectives
   ```

   Expect 0 matches. If the new branch somehow already has any entry
   under a `<slug>/` prefix (extremely unlikely — would mean the slug
   collided with an existing key in the current snapshot's tree), abort
   and surface the collision so the user can pick a different slug.

8. **Continue at step 3** (Resolve source) on the new branch. Discovery
   in step 3b will see `<prev>` as an ancestor, find its (possibly
   just-updated) snapshot, and carry it forward.

#### 2b. Resolve-then-cut (off-topic-parent case)

The current branch — call it `<prev>` — has no memjective files, but the
user chose **stack a new slice branch on top** rather than implement here.
`<prev>` is unrelated work (a sibling feature commit, an in-flight
refactor, anything) that the user wants to stack the next slice onto.
Because `<prev>` carries no memjective, step 3b cannot find the source via
ancestry of the new branch — so §2b resolves the source **before** cutting
and passes it forward as an explicit user source for step 3a.

**The update-on-next hook does not fire in §2b.** `<prev>` holds no
memjective of its own, and the ancestor that does hold one may be owned
by a different workstream — writing to it here would be out of scope for
`next`. Jump straight to source resolution.

1. **Resolve the source now**, running against the current (off-topic)
   branch:

   - Run step 3b's ancestor discovery over the current branch's history.
     `<prev>` itself contributes 0 slugs, so it won't appear as a
     candidate, but older ancestors that carry memjective snapshots
     will. Apply the slug-arg hook if a slug arg was provided.
   - If step 3b produces 0 candidates, fall through to step 3c
     (master-branch snapshots). Apply the slug-arg hook.
   - If both 3b and 3c produce 0 candidates, the short-circuit in
     step 2's 0-slug rule should already have routed here as
     fresh-slice instead; abort §2b and tell the user there is
     nothing to carry forward.

   Let the chosen source be labeled `<source>` with slug `<slug>`.

2. **Load `<source>`** per step 4 (`body.md` always, plus `roadmap.md`
   and `notes.md` if present) into `/tmp/<slug>-*.md`.

3. **Propose a kebab-case slug for the new branch** derived from the
   next unchecked roadmap item in `<source>`'s `roadmap.md`. Follow
   §2a step 4's slug guidance.

4. **Ask the user to confirm.** Present: `<source>` label + slug, the
   chosen next slice title, a one-line rationale, the proposed branch
   name. Accept a user-supplied slug and use it verbatim if provided.

   If the roadmap choice is non-obvious, offer 2–3 candidate slices
   with slug suggestions and let the user pick (same as §2a step 5).

5. **Create the branch** per §2a step 6:

   ```bash
   gt create <slug>
   ```

   Fall back to `git checkout -b <slug>` if `gt create` refuses. Do
   not stage throwaway content just to satisfy `gt`.

6. **Re-verify the precondition** on the new branch per §2a step 7 —
   `brmem list --namespace memjectives` should return 0 entries.

7. **Continue at step 3** on the new branch, treating `<source>` as
   the **explicit user source for step 3a**. This bypasses step 3b /
   3c discovery on the new branch — they must not re-prompt the user,
   since the source was already chosen in §2b step 1. Steps 4, 5, 6,
   7, 8 then proceed normally.

### 3. Resolve the memjective source

Step 2 guarantees the current branch has zero memjective entries (either
because it was already fresh, or because §2a / §2b cut a new one). Three
sources remain, in order. When §2b cut the branch it also pre-seeded
`<source>` as the explicit step 3a source — in that case 3a resolves
immediately and 3b / 3c do not run.

#### 3a. Explicit user source

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

#### 3b. Ancestor snapshots

Enumerate every `(branch, key)` pair that has a memjective entry. Storage
is snapshot-shaped — one ref per `(namespace, branch)` — so enumeration is
a two-step walk: list the snapshot refs first, then read the keys inside
each snapshot's tree.

```bash
git for-each-ref --format='%(refname)' refs/brmem/ns/memjectives/
```

Each refname is `refs/brmem/ns/memjectives/<encoded-branch>`. Extract the
`<encoded-branch>` segment (the trailing path component), decode `---` →
`/` to recover the real branch name. Then list the keys on that snapshot
with `git ls-tree -r <refname>` — each path is a `<slug>/<filename>` key.
Group keys by `<slug>` per branch — one memjective per (branch, slug)
regardless of how many files are attached.

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
  and fall through to step 3c. Do not silently ignore the arg.

#### 3c. Master-branch snapshots

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

### 4. Load the memjective

Read every file that exists under the resolved source's `<slug>/`. Always
read `body.md`; probe for sibling files and read them when present:

```bash
brmem get <slug>/body.md --namespace memjectives --branch <source-branch> > /tmp/<slug>-body.md
brmem check <slug>/roadmap.md --namespace memjectives --branch <source-branch> \
  && brmem get <slug>/roadmap.md --namespace memjectives --branch <source-branch> > /tmp/<slug>-roadmap.md
brmem check <slug>/notes.md --namespace memjectives --branch <source-branch> \
  && brmem get <slug>/notes.md --namespace memjectives --branch <source-branch> > /tmp/<slug>-notes.md
```

`<source-branch>` is the branch chosen in 3a, the nearest ancestor chosen
in 3b, or `master` for 3c snapshots. If step 3a resolved to a local file,
copy that file into the appropriate temp path instead.

Interpret the documents per the spec skill's **Document anatomy** —
`body.md` is the stable spine, `roadmap.md` holds the slice plan,
`notes.md` holds durable findings.

### 5. Brief summary to the user

Before carrying forward, write a short summary back to the user so they can
confirm the source:

- Title and Status.
- Source label (from step 3).
- The current state of the roadmap (which items are checked vs. open).

Keep the summary tight. If the user disagrees with the chosen source, return
to step 3 and let them pick a different candidate.

### 6. Carry-forward: attach every file to the current branch

Capture the prior commit state of the namespace on the current branch for
the report:

```bash
brmem list --namespace memjectives
```

(Expected: still empty per the precondition.)

When the source is a brmem snapshot (3a branch, 3b ancestor, or 3c master),
carry the `memjectives` snapshot forward in a single atomic operation:

```bash
brmem copy \
  --namespace memjectives \
  --from-branch <source-branch> \
  --to-branch <branch>
```

`<source-branch>` is the branch chosen in 3a, the nearest ancestor chosen
in 3b, or `master` for 3c snapshots. The new destination refs point at the
same commit SHAs as the source — carry-forward is byte-identical by
construction. No `--overwrite` flag: the step-2 precondition already
guarantees zero destination entries in the `memjectives` namespace, and
the one-memjective-per-branch invariant means the source snapshot holds
exactly the slug being carried forward.

When the source resolved in 3a is a **local file**, fall back to a single
`brmem put` instead (there is no brmem snapshot to copy from):

```bash
brmem put <slug>/body.md --namespace memjectives --file <local-path>
```

In either path, the carried-forward text is a verbatim copy of the source
— no edits, no section rewrites, no section renames, no splitting or
merging across files. Any reshaping belongs to `dev-memjective-update`
after work lands, not to carry-forward.

Capture the destination ref / commit entries reported by `brmem copy` (or
the `brmem put` commit SHA, in the local-file branch) for the final
report.

### 7. Decide the next slice

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

### 8. Implement the slice

With the memjective snapshot attached and a slice chosen, implement the
slice directly in the current session using standard tooling (Edit, Write,
Bash, etc.). Follow the existing codebase conventions and any project-level
rules (lint, format, tests).

The session will typically end with the user committing the resulting
changes themselves. This skill does not commit or push on the user's
behalf.

### 9. Report

After implementation, summarize:

- **Source** — label + slug (e.g., _snapshot (ancestor branch `clinkr-m1`)_,
  slug `clinkr-followups`).
- **Update-on-next hook** — one of:
  - _fired (active-slug)_ — the cheap freshness check tripped on a
    non-master `<prev>`, the user accepted, and the inline
    `dev-memjective-update` workflow ran on `<prev>`. List per-file
    rewrites as `<slug>/<file>: <old-sha> → <new-sha>` for each file
    that was rewritten.
  - _fired (master-reconcile)_ — `<prev>` was master, the user
    accepted, and `dev-memjective-update`'s master-reconcile variant
    ran (§5a sibling-evidence gathering + §5 rewrite). List per-file
    rewrites on master as `<slug>/<file>: <old-sha> → <new-sha>`, and
    include a **Sibling evidence consulted** sub-section: for each
    sibling, `<branch>` — liveness (`live` / `orphaned-ref`), newest
    `head_date`, per-file verdict (`same` / `modified` /
    `sibling-only`), one-line contribution. Note siblings dropped as
    identical and the "plus K more (older)" bucket, if any.
  - _skipped (declined)_ — the prompt fired but the user declined. No
    writes to `<prev>`.
  - _no-op (in sync)_ — the cheap check (non-master branch) saw no new
    commits on `<prev>` since the memjective was last touched. Include
    the one-liner _"memjective was already in sync with HEAD"_. Does
    not apply on master (the check is skipped there and always
    prompts).
  - _n/a_ — the hook does not apply (fresh-slice case, §2b
    off-topic-parent case).
- **Carry-forward** — old state (namespace was empty on the current
  branch), which files were written (`body.md`, and optionally
  `roadmap.md` / `notes.md`), and the commit SHA each destination ref
  now points at (reported by `brmem copy`, or by the `brmem put` fallback
  for the local-file path), so the user can recover the attached snapshot
  if needed.
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
  Run step 2a to cut a new slice branch (with the update-on-next hook
  firing first if the freshness check trips, or unconditionally if
  `<prev>` is master), then continue at step 3 on the new branch.
- **Current branch is `master`** → not an abort. Step 2's 2+-slug or
  1-slug path runs as usual; step 2a's update-on-next hook fires in the
  master variant (skip the compare, always prompt), which routes to
  `dev-memjective-update`'s master-reconcile variant (§5a
  sibling-evidence gathering) on user confirmation.
- **Current branch has files for 2+ distinct memjective slugs** → step 2
  presents a picker; the user chooses which slug to progress. If a slug
  arg was provided in the invoking prompt and matches one of the slugs,
  step 2 auto-selects it. Either way, step 2a cuts a fresh slice branch
  for the chosen slug and the other memjectives stay on `<prev>`
  untouched. Not an abort.
- **Current branch has 0 memjective snapshots and is off-topic** (an
  unrelated feature branch the user wants to stack onto) → step 2 asks
  whether to implement here or stack a new slice branch on top. If the
  user picks stack-on-top, §2b resolves the source, cuts a new slice
  branch via `gt create`, and continues there. `<prev>` stays untouched.
- **Current branch has 0 memjective snapshots and no memjectives exist
  anywhere in the repo** → step 2 short-circuits to the fresh-slice
  path. Step 3c's 0-snapshots rule then asks the user to name a source,
  or the user should use `dev-memjective-create` instead.
- **Slug arg does not match any candidate** at the relevant decision
  point (step 2 multi-slug, step 3b multi-ancestor, step 3c multi-master)
  → list what is available, flag the mismatch, and fall back to the
  interactive flow. Do not silently ignore the arg.
- **Update hook prompt fires but user declines the update** → proceed
  to branch-cut; the §9 report notes the skip. `<prev>`'s memjective is
  unchanged from what was there before this session. Applies to both
  the active-slug variant (cheap check tripped) and the master variant
  (unconditional prompt).
- **Cheap freshness check signal is noisy after a rebase or
  `git commit --amend` on `<prev>`** → the prompt still fires; the user
  can decline and move on. The signal is advisory — a single
  confirmation is the cheap insurance against false positives. Does
  not apply on master (the compare is skipped there).
- **Master snapshot has no sibling branches** → §5a's enumeration
  returns 0 candidates. The master-reconcile variant still runs but
  has no evidence to fuse; the §5 rewrite ends up touching nothing (or
  only what the user explicitly confirms). Report in §9 as
  `fired (master-reconcile)` with an empty sibling list.
- **`<prev>` has only `body.md` (no `roadmap.md` / `notes.md`)** → the
  freshness check still works: the max `head_date` across whatever
  files exist is well-defined, and the single-file case compares
  `body.md`'s `head_date` directly against the branch HEAD commit time.
- **`gt create` refuses because there are no staged changes** → fall back
  to `git checkout -b <slug>` in step 2a. Never stage throwaway content
  just to satisfy `gt`.
- **User rejects the proposed slug** → take the user's slug verbatim and
  use it in step 2a.
- **User wants a different next slice** than the one proposed → present
  alternatives in step 2a, let the user pick, then derive the slug from
  their choice.
- **Stale brmem refs** for deleted branches → dropped during step 3b by
  the `git rev-parse --verify` filter.
- **Branch with >1 distinct memjective slug** (ancestor or master) →
  abort and surface; never pick silently. (The current-branch case is
  handled by the step 2 picker above; this rule still applies to
  ancestor branches enumerated in step 3b and to master-branch handling
  in step 3c.)
- **Worktrees** — `git for-each-ref refs/brmem/ns/...` is repo-global, so
  ancestor enumeration works correctly from any worktree.
- **Multiple ancestor snapshots on the branch stack** → choose the one
  with the smallest `git rev-list --count <branch>..HEAD`. If a slug
  arg was provided, filter to ancestors carrying that slug first (see
  step 3b's slug-argument hook).
- **User explicitly names a slug** that exists only on master → use the
  master-branch snapshot; label as _master-branch snapshot_.
- **No memjectives anywhere** → ask the user for a source rather than
  silently returning nothing.

## Anti-patterns

- Aborting when the current branch already has a memjective snapshot.
  That's now step 2a's job to resolve — cut a new slice branch and
  continue, don't push the user back to a shell. This applies whether
  the branch carries one slug or multiple; 2+ slugs is a picker, not a
  dead end.
- Silently implementing on an off-topic branch. When step 2 sees 0
  memjective files on the current branch, do not assume "fresh slice
  branch, implement here" — ask whether to implement here (fresh
  slice) or stack a new slice branch on top (off-topic parent). The
  only time the prompt is skipped is when no memjectives exist
  anywhere in the repo (nothing to stack).
- Using a slug arg to decide the here-vs-stack mode. The slug arg
  identifies which memjective to carry forward; it does not pick
  between fresh-slice and off-topic-parent. Always ask the user for
  the mode when step 2 sees 0 memjective files.
- Re-prompting the user on the new branch after §2a or §2b cuts it.
  Step 2 runs once per invocation; §2a and §2b hand off to step 3 on
  the new branch, and in §2b's case pre-seed `<source>` as step 3a's
  explicit source so 3b/3c do not re-ask.
- Silently ignoring a slug arg supplied in the invoking prompt. If the
  arg matches a candidate at the relevant decision point, auto-select
  it. If it doesn't, surface the mismatch and fall back — never drop
  the arg on the floor.
- Auto-running the update-on-next hook without user confirmation. The
  prompt is the cheap insurance against noisy timestamp signals
  (rebase, amend) on slice branches, and the gate against unintended
  writes to master's durable snapshot. Always ask once — whether the
  freshness check tripped or `<prev>` is master.
- Firing the update-on-next hook in the §2b off-topic-parent case. The
  ancestor source may belong to a different workstream — `next` does
  not mutate someone else's memjective on their behalf.
- Running the cheap freshness compare on master anyway. Master HEAD is
  always newer than its snapshot; the compare adds no signal and
  "trips" are not informative. Skip straight to the master-variant
  prompt.
- Invoking `dev-memjective-update`'s master-reconcile variant on a
  slice branch. The variant fires only when `<prev>` is master; on any
  other branch, use the normal `update` workflow grounded by the
  branch's own commit log.
- Copying a sibling snapshot verbatim onto master during a
  master-reconcile run. Sibling text is evidence, not source;
  carry-forward (exact-copy, single-source) is `next`'s job on slice
  branches, not `update`'s job on master.
- Loading `body.md` / `roadmap.md` for slice-picking **before** the
  update runs. Slice selection in §2a step 3 reads the post-update
  roadmap; running it earlier can pick a slice against a stale plan.
- Duplicating the `dev-memjective-update` workflow inline in §2a step 2
  instead of referencing that skill's steps 3–6 (and §5a for master).
  Keep the mutation contract in one place.
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
