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

> For shared concepts — vocabulary, storage model, document anatomy,
> lifecycle, carry-forward semantics, and mutation contracts — see
> `../dev-memjective/SKILL.md`.

## Goal

Given an explicit memjective slug, load the best matching source, summarize
the document state, flag stale non-master branch snapshots, and suggest a
collision-checked kebab-case slug for the next PR-sized slice.

`next` writes nothing: no `brmem put`, no `brmem copy`, no branch creation,
no checkbox edits, and no working-tree changes. It is optional in the
memjective lifecycle; users can skip it when they already know what to do.

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

- **Slug, required.** Parse the memjective slug from the prompt. Never infer
  it from "the only memjective" on a branch; branches may carry multiple
  slugs. If the prompt lacks a slug, ask which memjective to inspect.
- **Source, optional.** The user may name a branch, a master-branch snapshot
  slug, or a local file path. Use an explicit source directly. If it is
  invalid, stop and report the problem instead of falling back to discovery.

## Core Rules

- **Read-only.** Do not mutate brmem, git refs, branches, files, checkboxes,
  or the working tree.
- **Content-only.** Do not inspect repo source files to audit progress.
  Implementation evidence is folded back later by `dev-memjective-update`.
- **Source labels are mandatory.** Every report says whether content came
  from the current-branch snapshot, an ancestor-branch snapshot, the
  master-branch snapshot, an explicit branch, or a local file.
- **Prefer the nearest working snapshot.** Discovery order is current branch,
  nearest ancestor branch, then master.
- **No Graphite dependency.** Use raw git and brmem only; never use `gt` for
  source discovery.
- **Collision-safe suggestion.** Check the suggested slice slug against local
  branches and master-branch memjective slugs. On collision, warn and ask;
  do not auto-resolve.

## Workflow

### 1. Preflight

Confirm the repo and current branch:

```bash
git rev-parse --show-toplevel
git rev-parse --abbrev-ref HEAD
```

Abort if not in a git repo, on detached `HEAD`, or missing the required slug.

### 2. Resolve the Source

Use the requested slug to choose which memjective to inspect, then resolve the
copy to read:

1. **Explicit source from the user**
   - Branch: require the memjective's required content file in that branch's
     snapshot.
   - Master snapshot slug: require it on `master`; if it differs from the
     requested slug, surface the mismatch and ask.
   - Local file: read it as the required content file and label the source
     `local file`.
2. **Current branch**: use it when
   `brmem check` succeeds for the required content file.
3. **Ancestor branch**: enumerate `refs/brmem/ns/memjectives/*`, decode
   `---` to `/`, and keep only live non-master branches that are ancestors of
   `HEAD` and carry the required content file. Choose the candidate with the
   smallest `git rev-list --count refs/heads/<branch>..HEAD`; ask on ties.
4. **Master branch**: use it when `brmem check` succeeds for the required
   content file on `master`.

If no source contains the slug, ask the user to name a branch, master slug, or
local file. Do not return an empty report.

Record the source type, source branch when applicable, and which known content
files are present under `<slug>/`.

### 3. Load the Content

Read the resolved content files with
`brmem get <slug>/<file> --namespace memjectives --branch <source-branch>`, or
read the explicit local file directly. Interpret them using this skill's
content inventory and the anatomy in `../dev-memjective/SKILL.md`.

### 4. Check Freshness

Run this only for non-master branch snapshots: current branch, ancestor
branch, or explicit branch. Skip master and local files.

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
brmem check <suggested-slug>/body.md --namespace memjectives --branch master
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
After implementing the slice, run dev-memjective-update <slug> to record
progress.
```

If the freshness advisory fired, prepend a reminder to update the stale source
branch before claiming a new slice.

## Edge Cases And Anti-Patterns

- Missing slug or detached `HEAD`: abort and ask/describe the issue.
- Stale brmem refs for deleted branches: ignore them during ancestor
  discovery.
- Multiple ancestor candidates at the same nearest distance: list the tied
  branches and ask.
- Source has only the required content file: report that no optional progress
  surface exists; fall back to progress guidance, or ask if the next slug is
  ambiguous.
- Master source: never run the freshness check; master rewrites go through
  `dev-memjective-reconcile`, not `dev-memjective-update`.
- Never auto-pick a slug, auto-resolve a collision, inspect source code for
  drift, attach/carry forward a snapshot, or implement work during `next`.
