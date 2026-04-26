---
name: dev-memjective-reconcile
description: Command
allowed-tools:
  - "Bash(git rev-parse *)"
  - "Bash(git for-each-ref *)"
  - "Bash(git ls-tree *)"
  - "Bash(git log *)"
  - "Bash(memjective tree *)"
  - "Bash(gh pr view *)"
  - "Bash(brmem check *)"
  - "Bash(brmem get *)"
  - "Bash(brmem list *)"
  - "Bash(brmem put *)"
  - "Read"
  - "Write"
metadata:
  internal: true
---

<!-- INTERNAL SKILL: twerk-only. Local-first memjective subsystem on top of brmem. -->

# dev-memjective-reconcile

Refresh the canonical memjective from landed branch snapshots and the merged
PRs associated with those branches.

> For the canonical-vs-branch model, document anatomy, lifecycle, and shared
> rewrite rules, see `../dev-memjective/SKILL.md` and
> `../dev-memjective/references/mutation-contract.md`.

## Goal

Given an explicit memjective slug, rewrite the canonical memjective
conservatively by exploring branch snapshots that carry `<slug>/`,
cross-referencing their associated PRs, and folding only landed evidence into
canonical `body.md`, `roadmap.md`, and `notes.md`.

In the current implementation, canonical state is stored in `brmem` on
branch `master`, so `reconcile` runs only on `master`. It never writes to
branch snapshots and never copies one snapshot verbatim onto canonical state.
Open PRs and unmerged branches remain branch-local state for higher-level
views; reconcile must not incorporate them into canonical state.

## Memjective Content

The canonical memjective is stored under `<slug>/` in namespace
`memjectives` on `master`. Files:

- `body.md` (required): stable workstream spine and progress guidance.
- `roadmap.md` (optional): ordered slice plan and progress surface.
- `notes.md` (optional): durable findings.

`reconcile` reads every present canonical file and rewrites only files whose
content changed. It also reads PR metadata for branch snapshots carrying the
slug, then reads `<slug>/body.md`, `<slug>/roadmap.md`, and `<slug>/notes.md`
only from branch snapshots whose associated PRs are merged. Branch snapshots
and PRs are evidence only; reconcile never writes to them.

## Inputs

- **Slug, required.** The prompt must name the memjective slug. Do not infer
  it from "the only memjective" in canonical storage. If the prompt does not
  name a slug, abort and ask which memjective to reconcile.

## Core Rules

- **Canonical state only.** `reconcile` writes only to the canonical
  `<slug>/` on `master`; never to branch snapshots, other branches, or PRs.
- **Off-master aborts.** Run only on `master`; abort on detached `HEAD` or
  any other branch.
- **Slug always explicit.** No auto-pick from "the only canonical slug."
- **Only landed work enters canonical state.** Use merged PR-backed branch
  snapshots to inform the rewrite. Do not fold open PRs, closed-unmerged PRs,
  no-PR branches, or orphaned snapshots into canonical state.
- **Verbatim copy forbidden.** Sibling text is evidence, not source. Fuse
  evidence under the per-file mutation contract.
- **No freshness shortcut.** Always evaluate available branch/PR state, but
  fold only landed evidence. Sibling changes do not bump canonical HEAD, so
  HEAD-vs-snapshot checks are invalid here.
- **In-repo enumeration only.** Discover branch snapshots from local
  `refs/brmem/ns/memjectives/` (or the `memjective tree` helper). Do not
  fetch from remotes during reconcile.
- **PR errors are gaps, not failures.** A failed PR lookup becomes an
  evidence gap in the report unless every PR lookup needed for the
  requested reconciliation is unavailable.
- **Conservative per-file rewrites.** Apply the shared rules in
  `../dev-memjective/references/mutation-contract.md`. Do not rebuild
  canonical files wholesale, delete completed history, or rename sections.

## Workflow

### 1. Preflight

```bash
git rev-parse --show-toplevel
git rev-parse --abbrev-ref HEAD
```

Abort if not in a git repo, on detached `HEAD`, off `master`, or missing the
slug. Off `master`, print:

```text
dev-memjective-reconcile updates canonical state. Use
dev-memjective-update <slug> to record progress on a branch snapshot.
```

### 2. Confirm canonical state exists

```bash
brmem check <slug>/body.md --namespace memjectives --branch master
```

If canonical `body.md` is missing, abort and point the user at
`dev-memjective-create`.

Capture old SHAs and load present canonical files:

