---
name: dev-memjective
description: "Conceptual reference for the twerk memjective subsystem: local-first planning docs with a canonical memjective plus branch-local snapshots. Covers storage, document anatomy, lifecycle, carry-forward, update vs reconcile, and shared mutation contracts. Fires on conceptual questions about memjectives and alongside dev-memjective-create, dev-memjective-next, dev-memjective-claim, dev-memjective-update, and dev-memjective-reconcile. Read-only."
allowed-tools: []
metadata:
  internal: true
---

<!-- INTERNAL SKILL: twerk-only. Conceptual reference for the local-first memjective subsystem. -->

# dev-memjective

Conceptual reference for the memjective subsystem. This skill does not
perform operations. Use it as shared grounding alongside the operation skills
(`dev-memjective-create`, `dev-memjective-next`, `dev-memjective-claim`,
`dev-memjective-update`, `dev-memjective-reconcile`), and as a landing spot
for ad-hoc questions about memjectives that do not map cleanly to one
operation.

## What a memjective is

A **memjective** is a local-first planning document for a multi-session
workstream. The workstream has one authoritative record and zero or more
branch-local working copies:

- **Canonical memjective**: the shared ground truth for the workstream.
  Today it is stored in `brmem` under branch `master`; that storage choice
  is an implementation detail. A future implementation could store canonical
  memjectives in a shared database without changing the branch-snapshot
  model.
- **Branch snapshot**: a local working copy/checkpoint attached to a branch.
  It can drift while slice work is in flight, accumulate notes, and later
  serve as evidence during reconciliation.

The memjective body is the current state of the workstream: what is in
scope, what has landed, what remains, and how to make the next slice of
progress. The subsystem stays local-first: memjective content is stored in
`brmem`, not GitHub issues, PR bodies, comments, or working-tree files.

## Storage model

Memjectives live in `brmem` under namespace `memjectives`, keyed by
`<slug>/<filename>`. A memjective is a directory of files:

- `body.md` - required stable spine
- `roadmap.md` - optional progress surface
- `notes.md` - optional durable findings

Current storage is snapshot-shaped: a single ref per `(namespace, branch)`
holds a commit whose tree is the namespace filesystem for that branch.

```text
refs/brmem/ns/memjectives/<encoded-branch>
refs/brmem/ns/memjectives/<encoded-branch>:<slug>/body.md
refs/brmem/ns/memjectives/<encoded-branch>:<slug>/roadmap.md
refs/brmem/ns/memjectives/<encoded-branch>:<slug>/notes.md
```

Branch names are encoded by replacing `/` with `---`. The slug is the path
segment before the filename.

### Canonical record

The canonical memjective is the authoritative record. In the current
brmem-backed implementation, it is the `<slug>/` directory stored on branch
`master`.

- `dev-memjective-create` seeds the canonical memjective.
- `dev-memjective-reconcile` is the normal lifecycle path that rewrites it.
- `dev-memjective-update` never rewrites it.
- `dev-memjective-claim` may copy from it, but never mutates it.

### Branch snapshots

A branch snapshot is the `<slug>/` directory stored on a working branch. It
is a local checkpoint, not shared ground truth.

- `dev-memjective-claim` attaches one by copying from a source snapshot.
- `dev-memjective-update` refreshes it after branch work lands.
- `dev-memjective-reconcile` reads branch snapshots as evidence, but never
  writes back to them.

A single branch may carry multiple memjective slugs. Operations always target
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
  -> claim canonical or ancestor snapshot into a branch snapshot
  -> inspect with next, if useful
  -> implement a slice
  -> update the branch snapshot from branch work
  -> reconcile branch snapshots and associated PR evidence into canonical
```

- **Create** (`dev-memjective-create`): draft the canonical memjective.
  Writes `body.md` and, when a concrete slice plan exists, `roadmap.md`.
- **Claim** (`dev-memjective-claim`): attach a branch snapshot by verbatim
  copy from an explicit source, nearest ancestor branch snapshot, or the
  canonical memjective.
- **Next** (`dev-memjective-next`): read-only inspection and next-slice
  recommendation. It writes nothing.
- **Update** (`dev-memjective-update`): refresh the current branch snapshot
  from commits that landed on that branch. It is a no-op when the snapshot is
  already fresh relative to branch HEAD.
- **Reconcile** (`dev-memjective-reconcile`): rewrite the canonical
  memjective by exploring branch snapshots that carry the slug,
  cross-referencing their associated PRs, and folding that evidence into a
  conservative canonical update.

## Carry-forward semantics

Carry-forward is an exact copy of one source snapshot into one target branch
snapshot. It is performed only by `dev-memjective-claim`.

Source resolution is:

1. explicit source, if supplied
2. nearest ancestor branch snapshot carrying the slug
3. canonical memjective

Carry-forward never edits, merges, summarizes, or synthesizes. Any reshaping
belongs to `update` after work lands on a branch, or `reconcile` when branch
evidence is folded into canonical state.

## Mutation contracts

The full contract lives in `references/mutation-contract.md`. Summary:

| Operation                  | Canonical memjective                  | Current branch snapshot                  | Other branch snapshots |
| -------------------------- | ------------------------------------- | ---------------------------------------- | ---------------------- |
| `dev-memjective-create`    | Writes initial `body.md` and roadmap  | Never                                    | Never                  |
| `dev-memjective-next`      | Reads only                            | Reads only                               | Reads only             |
| `dev-memjective-claim`     | May read as source                    | Writes verbatim carry-forward to target  | May read as source     |
| `dev-memjective-update`    | Never                                 | Rewrites conservatively from branch work | Never                  |
| `dev-memjective-reconcile` | Rewrites conservatively from evidence | Reads only as evidence                   | Reads only as evidence |

`update` and `reconcile` share the same conservative per-file rewrite rules.
They differ in authority and evidence:

- `update` mutates a branch snapshot, using that branch's work as evidence.
- `reconcile` mutates the canonical memjective, using branch snapshots plus
  associated PR state/metadata as evidence.

## Shared references

- `templates/body-template.md` - canonical `body.md` shape.
- `templates/roadmap-template.md` - canonical `roadmap.md` shape.
- `templates/notes-template.md` - canonical `notes.md` shape.
- `references/mutation-contract.md` - single source of truth for shared
  rewrite rules and operation-specific evidence adapters.

This subsystem follows the `dev-` prefix convention. See `AGENTS.md` >
"Dev Skill Naming Convention" for the graduation path.

## Failure modes and edge cases

- **Deleted branch with remaining snapshot**: the branch snapshot is
  orphaned but still readable through its brmem ref. Reconcile may use it as
  weak evidence and must label it accordingly.
- **Concurrent branch snapshots diverge**: expected. Reconciliation is
  user-driven and conservative; the system does not auto-merge.
- **Slug collision in canonical storage**: `create` aborts. Pick another slug
  or intentionally delete the existing canonical record first.
- **Target branch already carries the slug**: `claim` aborts. Use `update`
  on a branch snapshot or `reconcile` on canonical state.
- **Lost brmem ref**: nothing auto-recovers. Recreate canonical state with
  `create`, or reattach a branch snapshot with `claim`.

## Non-goals

- Storing memjective content in GitHub, PR comments, or working-tree files.
- Auto-attaching memjectives to new branches.
- Letting `next` write state.
- Letting `update` rewrite canonical state.
- Letting `reconcile` rewrite branch snapshots.
- Rebuilding snapshots wholesale during normal progress work.
