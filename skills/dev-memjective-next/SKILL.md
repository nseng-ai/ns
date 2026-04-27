---
name: dev-memjective-next
description: Command
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
metadata:
  internal: true
---

<!-- INTERNAL SKILL: twerk-only. Local-first memjective subsystem on top of brmem. -->

# dev-memjective-next

Read-only status peek and next-slice recommendation for a memjective.

> For shared concepts — vocabulary, storage model, content anatomy, lifecycle,
> carry-forward semantics, and mutation contracts — see
> `../dev-memjective/SKILL.md`.

## Goal

Given a memjective slug — supplied directly or resolved from a branch-scoped
question — load the best matching source, summarize the content state, flag
stale branch snapshots, and suggest a collision-checked kebab-case slug for
the next PR-sized slice.

`next` writes nothing: no `brmem put`, no `brmem copy`, no branch creation,
no checkbox edits, and no working-tree changes. It is the normal planning
step before `dev-memjective-claim`: choose the slice first, then create a
branch and attach the memjective snapshot to that branch.

## Memjective Content

Until the stack has a repo-wide single source of truth for memjective
contents, this section is the only place in this skill that names the current
content files.

A memjective snapshot is the content stored under `<slug>/` in namespace
`memjectives`. Current content files:

- `body.md` (required): stable workstream spine and progress guidance.
- `roadmap.md` (optional): ordered slice plan and progress surface.
- `notes.md` (optional): durable findings.

When resolving a source, use the required content file from this inventory as
the presence check. When loading, reporting, or checking freshness, discover
which known content files exist under `<slug>/` and operate on that set.

## Inputs

- **Slug, usually required.** Parse the memjective slug from the prompt and
  use it directly. When the prompt is a branch-scoped discovery question
  (e.g., "what memjective is on this branch?") and names no slug, defer to
  Step 2a to enumerate slugs on the target branch instead of asking up
  front. Never infer a slug from the branch name; branches commonly carry a
  parent memjective whose slug differs from the branch's slice slug.
- **Source, optional.** The user may name a branch, a canonical memjective
  slug, or a local file path. Use an explicit source directly. If it is
  invalid, stop and report the problem instead of falling back to discovery.

## Core Rules

- **Read-only.** Do not mutate brmem, git refs, branches, files, checkboxes,
  or the working tree.
- **Content-only.** Do not inspect repo source files to audit progress.
  Implementation evidence is folded back later by `dev-memjective-update`.
- **Source labels are mandatory.** Every report says whether content came
  from the current-branch snapshot, an ancestor-branch snapshot, canonical
  state, an explicit branch, or a local file.
- **Prefer the nearest working snapshot.** Discovery order is current branch,
  nearest ancestor branch snapshot, then canonical state.
- **No Graphite dependency.** Use raw git and brmem only; never use `gt` for
  source discovery.
- **Collision-safe suggestion.** Check the suggested slice slug against local
  branches and canonical memjective slugs. On collision, warn and ask;
  do not auto-resolve.

## Workflow

### 1. Preflight

Confirm the repo and current branch:

```bash
git rev-parse --show-toplevel
git rev-parse --abbrev-ref HEAD
```

Abort if not in a git repo or on detached `HEAD`. Defer slug presence to
Step 2a; a missing slug is only fatal when no inverse-discovery path applies.

### 2. Resolve the Slug, Then the Source

#### 2a. Resolve the Slug

When the prompt names a slug, use it and skip to 2b. Otherwise, the question
must be branch-scoped (current branch by default, or an explicit branch the
user named). Enumerate slugs on that branch:

```bash
brmem list --namespace memjectives --branch <branch> --format json
```

Split each returned key on `/` and take the first segment. Deduplicate.

- **Single slug**: use it. Surface the resolved slug name in the final
  report so a wrong-slug guess is visible.
- **Multiple slugs**: list them with one-line context (e.g., the title from
  each `body.md` if cheap to fetch) and ask which to inspect. Branches
  routinely carry both a parent memjective and an in-flight slice doc;
  never auto-pick.
- **Zero slugs**: fall back to ancestor-branch enumeration as in 2b case #3,
  collecting the slug set across live ancestor snapshots. If still empty,
  ask the user to name a slug or source. Do not abort on bare slug absence.

#### 2b. Resolve the Source

Use the resolved slug to choose which memjective to inspect, then resolve
the copy to read:

