---
name: dev-memjective-next
description: Command
allowed-tools:
  - "Bash(git rev-parse *)"
  - "Bash(git for-each-ref *)"
  - "Bash(git merge-base *)"
  - "Bash(git rev-list *)"
  - "Bash(git log *)"
  - "Bash(brmem check *)"
  - "Bash(brmem get *)"
  - "Bash(brmem list *)"
  - "Read"
metadata:
  internal: true
---

<!-- INTERNAL SKILL: twerk-only. Local-first memjective subsystem on top of brmem. -->

# dev-memjective-next

Read-only inspect + recommend for the memjective subsystem.

> For shared concepts — vocabulary (`snapshot`, `master-branch snapshot`,
> `per-branch snapshot`), the storage model, the document anatomy, the
> lifecycle, carry-forward semantics, and the per-operation mutation contract
> — see `../dev-memjective/SKILL.md`.

## Goal

Resolve the active source for a named memjective slug, report a short status
summary so the user can confirm it, flag staleness when the resolved source
is a non-master snapshot trailing its branch HEAD, and recommend a
kebab-case slug for the next PR-sized slice.

`next` writes nothing — no `brmem put`, no `brmem copy`, no branch creation,
no checkbox edits, no working-tree changes. Every output is advisory. To
attach a snapshot to a branch, run `dev-memjective-claim`. To rewrite a
snapshot after a slice lands, run `dev-memjective-update` (slice branches)
or `dev-memjective-reconcile` (master).

`next` is optional in the lifecycle. A user who already knows the state
can skip straight from `claim` to implementing the slice, and run `update`
afterwards.

## Arguments

`next` requires the **memjective slug** as an explicit positional argument,
parsed from the invoking prompt — e.g., _"run dev-memjective-next for
`widget-rewrite`"_ or _"peek the `foo-bar` memjective"_. There is no CLI
flag; pull the slug out of the prompt text.

The slug is **always explicit**. Many-to-many is allowed in the storage
model (a single branch can carry multiple distinct slugs), so `next` does
not auto-pick a slug even when the resolved source has only one — the slug
arg disambiguates which memjective to inspect.

If the invoking prompt does not contain a slug, abort and ask the user
which memjective to peek at. Do not silently fall through to a "show me
whatever you find" mode.

The user may optionally name a source explicitly (a branch, a master-branch
snapshot slug, or a local file path). When they do, that source is used
directly — see step 2a.

## Core rules

- **Read-only.** No `brmem put`, no `brmem copy`, no branch creation, no
  git refs written, no checkbox edits, no file writes. Every output is
  advisory.
- **Slug is always explicit.** `next` never auto-picks a slug, even when
  only one is present on the resolved source. Many-to-many is allowed; the
  slug arg disambiguates.
- **Document-only, not repo-wide.** `next` is state-of-the-document, not
  state-of-the-repo. It does not open or grep source files to check
  progress — that work belongs to whoever implements the slice, and the
  evidence is folded back in by `dev-memjective-update`.
- **Label the source.** Every output names where the memjective was read
  from: current-branch snapshot, ancestor-branch snapshot (with branch
  name), master-branch snapshot, or local file.
