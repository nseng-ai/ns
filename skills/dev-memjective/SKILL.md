---
name: dev-memjective
description: "Conceptual reference for the twerk memjective subsystem — local-first planning docs stored in `brmem` that track a multi-session workstream. Covers the storage model (master-branch snapshot + per-branch snapshots), the one-memjective-per-branch invariant, the document anatomy, the lifecycle, carry-forward semantics, and per-operation mutation contracts. Fires on conceptual questions about memjectives and alongside `dev-memjective-create`, `dev-memjective-peek`, `dev-memjective-next`, and `dev-memjective-update` as shared grounding. Read-only."
allowed-tools: []
metadata:
  internal: true
---

<!-- INTERNAL SKILL: twerk-only. Conceptual reference for the local-first memjective subsystem. -->

# dev-memjective

Conceptual reference for the memjective subsystem. This skill does not
perform operations. Use it as shared grounding alongside the operation skills
(`dev-memjective-create`, `dev-memjective-peek`, `dev-memjective-next`,
`dev-memjective-update`), and as a landing spot for ad-hoc questions about
memjectives that do not map cleanly to any of them.

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

Memjectives live entirely in `brmem` under namespace `memjectives`, key
`<slug>/body.md`. The ref layout is:

```text
refs/brmem/memjectives/<encoded-branch>/<slug>/body.md
```

Branch names are encoded by replacing `/` with `---`.

Each memjective has **two kinds of snapshots**:

1. **Master-branch snapshot (initial)** — the initial snapshot, stored on
   `master` at `refs/brmem/memjectives/master/<slug>/body.md`. Written once
   by `dev-memjective-create`. Not rewritten by any operation skill during
   normal progress.
2. **Per-branch snapshot** — the speculative, in-flight state on a specific
   working branch. Stored at
   `refs/brmem/memjectives/<encoded-branch>/<slug>/body.md`. Rewritten
   conservatively by `dev-memjective-update` as slices land. Each branch
   has at most one memjective.

The master-branch snapshot is treated as an immutable starting point during
the normal lifecycle. The per-branch snapshot is the working document.

### One-memjective-per-branch invariant

A single branch must have **at most one** entry in the `memjectives`
namespace. Every operation skill enforces this: `create` aborts if the
branch already has a memjective; `next` and `update` abort if a branch they
rely on has more than one. This invariant simplifies source resolution and
prevents silent ambiguity.

### Carry-forward semantics

When a new branch is created and work on the memjective should continue
there, the snapshot from the source branch (or the master-branch snapshot)
is **copied verbatim** into the new branch's snapshot. This exact-copy
attach is the only way a memjective snapshot appears on a branch that did
not have one. The skills never merge, diff, or synthesize across sources.

Carry-forward is performed explicitly. In the normal flow,
`dev-memjective-next` owns the carry-forward: when run on a fresh slice
branch, it resolves the source memjective, copies the text verbatim onto
the current branch via `brmem put`, and then implements the slice.
`dev-memjective-update`'s preflight carry-forward remains as a
belt-and-suspenders safety net for users who skipped `next` and land work
directly on a bare branch. Nothing auto-attaches at branch-creation time.

## Document anatomy

Every memjective shares the same canonical shape. See
`templates/memjective-template.md` for the reference form.

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
- **Roadmap** — the evolving ordered progress surface. Organized by PR-sized
  or session-sized slices when work is expected to land incrementally. Prefer
  steelthreaded early slices (end-to-end) over framework-only scaffolding.
  This is the single main place to record slice progress. This can change
  as the memjective unfolds. New data or findings might mean new work items
  and PRs. Every bullet must describe codified work that lands in a PR —
  code, tests, docs, config, or a deliberate delete. Manual observation,
  live-run sessions, or any step that produces no diff does not belong in
  the roadmap; fold verification into the PR's test plan instead.
- **How to Make Progress** — the mechanical recipe for future sessions. Says
  how to pick the next slice, what current behavior to inspect first, and what
  to update after landing a slice.
- **Notes** — durable findings, constraints, collisions, and pointers
  discovered during implementation. Optional for simple memjectives; kept for
  architectural or long-running memjectives so hard-won knowledge is
  preserved. Also serves as log of changes to the memjective itself.

## Example

A concrete slice-cycle walkthrough, using slug `widget-rewrite`.

### t=0 — `dev-memjective-create` on `master`

`create` drafts the memjective and writes it to
`refs/brmem/memjectives/master/widget-rewrite/body.md` as the initial
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

## Roadmap

### Slice 1 — Introduce async `WidgetGateway` alongside sync

- [ ] New `WidgetGateway` ABC with async methods.
- [ ] First call site ported end-to-end.

### Slice 2 — Migrate remaining call sites and delete sync wrappers

- [ ] Port remaining call sites.
- [ ] Delete sync wrappers and the shim gateway.

## How to Make Progress

1. Pick the next incomplete Roadmap slice.
2. Inspect current `WidgetGateway` implementations and their callers.
3. After landing, check off the completed Roadmap items.

## Notes

- (empty)
```

The same text is also attached to the current working branch as its
initial per-branch snapshot.

### t=1 — `dev-memjective-next` on `alice/widget-rewrite-slice-1`

Alice creates a fresh slice branch; it has no snapshot yet. `next` resolves
the initial snapshot on `master` and copies it verbatim to
`refs/brmem/memjectives/alice---widget-rewrite-slice-1/widget-rewrite/body.md`,
then implements Slice 1 in-session.

After the work lands, `dev-memjective-update` checks off Slice 1's Roadmap
bullets and appends a Note about a threading gotcha discovered mid-slice:

```markdown
## Notes