1. **Explicit source from the user**
   - Branch: require the memjective's required content file in that branch's
     snapshot.
   - Canonical slug: require it in canonical storage (`master` today); if it
     differs from the requested slug, surface the mismatch and ask.
   - Local file: read it as the required content file and label the source
     `local file`.
2. **Current branch**: use it when
   `brmem check` succeeds for the required content file.
3. **Ancestor branch**: enumerate `refs/brmem/ns/memjectives/*`, decode
   `---` to `/`, and keep only live non-master branches that are ancestors of
   `HEAD` and carry the required content file. Choose the candidate with the
   smallest `git rev-list --count refs/heads/<branch>..HEAD`; ask on ties.
4. **Canonical state**: use it when `brmem check` succeeds for the required
   content file in canonical storage (`master` today).

If no source contains the slug, ask the user to name a branch, canonical slug,
or local file. Do not return an empty report.

Record the source type, source branch when applicable, and which known content
files are present under `<slug>/`.

### 3. Load the Content

Read the resolved content files with
`brmem get <slug>/<file> --namespace memjectives --branch <source-branch>`, or
read the explicit local file directly. Interpret them using this skill's
content inventory and the anatomy in `../dev-memjective/SKILL.md`.

### 4. Check Freshness

Run this only for branch snapshots: current branch, ancestor branch, or
explicit branch. Skip canonical state and local files.

Compare the newest `head_date` reported by `brmem check --format json` across
the present files with the source branch's `git log -1 --format=%cI` time. If
the branch HEAD is newer, include one advisory line:

```text
Snapshot is behind HEAD on <source-branch> -- consider running
dev-memjective-update <slug> on that branch first.
```

If the relevant `head_sha` is reachable and cheap to compare, include the
commit count behind; otherwise omit the count. The advisory is the important
part.

### 5. Report Status

Keep the status report tight enough to verify at a glance:

- source label and slug
- content files present
- title and status from the required content file
- completion/progress state from the loaded content, clearly marking open work
- durable findings presence, summarized in one line when present
- freshness advisory, if it fired
- description/goals summary only when it adds signal

If the user disagrees with the resolved source, ask which source to use and
rerun source resolution.

### 6. Suggest the Next-Slice Slug

Default to the first unchecked slice-like item that still fits the memjective's
progress guidance. If priority is non-obvious, present 2-3 candidate slugs with
one-line rationales and ask the user to choose.

Slug rules:

- lowercase ASCII, hyphen-separated
- specific to the slice, not the whole memjective
- no `.md` suffix
- usually 50 characters or fewer
- no redundant `memjective-` prefix and no verbatim repeat of the parent slug

Collision check before finalizing:

```bash
git rev-parse --verify --quiet refs/heads/<suggested-slug>
brmem check <suggested-slug>/<required-content-file> --namespace memjectives --branch master
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
To proceed: cut a branch (for example, gt create <suggested-slug>), then run
dev-memjective-claim <slug> --target <suggested-slug> to attach the snapshot.
After implementing the slice, merge the PR and run dev-memjective-reconcile
<slug> on master. Run dev-memjective-update <slug> only if you are stacking a
child branch before this branch lands.
```

If the freshness advisory fired, prepend a reminder to update the stale source
branch before claiming a new slice.

## Edge Cases And Anti-Patterns

- Detached `HEAD`: abort. Missing slug: only abort after Step 2a
  inverse-discovery fails to resolve a unique slug.
- Stale brmem refs for deleted branches: ignore them during ancestor
  discovery.
- Branch name does not equal slug. A branch named after a slice (e.g.,
  `pool-state-assignment-primitives`) commonly carries the parent
  memjective's snapshot (e.g., `twerk-slots-cleanup`). Never derive the
  slug from the branch name; enumerate `<slug>/` keys with `brmem list`
  instead.
- Multiple ancestor candidates at the same nearest distance: list the tied
  branches and ask.
- Source has only the required content file: report that no optional progress
  surface exists; fall back to progress guidance, or ask if the next slug is
  ambiguous.
- Canonical source: never run the freshness check; canonical rewrites go
  through `dev-memjective-reconcile`, not `dev-memjective-update`.
- Never auto-pick a slug, auto-resolve a collision, inspect source code for
  drift, attach/carry forward a snapshot, or implement work during `next`.
