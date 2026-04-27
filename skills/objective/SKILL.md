---
name: objective
description: "Conceptual reference for the twerk objective subsystem: local-first planning docs with a canonical objective plus branch-local snapshots. Covers storage, document anatomy, lifecycle, carry-forward, update vs reconcile, and shared mutation contracts. Fires on conceptual questions about objectives and alongside objective-create, objective-next, objective-claim, objective-update, and objective-reconcile. Read-only."
allowed-tools: []
---

# objective

Conceptual reference for the objective subsystem. This skill does not
perform operations. Use it as shared grounding alongside the operation skills
(`objective-create`, `objective-next`, `objective-claim`,
`objective-update`, `objective-reconcile`), and as a landing spot
for ad-hoc questions about objectives that do not map cleanly to one
operation.

## What an objective is

An **objective** is a local-first planning document for a multi-session
workstream. The workstream has one authoritative record and zero or more
branch-local working copies:

- **Canonical objective**: the shared ground truth for the workstream.
  Today it is stored in `brmem` under branch `master`; that storage choice
  is an implementation detail. A future implementation could store canonical
  objectives in a shared database without changing the branch-snapshot
  model.
- **Branch snapshot**: a local working copy/checkpoint attached to a branch.
  It can drift while slice work is in flight and accumulate notes. It serves
  as evidence during reconciliation only after the branch's work has landed.

The objective body is the current state of the workstream: what is in
scope, what has landed, what remains, and how to make the next slice of
progress. The subsystem stays local-first: objective content is stored in
`brmem`, not GitHub issues, PR bodies, comments, or working-tree files.

## Storage model

Objectives live in `brmem` under namespace `objectives`, keyed by
`<slug>/<filename>`. An objective is a directory of files:

- `body.md` - required stable spine
- `roadmap.md` - optional progress surface
- `notes.md` - optional durable findings

Current storage is snapshot-shaped: a single ref per `(namespace, branch)`
holds a commit whose tree is the namespace filesystem for that branch.

```text
refs/brmem/ns/objectives/<encoded-branch>
refs/brmem/ns/objectives/<encoded-branch>:<slug>/body.md
refs/brmem/ns/objectives/<encoded-branch>:<slug>/roadmap.md
refs/brmem/ns/objectives/<encoded-branch>:<slug>/notes.md
```

Branch names are encoded by replacing `/` with `---`. The slug is the path
segment before the filename.

### Canonical record

The canonical objective is the authoritative record. In the current
brmem-backed implementation, it is the `<slug>/` directory stored on branch
`master`.

- `objective-create` writes the canonical objective.
- `objective-reconcile` is the normal lifecycle path that rewrites it.
- `objective-update` never rewrites it.
- `objective-claim` may copy from it, but never mutates it.

### Branch snapshots

A branch snapshot is the `<slug>/` directory stored on a working branch. It
is a local checkpoint, not shared ground truth.

- `objective-claim` attaches one by copying from a source snapshot.
- `objective-update` refreshes it after branch work lands.
- `objective-reconcile` reads branch snapshots as evidence, but never
  writes back to them.

A single branch may carry multiple objective slugs. Operations always target
one explicit slug.

## Document anatomy

### `body.md` - stable spine

The part that rarely changes after creation.

- **Title**: one line. Describes the workstream, not the current slice.
- **Status**: terse categorical state such as `in progress`, `blocked`, or
  `done`; never a running changelog.
- **Description**: durable context, scope, adjacent landed work, and
  out-of-scope boundaries.
- **Goals**: value-oriented outcomes.
- **Completion Criteria**: re-checkable end-state bullets.
- **How to Make Progress**: mechanical recipe for choosing and recording
  future slices.

### `roadmap.md` - progress surface

Ordered PR-sized or session-sized slices. This is where most normal motion
happens: checking completed items, splitting work that became more granular,
reordering remaining slices, and adding nearby follow-ups.

Every roadmap bullet must describe codified work that lands in a PR: code,
tests, docs, config, or deliberate deletion. Manual observation and live
verification belong in PR test plans, not in the roadmap.

### `notes.md` - durable findings

Append-only in spirit. Use it for constraints, collisions, pointers, and
non-obvious findings discovered during implementation. When a note becomes
obsolete, annotate it in place instead of deleting it.

## Lifecycle

```text
create canonical
  -> inspect with next and choose a PR-sized slice
  -> claim canonical or ancestor snapshot into a branch snapshot
  -> implement and merge a slice
  -> reconcile landed branch snapshots and associated PR evidence into canonical objective
```

For stacked PRs, insert `update` after implementation and before a child
branch claims from the current branch snapshot:

```text
implement a slice on a branch
  -> update that branch snapshot from branch work
  -> inspect with next and choose the child slice
  -> claim from the updated ancestor snapshot into the child branch
```

- **Create** (`objective-create`): draft the canonical objective.
  Writes `body.md` and, when a concrete slice plan exists, `roadmap.md`.
- **Next** (`objective-next`): read-only inspection and next-slice
  recommendation before branch claim. It writes nothing.
- **Claim** (`objective-claim`): attach a branch snapshot by verbatim
  copy from an explicit source, nearest ancestor branch snapshot, or the
  canonical objective.
- **Update** (`objective-update`): refresh the current branch snapshot
  from commits on that branch when another branch will claim from it before it
  lands. It is normally only needed for stacked PRs. It is a no-op when the
  snapshot is already fresh relative to branch HEAD.
- **Reconcile** (`objective-reconcile`): rewrite the canonical
  objective by exploring branch snapshots that carry the slug,
  cross-referencing their associated PRs, and folding only landed evidence
  into a conservative canonical update. Open PRs and unmerged branches stay
  outside canonical state.

## Carry-forward semantics

Carry-forward is an exact copy of one source snapshot into one target branch
snapshot. It is performed only by `objective-claim`.

Source resolution is:

1. explicit source, if supplied
2. nearest ancestor branch snapshot carrying the slug
3. canonical objective

Carry-forward never edits, merges, summarizes, or synthesizes. Any reshaping
belongs to `update` after work lands on a branch, or `reconcile` when landed
branch evidence is folded into canonical state.

## Mutation contracts

The full contract lives in `references/mutation-contract.md`. Summary:

| Operation             | Canonical objective                          | Current branch snapshot                  | Other branch snapshots |
| --------------------- | -------------------------------------------- | ---------------------------------------- | ---------------------- |
| `objective-create`    | Writes initial `body.md` and roadmap         | Never                                    | Never                  |
| `objective-next`      | Reads only                                   | Reads only                               | Reads only             |
| `objective-claim`     | May read as source                           | Writes verbatim carry-forward to target  | May read as source     |
| `objective-update`    | Never                                        | Rewrites conservatively from branch work | Never                  |
| `objective-reconcile` | Rewrites conservatively from landed evidence | Reads only as evidence                   | Reads only as evidence |

`update` and `reconcile` share the same conservative per-file rewrite rules.
They differ in authority and evidence:

- `update` mutates a branch snapshot, using that branch's work as evidence.
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
- **Target branch already carries the slug**: `claim` aborts. Use `update`
  on a branch snapshot or `reconcile` on canonical state.
- **Lost brmem ref**: nothing auto-recovers. Recreate canonical state with
  `create`, or reattach a branch snapshot with `claim`.

## Non-goals

- Storing objective content in GitHub, PR comments, or working-tree files.
- Auto-attaching objectives to new branches.
- Letting `next` write state.
- Letting `update` rewrite canonical state.
- Letting `reconcile` rewrite branch snapshots.
- Rebuilding snapshots wholesale during normal progress work.
