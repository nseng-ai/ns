---
name: dev-memjective-update
description: "Rewrite the current branch's memjective files after a slice of work lands. Requires exactly one memjective slug under `memjectives/<slug>/` on the branch. Applies conservative in-place edits per the per-file mutation contract, writes back to brmem, and reports old/new commit SHAs for recovery. See `dev-memjective` for the subsystem overview."
allowed-tools:
  - "Bash(git rev-parse *)"
  - "Bash(git for-each-ref *)"
  - "Bash(git ls-tree *)"
  - "Bash(git merge-base *)"
  - "Bash(git log *)"
  - "Bash(diff *)"
  - "Bash(brmem *)"
  - "Read"
  - "Write"
metadata:
  internal: true
---

<!-- INTERNAL SKILL: twerk-only. Local-first memjective subsystem on top of brmem. -->

# dev-memjective-update

Rewrite the current branch's memjective snapshot after a slice of work lands.

> For shared concepts — vocabulary (`snapshot`, `master-branch snapshot`,
> `per-branch snapshot`), the storage model, the one-memjective-per-branch
> invariant, carry-forward semantics, the lifecycle, and the mutation-contract
> summary — see `../dev-memjective/SKILL.md`.

## Goal

On the current branch, confirm there is exactly one memjective slug, load
every file under its `<slug>/`, update each file conservatively to reflect
the completed slice, write any changed file back to brmem, and report
old/new commit SHAs so prior snapshots are recoverable.

This skill does **not** choose the next slice and does **not** implement
anything. `dev-memjective-peek` handles the lightweight status check + slug
suggestion, and `dev-memjective-next` handles carry-forward + implementation on
a fresh slice branch.

## Core rules

- **Conservative in-place edits.** Follow the per-file mutation contract in
  `../dev-memjective/references/mutation-contract.md`. Do not regenerate any
  file from scratch.
- **Preserve history.** brmem keeps prior snapshots by commit; report the
  old SHA for every file you rewrite so the user can recover it.
- **Master-reconcile variant.** When the current branch is `master`, run
  the sibling-evidence gathering pass (§5a) before the §5 rewrite. The
  per-file mutation contract still applies — sibling snapshots are
  read-only evidence, never a verbatim source. This variant is invoked
  by `dev-memjective-next` on master; see `../dev-memjective-next/SKILL.md`
  §2a.

  When a slice has merged via PR and the goal is to land that slice's
  docs into the root snapshot with provenance, prefer
  `dev-memjective-reconcile`. That skill consumes
  `memjective exec compute-pending-entries`, applies the conservative
  root rewrite, and persists an `incorporated` entry with `source` /
  `root_before` / `root_after` provenance — including the `tree_sha`
  values the strict validator now requires. The `update`
  master-reconcile variant remains available for cases not backed by a
  single merged PR (manual evidence aggregation across sibling
  snapshots), but it is no longer the default path for merged-PR
  incorporation.

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

### 2. Confirm exactly one memjective slug on the current branch

```bash
brmem list --namespace memjectives
```

`--branch` is omitted so the current branch is used implicitly. Group the
returned keys by their `<slug>/` prefix — each distinct slug is one
memjective regardless of how many files are attached.

Decision rules:

- **0 distinct slugs** → abort; this skill does not attach a memjective
  onto a branch that has none. Tell the user to run `dev-memjective-next`
  on this branch to carry the snapshot forward and implement the next
  slice, or to run `dev-memjective-create` if this is a brand-new
  memjective.
- **1 distinct slug** → that is the active memjective. Continue. Note
  which files exist under `<slug>/` (always `body.md`; optionally
  `roadmap.md` and/or `notes.md`).
- **2+ distinct slugs** → abort; the branch is in an invalid state.

### 3. Capture the prior file commits

Before rewriting, capture the current commit of each existing file for
the report:

```bash
brmem check <slug>/body.md --namespace memjectives
brmem check <slug>/roadmap.md --namespace memjectives   # if present
brmem check <slug>/notes.md --namespace memjectives     # if present
```

### 4. Load the active files

```bash
brmem get <slug>/body.md --namespace memjectives > /tmp/<slug>-body.md
brmem get <slug>/roadmap.md --namespace memjectives > /tmp/<slug>-roadmap.md  # if present
brmem get <slug>/notes.md --namespace memjectives > /tmp/<slug>-notes.md      # if present
```

Interpret the files per the spec skill's **Document anatomy**:

- `body.md` — Title, Status, Description, Goals, Completion Criteria, How
  to Make Progress.
- `roadmap.md` — ordered PR-sized slices.
- `notes.md` — durable findings.

If any file is badly malformed, consult the corresponding template under
`../dev-memjective/templates/` for intended shape, but preserve the
existing content rather than regenerating it.

### 5a. Sibling-evidence gathering (master only)

