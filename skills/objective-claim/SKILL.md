---
name: objective-claim
description: "Command: objective-claim"
allowed-tools:
  - "Bash(git rev-parse *)"
  - "Bash(git for-each-ref *)"
  - "Bash(git merge-base *)"
  - "Bash(git rev-list *)"
  - "Bash(brmem check *)"
  - "Bash(brmem copy *)"
  - "Bash(brmem put *)"
  - "Bash(brmem list *)"
  - "Read"
---

# objective-claim

Carry-forward primitive for attaching an objective snapshot to a target
branch.

> For shared concepts — vocabulary, storage model, content anatomy, lifecycle,
> carry-forward semantics, and mutation contracts — see
> `../objective/SKILL.md` and
> `../objective/references/mutation-contract.md`.

## Goal

Given an objective slug — supplied directly or resolved from the nearest
ancestor branch's claimed objectives — resolve one source and copy it
verbatim to the target branch snapshot.

`claim` only attaches existing workstream state. It never edits, merges, or
summarizes objective content; reshaping belongs to `objective-update`
on branch snapshots or `objective-reconcile` into canonical state.

## Content Files

Use `<slug>/body.md` as the source presence check. For branch sources, carry
the entire `<slug>/` directory with `brmem copy`; do not filter the copy to
the current `body.md` / `roadmap.md` / `notes.md` inventory.

## Inputs

- **Slug, optional.** Parse the objective slug from the prompt when present.
  When the prompt lacks a slug, defer to Step 2a's no-slug resolution: walk
  the nearest live ancestor that carries any objectives, prompt on
  ambiguity, and fall through to canonical only when no ancestor does.
  Never infer a slug from a branch name; branches may carry multiple slugs.
- **Target, optional.** `--target <branch>` overrides the write destination.
  Otherwise use the current branch.
- **Source, optional.** `--from <branch>` uses an explicit source branch.
  `--from-file <path>` treats a local file as `<slug>/body.md`. These flags
  are mutually exclusive, both imply the caller already knows the slug, and
  abort if no slug is supplied alongside either. If an explicit source is
  invalid, stop and report the problem instead of falling back to discovery.

## Core Rules

- **Verbatim carry-forward.** Copy exactly one source. No edits, section
  rewrites, annotations, synthesis, or cross-snapshot fusion.
- **One slug per invocation.** To attach two objectives, run `claim` twice.
- **Write only to the target branch.** Never write to canonical storage or any
  non-target branch.
- **Target must be empty for this slug.** Abort if the target already carries
  any key under `<slug>/`; use `objective-update` or
  `objective-reconcile` to advance an attached snapshot.
- **Prefer the nearest working snapshot.** Discovery order is nearest
  ancestor branch snapshot, then canonical state. Explicit sources bypass
  discovery.
- **No Graphite dependency.** Use raw git and brmem only; never use `gt` for
  source discovery.

## Workflow

### 1. Preflight

Confirm the repo and current branch:

```bash
git rev-parse --show-toplevel
git rev-parse --abbrev-ref HEAD
```

Resolve `<target>` from `--target` or the current branch. Abort if not in a
git repo, given both source flags, given `--from` or `--from-file` without a
slug, targeting `master`, or on detached `HEAD` without `--target`. The
target collision check moves to Step 2b once the slug is known.

### 2a. Resolve the Slug (when not supplied)

If the prompt named a slug, skip to Step 2b. Otherwise, find candidate slugs
by walking ancestors nearest-first, then continue to Step 2b.

1. Enumerate `refs/brmem/ns/objectives/*`, decode `---` to `/`, and keep
   only live non-master branches that are ancestors of `HEAD` and are not
   `<target>`. Order them nearest-first by
   `git rev-list --count refs/heads/<branch>..HEAD`.
2. Walk that list and stop at the **nearest** ancestor that carries any
   objectives. Use _only_ that ancestor's slug set as candidates; do not
   merge slugs across multiple ancestor levels. Enumerate slugs with:

   ```bash
   brmem list --namespace objectives --branch <ancestor> --format json
   ```

   Split each returned key on `/`, take the first segment, and deduplicate.
