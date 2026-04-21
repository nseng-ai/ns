---
name: dev-memjective
description: "Conceptual reference for the twerk memjective prototype — local-first, brmem-backed planning docs that mirror the objective subsystem without touching GitHub. Covers what a memjective is, the master-seed / branch-snapshot storage model, the one-memjective-per-branch invariant, the document anatomy (Title / Status / Intro / Completion Criteria / Status Checklist / How to Make Progress / Notes), the create → (peek? → branch → next → update)* lifecycle, per-operation mutation contracts, exact-copy carry-forward semantics, and the relationship to `objective`, `workbr`, and `plan`. Fires on conceptual questions about memjectives, ad-hoc operations outside the operation skills, and alongside `dev-memjective-create`, `dev-memjective-peek`, `dev-memjective-next`, and `dev-memjective-update` as shared grounding. Owns the memjective template under `templates/` and the mutation-contract table under `references/`. Read-only — no state mutation."
allowed-tools: []
metadata:
  internal: true
---

<!-- INTERNAL SKILL: twerk-only. Conceptual reference for the local-first memjective prototype. -->

# dev-memjective

Conceptual reference for the twerk memjective subsystem. This skill does not
perform operations. Use it as shared grounding alongside the four operation
skills (`dev-memjective-create`, `dev-memjective-peek`, `dev-memjective-next`,
`dev-memjective-update`), and as a landing spot for ad-hoc questions about
memjectives that don't map cleanly to any of them.

## What a memjective is

A **memjective** is a local-first, branch-scoped planning document for a
multi-session workstream. It is the prototype cousin of the `objective`
subsystem: same primitive operation ("progress this over time"), same
body-as-current-state discipline, but the storage moves from GitHub issues and
comments to plain text in **branch memory** (`brmem`) — a git-native key-value
store backed by dedicated refs.

The goal is to keep the objective-style loop (read context → decide → implement
→ rewrite context) working entirely inside a local git repo, so early
experiments can evolve without polluting GitHub, and so the doc travels with
the branch it describes.

A memjective is **not** an objective. If the work is substantial, shared with
others, or benefits from external reviewers, graduate it to a real GitHub
`objective` (see `objective` skill). The memjective prototype is deliberately
lightweight.

## Storage model

Memjectives live entirely in `brmem` under namespace `memjectives`, key
`<slug>.md`. The ref layout is:

```
refs/brmem/memjectives/<encoded-branch>/<slug>.md
```

Branch names are encoded by replacing `/` with `---`.

Each memjective has **two kinds of entries**:

1. **Master-branch seed** — the canonical starting point for the memjective.
   Stored at `refs/brmem/memjectives/master/<slug>.md`. Written once by
   `dev-memjective-create`. Not rewritten by any operation skill during normal
   progress. The seed preserves the original framing of the workstream.
2. **Per-branch snapshot** — the speculative, in-flight state on a specific
   working branch. Stored at `refs/brmem/memjectives/<encoded-branch>/<slug>.md`.
   Rewritten conservatively by `dev-memjective-update` as slices land. Each
   branch has at most one memjective.

The seed is treated as an immutable starting point during the normal
lifecycle. The per-branch snapshot is the working document.

### One-memjective-per-branch invariant

A single branch must have **at most one** entry in the `memjectives`
namespace. Every operation skill enforces this: `create` aborts if the branch
already has a memjective; `next` and `update` abort if a branch they rely on
has more than one. This invariant simplifies source resolution and prevents
silent ambiguity.

### Carry-forward semantics

When a new branch is created and work on the memjective should continue there,
the snapshot from the source branch (or the master seed) is **copied verbatim**
into the new branch's entry. This exact-copy attach is the only way a memjective
snapshot appears on a branch that didn't have one. The skills never merge,
diff, or synthesize across sources.

Carry-forward is performed explicitly. In the normal flow, `dev-memjective-next`
owns the carry-forward: when run on a fresh slice branch, it resolves the
source memjective, copies the text verbatim onto the current branch via
`brmem put`, and then implements the slice. `dev-memjective-update`'s
preflight carry-forward remains as a belt-and-suspenders safety net for users
who skipped `next` and land work directly on a bare branch. Nothing
auto-attaches at branch-creation time.

## Document anatomy

Every memjective shares the same shape. See
`templates/memjective-template.md` for the canonical form.

- **Title** — one line. Describes the workstream, not the current slice.
- **Status** — a single line: `in progress`, `blocked`, `done`, or similar.
- **Intro** — one to two short paragraphs. Says what triggered the memjective,
  what related work is already landed, what remains in scope now, what is out
  of scope, and why the remaining work matters. Load-bearing: a fresh session
  should be able to understand the workstream from this alone.
- **Completion Criteria** — re-checkable, end-state-oriented bullets. Prefer
  criteria that describe the final contract / public surface / cleanup state
  over intermediate implementation steps.
- **Status Checklist** — the evolving roadmap + progress surface. Organized
  by PR-sized slices when work is expected to land incrementally. Prefer
  steelthreaded early slices (end-to-end) over framework-only scaffolding.
- **How to Make Progress** — the mechanical recipe for future sessions. Says
  how to pick the next slice, what current behavior to inspect first, and what
  to update after landing a slice.
- **Notes** — durable findings, constraints, collisions, and pointers
  discovered during implementation. Optional for simple memjectives; kept for
  architectural / migration memjectives so hard-won knowledge is preserved.

