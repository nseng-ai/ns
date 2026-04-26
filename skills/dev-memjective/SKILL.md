---
name: dev-memjective
description: "Conceptual reference for the twerk memjective subsystem — local-first planning docs stored in `brmem` that track a multi-session workstream. Covers the storage model (master-branch snapshot + per-branch snapshots), the one-memjective-per-branch invariant, the document anatomy, the lifecycle, carry-forward semantics, and per-operation mutation contracts. Fires on conceptual questions about memjectives and alongside `dev-memjective-create`, `dev-memjective-next`, `dev-memjective-claim`, `dev-memjective-update`, and `dev-memjective-reconcile` as shared grounding. Read-only."
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
for ad-hoc questions about memjectives that do not map cleanly to any of
them.

## What a memjective is

A **memjective** is a local-first, branch-scoped planning document for a
multi-session workstream. It is stored as plain text in **branch memory**
(`brmem`) — a git-native key-value store backed by dedicated refs — and
lives only in the local repository.

Throughout this doc:

- **memjective** — the workstream and its documented state (abstract).
- **snapshot** — a specific stored copy on a specific branch. Each
  `brmem put` writes a snapshot. The memjective on `master` is the
  initial snapshot; per-branch snapshots on working branches are rewritten
  as slices land.

The body of a memjective _is_ the current state of the workstream: what is
in scope, what has landed, what remains, and what the next slice should be.
Progressing the workstream is the primitive operation, and each operation
reads the memjective, decides the next slice, implements it, and rewrites
the memjective to reflect the new state.

Skills may freely read GitHub or other remote sources for context —
checking whether a referenced PR has merged, pulling a decision from a
PR body, cross-referencing issue numbers. The locality rule applies only
to _where the memjective is stored_: always in `brmem`, never in GitHub
issues, comments, or PR bodies.

## Storage model

Memjectives live entirely in `brmem` under namespace `memjectives`, keyed by
`<slug>/<filename>`. A memjective is a **directory of files** — a required
`body.md` plus optional siblings `roadmap.md` and `notes.md`.

Storage is snapshot-shaped: a single ref per `(namespace, branch)` holds a
commit whose tree is the namespace's filesystem for that branch. Keys are
paths inside that tree. The snapshot ref is:

```text
refs/brmem/ns/memjectives/<encoded-branch>
```

and an individual file is addressed with a `:<key>` suffix:

```text
refs/brmem/ns/memjectives/<encoded-branch>:<slug>/body.md
refs/brmem/ns/memjectives/<encoded-branch>:<slug>/roadmap.md    (optional)
refs/brmem/ns/memjectives/<encoded-branch>:<slug>/notes.md      (optional)
```

Branch names are encoded by replacing `/` with `---`. The slug is the path
segment before the filename — `memjective show` groups all files under a
slug into a single memjective.

Each memjective has **two kinds of snapshots**:

