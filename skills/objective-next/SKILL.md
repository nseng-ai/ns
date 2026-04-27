---
name: objective-next
description: "Command: objective-next"
allowed-tools:
  - "Bash(git rev-parse *)"
  - "Bash(git for-each-ref *)"
  - "Bash(git ls-tree *)"
  - "Bash(git merge-base *)"
  - "Bash(git rev-list *)"
  - "Bash(git log *)"
  - "Bash(brmem check *)"
  - "Bash(brmem get *)"
  - "Bash(brmem list *)"
  - "Read"
---

# objective-next

Read-only status peek and next-slice recommendation for an objective.

> For shared concepts — vocabulary, storage model, content anatomy, lifecycle,
> carry-forward semantics, and mutation contracts — see
> `../objective/SKILL.md`.

## Goal

Given an objective slug — supplied directly or resolved from the current
branch's claimed objectives — load the snapshot from the current branch,
summarize the content state, flag stale branch snapshots, and suggest a
collision-checked kebab-case slug for the next PR-sized slice.

`next` writes nothing: no `brmem put`, no `brmem copy`, no branch creation,
no checkbox edits, and no working-tree changes. It is the normal planning
step before `objective-claim`: choose the slice first, then create a
branch and attach the objective snapshot to that branch.

## Content Files

Use `<slug>/body.md` as the presence check. When loading, reporting, or
checking freshness, discover which known files (`body.md`, `roadmap.md`,
`notes.md`) exist under `<slug>/` and operate only on that set.

## Inputs

- **Slug, optional.** Parse the objective slug from the prompt when present.
  Otherwise defer to Step 2's enumeration of slugs claimed on the current
  branch. Never infer a slug from the branch name; a branch commonly
  carries a parent objective whose slug differs from the branch's slice
  slug.

`next` plans against the current branch only. There is no `--from`,
`--from-file`, or `--branch <other>` flag — to inspect a different branch,
check it out first.

## Core Rules

- **Read-only.** Do not mutate brmem, git refs, branches, files, checkboxes,
  or the working tree.
- **Content-only.** Do not inspect repo source files to audit progress.
  Implementation evidence is folded back later by `objective-update`.
- **Current-branch-only source.** Always load the snapshot claimed on the
  current branch. There is no source cascade and no ancestor walk; if the
  current branch carries no claim, abort with the master-aware empty-branch
  error in Step 2.
- **No Graphite dependency.** Use raw git and brmem only.
- **Collision-safe suggestion.** Check the suggested slice slug against local
  branches and canonical objective slugs. On collision, warn and ask;
  do not auto-resolve.

## Workflow

### 1. Preflight

Confirm the repo and current branch:

```bash
git rev-parse --show-toplevel
git rev-parse --abbrev-ref HEAD
```

Abort if not in a git repo or on detached `HEAD`. Slug presence is resolved
in Step 2 from the current branch's claims.

### 2. Resolve the Slug from the Current Branch

Enumerate slugs claimed on the current branch:

```bash
brmem list --namespace objectives --branch <current> --format json
```

Split each returned key on `/`, take the first segment, and deduplicate.

If the prompt named a slug, require it to be present in this set; otherwise
abort with "slug `<requested>` not claimed on `<current>`; run
`objective-claim <requested>` first."

Otherwise resolve from the enumeration:

- **Single slug**: use it. Surface the resolved slug name in the final
  report so a wrong-slug guess is visible.
- **Multiple slugs**: list them with one-line context (the title from each
  `body.md` if cheap to fetch) and ask which to inspect. A branch may
  legitimately carry two unrelated parent objectives; never auto-pick.
- **Zero slugs**: emit the master-aware empty-branch error and abort.

#### Empty-branch error (master-aware)

- On `master` with zero canonicals: "no canonical objectives; run
  `objective-create` to author one."