## Lifecycle

```
dev-memjective-create  →  ( dev-memjective-peek?  →  new slice branch  →
                            dev-memjective-next   →  dev-memjective-update )*
```

- **Create** (`dev-memjective-create`): draft the memjective and store it as
  the master-branch seed + an initial branch snapshot on the current branch.
  Runs once per memjective.
- **Peek** (`dev-memjective-peek`): optional, read-only, lightweight. Resolve
  the active memjective from the current branch snapshot, the nearest
  ancestor branch snapshot in commit history, or the master seed; report a
  short status summary (title, status, completion-criteria progress,
  checklist state); and suggest a kebab-case slug for the next slice.
  Writes nothing. Useful when you want a quick status check before deciding
  whether to open a new branch, but skippable — users who already know the
  state can go straight to creating a branch.
- **New slice branch**: the user creates a branch for the next slice using
  their preferred tool (`gt create`, `git checkout -b`, etc.), typically
  named with the slug `peek` suggested. Not a skill.
- **Next** (`dev-memjective-next`): runs **on the fresh slice branch**.
  Precondition: the current branch has no memjective snapshot yet; the skill
  errors out otherwise. It then (a) copies the source memjective verbatim
  onto the current branch via `brmem put` (the carry-forward) and (b)
  implements the next slice directly in the session using normal tooling.
  Resolution skips the current-branch case (ruled out by the precondition)
  and uses ancestor snapshots or master seeds.
- **Update** (`dev-memjective-update`): after a slice lands, conservatively
  rewrite the branch snapshot to reflect what happened. Runs once per slice.

A session may mix these freely: skip `peek` and go straight to `next`, run
`update` without having run `next` in this session (if a snapshot is already
attached), or run neither and just progress the work informally. The only
hard rule is `next`'s precondition — it must run on a branch with no
existing memjective snapshot.

## Mutation contracts

Each operation skill has a narrow mutation contract that keeps the system
honest. The full table lives in `references/mutation-contract.md`. Summary:

- **`create`** — writes the master seed + initial branch snapshot. Does not
  touch any other branch.
- **`peek`** — writes **nothing**. Advisory only; status inspector + slug
  suggester.
- **`next`** — writes exactly one brmem entry: the carry-forward of the
  resolved source onto the current branch. The snapshot is attached as a
  verbatim copy; no edits at attach time. After implementation, `next` does
  not rewrite the snapshot — that is `update`'s job. Never writes the master
  seed or any other branch's snapshot.
- **`update`** — rewrites only the current branch's snapshot. Never rewrites
  the master seed or any other branch's snapshot.

Within `update`, the rewrite is **conservative**: completed items may be
checked; the Status Checklist may be split or extended; the Notes section may
grow; `How to Make Progress` may be amended when the recipe actually changed.
Completion Criteria and the master seed are not rewritten casually. See the
full table for the per-section rules.

## Relation to neighboring concepts

- **`objective`** — the GitHub-backed sibling. Use an `objective` when the
  work is substantial, benefits from external reviewers, or needs to outlive a
  local branch. Graduate a memjective to an objective if it outgrows the
  prototype.
- **`workbr`** — the upper execution frame. A branch may carry both a
  `workbr` plan entry (namespace `workbr`, key `plan/plan.md`) and a
  memjective snapshot (namespace `memjectives`, key `<slug>.md`). The plan
  scopes the work in-flight; the memjective spans multiple slices. They
  coexist without interacting.
- **`plan`** — orthogonal. A one-shot plan file (via `dev-plan-to-branch`)
  describes a single implementation. A memjective describes a workstream that
  may span many such plans.

## The `dev-` prefix

All memjective skills carry the `dev-` prefix and `metadata.internal: true`.
This marks the subsystem as a prototype dogfooded by twerk contributors. It is
hidden from external `npx skills add` discovery. When the prototype
stabilizes, the graduation path is (1) drop the `dev-` prefix in every
directory and reference, and (2) remove the `internal: true` flag.

## Shared references

- `templates/memjective-template.md` — canonical memjective shape used by
  `dev-memjective-create` when drafting a new memjective.
- `references/mutation-contract.md` — per-operation, per-section table of
  what each skill may and may not change.

## Operation skill index

- `dev-memjective-create` — draft a new memjective, store the master seed,
  and attach the initial branch snapshot.
- `dev-memjective-peek` — optional, read-only status check. Summarize the
  active memjective and suggest a kebab-case branch slug for the next
  slice. Writes nothing.
- `dev-memjective-next` — run on a fresh slice branch; carry the memjective
  snapshot forward onto the current branch and implement the next slice.
  Errors if the current branch already has a memjective snapshot.
- `dev-memjective-update` — after a slice lands, rewrite the branch snapshot
  conservatively.

## Shared anti-patterns

- Using GitHub issues or comments for memjectives. The prototype is
  deliberately local-first; a GitHub-backed workstream should be an
  `objective`.
- Treating the master seed as a living document. In the current lifecycle,
  the seed is written once and not rewritten by `update`.
- Writing a memjective into the working tree. Memjectives live only in brmem.
- Attaching more than one memjective to a branch. The invariant is enforced
  by every operation skill.
- Synthesizing or merging a memjective from multiple sources. Carry-forward
  is always an exact copy of a single source.
- Opening an architectural redesign with framework-only early slices when a
  steelthreaded end-to-end slice is possible.
