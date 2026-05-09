---
name: objective-update
description: "Command: objective-update"
allowed-tools:
  - "Bash(git rev-parse *)"
  - "Bash(git log *)"
  - "Bash(git show *)"
  - "Bash(objective exec update-precheck *)"
  - "Bash(objective exec claim *)"
  - "Bash(objective exec absorb-patches *)"
  - "Bash(brmem get *)"
  - "Bash(brmem put *)"
  - "Read"
  - "Write"
---

# objective-update

Refresh the current branch's objective snapshot before another branch claims
from it.

> For the canonical-vs-branch model, document anatomy, lifecycle, and shared
> rewrite rules, see `../objective/SKILL.md` and
> `../objective/references/mutation-contract.md`.

## Goal

Given an explicit, resolved, or implicitly claimed objective slug, make the
current branch's snapshot under `<slug>/` current with commits on the current
branch. If the branch has no matching snapshot, delegate to the
`objective-claim` carry-forward skill first, then continue the normal update. Write only changed content files back to
`brmem`, then advance the machine-owned `<slug>/.absorbed.jsonl` marker so
deterministic freshness checks know which branch patches this snapshot
covers. Report old/new commit SHAs so prior snapshots are recoverable.

`update` mutates a **branch snapshot**, not the canonical objective.
Canonical state is stored on the repo's trunk branch (see
`../objective/SKILL.md`), so `update` aborts on the trunk branch and points to
`objective-reconcile`.

This is normally needed only for stacked PRs, when a later branch will claim
from this branch before this branch lands. For a simple single-PR path, merge
the PR and run `objective-reconcile` on the trunk branch instead.

## Content Files And Marker

Read every present file under `<slug>/` on the current branch (`body.md`
required; `roadmap.md` / `notes.md` optional). Rewrite only files whose
content changed. Never read or write other branch snapshots or canonical
state.

The `.absorbed.jsonl` file is not prose. Never hand-author it. It is written
only by `objective exec absorb-patches` after evidence triage confirms the
snapshot covers the current branch work.

## Inputs

- **Slug, usually required.** Parse the slug from the prompt and pass it
  to the Step 1 precheck. If the prompt names no slug, omit the argument
  and let the precheck enumerate slugs attached to the current branch: a
  single slug auto-resolves, multiple slugs returns
  `ambiguous_objective` (ask the user to choose), zero slugs returns
  `no_objective_on_branch` (run the implicit claim flow below). Never derive
  the slug from the branch name — branches commonly carry a parent
  objective whose slug differs from the branch's slice slug.

## Core Rules

- **Branch snapshots only.** `update` writes only to the current branch's
  `<slug>/` snapshot. Abort on the trunk branch or detached `HEAD`.
- **Slug auto-pick is single-slug only.** When the prompt names a slug, use
  it. When it doesn't, auto-resolve only when the current branch carries
  exactly one slug under namespace `objectives`; surface that resolved
  slug in the final report. Multiple attached slugs still require the user
  to pick — never guess between slices that happen to coexist on a branch.
- **One slug per invocation.** Multiple slugs on the branch are fine; operate
  only on the explicit slug.
- **No-op only when structurally fresh.** If precheck reports
  `data.freshness == "fresh"`, report in sync and exit without loading or
  writing files. If freshness is stale, always triage the branch commits.
- **Advance the marker after successful triage.** If evidence triage finds
  every branch commit already documented, skip Markdown rewrites but still
  run `objective exec absorb-patches` to record that the snapshot covers the
  current branch patch IDs.
- **Conservative per-file rewrites.** Apply the shared rules in
  `../objective/references/mutation-contract.md`. Do not regenerate
  files from the original brief, rename sections, delete history, or rebuild
  files wholesale.
- **Attach missing snapshots only through claim.** If `<slug>/` is not present
  on the branch, delegate to the `objective-claim` skill and then rerun the
  update precheck. Do not synthesize or hand-copy snapshot files during
  `update`, and do not reproduce claim mechanics here.
