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
  - "Agent"
  - "Task"
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
branch `master`. `reconcile` always targets canonical state on `master`,
regardless of the operator's working-tree branch — `brmem` ref operations
are branch-independent, so the command can be invoked from any branch
(including a feature branch) and still reads/writes only `master`'s
canonical objectives. It never writes to branch snapshots and never copies
one snapshot verbatim onto canonical state. Open PRs and unmerged branches
remain branch-local state for higher-level views; reconcile must not
incorporate them into canonical state.

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
- **Always targets `master`.** `reconcile` always reads and writes
  canonical state on `master` regardless of the operator's working-tree
  branch. The current branch is never consulted; the command runs from
  any branch (or detached `HEAD`) without changing scope.
- **Slug optional; sweep by default.** With no slug argument, reconcile
  every canonical objective on `master`. Narrow only when the operator
  passes explicit slugs.
- **Per-slug work runs in subagents.** Parent spawns one subagent per slug
  resolved in step 2; the subagent owns 3a–3e for that slug and returns a
  handoff document. The parent must not run any per-slug evidence-gathering
  command itself.
- **Parent owns canonical writes.** All `brmem put` calls happen in the
  parent after subagents return, dispatched serially in slug order.
  Concurrent `brmem put` against the shared
  `refs/brmem/ns/objectives/<encoded-master>` snapshot ref clobber each
  other even when writes target disjoint key paths, so this serialization
  is required.
- **Per-objective issues are gaps, not aborts.** When one slug hits a
  problem (missing canonical `body.md`, PR lookup error, contradictory
  evidence), record the gap for that slug and continue with the next one.
  The sweep aborts only on whole-run preconditions (not in a git repo).
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
```

Abort only if not in a git repo. The operator's working-tree branch is
not consulted; reconcile runs from any branch (including detached `HEAD`)
because every `brmem` and `objective` operation in this workflow targets
`master` explicitly via ref reads/writes.

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

### 3. Fan out per-slug subagents

Spawn one Agent per slug in the resolved set. **All Agent calls must be
issued in a single message** so they run concurrently. Use:

- `subagent_type: general-purpose`
- `model: sonnet`

Use the brief template below for each Agent's prompt, substituting `<slug>`
and `<repo-root>`:

> You are reconciling one canonical objective for the twerk
> `objective-reconcile` skill. Slug: `<slug>`. Working directory:
> `<repo-root>`. Canonical branch: `master`.
>
> Read `skills/objective-reconcile/SKILL.md` ("Per-slug subagent
> procedure" and "Handoff contract" sections) and
> `skills/objective/references/mutation-contract.md`. Follow the
> per-slug procedure for `<slug>` only.
>
> You MUST NOT call `brmem put`, write to branch snapshots, or touch any
> slug other than `<slug>`. Write proposed canonical file rewrites to
> `/tmp/objective-reconcile/<slug>/<file>.proposed` and reference those
> paths in your handoff. Return a single fenced JSON code block (with the
> `json` info string) matching the handoff schema. No prose outside the
> fenced block.

The parent must not run any per-slug 3a–3f command itself. Wait for all
subagents to return their handoffs before proceeding to step 4.

### 4. Apply rewrites serially

Iterate the returned handoffs in the same order as the resolved slug set.
For each handoff:

- If `status` is `"unchanged"` or `"gap"` (no `proposed_writes`), record
  the slug's report data and move on.
- If `proposed_writes` is non-empty, for each entry call:

  ```bash
  brmem put <slug>/<file> --namespace objectives \
    --branch master --file <subagent-temp-path>
  ```

  one file at a time. Capture the new SHA from each call and merge it into
  the per-slug report data alongside the `old_shas` reported by the
  subagent.

Surface every handoff's `gaps` and `conflicts` verbatim in the report. A
malformed or missing handoff (timeout, tool denial, schema mismatch)
becomes a per-slug "subagent failure" gap; the parent continues with the
remaining handoffs.

All `brmem put` calls are issued by the parent, one at a time. Do not
parallelize this step.

### 5. Aggregate report

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

## Per-slug subagent procedure

Each subagent runs the steps below for its assigned slug. On any caught
exception, record the slug-level gap and return a `status: "gap"` handoff
— never raise out to the parent.

#### 3a. Confirm canonical state exists

```bash
brmem check <slug>/body.md --namespace objectives --branch master
```

If canonical `body.md` is missing, record a gap for this slug — "slug
requested but no canonical body.md; use `objective-create` first" for an
operator-supplied slug, or treat as a sweep enumeration anomaly otherwise —
and return a `status: "gap"` handoff.

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
fold in" gap and return a `status: "gap"` handoff — do not write any
proposed files for this slug.

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

#### 3e. Gate evidence and propose canonical rewrites conservatively

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
Surface contradictions in the handoff's `conflicts` array instead of
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

Write each proposed canonical file rewrite to
`/tmp/objective-reconcile/<slug>/<file>.proposed` and reference those paths
in the handoff. Return a handoff document (schema below) instead of writing
to canonical state.

## Handoff contract

Each subagent returns a single fenced JSON code block (with the `json`
info string) — and nothing else — matching the schema below.

```json
{
  "slug": "<slug>",
  "status": "rewritten" | "unchanged" | "gap",
  "old_shas": {
    "body.md": "<sha-or-null>",
    "roadmap.md": "<sha-or-null>",
    "notes.md": "<sha-or-null>"
  },
  "proposed_writes": [
    {
      "file": "body.md",
      "path": "/tmp/objective-reconcile/<slug>/body.md.proposed",
      "summary": "<one-line>"
    }
  ],
  "evidence": {
    "branches_consulted": [
      {
        "branch": "...",
        "live": true,
        "pr": {"number": 123, "state": "MERGED", "url": "...", "title": "..."},
        "contribution": "<one-line>"
      }
    ],
    "branches_skipped": [
      {"branch": "...", "reason": "open|closed-unmerged|no-pr|orphan|lookup-error"}
    ]
  },
  "conflicts": ["<one-line>", "..."],
  "gaps": ["<one-line>", "..."]
}
```

The parent fills in `new_shas` per file after running `brmem put` and
includes them in the aggregate report's per-slug sub-section.

## Edge Cases and Anti-Patterns

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
- Subagent failure (timeout, tool denial, malformed handoff, missing
  proposed-writes file): record a per-slug "subagent failure" gap and
  continue with the remaining handoffs. Do not re-run the failed
  subagent's 3a–3e in the parent.
- Never copy a branch snapshot verbatim, write to branch snapshots,
  incorporate open PR or unmerged branch state into canonical, add a HEAD
  freshness shortcut, or rebuild canonical files wholesale.
