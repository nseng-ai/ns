---
name: dev-memjective-claim
description: Command
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
metadata:
  internal: true
---

<!-- INTERNAL SKILL: twerk-only. Local-first memjective subsystem on top of brmem. -->

# dev-memjective-claim

Carry-forward primitive for attaching a memjective snapshot to a target
branch.

> For shared concepts — vocabulary, storage model, content anatomy, lifecycle,
> carry-forward semantics, and mutation contracts — see
> `../dev-memjective/SKILL.md` and
> `../dev-memjective/references/mutation-contract.md`.

## Goal

Given an explicit memjective slug, resolve one source snapshot and copy it
verbatim to the target branch's per-branch snapshot.

`claim` only attaches existing workstream state. It never edits, merges, or
summarizes memjective content; reshaping belongs to `dev-memjective-update`
on slice branches or `dev-memjective-reconcile` on master.

## Memjective Content

Until the stack has a repo-wide single source of truth for memjective
contents, this section is the only place in this skill that names the current
content files.

A memjective snapshot is the content stored under `<slug>/` in namespace
`memjectives`. Current content files:

- `body.md` (required): stable workstream spine and progress guidance.
- `roadmap.md` (optional): ordered slice plan and progress surface.
- `notes.md` (optional): durable findings.

Use `body.md` as the presence check when validating a source. For branch
sources, carry the entire `<slug>/` directory with `brmem copy`; do not filter
the copy to the current content inventory.

## Inputs

- **Slug, required.** Parse the memjective slug from the prompt. Never infer
  it from "the only memjective" on a branch; branches may carry multiple
  slugs. If the prompt lacks a slug, ask which memjective to attach.
- **Target, optional.** `--target <branch>` overrides the write destination.
  Otherwise use the current branch.
- **Source, optional.** `--from <branch>` uses an explicit source branch.
  `--from-file <path>` treats a local file as `<slug>/body.md`. These flags
  are mutually exclusive. If an explicit source is invalid, stop and report
  the problem instead of falling back to discovery.

## Core Rules

- **Verbatim carry-forward.** Copy exactly one source. No edits, section
  rewrites, annotations, synthesis, or cross-snapshot fusion.
- **One slug per invocation.** To attach two memjectives, run `claim` twice.
- **Write only to the target branch.** Never write to master or any other
  branch.
- **Target must be empty for this slug.** Abort if the target already carries
  any key under `<slug>/`; use `dev-memjective-update` or
  `dev-memjective-reconcile` to advance an attached snapshot.
- **Prefer the nearest working snapshot.** Discovery order is nearest
  ancestor branch, then master. Explicit sources bypass discovery.
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
git repo, missing the required slug, given both source flags, targeting
`master`, or on detached `HEAD` without `--target`.

Check the target collision precondition:

```bash
brmem list --namespace memjectives --branch <target> --format json
```

Abort if any returned key starts with `<slug>/`. Other slugs on the target are
fine.

### 2. Resolve the Source

Use the requested slug to choose which memjective to attach, then resolve the
copy to carry:

1. **Local file**: if `--from-file <path>` is given, require the file to exist
   and be readable. Carry it as `<slug>/body.md` only.
2. **Explicit branch**: if `--from <branch>` is given, require
   `<slug>/body.md` there with `brmem check`.
3. **Ancestor branch**: enumerate `refs/brmem/ns/memjectives/*`, decode
   `---` to `/`, and keep only live non-master branches that are ancestors of
   `HEAD`, are not `<target>`, and carry `<slug>/body.md`. Choose the
   candidate with the smallest
   `git rev-list --count refs/heads/<branch>..HEAD`; ask on ties.
4. **Master branch**: use it when `brmem check` succeeds for
   `<slug>/body.md` on `master`.

If no source contains the slug, ask the user to name `--from`, name
`--from-file`, or run `dev-memjective-create` if the slug is new.

Record the source label:

- `local file <path>`
- `branch <branch> (explicit --from)`
- `ancestor branch <branch>`
- `master snapshot`

### 3. Carry Forward

For branch sources, perform one atomic copy:

```bash
brmem copy --namespace memjectives \
  --from-branch <source> --to-branch <target> \
  --key-glob '<slug>/*'
```

This carries every file present under `<slug>/` on the source.

For local-file sources, perform one put:

```bash
brmem put <slug>/body.md --namespace memjectives \
  --branch <target> --file <path>
```

Do not synthesize `roadmap.md` or `notes.md` from a local file.

Capture the destination ref and commit SHA from the brmem output.

### 4. Final Output

Return:

- memjective slug
- source label
- target branch
- files carried
- destination ref and commit SHA
- next-step hint:

```text
Run dev-memjective-next <slug> to inspect the attached snapshot, or proceed
with implementation. After implementing the slice, run
dev-memjective-update <slug> to record progress.
```

## Edge Cases And Anti-Patterns

- Detached `HEAD` without `--target`, missing slug, `--from` plus
  `--from-file`, or `--target master`: abort and describe the issue.
- Target already carries `<slug>/`: abort. The precondition is per-slug, so
  other slugs on the target are not a conflict.
- Explicit source lacks `<slug>/body.md`: abort instead of falling back to
  discovery.
- Stale brmem refs for deleted branches: ignore them during ancestor
  discovery.
- Multiple nearest ancestor candidates at the same distance: list the tied
  branches and ask.
- Slug exists only on master: use the master snapshot.
- Slug exists nowhere: ask for an explicit source or create the memjective
  first.
- Never auto-pick a slug, auto-resolve a source tie, write to master, carry
  only `body.md` from a branch source, synthesize sibling files from
  `--from-file`, fuse multiple snapshots, use Graphite for discovery, run
  `update`, or implement work during `claim`.
