---
name: objective-reconcile
description: "Command: objective-reconcile"
allowed-tools:
  - "Bash(git rev-parse *)"
  - "Bash(git for-each-ref *)"
  - "Bash(git ls-tree *)"
  - "Bash(git log *)"
  - "Bash(objective list *)"
  - "Bash(objective tree *)"
  - "Bash(gh pr view *)"
  - "Bash(brmem check *)"
  - "Bash(brmem get *)"
  - "Bash(brmem list *)"
  - "Bash(brmem put *)"
  - "Read"
  - "Write"
---

# objective-reconcile

Refresh the canonical objective from landed branch snapshots and the merged
PRs associated with those branches.

> For the canonical-vs-branch model, document anatomy, lifecycle, and shared
> rewrite rules, see `../objective/SKILL.md` and
> `../objective/references/mutation-contract.md`.

## Goal

Sweep every canonical objective on `master` and rewrite each one
conservatively by exploring the branch snapshots that carry `<slug>/`,
cross-referencing their associated PRs, and folding only landed evidence into
canonical `body.md`, `roadmap.md`, and `notes.md`.

The default scope is **all** canonical objectives on `master`. An optional
slug or comma-separated slug list narrows the sweep to one or a few
objectives without otherwise changing the per-slug procedure.

In the current implementation, canonical state is stored in `brmem` on
branch `master`, so `reconcile` runs only on `master`. It never writes to
branch snapshots and never copies one snapshot verbatim onto canonical state.
Open PRs and unmerged branches remain branch-local state for higher-level
views; reconcile must not incorporate them into canonical state.

## Content Files

Read every present canonical file under `<slug>/` on `master` (`body.md`
required; `roadmap.md` / `notes.md` optional) and rewrite only files whose
content changed. Read branch snapshot files only when their associated PRs
are merged. Branch snapshots and PRs are evidence only; never write to them.

## Inputs

- **Slug or slug list, optional.** When omitted, the sweep covers every
  canonical objective on `master`. When provided as a single slug or a
  comma-separated list, the sweep is narrowed to those slugs. Each
  operator-supplied slug must already exist canonically; unknown slugs are
  recorded as a per-slug gap and skipped.

## Core Rules

- **Canonical state only.** `reconcile` writes only to the canonical
  `<slug>/` on `master`; never to branch snapshots, other branches, or PRs.
- **Off-master aborts.** Run only on `master`; abort on detached `HEAD` or
  any other branch.
- **Slug optional; sweep by default.** With no slug argument, reconcile
  every canonical objective on `master`. Narrow only when the operator
  passes explicit slugs.
- **Per-objective issues are gaps, not aborts.** When one slug hits a
  problem (missing canonical `body.md`, PR lookup error, contradictory
  evidence), record the gap for that slug and continue with the next one.
  The sweep aborts only on whole-run preconditions (off `master`, detached
  `HEAD`).
- **Only landed work enters canonical state.** Use merged PR-backed branch
  snapshots to inform the rewrite. Do not fold open PRs, closed-unmerged PRs,
  no-PR branches, or orphaned snapshots into canonical state.
- **Verbatim copy forbidden.** Sibling text is evidence, not source. Fuse
  evidence under the per-file mutation contract.
- **No freshness shortcut.** Always evaluate available branch/PR state, but
  fold only landed evidence. Sibling changes do not bump canonical HEAD, so
  HEAD-vs-snapshot checks are invalid here.
- **In-repo enumeration only.** Discover branch snapshots from local
  `refs/brmem/ns/objectives/` (or the `objective tree` helper). Do not
  fetch from remotes during reconcile.
- **PR errors are gaps, not failures.** A failed PR lookup becomes an
  evidence gap in the report unless every PR lookup needed for the
  requested reconciliation is unavailable.
- **Conservative per-file rewrites.** Apply the shared rules in
  `../objective/references/mutation-contract.md`. Do not rebuild
  canonical files wholesale, delete completed history, or rename sections.

## Workflow

### 1. Preflight

```bash
git rev-parse --show-toplevel
git rev-parse --abbrev-ref HEAD
```

Abort if not in a git repo, on detached `HEAD`, or off `master`. Off
`master`, print:

```text
objective-reconcile updates canonical state. Use
objective-update <slug> to record progress on a branch snapshot.
```

### 2. Resolve the target slug set

If the operator passed a slug or comma-separated slug list, use that list
deduplicated and in operator-supplied order. Otherwise enumerate every
canonical objective on `master`:

```bash
objective list --format json
```

Collect every `objectives[].slug` whose `canonical_present` is `true`, then
sort the resulting set alphabetically so the sweep is reproducible.

If the resolved set is empty, print a one-line "no canonical objectives on
master" report and exit cleanly without writing anything.

### 3. Per-slug reconcile loop

For each slug in the resolved set, run the steps below. On any caught
exception, record the slug-level gap and continue with the next slug — never
abort the sweep.

#### 3a. Confirm canonical state exists

```bash
brmem check <slug>/body.md --namespace objectives --branch master
```

If canonical `body.md` is missing, record a gap for this slug — "slug
requested but no canonical body.md; use `objective-create` first" for an
operator-supplied slug, or treat as a sweep enumeration anomaly otherwise —
and `continue` with the next slug.

#### 3b. Capture old SHAs and load canonical files