- On `master` with N canonicals: "master holds N canonical objectives; pass
  a slug to `objective-next <slug>` to plan against one." Do not surface
  the multi-pick prompt on master — it is theater, and the user should
  pick explicitly.
- Off `master` with no claim: "no objective claimed on this branch; run
  `objective-claim` to attach the parent's objective, or
  `objective-create` to start a new one."

The source for loading is always the current branch's snapshot; record the
source label `current branch <branch>` and which known content files are
present under `<slug>/`.

### 3. Load the Content

Read the resolved content files with
`brmem get <slug>/<file> --namespace objectives --branch <current>`.
Interpret them using this skill's content inventory and the anatomy in
`../objective/SKILL.md`.

### 4. Check Freshness

When the current branch is `master`, skip the freshness check (canonical
storage's lifecycle is `objective-reconcile`, not `objective-update`).

Otherwise, compare the newest `head_date` reported by
`brmem check --format json` across the present files with the current
branch's `git log -1 --format=%cI` time. If the branch HEAD is newer,
include one advisory line:

```text
Snapshot is behind HEAD on <current-branch> -- consider running
objective-update <slug> on that branch first.
```

If the relevant `head_sha` is reachable and cheap to compare, include the
commit count behind; otherwise omit the count. The advisory is the important
part.

### 5. Report Status

Keep the status report tight enough to verify at a glance:

- source label (`current branch <branch>`) and slug
- content files present
- title and status from the required content file
- completion/progress state from the loaded content, clearly marking open work
- durable findings presence, summarized in one line when present
- freshness advisory, if it fired
- description/goals summary only when it adds signal

### 6. Suggest the Next-Slice Slug

Default to the first unchecked slice-like item that still fits the objective's
progress guidance. If priority is non-obvious, present 2-3 candidate slugs with
one-line rationales and ask the user to choose.

Slug rules:

- lowercase ASCII, hyphen-separated
- specific to the slice, not the whole objective
- no `.md` suffix
- usually 50 characters or fewer
- no redundant `objective-` prefix and no verbatim repeat of the parent slug

Collision check before finalizing:

```bash
git rev-parse --verify --quiet refs/heads/<suggested-slug>
brmem check <suggested-slug>/<required-content-file> --namespace objectives --branch master
```

If either exists, warn and ask whether to pick another slug, append a suffix,
or proceed anyway.

### 7. Final Output

Return:

- source label and slug
- the status summary
- suggested next-slice slug and collision result
- next-step hint:

```text
To proceed: write a plan file using <suggested-slug>, run
brmem-create-branch, navigate to the new branch (your choice of tool),
then run objective-claim. After implementing the slice, merge the PR and
run objective-reconcile <slug> on master.
```

If the freshness advisory fired, prepend a reminder to update the stale
current branch before creating the next slice branch.

## Edge Cases And Anti-Patterns

- Detached `HEAD`: abort. Missing slug: only abort after Step 2's
  current-branch enumeration emits the master-aware empty-branch error.
- Branch name does not equal slug. A branch named after a slice (e.g.,
  `pool-state-assignment-primitives`) commonly carries the parent
  objective's snapshot (e.g., `twerk-slots-cleanup`). Never derive the
  slug from the branch name; enumerate `<slug>/` keys with `brmem list`
  on the current branch.
- Multiple slugs on the current branch: legitimate when two unrelated
  parent objectives are claimed on the same branch; list both and ask.
- Source has only the required content file: report that no optional
  progress surface exists; fall back to progress guidance, or ask if the
  next slug is ambiguous.
- Current branch is `master`: skip the freshness check; canonical rewrites
  go through `objective-reconcile`, not `objective-update`. On master
  with no slug, refuse to multi-pick — require an explicit slug.
- Never auto-pick a slug from a multi-slug current branch, auto-resolve a
  collision, inspect source code for drift, attach/carry forward a
  snapshot, walk ancestors or canonical state outside the current branch,
  or implement work during `next`.