3. If no live ancestor carries any objectives, fall through to canonical
   storage (`master`) and use master's slug set as the candidate set.
   Master typically carries many slugs, so the multi-pick prompt below
   will be long — that is intentional friction signaling the user should
   pass a slug explicitly.
4. Apply selection:
   - **Exactly one candidate**: use it; continue to Step 2b's collision
     check, then Step 2c's source cascade unchanged.
   - **Multiple candidates**: list each with a one-line context (the title
     from `body.md` if cheap to fetch) and ask which to claim.
   - **Zero candidates** (canonical also empty): abort with "no objectives
     reachable; run `objective-create` to author one or pass `--from-file
     <path>`."

### 2b. Target Collision Check

Now that the slug is known, ensure the target is free for it:

```bash
brmem list --namespace objectives --branch <target> --format json
```

Abort if any returned key starts with `<slug>/`. Other slugs on the target
are fine.

### 2c. Resolve the Source

Use the resolved slug to choose which objective to attach, then resolve the
copy to carry:

1. **Local file**: if `--from-file <path>` is given, require the file to exist
   and be readable. Carry it as `<slug>/body.md` only.
2. **Explicit branch**: if `--from <branch>` is given, require
   `<slug>/body.md` there with `brmem check`.
3. **Ancestor branch**: enumerate `refs/brmem/ns/objectives/*`, decode
   `---` to `/`, and keep only live non-master branches that are ancestors of
   `HEAD`, are not `<target>`, and carry `<slug>/body.md`. Choose the
   candidate with the smallest
   `git rev-list --count refs/heads/<branch>..HEAD`; ask on ties.
4. **Canonical record**: use canonical storage (`master`, the permanent
   canonical branch) when `brmem check` succeeds for `<slug>/body.md`.

If no source contains the slug, ask the user to name `--from`, name
`--from-file`, or run `objective-create` if the slug is new.

Record the source label:

- `local file <path>`
- `branch <branch> (explicit --from)`
- `ancestor branch <branch>`
- `canonical objective`

### 3. Carry Forward

For branch sources, perform one atomic copy:

```bash
brmem copy --namespace objectives \
  --from-branch <source> --to-branch <target> \
  --key-glob '<slug>/*'
```

This carries every file present under `<slug>/` on the source.

For local-file sources, perform one put:

```bash
brmem put <slug>/body.md --namespace objectives \
  --branch <target> --file <path>
```

Do not synthesize `roadmap.md` or `notes.md` from a local file.

Capture the destination ref and commit SHA from the brmem output.

### 4. Final Output

Return:

- objective slug
- source label
- target branch
- files carried
- destination ref and commit SHA
- next-step hint:

```text
This branch is ready for implementation. After implementing the slice, merge
the PR and run objective-reconcile <slug> on master. Run
objective-update <slug> only if another branch will claim from this
branch before it lands.
```

## Edge Cases And Anti-Patterns

- Detached `HEAD` without `--target`, `--from` or `--from-file` without a
  slug, `--from` plus `--from-file`, or `--target master`: abort and
  describe the issue. The master-target guard exists because claim attaches
  canonical objectives to feature branches; master is the canonical store.
- No-slug invocation with no candidates anywhere (no live ancestor carries
  objectives and canonical storage is empty): abort with the
  `objective-create` / `--from-file` hint instead of guessing.
- Target already carries `<slug>/`: abort. The precondition is per-slug, so
  other slugs on the target are not a conflict.
- Explicit source lacks `<slug>/body.md`: abort instead of falling back to
  discovery.
- Stale brmem refs for deleted branches: ignore them during ancestor
  discovery.
- Multiple nearest ancestor candidates at the same distance: list the tied
  branches and ask.
- Slug exists only in canonical storage: use the canonical objective.
- Slug exists nowhere: ask for an explicit source or create the objective
  first.
- Never auto-pick a slug from a branch name or from a multi-slug candidate
  set (Step 2a's single-candidate branch is the only auto-resolution),
  auto-resolve a source tie, write to canonical storage, carry only
  `body.md` from a branch source, synthesize sibling files from
  `--from-file`, fuse multiple snapshots, use Graphite for discovery, run
  `update`, or implement work during `claim`.