This step runs only when the current branch is `master`. On any other
branch, skip straight to §5.

On master, the `git log master` signal is noisy (every merged PR) and
the branch's own commit log does not cleanly describe per-slice work.
Instead, ground the rewrite in **sibling-branch snapshots** — other
refs under `refs/brmem/ns/memjectives/*` carrying the same slug. Each
sibling's `update`-written snapshot is itself a distilled record of
what landed on its branch.

#### Step 1 — Enumerate sibling refs

```bash
git for-each-ref --format='%(refname)' refs/brmem/ns/memjectives/
```

For each ref, extract `<encoded-branch>` (the trailing path segment)
and decode `---` → `/`. Run `git ls-tree -r <refname>` and keep only
refs whose tree contains paths starting with `<slug>/`. Drop the ref
whose encoded branch is `master` — that is the target, not a sibling.

#### Step 2 — Classify each sibling

For each surviving sibling, record:

- **Liveness** — `git rev-parse --verify --quiet refs/heads/<sibling>`
  → `live` or `orphaned-ref` (branch deleted; ref still readable).
- **Per-file metadata** — for each of `body.md`, `roadmap.md`, `notes.md`
  that exists under `<slug>/` on that ref:

  ```bash
  brmem check <slug>/<file> --namespace memjectives --branch <sibling> --format json
  ```

  Extract `.data.head_sha` and `.data.head_date`.
- **Per-file text** —

  ```bash
  brmem get <slug>/<file> --namespace memjectives --branch <sibling> \
    > /tmp/<slug>-<sibling>-<file>
  ```
- **Divergence from master** — diff each sibling file against master's
  copy from §4. Flag each file `same`, `modified`, or `sibling-only`.

#### Step 3 — Filter and rank

Drop siblings whose files are byte-identical to master's across every
file (they add no signal). Rank the remainder by newest `head_date`
across their files (ISO 8601 lexicographic sort). Cap at N=10; footnote
any excess as "plus K more (older)".

#### Step 4 — Assemble the evidence bundle

For each surviving sibling, build a block containing:

- Sibling branch name + liveness (`live` / `orphaned-ref`).
- Newest `head_date` across its files.
- Per-file verdict (`same` / `modified` / `sibling-only`) and the diff
  regions against master for modified files.
- For `roadmap.md` across all siblings: the union of items with checked
  boxes. An item checked in any sibling is evidence that the slice
  landed.
- For `notes.md` across all siblings: durable findings not already
  present on master, attributed with markers like
  `<!-- from sibling <branch>, <head_date> -->`.

This bundle is the grounding for §5's rewrite. It is not itself a
rewrite.

#### Step 5 — Report the evidence to the user before rewriting

Summarize which siblings were consulted (count + list with liveness
labels) and the headline per-file signals. The user can course-correct
if the sibling set looks wrong (e.g., an unrelated slug collision).
The §7 report later includes the full per-sibling record.

### 5. Rewrite conservatively, per file

Apply the per-file mutation contract in
`../dev-memjective/references/mutation-contract.md`. In practice, keep
each rewrite narrow.

On master (master-reconcile variant), use the sibling-evidence bundle
from §5a as the primary grounding for what moves. The per-file rules
are the same as on a slice branch; only the evidence source differs.
For checkbox flips in `body.md`'s Completion Criteria and `roadmap.md`,
prefer signals corroborated by more than one sibling when available, and
treat orphaned-ref-only signals as weaker than live-sibling signals.

When the work that needs to land in root traces to a single merged PR
rather than aggregated sibling evidence, prefer
`dev-memjective-reconcile` instead of this variant. That skill consumes
`memjective exec compute-pending-entries`, performs the same kind of
conservative root rewrite, and persists an `incorporated` entry with
`source` / `root_before` / `root_after` provenance (including the
`tree_sha` values the strict validator requires). Use the
master-reconcile variant here only for the genuine sibling-aggregation
case where no single merged PR underwrites the change.

**`body.md`** — the stable spine; touch sparingly:

- Preserve the title unless the user explicitly asked to rename it.
- Update `Status` if the branch state changed.
- Mark completed `Completion Criteria` items and keep them visible.
- Update `Description` or `Goals` only for small clarifications.
- Update `How to Make Progress` only when the actual recipe changed.

**`roadmap.md`** — where most of the motion happens:

- Check completed items; keep completed items visible.
- Add only nearby follow-up items when the work split more finely than
  expected.