- **Staleness flag on non-master sources.** When the resolved source is a
  non-master branch snapshot, compare the snapshot's max `head_date`
  (across files present for `<slug>`) against the source branch's HEAD
  commit time. If HEAD is newer, print one advisory line pointing the
  user at `dev-memjective-update`. Skip the staleness check entirely on
  master sources — master snapshot rewrites go through
  `dev-memjective-reconcile`, which has no freshness contract (sibling
  evidence does not bump master's HEAD).
- **Collision-safe slug suggestion.** Before finalizing the suggested
  next-slice slug, probe for existing branches and existing master-branch
  snapshots with that name. On a collision, warn and ask. Never
  auto-resolve.
- **No Graphite dependency.** Source discovery uses raw git plumbing only;
  `gt` is never invoked.

## Workflow

### 1. Pre-flight: confirm repo + current branch

```bash
git rev-parse --show-toplevel
git rev-parse --abbrev-ref HEAD
```

Call the branch `<branch>`.

Abort if:

- not in a git repo,
- the current branch is detached (`HEAD`),
- the invoking prompt did not name a memjective slug (see **Arguments**).

### 2. Resolve the memjective source

Use the strongest source available in this order: explicit user input,
current-branch snapshot, nearest ancestor branch snapshot, then the
master-branch snapshot. The slug arg fixes _which_ memjective to inspect;
this step decides _which copy_ of that memjective to read.

#### 2a. Explicit user source

If the user explicitly names a source, resolve that directly instead of
guessing:

- a **branch name**: probe that branch's snapshot for the requested slug
  via `brmem check <slug>/body.md --namespace memjectives --branch <B>`.
  The branch must carry at least `<slug>/body.md`. Other slugs on the
  same branch are fine and ignored.
- a **master-branch snapshot slug**: read every file under `<slug>/` from
  `master`. The slug arg should match — if the user named a different
  master slug from the slug arg, surface the mismatch and ask.
- a **local file path**: read the file directly and label the source as
  _local file_ (treat its content as `body.md`).

If the explicit source is invalid (branch lacks the slug, master lacks
the slug, file does not exist), stop and surface the problem instead of
falling through to discovery.

#### 2b. Current-branch snapshot

```bash
brmem check <slug>/body.md --namespace memjectives
```

`--branch` omitted so the current branch is used implicitly. The slug arg
is fixed, so this is a presence check, not a discovery scan.

Decision rules:

- **Slug present on the current branch** → record the slug and probe for
  sibling files (`roadmap.md`, `notes.md`); label the source as
  _snapshot (current branch)_; skip to step 3.
- **Slug not present** → continue to 2c.

#### 2c. Ancestor-branch snapshots

Enumerate every `(branch, key)` pair that has a memjective entry under
the requested slug. Storage is snapshot-shaped — one ref per
`(namespace, branch)` — so enumeration is a two-step walk: list snapshot
refs first, then read keys inside each snapshot's tree.

```bash
git for-each-ref --format='%(refname)' refs/brmem/ns/memjectives/
```

Each refname is `refs/brmem/ns/memjectives/<encoded-branch>`. Extract the
`<encoded-branch>` segment (the trailing path component) and decode
`---` → `/` to recover the real branch name. To check whether a snapshot
carries the requested slug, pair with
`git ls-tree -r <refname>` and look for paths starting with `<slug>/`.

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
- Keep only entries that carry at least `<slug>/body.md`. (Many-to-many
  is allowed, so a single ancestor branch may hold other slugs alongside
  this one — those are ignored.)

Decision rules for ancestor candidates:

- **0 candidates** → continue to master-branch snapshots.
- **1 candidate** → use it automatically and label it as
  _snapshot (ancestor branch `<B>`)_.
- **2+ candidates** → rank them by commit distance from `HEAD` and use the
  nearest one automatically:

  ```bash
  git rev-list --count refs/heads/<B>..HEAD
  ```

  The smallest count wins. If multiple candidates tie for the smallest
  distance, list those tied candidates and ask the user to choose.

#### 2d. Master-branch snapshot

```bash
brmem check <slug>/body.md --namespace memjectives --branch master
```

Decision rules:

- **Present** → use it and label as _master-branch snapshot_.
- **Absent** → ask the user to name a branch, a master-branch slug, or a
  local memjective file. Do not silently return nothing.

### 3. Load the memjective

Read every file under the resolved source's `<slug>/`:

```bash
brmem get <slug>/body.md --namespace memjectives --branch <source-branch>
brmem check <slug>/roadmap.md --namespace memjectives --branch <source-branch> \
  && brmem get <slug>/roadmap.md --namespace memjectives --branch <source-branch>
brmem check <slug>/notes.md --namespace memjectives --branch <source-branch> \
  && brmem get <slug>/notes.md --namespace memjectives --branch <source-branch>
```

`<source-branch>` is the branch chosen in 2a when the user named a branch,
the current branch for 2b, the nearest ancestor chosen in 2c, or `master`
for 2d. If step 2a resolved to a local file, read that file directly
instead and treat it as the `body.md` content.

Interpret the files per the spec skill's **Document anatomy** — `body.md`
is the stable spine, `roadmap.md` holds the slice plan, `notes.md` holds
durable findings.

### 4. Staleness check (non-master sources only)

When the resolved source is a non-master branch snapshot (2b, 2c, or a
2a branch source), compare the snapshot's freshness against the source
branch's HEAD:

```bash
latest_mem_ts=$(
  for f in body.md roadmap.md notes.md; do
    brmem check <slug>/$f --namespace memjectives --branch <source-branch> \
      --format json 2>/dev/null \
      | jq -r '.data.head_date // empty'
  done | sort | tail -n1
)

head_ts=$(git log -1 --format=%cI refs/heads/<source-branch>)

commits_behind=$(git rev-list --count \
  $(brmem head-sha <slug>/body.md --namespace memjectives --branch <source-branch>)..refs/heads/<source-branch>)
```

Compare `head_ts` and `latest_mem_ts` as ISO 8601 strings (lexicographic
sort is correct for the `%cI` / `head_date` format).

- **`head_ts <= latest_mem_ts`** → no advisory; the snapshot is at or
  ahead of branch HEAD.
- **`head_ts > latest_mem_ts`** → emit one advisory line in the report:

  > _Snapshot is N commits behind HEAD on `<source-branch>` — consider
  > running `dev-memjective-update <slug>` on `<source-branch>` first._

If `commits_behind` is hard to compute cheaply (e.g., the snapshot's
recorded `head-sha` is not reachable from the source branch's HEAD), drop
the count and emit the line without the "N commits" qualifier — the
pointer to `dev-memjective-update` is the load-bearing part.

**Skip the staleness check on master sources** (2a master, 2d). Master's
HEAD is virtually always newer than its snapshot — every merged PR lands
there — so the compare always trips and adds no signal. Master rewrites
go through `dev-memjective-reconcile`, which has no freshness contract;
do not redirect the user to `update` for a master source.

### 5. Report a status summary

Write a short status summary back to the user so they can confirm:

- **Source** — the label from step 2 (e.g., _snapshot (current branch)_,
  _snapshot (ancestor branch `widget-rewrite-slice-1`)_,
  _master-branch snapshot_, _local file_) and the slug.
- **Files present** — `body.md` always, plus whichever of `roadmap.md` /
  `notes.md` exist under `<slug>/` on the source.
- **Title** — from `body.md`.
- **Status** — from the `Status:` line in `body.md`.
- **Description / Goals summary** — only if it adds signal; keep it to one
  short sentence or 1–2 bullets. Skip on a routine peek where the user
  already knows the workstream.
- **Completion Criteria** — from `body.md`. Count checked vs. open, and
  list any remaining open criteria.
- **Roadmap state** — from `roadmap.md`. Which items are checked vs. open,
  with unchecked items clearly flagged so the user can see what is left.
- **Notes presence** — one-line summary (e.g., _"3 durable notes recorded"_
  or _"none yet"_). Do not dump the full notes file.
- **Staleness flag** — the advisory line from step 4, if it fired. Omit
  the line entirely on master sources or in-sync non-master sources.

Keep this tight. The goal is enough signal for the user to recognize the
state at a glance; it is not a full re-print of the document.

If the user disagrees with the chosen source, return to step 2 and let
them pick a different candidate.

### 6. Suggest a next-slice slug

Default to naming the slug after the first unchecked roadmap item in
`roadmap.md` that still matches `body.md`'s `How to Make Progress`.

If the choice is genuinely non-obvious — multiple unchecked items at
similar priority, recent Notes suggesting the plan should be reshaped —
present 2–3 candidate slugs with a one-line rationale each and ask the
user to pick.

Slug rules:

- Lowercase ASCII, hyphen-separated.
- Concise and specific to the slice, not the whole memjective.
- No `.md` suffix.
- Usually ≤50 characters.
- Do not add redundant prefixes like `memjective-` or duplicate the parent
  memjective's slug verbatim. Use something that distinguishes this slice
  from sibling slices.

### 7. Collision-check the suggested slug

Probe for collisions:

```bash
git rev-parse --verify --quiet refs/heads/<suggested-slug>
brmem check <suggested-slug>/body.md --namespace memjectives --branch master
```

If either returns success (a local branch already exists or a
master-branch snapshot already uses that slug), **warn the user and ask
how to proceed**:

- pick a different slug,
- append a numeric suffix (e.g., `<suggested-slug>-2`),
- proceed anyway (user's call).

Do not auto-resolve the collision.

### 8. Report + next-step hint

Output:

- **Source** — label + slug.
- **Status summary** — from step 5, including the staleness advisory
  if it fired.
- **Suggested next-slice slug** — with the collision-check result.
- **Next steps** — tell the user, in this order:

  > _To proceed: cut a branch (e.g. `gt create <suggested-slug>`), then
  > run `dev-memjective-claim <slug> --target <suggested-slug>` to attach
  > the snapshot. After implementing the slice, run `dev-memjective-update
  > <slug>` to record progress._

  When the staleness advisory fired in step 4, prepend the
  `dev-memjective-update <slug>` on `<source-branch>` step to the hint
  so the user knows to refresh the source before claiming.

## Edge cases

- **Detached HEAD** → abort in step 1.
- **No slug arg in the invoking prompt** → abort in step 1; ask the user
  which memjective to peek at. Never default to "the only one I can find"
  — many-to-many is allowed and the slug is always explicit.
- **Stale brmem refs** for deleted branches → dropped during step 2c by
  the `git rev-parse --verify` filter.
- **Worktrees** — `git for-each-ref refs/brmem/ns/...` is repo-global, so
  ancestor enumeration works correctly from any worktree.
- **Multiple ancestor snapshots carrying the slug** → choose the one with
  the smallest `git rev-list --count <branch>..HEAD`. Tie-break by asking
  the user.
- **Slug exists only on master** → fall through 2b → 2c (0 ancestor
  candidates) → 2d (use the master-branch snapshot). Staleness check
  skipped per step 4.
- **Slug exists only on the current branch but the current branch has
  other slugs too** → 2b finds it; the other slugs are ignored. Many-to-
  many is fine.
- **No memjective for the requested slug anywhere** → step 2d's "absent"
  rule fires; ask the user to name a source. Probably they meant
  `dev-memjective-create` for a slug that does not exist yet.
- **Source has only `body.md`** (no `roadmap.md` / `notes.md`) → step 5's
  "Roadmap state" reports _"no roadmap.md yet"_; the slug suggestion in
  step 6 has to fall back to `body.md`'s `How to Make Progress` directly,
  or the user is asked to choose. The staleness check in step 4 still
  works against `body.md`'s `head_date` alone.
- **Snapshot's recorded `head_date` is somehow newer than the branch
  HEAD's commit time** (rare; usually a clock-skew artifact or a manual
  `brmem put` after a rebase reset HEAD backwards) → step 4 treats this
  as in-sync and emits no advisory. The next genuine commit on the
  source branch will retrip the check.

## Anti-patterns

- **Writing anything to brmem.** `next` is read-only. Carry-forward
  belongs to `dev-memjective-claim`; rewrites belong to `update`
  (slice branches) and `reconcile` (master).
- **Auto-picking a slug because only one is present on the source.**
  The slug is always explicit; many-to-many is allowed. Surface the
  prompt for one if the invoker forgot to name it.
- **Auto-resolving slug collisions** in step 7. Always ask.
- **Falling back to the master-branch snapshot when a nearer ancestor
  carries the slug.** Step 2c runs before step 2d on purpose; only fall
  through to master when 2c produces no candidates.
- **Running the staleness check on a master source.** Master HEAD is
  always newer than its snapshot; the check would always trip and add
  no signal, and the redirect to `dev-memjective-update` is wrong for
  master (master rewrites go through `dev-memjective-reconcile`).
- **Ranking ancestor candidates by timestamp or branch name** instead of
  commit distance from `HEAD`.
- **Skipping the status summary.** The user needs to see what got loaded
  before accepting the slug suggestion.
- **Doing a codebase assessment or a file-level drift audit.** That is
  the implementer's job once a slice begins, and the evidence is folded
  back in by `dev-memjective-update`. `next` stays document-only.
- **Carrying forward, attaching, or implementing during a `next` run.**
  Direct the user at `dev-memjective-claim` for attach and at the
  user's normal tooling for implementation.
- **Using Graphite plumbing** (`gt parent`, `gt ls`, graphite
  branch-config reads) for source discovery. Raw git only.
- **Letting the slug suggestion name the whole memjective** instead of
  the current slice. Sibling slices need distinguishing names.