```bash
brmem check <slug>/body.md --namespace objectives --branch master
brmem check <slug>/roadmap.md --namespace objectives --branch master
brmem check <slug>/notes.md --namespace objectives --branch master

brmem get <slug>/body.md --namespace objectives --branch master \
  > /tmp/<slug>-canonical-body.md
brmem get <slug>/roadmap.md --namespace objectives --branch master \
  > /tmp/<slug>-canonical-roadmap.md
brmem get <slug>/notes.md --namespace objectives --branch master \
  > /tmp/<slug>-canonical-notes.md
```

Only run commands for files that exist.

#### 3c. Enumerate branch snapshots and PRs

Prefer the purpose-built tree command:

```bash
objective tree <slug> --format json
```

Use it to identify:

- branch snapshots carrying `<slug>/`
- live vs stale/orphaned branches
- associated PR number, URL, title, and state
- branches with no PR
- PR lookup errors

If no branch snapshots carry the slug, record a per-slug "no evidence to
fold in" gap and skip directly to the next slug — do not write any files
for this slug.

If the tree command is unavailable or insufficient, fall back to local refs
plus direct PR lookup:

```bash
git for-each-ref --format='%(refname)' refs/brmem/ns/objectives/
git ls-tree -r <refname>
gh pr view <branch> --json number,title,url,headRefName,baseRefName,state,mergedAt
```

PR lookup failures become per-slug evidence gaps, not hard failures.

#### 3d. Load branch snapshot evidence

For each branch snapshot whose associated PR is merged, read present files:

```bash
brmem get <slug>/body.md --namespace objectives --branch <branch> \
  > /tmp/<slug>-<branch>-body.md
brmem get <slug>/roadmap.md --namespace objectives --branch <branch> \
  > /tmp/<slug>-<branch>-roadmap.md
brmem get <slug>/notes.md --namespace objectives --branch <branch> \
  > /tmp/<slug>-<branch>-notes.md
```

Capture per-file metadata when useful:

```bash
brmem check <slug>/<file> --namespace objectives --branch <branch> --format json
```

When landed branch snapshot text is ambiguous, enrich the associated PR:

```bash
gh pr view <number-or-branch> \
  --json number,title,url,headRefName,baseRefName,state,mergedAt,commits,body
```

Use PR metadata to ground the rewrite, not as text to copy wholesale.

#### 3e. Gate evidence and rewrite canonical files conservatively

Use the inclusion rules from
`../objective/references/mutation-contract.md`:

- merged PR-backed branch snapshots are eligible evidence
- open PRs are not folded into canonical state
- closed-unmerged PRs are not folded into canonical state
- no-PR branches are local-only state and are not folded into canonical state
- PR lookup errors are evidence gaps
- stale/orphaned snapshots are not folded into canonical state unless tied to
  landed work

Prefer corroborated signals when multiple landed branch snapshots disagree.
Surface contradictions in the per-slug section of the report instead of
forcing a confident rewrite.

Then apply the shared conservative rewrite rules in the mutation contract.
Typical reconcile work:

- check canonical roadmap items supported by merged branch/PR evidence
- check canonical completion criteria when the end-state is actually true
- append durable findings from landed branch `notes.md` or merged PR context
- split or add nearby roadmap follow-ups discovered during branch work
- move `Status:` only when canonical state changed categorically

Do not paste a branch snapshot over canonical state. Do not write to branch
snapshots.

#### 3f. Persist changed canonical files

Write changed content to temporary files, then store only changed files back
to canonical storage:

```bash
brmem put <slug>/body.md --namespace objectives --branch master --file <temp-body>
brmem put <slug>/roadmap.md --namespace objectives --branch master --file <temp-roadmap>
brmem put <slug>/notes.md --namespace objectives --branch master --file <temp-notes>
```

Skip `brmem put` for unchanged files. Capture new commit SHAs.

### 4. Aggregate report

Lead with a header line that reports counts: slugs swept, slugs rewritten,
slugs unchanged, slugs with gaps.

Then, for every slug that was either rewritten or had a gap, emit a
sub-section containing:

- slug and canonical target (`master` in current storage)
- files touched with one-line notes
- old SHA to new SHA for each changed file
- branch snapshots consulted, including skipped unmerged snapshots
- PR evidence consulted: branch, liveness, PR number/state/URL/title, and
  one-line contribution
- conflicts or evidence gaps
- recovery hint:

```text
brmem get <slug>/<file> --namespace objectives --branch master --at <old-sha>
```

Slugs that produced no changes and no gaps may collapse into a single
"Unchanged" group listing those slugs by name.

## Edge Cases and Anti-Patterns

- Off `master`: abort the whole sweep and point to `update`.
- Empty target set (no canonical objectives, or operator-supplied list
  filtered down to nothing): clean exit with a single-line report; no
  writes.
- Operator-supplied unknown slug (no canonical entry): record a per-slug gap
  and continue with the next slug.
- No canonical `body.md` for a slug in the resolved set: record a per-slug
  gap (point at `objective-create` for operator-supplied slugs) and
  continue.
- No branch snapshots carry a slug: record a "no evidence to fold in" gap
  for that slug and write nothing for it.
- No merged PR-backed branch snapshots carry a slug: record a "no landed
  evidence" gap for that slug and write nothing for it.
- PR lookup errors for a slug: record per-slug evidence gaps and continue.
- Contradictory branch/PR evidence for a slug: keep that slug's canonical
  state conservative and surface the conflict in its sub-section of the
  report.
- Never copy a branch snapshot verbatim, write to branch snapshots,
  incorporate open PR or unmerged branch state into canonical, add a HEAD
  freshness shortcut, or rebuild canonical files wholesale.