- Reorder items when the remaining slice order materially changed.
- Never add manual-only or observation-only bullets (e.g., "live testing
  session", "manual smoke-test").

**`notes.md`** — append-only with obsolete annotations:

- Append durable findings, constraints, pointers.
- Annotate obsolete notes in place (e.g.,
  `~~…~~ — superseded by slice 3`) rather than deleting them.
- Create `notes.md` for the first time when there is a durable finding
  worth recording and none existed before.

The intended cost reduction is explicit here: normal update sessions
should mostly touch `Status` + `Completion Criteria` in `body.md`,
checkboxes in `roadmap.md`, and appends to `notes.md`. `body.md`'s
top-of-document context should stay mostly stable over time.

**Sourcing "what landed" signal.** On a slice branch (normal variant),
`git log --oneline master` is usually enough — squash-merged PRs appear
as `Title (#N)` commits on master. When the commit title is terse or a
file cites PR numbers that need cross-checking, consulting GitHub
directly via `gh pr view <N>` or `gh pr list --state merged --search
...` is encouraged — reading GitHub is allowed. Do not synthesize new
document content from PR bodies; use GitHub signal only to ground the
conservative edits the mutation contract already allows.

On master (master-reconcile variant), prefer sibling-branch snapshots
(§5a evidence bundle) over raw `git log master`. Sibling `roadmap.md`
and `notes.md` are already distilled records of per-slice work; the
master `git log` is comparatively noisy. GitHub lookups remain
available for cross-checking a specific PR referenced in sibling text,
not as a primary signal source.

### 6. Persist the updated files

Write each file that you changed to a temp file, then store it back to the
same brmem key:

```bash
brmem put <slug>/body.md --namespace memjectives --file <temp-body>
# If roadmap.md changed:
brmem put <slug>/roadmap.md --namespace memjectives --file <temp-roadmap>
# If notes.md changed (including a first-time append):
brmem put <slug>/notes.md --namespace memjectives --file <temp-notes>
```

Capture the new commit SHAs. Skip `brmem put` for any file that did not
change in this session.

### 7. Report

Summarize:

- memjective slug
- variant — `normal` (slice branch) or `master-reconcile` (on master).
- files touched (`body.md`, `roadmap.md`, `notes.md`) and a one-line note
  for each — e.g., "body.md: status → done; 2 criteria checked",
  "roadmap.md: Slice 2 items checked", "notes.md: appended threading
  gotcha"
- per-file old commit SHA → new commit SHA
- **Sibling evidence consulted** (master-reconcile only): for each
  sibling listed by recency, report `<branch>` — liveness
  (`live` / `orphaned-ref`), newest `head_date`, per-file verdict
  (`same` / `modified` / `sibling-only`), and a one-line contribution
  (e.g., "checked Slice 1 items 1–3 in roadmap", "notes: threading
  gotcha carried forward"). Also note siblings dropped as identical and
  siblings skipped as too old (the "plus K more" bucket, if any).
- recovery hint:

```text
Recover a prior file with:
brmem get <slug>/<file> --namespace memjectives --at <old-sha>
```

## Edge cases

- **Detached HEAD** → abort.
- **Current branch has no memjective files** → abort; direct the user to
  run `dev-memjective-next` on this branch to carry-forward and implement
  a slice before re-running `update`.
- **Current branch has files for 2+ distinct memjective slugs** → abort;
  invalid state.
- **Current branch is master** → run the master-reconcile variant
  (§5a sibling-evidence gathering, then §5 rewrite). This variant is
  normally invoked by `dev-memjective-next` on master; direct user
  invocation is allowed but should confirm with the user before
  writing.
- **Sibling ref exists but its branch has been deleted** → treat the
  ref as valid evidence; label it `orphaned-ref` in the report.
  Prefer corroboration from a live sibling or a merged PR on master
  before acting on its signal alone.

## Anti-patterns

- Updating the master-branch snapshot without the sibling-evidence
  gathering pass (§5a). The master-reconcile variant is mandatory on
  master; direct freehand `update` on master is forbidden.
- Copying a sibling snapshot verbatim onto master during reconcile.
  Verbatim copy is `dev-memjective-next`'s carry-forward primitive on
  slice branches, not `update`'s job on master. Sibling text is
  evidence, not source.
- Using `update`'s master-reconcile variant to "incorporate" a single
  merged PR's docs into root. That work belongs to
  `dev-memjective-reconcile`, which records the structured incorporation
  entry (with `source` / `root_before` / `root_after` `tree_sha`
  provenance). The `update` master-reconcile variant is for
  sibling-aggregation cases that don't map onto one merged PR.
- Regenerating any file from memory or from the original user brief when a
  real snapshot already exists.
- Silently deleting completed roadmap items or notes.
- Rewriting `body.md`'s Completion Criteria because the plan drifted. If
  the criteria no longer match the work, the memjective has outgrown the
  subsystem.
- Using `update` to rename sections or rebuild files wholesale.
- Doing any implementation work from inside this skill. Implementation
  happens inside `dev-memjective-next`, not here.
- Attaching a memjective onto a branch that has none. That is explicitly
  outside this skill's scope; `dev-memjective-next` performs the
  carry-forward as part of its workflow on a fresh slice branch.