- `WidgetStore.flush()` blocks under the async event loop if called from a
  sync context — keep the sync shim until Slice 2 removes the last caller.
```

### t=2 — `dev-memjective-next` on `alice/widget-rewrite-slice-2`

Alice opens the next slice branch off Slice 1. `next` carries forward from
the `alice/widget-rewrite-slice-1` snapshot (not from the master-branch
snapshot), so the completed Slice 1 checkboxes and the threading-gotcha
Note travel with it. Slice 2 lands; `update` checks off its Roadmap
bullets. The Roadmap now shows Slices 1–2 done and the terminal
`Completion Criteria` checked off.

## Lifecycle

```text
dev-memjective-create  →  ( dev-memjective-peek?  →  new slice branch  →
                            dev-memjective-next   →  dev-memjective-update )*
```

- **Create** (`dev-memjective-create`): draft the memjective and store it as
  the master-branch snapshot + an initial branch snapshot on the current
  branch. Runs once per memjective.
- **Peek** (`dev-memjective-peek`): optional, read-only, lightweight. Resolve
  the active memjective from the current branch snapshot, the nearest
  ancestor branch snapshot in commit history, or the master-branch snapshot;
  report a short status summary (title, status, optional description/goals
  summary, completion-criteria progress, roadmap state); and suggest a
  kebab-case slug for the next slice. Writes nothing. Useful when you want
  a quick status check before deciding whether to open a new branch, but
  skippable — users who already know the state can go straight to creating
  a branch.
- **New slice branch**: the user creates a branch for the next slice using
  their preferred tool (`gt create`, `git checkout -b`, etc.), typically
  named with the slug `peek` suggested. Not a skill.
- **Next** (`dev-memjective-next`): runs **on the fresh slice branch**.
  Precondition: the current branch has no memjective snapshot yet; the skill
  errors out otherwise. It performs the carry-forward (see
  `## Carry-forward semantics`), then implements the next slice directly in
  the session using normal tooling. Resolution skips the current-branch case
  (ruled out by the precondition) and uses ancestor snapshots or the
  master-branch snapshot.
- **Update** (`dev-memjective-update`): after work completes, conservatively
  rewrite the branch snapshot to reflect what happened. This brings the
  memjective up-to-date with respect to the state of the current branch at
  a particular point in time. Runs once per slice.

A session may mix these freely: skip `peek` and go straight to `next`, run
`update` without having run `next` in this session (if a snapshot is already
attached), or run neither and just progress the work informally. The only
hard rule is `next`'s precondition — it must run on a branch with no
existing memjective snapshot.

## Mutation contracts

Each operation skill has a narrow mutation contract that keeps the system
honest. The full table lives in `references/mutation-contract.md`. Summary:

- **`create`** — writes the master-branch snapshot + initial branch snapshot.
- **`peek`** — writes **nothing**. Advisory only; status inspector + slug
  suggester.
- **`next`** — writes exactly one brmem entry — the carry-forward onto the
  current branch.
- **`update`** — rewrites only the current branch's snapshot.

No operation skill rewrites the master-branch snapshot or any other branch's
snapshot during normal progress.

Within `update`, the rewrite is **conservative**: completed items may be
checked; the Roadmap may be split or extended; the Notes section may grow;
`How to Make Progress` may be amended when the recipe actually changed.
`Description` and `Goals` stay mostly stable but can change if the
memjective has materially changed. Completion Criteria and the master-branch
snapshot are not rewritten casually. See the full table for the per-section
rules.

## Shared references

- `templates/memjective-template.md` — canonical memjective shape used by
  `dev-memjective-create` when drafting a new memjective.
- `references/mutation-contract.md` — per-operation, per-section table of
  what each skill may and may not change.

This subsystem follows the `dev-` prefix convention — see `AGENTS.md` >
"Dev Skill Naming Convention" for the graduation path.

## Failure modes and edge cases

- **Branch deleted before its snapshot was consumed.** The snapshot is
  effectively orphaned but still addressable by ref until garbage collected.
  The master-branch snapshot remains authoritative; any fresh slice branch
  can resolve from it.
- **Concurrent drafts on different branches.** No git-level conflict because
  refs are per-branch. The snapshots will diverge. Reconciliation is manual
  and human-driven; the system does not auto-merge.
- **Slug collision on `master`.** `dev-memjective-create` aborts. The user
  picks a different slug or deletes the existing master-branch snapshot
  explicitly before retrying.
- **Lost brmem ref** (force-push, manual `git update-ref -d`, failed push
  from another clone). Nothing auto-recovers. If the master-branch snapshot
  is gone, re-run `dev-memjective-create`. If a per-branch snapshot is gone,
  manually re-attach from an ancestor ref via `brmem put`.

## Non-goals

- Storing the memjective document anywhere outside `brmem` — no GitHub
  issues, comments, or PR bodies; no files in the working tree.
- Auto-attaching memjectives to newly created branches. Carry-forward is
  explicit.
- Letting `next` or `update` rename sections or rebuild an older snapshot
  wholesale during ordinary progress work.