- **Serialize snapshot writes.** `brmem put` advances the branch snapshot ref.
  When updating multiple files under the same objective snapshot, run each
  `brmem put` one at a time and wait for its result before starting the next.
  Never run these writes via `multi_tool_use.parallel`, background jobs,
  `xargs -P`, or shell `&` parallelism.
- **Never implement work.** `update` records progress; it does not write
  code or perform the slice's engineering.

## Workflow

### 1. Precheck

Run the precheck CLI and parse the JSON envelope:

```bash
objective exec update-precheck [<slug>] --format json
```

The envelope handles preflight (current branch, trunk refusal, detached
HEAD), slug resolution, file presence + old SHAs, and the `trunk..HEAD`
commit list in one round-trip.

Handle the result. `update-precheck` may exit 2 for preparation-control
states; `no_objective_on_branch` and `slug_not_attached` are expected
preparation signals that route to Step 1a, not terminal failures. Other
exit-2 errors are terminal unless explicitly handled below.

- **`error_type` set**: handle only the attach-missing cases here; surface
  all other errors and stop.
  - `no_objective_on_branch` — no slugs attached on this branch; continue to
    Step 1a to implicitly claim one.
  - `slug_not_attached` — the named slug has no snapshot on this branch;
    continue to Step 1a to claim that slug.
  - `detached_head` — not on a branch; user must check out a branch.
  - `on_trunk_branch` — `update` operates on branch snapshots only;
    direct the user to `objective-reconcile`.
  - `ambiguous_objective` — multiple slugs already attached; ask the user to
    name one explicitly and re-run with the slug argument.
  - `git_failed` — surface the underlying git error verbatim.
- **`data.freshness == "fresh"`**: report and exit without loading or
  writing files:

  ```text
  objective <data.slug> is in sync with HEAD on <data.branch> - no update needed
  ```

  `freshness` is true when every content patch ID in `trunk..HEAD` is
  already absorbed by the branch snapshot's `.absorbed.jsonl` marker.
  `data.in_sync` is a compatibility alias for `data.freshness == "fresh"`.

- **Otherwise**: carry forward `data.slug`, `data.branch`, the three
  `FilePrecheck` records (`body`, `roadmap`, `notes` — `present` flags
  drive "only run for present files" gating; `head_sha` values are the
  old SHAs for the recovery hint), `data.branch_head_sha` (the exact HEAD
  reviewed by this run), `data.branch_commits` (evidence list for triage),
  and any `data.absorbed_marker_diagnostics`. Continue to step 2.

If `data.absorbed_marker_diagnostics` is non-empty, mention that the marker is
malformed and will be rewritten if triage succeeds.

### 1a. Implicit claim when missing

If `update-precheck` reports `no_objective_on_branch` or `slug_not_attached`,
delegate to the `objective-claim` skill (passing the slug from the prompt
when present). Do not reproduce claim mechanics here.

If `objective-claim` reports ambiguity (multiple candidate slugs or tied
source branches), present the alternatives, ask the user to choose, and
rerun `objective-claim` with the selected slug (and `--from <branch>` when
the ambiguity was over source branches). If `objective-claim` reports a
real error, surface the message and stop.

After a successful claim, capture the resolved slug and rerun the precheck:

```bash
objective exec update-precheck <resolved-slug> --format json
```

Then continue Step 1's normal stale/fresh handling.

### 2. Load target files

For every `FilePrecheck` with `present == true`, load the content:

```bash
brmem get <slug>/body.md --namespace objectives > /tmp/<slug>-body.md
brmem get <slug>/roadmap.md --namespace objectives > /tmp/<slug>-roadmap.md
brmem get <slug>/notes.md --namespace objectives > /tmp/<slug>-notes.md
```

Skip absent files. Use the per-file `head_sha` from the precheck envelope
as the "old SHA" in the final report's recovery hint — do not re-query.

### 3. Triage: net-new content?

Before drafting edits, classify each commit in `data.branch_commits` from
step 1:

- **Already-documented** — subject and stat match a roadmap item that's
  already checked off, or a `notes.md` section that already names the same
  types/methods/tests. Typical causes: rebase with `--reset-author`, late
  cherry-pick of an already-folded commit, squash-merge of a substack.