1. **Master-branch snapshot (initial)** — the initial snapshot, stored on
   `master`. `dev-memjective-create` writes `body.md` there once;
   `roadmap.md` is written at create time when a concrete slice plan exists.
   `notes.md` appears later if it appears at all. The master snapshot is
   stable during normal slice work and is rewritten only by
   `dev-memjective-reconcile`, which folds evidence from sibling-branch
   snapshots into a conservative rewrite (see the mutation contract and
   `dev-memjective-reconcile`'s SKILL.md).
2. **Per-branch snapshot** — the speculative, in-flight state on a specific
   working branch. Files appear under
   `refs/brmem/ns/memjectives/<encoded-branch>:<slug>/`. Attached to a
   branch by `dev-memjective-claim` (carry-forward) and rewritten
   conservatively by `dev-memjective-update` as slices land — typically
   `roadmap.md` (checking off items) and `notes.md` (appending findings)
   move most.

The master-branch snapshot is mostly stable during the normal lifecycle;
its only normal-lifecycle rewrite path is `dev-memjective-reconcile`. The
per-branch snapshot is the working document.

Only `body.md` is required; the absence of `roadmap.md` or `notes.md` means
that file hasn't been written yet, not that the memjective is malformed.

### Multi-memjective-per-branch (many-to-many)

A single branch may carry **multiple distinct memjective slugs** in the
`memjectives` namespace. Each operation skill targets one slug at a time
via its required slug argument; the slug disambiguates which memjective is
being acted on when more than one is attached to the same branch. Files
under a single `<slug>/` directory still form one logical memjective —
that grouping is unchanged. The previous "at most one memjective per
branch" invariant has been **relaxed**: skills no longer abort when more
than one slug is present on a branch they read from.

### Carry-forward semantics

When a new branch is created and work on the memjective should continue
there, the snapshot from a source branch (or the master-branch snapshot)
is **copied verbatim** into the new branch's snapshot. This exact-copy
attach is the only way a memjective snapshot appears on a branch that did
not have one. The skills never merge, diff, or synthesize across sources
during carry-forward.

Carry-forward is performed by **`dev-memjective-claim`** and only by
`claim`. The user invokes `claim` explicitly with the memjective's slug
to attach it to a target branch (defaulting to the current branch).
`claim` resolves a source — current-branch snapshot, nearest ancestor
branch, master — and copies every file under `<slug>/` verbatim onto the
target. No other skill attaches a snapshot:

- `dev-memjective-create` writes only the master-branch snapshot. It does
  **not** attach to the current working branch.
- `dev-memjective-next` is read-only inspection and never writes anything.
- `dev-memjective-update` refuses to run on a branch that has no entries
  for the requested slug.
- `dev-memjective-reconcile` runs only on master and never carries
  forward; sibling text is evidence for a conservative rewrite, not source
  for a verbatim copy.

## Document anatomy

A memjective is split across three sibling files with different editing
cadences. See `templates/body-template.md`, `templates/roadmap-template.md`,
and `templates/notes-template.md` for reference forms.

### `body.md` — the stable spine (required)

The part that rarely changes after `create`. Edits are small clarifications.

- **Title** — one line. Describes the workstream, not the current slice.
- **Status** — a single line: `in progress`, `blocked`, `done`, or similar.
  Keep it terse and categorical, optionally with one short qualifier. It is
  not a running changelog.
- **Description** — stable context. Says what triggered the memjective, what
  related work is already landed, what remains in scope now, and what is out
  of scope. Load-bearing: a fresh session should be able to understand the
  workstream from this alone.
- **Goals** — the value-oriented statement of what the work should deliver and
  why it is worth doing. This is about outcomes, not slice planning.
- **Completion Criteria** — re-checkable, end-state-oriented bullets. Prefer
  criteria that describe the final contract / public surface / cleanup state
  over intermediate implementation steps. More precise than Goals.
- **How to Make Progress** — the mechanical recipe for future sessions. Says
  how to pick the next slice, what current behavior to inspect first, and what
  to update after landing a slice.

### `roadmap.md` — the evolving progress surface (optional)

The ordered list of PR-sized or session-sized slices. Rewritten often as
slices are chosen, checked off, split, or reordered.

Organize by slices when work is expected to land incrementally. Prefer
steelthreaded early slices (end-to-end) over framework-only scaffolding.
This is the single main place to record slice progress. It can change as
the memjective unfolds. New data or findings might mean new work items and
PRs. Every bullet must describe codified work that lands in a PR — code,
tests, docs, config, or a deliberate delete. Manual observation, live-run
sessions, or any step that produces no diff does not belong in the roadmap;
fold verification into the PR's test plan instead.

### `notes.md` — durable findings (optional)

Append-only accumulation of durable findings, constraints, collisions, and
pointers discovered during implementation. Expected for architectural or
long-running memjectives so hard-won knowledge is preserved. Also serves as
a log of non-trivial changes to the memjective itself.

## Example

A concrete slice-cycle walkthrough, using slug `widget-rewrite`.

### t=0 — `dev-memjective-create` on `master`

`create` drafts the memjective and writes `body.md` to
`refs/brmem/ns/memjectives/master:widget-rewrite/body.md` as the initial
snapshot:

```markdown
# Rewrite the widget subsystem for async I/O

Status: in progress

## Description

Port the widget subsystem from sync to async. Keep the public surface the
same; internal storage gateway moves first.

## Goals

- Async-capable widget subsystem usable by the new scheduler.

## Completion Criteria

- [ ] `WidgetGateway` exposes an async API with no sync shims left behind.
- [ ] All call sites migrated; sync wrappers deleted.

## How to Make Progress

1. Pick the next incomplete roadmap slice.
2. Inspect current `WidgetGateway` implementations and their callers.
3. After landing, check off the completed roadmap items.
```

When there is already a concrete slice plan, `create` also writes
`roadmap.md`:

```markdown
# Roadmap

## Slice 1 — Introduce async `WidgetGateway` alongside sync

- [ ] New `WidgetGateway` ABC with async methods.
- [ ] First call site ported end-to-end.

## Slice 2 — Migrate remaining call sites and delete sync wrappers

- [ ] Port remaining call sites.
- [ ] Delete sync wrappers and the shim gateway.
```

Notes are not written yet — `notes.md` appears the first time
`dev-memjective-update` records a durable finding.

`create` writes only the master-branch snapshot. It does **not** attach
the memjective to the current working branch — Alice runs
`dev-memjective-claim widget-rewrite` to attach the snapshot when she's
ready to work on the first slice.

### t=1 — fresh slice branch + `claim` + work + `update`

Alice creates a fresh slice branch (`alice/widget-rewrite-slice-1`); it has
no snapshot yet. She runs:

```text
dev-memjective-claim widget-rewrite
```

`claim` resolves the source (master, since no ancestor carries the slug),
copies every file under `widget-rewrite/` verbatim onto the new branch,
and reports what was attached.

Optionally, Alice runs `dev-memjective-next widget-rewrite` to inspect the
attached snapshot and confirm the recommended next slice — `next` is
read-only and writes nothing.

Alice implements Slice 1 in-session using normal tooling. After the work
lands, she runs `dev-memjective-update widget-rewrite`, which checks off
Slice 1's bullets in `roadmap.md` and writes `notes.md` for the first time
with a threading gotcha discovered mid-slice:

```markdown
# Notes

- `WidgetStore.flush()` blocks under the async event loop if called from a
  sync context — keep the sync shim until Slice 2 removes the last caller.
```

### t=2 — next slice branch

Alice opens `alice/widget-rewrite-slice-2` off Slice 1. The new branch has
no snapshot yet, so she runs:

```text
dev-memjective-claim widget-rewrite
```

`claim` discovers `alice/widget-rewrite-slice-1` as the nearest ancestor
carrying the slug and carries every file under `widget-rewrite/` verbatim
forward, so the completed Slice 1 checkboxes in `roadmap.md` and the
threading-gotcha entry in `notes.md` travel with it. Slice 2 lands;
`update` checks off its roadmap bullets. `roadmap.md` now shows Slices 1–2
done and `body.md`'s `Completion Criteria` are checked off.

### t=3 — `dev-memjective-reconcile` on master

Once both slices have merged into master (or whenever the user wants to
fold sibling evidence back into the durable starting point), Alice runs:

```text
dev-memjective-reconcile widget-rewrite
```

on master. `reconcile` enumerates sibling-branch snapshots under
`refs/brmem/ns/memjectives/`, reads each sibling's `body.md` /
`roadmap.md` / `notes.md` as evidence, and conservatively rewrites the
master-branch snapshot — checking completion-criteria items, checking
roadmap items, and appending durable findings to `notes.md`. Sibling
snapshots are read-only evidence; `reconcile` never writes back to a
sibling ref and never carries forward verbatim.

## Lifecycle

```text
dev-memjective-create  →  ( dev-memjective-claim   →  dev-memjective-next?  →
                            implement              →  dev-memjective-update )*
                       →    dev-memjective-reconcile (on master, when desired)
```

- **Create** (`dev-memjective-create`): draft the memjective and store it
  as the master-branch snapshot. Writes `body.md` and, when a concrete
  slice plan exists, `roadmap.md`. Runs once per memjective. Does not
  attach to any working branch — that is `claim`'s job.
- **Claim** (`dev-memjective-claim`): explicit carry-forward. Attaches a
  memjective slug to a target branch (default: current) by copying every
  file under `<slug>/` verbatim from a resolved source (current branch,
  nearest ancestor branch, or master). Required positional arg: the slug.
- **Next** (`dev-memjective-next`): read-only inspect + recommend. Resolves
  the active source (current → ancestor → master) for the requested slug,
  reports title/status/completion criteria/roadmap state/notes presence,
  flags staleness when the snapshot is behind branch HEAD on a non-master
  source, and recommends the next slice with a suggested kebab-case slug.
  Writes nothing. Required positional arg: the slug.
- **Implement**: the user does the work using normal tooling. Not a skill.
- **Update** (`dev-memjective-update`): runs on a slice branch only. After
  work completes, conservatively rewrites the current-branch snapshot to
  reflect what happened. No-op when the snapshot is already at-or-after
  branch HEAD. Aborts if invoked on master with a pointer to `reconcile`.
  Required positional arg: the slug.
- **Reconcile** (`dev-memjective-reconcile`): runs on master only. Folds
  sibling-branch snapshots (live or orphaned) into a conservative rewrite
  of the master-branch snapshot. Aborts if invoked on a slice branch with
  a pointer to `update`. Required positional arg: the slug.

A session may mix these freely: skip `next` and go straight to implement,
run `update` without having run `next` in this session, run `claim` again
on a new branch as the workstream advances. The hard guards are simple
identity checks: `update` aborts on master, `reconcile` aborts off master,
`claim` aborts if the target already carries the slug.

## Mutation contracts

Each operation skill has a narrow mutation contract that keeps the system
honest. The full table lives in `references/mutation-contract.md`. Summary:

| Operation                  | Master snapshot                                         | Current-branch snapshot                                | Other-branch snapshot |
| -------------------------- | ------------------------------------------------------- | ------------------------------------------------------ | --------------------- |
| `dev-memjective-create`    | **Writes** `body.md` (+ `roadmap.md` when drafted)      | Never                                                  | Never                 |
| `dev-memjective-next`      | Never                                                   | Never                                                  | Never                 |
| `dev-memjective-claim`     | Never                                                   | **Writes** carry-forward to the target (verbatim copy) | Never                 |
| `dev-memjective-update`    | Never (aborts if invoked on master)                     | **Rewrites** per-file conservatively                   | Never                 |
| `dev-memjective-reconcile` | **Rewrites** per-file conservatively (sibling evidence) | Never (aborts if invoked off master)                   | Never                 |

Within `update` and `reconcile`, the rewrite is **conservative** and
per-file:

- `body.md` edits are small clarifications only — Title, Description, and
  Goals stay mostly stable; Status moves categorically; Completion Criteria
  check off with brief evidence; How to Make Progress changes only when the
  recipe changed.
- `roadmap.md` is where most of the motion happens — check items, split
  newly-granular items, reorder, and add nearby follow-ups. Never add
  manual-only or observation-only bullets.
- `notes.md` is append-only with obsolete annotations — never silently
  delete.

See the mutation contract for the full per-file tables.

## Shared references

- `templates/body-template.md` — canonical `body.md` shape used by
  `dev-memjective-create` when drafting a new memjective.
- `templates/roadmap-template.md` — canonical `roadmap.md` shape.
- `templates/notes-template.md` — canonical `notes.md` shape.
- `references/mutation-contract.md` — per-operation, per-file, per-section
  table of what each skill may and may not change.

This subsystem follows the `dev-` prefix convention — see `AGENTS.md` >
"Dev Skill Naming Convention" for the graduation path.

## Failure modes and edge cases

- **Branch deleted before its snapshot was consumed.** The snapshot is
  effectively orphaned but still addressable by ref until garbage collected.
  The master-branch snapshot remains authoritative; any fresh slice branch
  can resolve from it via `claim`. Orphaned refs are also valid _evidence_
  for `dev-memjective-reconcile` — their content is readable even after
  the branch is gone, and the reconcile labels them `orphaned-ref` when
  surfacing them in its report.
- **Concurrent drafts on different branches.** No git-level conflict because
  refs are per-branch. The snapshots will diverge. Reconciliation is
  user-driven via `dev-memjective-reconcile` on master; the system does
  not auto-merge.
- **Slug collision on `master`.** `dev-memjective-create` aborts. The user
  picks a different slug or deletes the existing master-branch snapshot
  explicitly before retrying.
- **Slug already attached to a target branch.** `dev-memjective-claim`
  aborts with a pointer to `update` (to record progress) or `next` (to
  inspect).
- **Lost brmem ref** (force-push, manual `git update-ref -d`, failed push
  from another clone). Nothing auto-recovers. If the master-branch snapshot
  is gone, re-run `dev-memjective-create`. If a per-branch snapshot is gone,
  re-run `dev-memjective-claim` to re-attach from an ancestor or master.

## Non-goals

- Storing the memjective document anywhere outside `brmem` — no GitHub
  issues, comments, or PR bodies; no files in the working tree.
- Auto-attaching memjectives to newly created branches. Carry-forward is
  always explicit via `dev-memjective-claim`.
- Letting `next` carry forward, attach, or write anything. `next` is
  strictly read-only.
- Letting `update` rewrite master, or `reconcile` rewrite a slice branch.
  The branch-identity guards are absolute.
- Letting `update` or `reconcile` rename sections or rebuild an older
  snapshot wholesale during ordinary progress work.
