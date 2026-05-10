---
name: objective
description: "Use for conceptual questions about asdl objectives and as shared grounding with objective-create, objective-current, objective-next, objective-attach, objective-update, objective-reconcile, or objective-digest. Read-only."
allowed-tools: []
---

# objective

Conceptual reference for the objective subsystem. This skill does not
perform operations. Use it as shared grounding alongside the operation skills
(`objective-create`, `objective-next`, `objective-attach`,
`objective-current`, `objective-update`, `objective-reconcile`,
`objective-digest`), and as a landing spot for ad-hoc questions about
objectives that do not map cleanly to one operation.

> **Authority.** This skill is **conceptual behavior reference** for the
> objective subsystem, not an independent implementation authority.
> Deterministic mechanics (slug rules, snapshot-state classification, namespace
> constants, the `objective` CLI surface) live in the `asdl_objectives`
> Python package; ref encoding and branch-name validation live in `brmem`.
> When this skill's prose and the implementing package disagree, the package
> wins and the prose here is migration debt to be reconciled. New rules
> belong in the lowest layer that owns them — see the "Authority Boundaries"
> section in `packages/asdl-objectives/AGENTS.md`.

## What an objective is

An **objective** is a local-first planning document for a multi-session
workstream. The workstream has one authoritative record and zero or more
branch-local working copies:

- **Canonical objective**: the shared ground truth for the workstream.
  Stored in `brmem` under the repo's trunk branch (typically `master` on
  legacy repos, `main` on greenfield ones). The brmem ref shape
  (`refs/brmem/ns/objectives/<encoded-branch>`) records the trunk branch
  name as part of the storage key, so canonical state is anchored to
  whichever branch `git symbolic-ref refs/remotes/origin/HEAD` resolves to
  on a given repo.
- **Branch snapshot**: a local working copy/checkpoint attached to a branch.
  It can drift while roadmap-entry work is in flight and accumulate notes. It
  serves as evidence during reconciliation only after the branch's work has
  landed.

The objective body is the current state of the workstream: what is in
scope, what has landed, what remains, and how to make the next numbered step.
The subsystem stays local-first: objective content is stored in
`brmem`, not GitHub issues, PR bodies, comments, or working-tree files.

## Storage model

Open objectives live in `brmem` under namespace `objectives`; closed
objectives live under namespace `objectives-closed`. Entries are keyed by
`<slug>/<filename>`. An objective is a directory of files:

- `body.md` - required stable spine
- `roadmap.md` - optional progress surface
- `notes.md` - optional durable findings
- `.durable-evidence.jsonl` - optional machine-owned branch snapshot marker
- `.closed` - closed-only closure metadata on the trunk snapshot

Current storage is snapshot-shaped: a single ref per `(namespace, branch)`
holds a commit whose tree is the namespace filesystem for that branch.

```text
refs/brmem/ns/objectives/<encoded-branch>
refs/brmem/ns/objectives/<encoded-branch>:<slug>/body.md
refs/brmem/ns/objectives-closed/<encoded-branch>
refs/brmem/ns/objectives-closed/<encoded-branch>:<slug>/body.md
refs/brmem/ns/objectives-closed/<encoded-branch>:<slug>/.closed
```

Branch names are encoded by replacing `/` with `---`. The slug is the path
segment before the filename.

### Canonical record

The canonical objective is the authoritative record. In the current
brmem-backed implementation, it is the `<slug>/` directory stored on the
repo's trunk branch.

> **Detect trunk before invoking operations.** When an operation skill
> needs the trunk branch name (e.g. for a `<trunk>..HEAD` range or to
> decide whether the current branch _is_ canonical), resolve it from git
> first:
>
> ```bash
> trunk=$(git symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null \
>     | sed 's@^origin/@@')
> [ -z "$trunk" ] && trunk=$(git rev-parse --verify --quiet main >/dev/null && echo main || echo master)
> ```
>
> The objective CLI itself resolves trunk through its `git_gateway`, so
> commands such as `objective list` / `show` / `tree` / `exec digest` do
> not require a `--trunk` flag.

- `objective-create` writes the canonical objective.
- `objective-reconcile` is the normal lifecycle path that rewrites it.
- `objective-update` never rewrites it.
- `objective-attach` may copy from it, but never mutates it.

### Branch snapshots

A branch snapshot is the `<slug>/` directory stored on a working branch. It
is a local checkpoint, not shared ground truth.

