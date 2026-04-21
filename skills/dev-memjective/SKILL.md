---
name: dev-memjective
description: "Conceptual reference for the twerk memjective prototype — local-first, brmem-backed planning docs that mirror the objective subsystem without touching GitHub. Covers what a memjective is, the master-seed / branch-snapshot storage model, the one-memjective-per-branch invariant, the document anatomy (Title / Status / Intro / Completion Criteria / Status Checklist / How to Make Progress / Notes), the create → (next → work → update)* lifecycle, per-operation mutation contracts, exact-copy carry-forward semantics, and the relationship to `objective`, `workbr`, and `plan`. Fires on conceptual questions about memjectives, ad-hoc operations outside the operation skills, and alongside `dev-memjective-create`, `dev-memjective-next`, and `dev-memjective-update` as shared grounding. Owns the memjective template under `templates/` and the mutation-contract table under `references/`. Read-only — no state mutation."
allowed-tools: []
metadata:
  internal: true
---

<!-- INTERNAL SKILL: twerk-only. Conceptual reference for the local-first memjective prototype. -->

# dev-memjective

Conceptual reference for the twerk memjective subsystem. This skill does not
perform operations. Use it as shared grounding alongside the three operation
skills (`dev-memjective-create`, `dev-memjective-next`, `dev-memjective-update`),
and as a landing spot for ad-hoc questions about memjectives that don't map
cleanly to any of them.

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

Carry-forward is performed explicitly — either by `dev-memjective-update`'s
preflight when the branch has no snapshot yet, or manually by the user via
`brmem put` based on the command `dev-memjective-next` prints in its output.
Nothing auto-attaches at branch-creation time.

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
dev-memjective-create  →  (dev-memjective-next  →  work  →  dev-memjective-update)*
```

- **Create** (`dev-memjective-create`): draft the memjective and store it as
  the master-branch seed + an initial branch snapshot on the current branch.
  Runs once per memjective.
- **Next** (`dev-memjective-next`): read-only advisory. Resolve the active
  memjective, assess the codebase, decide the next slice, and suggest a branch
  slug for the work. Writes nothing. May be invoked from a new branch that
  doesn't yet have its own snapshot — source resolution walks the ancestor
  chain looking for the nearest branch with a memjective, falling back to the
  master seed.
- **Work**: normal implementation between `next` and `update`. Not a skill —
  just engineering, using whatever tooling the task calls for.
- **Update** (`dev-memjective-update`): after a slice lands, conservatively
  rewrite the branch snapshot to reflect what happened. Runs once per slice.

A session may mix these freely: run `next` without running `update`, run
`update` without running `next`, or run neither and just progress the work
informally.

## Mutation contracts

Each operation skill has a narrow mutation contract that keeps the system
honest. The full table lives in `references/mutation-contract.md`. Summary:

- **`create`** — writes the master seed + initial branch snapshot. Does not
  touch any other branch.
- **`next`** — writes **nothing**. Advisory only.
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
- `dev-memjective-next` — decide what to work on next; suggest a branch slug.
  Read-only.
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