```bash
brmem check <slug>/body.md --namespace memjectives --branch master
brmem check <slug>/roadmap.md --namespace memjectives --branch master
brmem check <slug>/notes.md --namespace memjectives --branch master

brmem get <slug>/body.md --namespace memjectives --branch master \
  > /tmp/<slug>-canonical-body.md
brmem get <slug>/roadmap.md --namespace memjectives --branch master \
  > /tmp/<slug>-canonical-roadmap.md
brmem get <slug>/notes.md --namespace memjectives --branch master \
  > /tmp/<slug>-canonical-notes.md
```

Only run commands for files that exist.

### 3. Enumerate branch snapshots and PRs

Prefer the purpose-built tree command:

```bash
memjective tree <slug> --format json
```

Use it to identify:

- branch snapshots carrying `<slug>/`
- live vs stale/orphaned branches
- associated PR number, URL, title, and state
- branches with no PR
- PR lookup errors

If no branch snapshots carry the slug, report that there is no evidence to
fold in and write nothing.

If the tree command is unavailable or insufficient, fall back to local refs
plus direct PR lookup:

```bash
git for-each-ref --format='%(refname)' refs/brmem/ns/memjectives/
git ls-tree -r <refname>
gh pr view <branch> --json number,title,url,headRefName,baseRefName,state,mergedAt
```

PR lookup failures should become evidence gaps in the report, not hard
failures, unless every PR lookup needed for the requested reconciliation is
unavailable.

### 4. Load branch snapshot evidence

For each branch snapshot whose associated PR is merged, read present files:

```bash
brmem get <slug>/body.md --namespace memjectives --branch <branch> \
  > /tmp/<slug>-<branch>-body.md
brmem get <slug>/roadmap.md --namespace memjectives --branch <branch> \
  > /tmp/<slug>-<branch>-roadmap.md
brmem get <slug>/notes.md --namespace memjectives --branch <branch> \
  > /tmp/<slug>-<branch>-notes.md
```

Capture per-file metadata when useful:

```bash
brmem check <slug>/<file> --namespace memjectives --branch <branch> --format json
```

When landed branch snapshot text is ambiguous, enrich the associated PR:

```bash
gh pr view <number-or-branch> \
  --json number,title,url,headRefName,baseRefName,state,mergedAt,commits,body
```

Use PR metadata to ground the rewrite, not as text to copy wholesale.

### 5. Gate evidence

Use the inclusion rules from
`../dev-memjective/references/mutation-contract.md`:

- merged PR-backed branch snapshots are eligible evidence
- open PRs are not folded into canonical state
- closed-unmerged PRs are not folded into canonical state
- no-PR branches are local-only state and are not folded into canonical state
- PR lookup errors are evidence gaps
- stale/orphaned snapshots are not folded into canonical state unless tied to
  landed work

Prefer corroborated signals when multiple landed branch snapshots disagree.
Surface contradictions in the report instead of forcing a confident rewrite.

### 6. Rewrite canonical files conservatively

Apply the shared conservative rewrite rules in
`../dev-memjective/references/mutation-contract.md`.

Typical reconcile work:

- check canonical roadmap items supported by merged branch/PR evidence
- check canonical completion criteria when the end-state is actually true
- append durable findings from landed branch `notes.md` or merged PR context
- split or add nearby roadmap follow-ups discovered during branch work
- move `Status:` only when canonical state changed categorically

Do not paste a branch snapshot over canonical state. Do not write to branch
snapshots.

### 7. Persist changed canonical files

Write changed content to temporary files, then store only changed files back
to canonical storage:

```bash
brmem put <slug>/body.md --namespace memjectives --branch master --file <temp-body>
brmem put <slug>/roadmap.md --namespace memjectives --branch master --file <temp-roadmap>
brmem put <slug>/notes.md --namespace memjectives --branch master --file <temp-notes>
```

Skip `brmem put` for unchanged files. Capture new commit SHAs.

### 8. Report

Include:

- slug and canonical target (`master` in current storage)
- files touched with one-line notes
- old SHA to new SHA for each changed file
- branch snapshots consulted, including skipped unmerged snapshots
- PR evidence consulted: branch, liveness, PR number/state/URL/title, and
  one-line contribution
- conflicts or evidence gaps
- recovery hint:

```text
brmem get <slug>/<file> --namespace memjectives --branch master --at <old-sha>
```

## Edge Cases and Anti-Patterns

- Off `master`: abort and point to `update`.
- No canonical `body.md`: abort and point to `create`.
- No branch snapshots carry the slug: report no evidence and write nothing.
- No merged PR-backed branch snapshots carry the slug: report no landed
  evidence and write nothing.
- PR lookup errors: continue when possible and report the gap.
- Contradictory branch/PR evidence: keep canonical state conservative and
  surface the conflict.
- Never copy a branch snapshot verbatim, write to branch snapshots,
  incorporate open PR or unmerged branch state into canonical, add a HEAD
  freshness shortcut, or rebuild canonical files wholesale.