- `objective-attach` attaches one by copying from a source snapshot.
- `objective-update` updates it after branch work lands and records the
  branch content patches covered by the snapshot.
- `objective-reconcile` reads branch snapshots as evidence, but never
  writes back to them.

A single branch may carry multiple objective slugs. Operations always target
one explicit slug.

## Document anatomy

### `body.md` - stable spine

The part that rarely changes after creation.

- **Title**: one line. Describes the workstream, not the current roadmap entry.
- **Status**: terse categorical state such as `in progress`, `blocked`, or
  `done`; never a running changelog.
- **Description**: durable context, scope, adjacent landed work, and
  out-of-scope boundaries.
- **Goals**: value-oriented outcomes.
- **Completion Criteria**: re-checkable end-state bullets.
- **How to Make Progress**: mechanical recipe for choosing and recording
  future numbered entries.

### `roadmap.md` - progress surface

Ordered numbered entries. This is where most normal motion happens: checking
completed items, splitting work that became more granular, reordering remaining
entries, and adding nearby follow-ups.

Use plain numbered entries (`1.`, `2.`, `3.`), with child checkboxes for the
work inside each entry. Nested numbered entries are fine when an existing entry
needs to be split later (`3.1`, `3.2`). Do not pre-label roadmap entries as
PRs, stacks, docs-only work, or splits; `objective-next` recommends that shape
when it selects an entry.

Every roadmap bullet must describe codified work: code, tests, docs, config,
or deliberate deletion. Manual observation and live verification belong in PR
test plans, not in the roadmap.

### `notes.md` - durable findings

Append-only in spirit. Use it for constraints, collisions, pointers, and
non-obvious findings discovered during implementation. When a note becomes
obsolete, annotate it in place instead of deleting it.

### `.durable-evidence.jsonl` - snapshot state marker

Machine-owned metadata for branch snapshots. Each JSONL record describes one
commit observed in the branch's `trunk..HEAD` range when `objective-update`
confirmed the snapshot covered that work. Humans may read this file for
debugging, but should not hand-edit it. The snapshot-state classifier uses only
non-null patch IDs from the marker; commit SHA, subject, and author time are
diagnostic.

## Lifecycle

```text
create canonical
  -> inspect with next and choose a numbered roadmap entry
  -> attach canonical or ancestor snapshot into a branch snapshot
  -> implement and merge the work
  -> reconcile landed branch snapshots and associated PR evidence into canonical objective
```

For stacked PRs, the ergonomic loop is:

```text
implement a roadmap entry on a branch
  -> objective update
  -> objective next
```

`update` makes the current branch's objective snapshot current, attaching one
first when the branch is missing it. `next` makes the current branch current
when needed, then recommends the next numbered roadmap entry and whether it
should be a single PR, short stack, docs-only change, or split. On an
unattached non-trunk branch, `objective next` attaches the selected objective,
updates the snapshot, reruns its context read, and only then recommends the
next entry.

- **Create** (`objective-create`): draft the canonical objective.
  Writes `body.md` and, when a concrete numbered plan exists, `roadmap.md` with
  plain numbered entries.
- **Next** (`objective-next`): prepare-then-read next-entry recommendation.
  It may attach/update the current branch snapshot when needed, then reads the
  prepared snapshot for planning, recommends implementation shape, and checks a
  suggested branch slug for collisions when one is needed. It never mutates
  canonical state.
- **Current** (`objective-current`): read-only current-branch orientation
  view. It shows the attached objective, PR, branch snapshot state,
  brmem entries, and the trunk-relation row. It is scoped to the current
  branch only — it does not walk downstack ancestry or upstack children.
  It writes nothing.
- **Digest** (`objective-digest`): read-only objective dossier from canonical
  and branch snapshots. It summarizes thesis, roadmap progress, PR state,
  readiness, and durable findings. It writes nothing.
- **Attach** (`objective-attach`): attach a branch snapshot by verbatim
  copy from an explicit source, nearest ancestor branch snapshot, or the
  canonical objective.
- **Update** (`objective-update`): make the current branch's objective
  snapshot current. When the snapshot is missing, it may attach one by
  delegating to the attach primitive; then it updates from commits on that
  branch. It is a no-op when the snapshot is already up-to-date relative to branch
  HEAD. When branch work is stale but already documented, `update` may only
  advance `.durable-evidence.jsonl`. It never mutates canonical state.