- **Net-new** — introduces work not yet reflected in body/roadmap/notes.

When a commit's subject alone is not enough to classify it, fetch detail:

```bash
git show --stat --oneline <sha>
```

If every post-snapshot commit is already documented, skip steps 4–5 and
continue to step 6. Do not draft "freshening" edits to a snapshot whose
content already covers the work.

### 4. Rewrite conservatively

Apply the shared conservative rewrite rules in
`../objective/references/mutation-contract.md`.

Typical update work:

- check completed roadmap items under the relevant slice section
- preserve existing visible slice markers on roadmap section headings
- keep child checklist tasks grouped under their slice section; do not add
  slice markers to child tasks
- when splitting or adding a PR-sized roadmap section, assign the new section
  a fresh visible ``(slice: `<slug>`)`` marker immediately
- check completion criteria that this branch actually satisfied
- move `Status:` only when the branch state changed categorically
- append durable findings to `notes.md`
- create `notes.md` only when there is a durable finding worth preserving

Do not regenerate files from the original brief, rename sections, delete
history, remove existing slice markers, or attach a missing snapshot.

### 5. Persist changed files

Write changed content to temporary files, then store only changed files back
to the same branch snapshot **serially**. Run at most one `brmem put` at a
time and capture its commit SHA before starting the next write:

```bash
brmem put <slug>/body.md --namespace objectives --file <temp-body> --format json
brmem put <slug>/roadmap.md --namespace objectives --file <temp-roadmap> --format json
brmem put <slug>/notes.md --namespace objectives --file <temp-notes> --format json
```

Skip absent or unchanged files. Do not parallelize these commands —
parallel writes to the same branch snapshot ref race and lose updates.

### 6. Advance absorbed marker

After content has been confirmed covered — either by existing prose or by
the rewrites from steps 4–5 — write the deterministic marker:

```bash
objective exec absorb-patches <slug> --expected-head <data.branch_head_sha> --format json
```

Handle failures:

- `head_moved` — stop and tell the user to rerun `objective-update`; a new
  commit landed after triage and must be reviewed before absorption.
- `git_failed`, `detached_head`, `on_trunk_branch`, `slug_not_attached` —
  surface the message and stop.

Capture the marker's `old_head_sha`, `new_head_sha`, and record count for the
final report.

### 7. Report

Include:

- slug and branch
- files touched with one-line notes
- old SHA to new SHA for each changed file
- `.absorbed.jsonl` old SHA to new SHA, or `created` when no old marker existed
- branch evidence used
- recovery hint:

```text
brmem get <slug>/<file> --namespace objectives --at <old-sha>
```

When no files were rewritten, report:

- slug, branch
- `snapshot already documents all post-snapshot commits`
- `.absorbed.jsonl` marker advanced
- the commit list checked, with a one-line rationale per commit (e.g.,
  `<sha> <subject>` → matches Slice N already in `notes.md`)
- the marker commit SHA so the user can audit / recover

## Edge Cases and Anti-Patterns

- Detached `HEAD`: abort.
- Current branch is the trunk branch: abort and point to `objective-reconcile`.
- Slug not attached or no objective on the branch: run the implicit claim flow,
  prompt for slug/source selection when `objective-claim` is ambiguous, then
  rerun `update-precheck` before mutating prose.
- Multiple attached slugs with no slug in the prompt: ask the user to
  choose. Never auto-pick to break the tie.
- Snapshot fresh relative to HEAD: report in sync and write nothing.
- HEAD changed after precheck: stop on `head_moved`; do not absorb untriaged
  commits.
- Multiple slugs on the branch: fine; operate only on the explicit slug.
- Never manually construct claim plan files during `update`; delegate
  missing snapshot attachment to `objective-claim`.
- Never parallelize `brmem put` writes to the same branch snapshot.
- Never implement work, attach a snapshot, rewrite canonical state, delete
  completed roadmap items, remove existing roadmap slice markers, hand-edit
  `.absorbed.jsonl`, or rebuild files wholesale during `update`.