- **Reconcile** (`objective-reconcile`): rewrite the canonical
  objective by exploring branch snapshots that carry the slug,
  cross-referencing their associated PRs, and folding only landed evidence
  into a conservative canonical update. Open PRs and unmerged branches stay
  outside canonical state.
- **Close** (`objective close`): move all active refs for the slug from
  `objectives` to `objectives-closed` and write `<slug>/.closed` on the
  closed trunk snapshot. Default `objective list` output shows only open
  objectives; use `objective list --closed` or `--all` for closed ones.
- **Reopen** (`objective reopen`): move closed refs for the slug back to
  `objectives`, omitting `.closed`, then remove the closed refs.

## Carry-forward semantics

Carry-forward is an exact copy of one source snapshot into one target branch
snapshot. It is performed only by `objective-attach`.

Source resolution is:

1. explicit source, if supplied
2. nearest ancestor branch snapshot carrying the slug
3. canonical objective

Carry-forward never edits, merges, summarizes, or synthesizes. Any reshaping
belongs to `update` after work lands on a branch, or `reconcile` when landed
branch evidence is folded into canonical state.

Because `.durable-evidence.jsonl` is patch-id based, carrying it forward is safe:
inherited patches remain covered on child branches, while new child patches
remain stale until `objective-update` runs on the child.

## Mutation contracts

The full contract lives in `references/mutation-contract.md`. Summary:

| Operation             | Canonical objective                          | Current branch snapshot                                                | Other branch snapshots |
| --------------------- | -------------------------------------------- | ---------------------------------------------------------------------- | ---------------------- |
| `objective-create`    | Writes initial `body.md` and roadmap         | Never                                                                  | Never                  |
| `objective-next`      | Reads only                                   | May attach/update, then reads prepared snapshot                        | Reads only             |
| `objective-current`   | Reads only                                   | Reads only                                                             | Reads only             |
| `objective-digest`    | Reads only                                   | Reads only                                                             | Reads only             |
| `objective-attach`    | May read as source                           | Writes verbatim carry-forward to target                                | May read as source     |
| `objective-update`    | Never                                        | May attach when missing; then rewrites conservatively from branch work | Never                  |
| `objective-reconcile` | Rewrites conservatively from landed evidence | Reads only as evidence                                                 | Reads only as evidence |
| `objective close`     | Moves active refs into closed storage        | Moves matching refs into closed storage                                | Moves matching refs    |
| `objective reopen`    | Moves closed refs back to active storage     | Moves matching refs back                                               | Moves matching refs    |

`update` and `reconcile` share the same conservative prose rewrite rules.
They differ in authority and evidence:

- `update` mutates a branch snapshot, using that branch's work as evidence.
  It also advances `.durable-evidence.jsonl` after successful triage.
- `reconcile` mutates the canonical objective, using landed branch snapshots
  plus associated merged PR state/metadata as evidence. Open PRs and unmerged
  branches are left to higher-level views across canonical state and branch
  snapshots.

## Shared references

- `templates/body-template.md` - canonical `body.md` shape.
- `templates/roadmap-template.md` - canonical `roadmap.md` shape.
- `templates/notes-template.md` - canonical `notes.md` shape.
- `references/mutation-contract.md` - single source of truth for shared
  rewrite rules and operation-specific evidence adapters.

## Failure modes and edge cases

- **Deleted branch with remaining snapshot**: the branch snapshot is
  orphaned but still readable through its brmem ref. Reconcile must not fold
  it into canonical state unless it is tied to landed work.
- **Concurrent branch snapshots diverge**: expected. Reconciliation is
  user-driven and conservative; the system does not auto-merge.
- **Slug collision in canonical storage**: `create` aborts. Pick another slug
  or intentionally delete the existing canonical record first.
- **Target branch already carries the slug**: `attach` aborts. Use `update`
  on a branch snapshot or `reconcile` on canonical state.
- **Lost brmem ref**: nothing auto-recovers. Recreate canonical state with
  `create`, or reattach a branch snapshot with `attach`.

## Non-goals

- Storing objective content in GitHub, PR comments, or working-tree files.
- Auto-attaching objectives merely by creating or checking out a branch; attach
  only through `attach` or through `update`/`next` preparation that delegates to
  attach.
- Letting `next` write canonical state, create branches, or implement work.
- Letting `update` rewrite canonical state.
- Letting `reconcile` rewrite branch snapshots.
- Rebuilding snapshots wholesale during normal progress work.
