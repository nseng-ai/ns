---
name: dev-memjective
description: "Conceptual reference for the twerk memjective prototype — local-first, brmem-backed planning docs that mirror the objective subsystem without touching GitHub. Covers what a memjective is, the master-seed / branch-snapshot storage model, the canonical `memjectives/<slug>/body.md` + `memjectives/<slug>/meta.json` layout, the exactly-one-body-per-branch invariant, the document anatomy (Title / Status / Intro / Completion Criteria / Status Checklist / How to Make Progress / Notes), the create → (peek? → branch → next → update)* lifecycle, per-operation mutation contracts, exact-copy carry-forward semantics, invalid states, and the relationship to `objective`, `workbr`, and `plan`. Fires on conceptual questions about memjectives, ad-hoc operations outside the operation skills, and alongside `dev-memjective-create`, `dev-memjective-peek`, `dev-memjective-next`, and `dev-memjective-update` as shared grounding. Owns the memjective template under `templates/` and the mutation-contract + meta-schema references under `references/`. Read-only — no state mutation."
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

Memjectives live entirely in `brmem` under namespace `memjectives`. The
canonical layout is:

```text
refs/brmem/memjectives/<encoded-branch>/<slug>/body.md
refs/brmem/memjectives/<encoded-branch>/<slug>/meta.json
```

Branch names are encoded by replacing `/` with `---`.

Each memjective has **two files**:

1. **`body.md`** — the authoritative planning document. This is the only file
   that establishes whether a memjective exists on a branch.
2. **`meta.json`** — repairable metadata. It captures branch / lineage /
   timestamp context, but it is not authoritative for existence. If missing or
   stale, skills may warn and reconstruct it from the branch state and the
   authoritative body.

Each memjective has **two kinds of entries**:

1. **Master-branch seed** — the canonical starting point for the workstream.
   Stored at `refs/brmem/memjectives/master/<slug>/body.md` plus sibling
   `meta.json`. Written once by `dev-memjective-create`. The seed body is not
   rewritten during ordinary progress.
2. **Per-branch snapshot** — the speculative, in-flight state on a specific
   working branch. Stored at
   `refs/brmem/memjectives/<encoded-branch>/<slug>/body.md` plus sibling
   `meta.json`. Rewritten conservatively by `dev-memjective-update` as slices
   land.

The seed is treated as an immutable starting point during the normal lifecycle.
The per-branch snapshot body is the working document.

### Exactly-one-body-per-branch invariant

A valid branch has **exactly zero or one** memjective bodies in the
`memjectives` namespace. Operationally:

- `dev-memjective-create` requires **zero** `*/body.md` entries on the current
  branch before creation.
- `dev-memjective-next` requires **zero** `*/body.md` entries on the fresh
  slice branch before carry-forward.
- `dev-memjective-peek` and `dev-memjective-update` require **exactly one**
  `*/body.md` entry on any branch they resolve directly.

This invariant keeps source resolution deterministic and prevents silent
ambiguity.

### Invalid states

The cutover is atomic. Old flat keys are not supported after it lands. Skills
must fail fast on invalid state instead of silently ignoring it.

Invalid states include:

- multiple `*/body.md` keys on a single branch
- `meta.json` without a matching sibling `body.md`
- legacy flat keys matching `^[^/]+\.md$` in namespace `memjectives`

`body.md` is authoritative. `meta.json` is repairable. A missing or stale
`meta.json` is recoverable; an orphaned `meta.json` is not.

### Carry-forward semantics

When a new branch is created and work on the memjective should continue there,
`dev-memjective-next` performs the carry-forward:

- copy the source `<slug>/body.md` **verbatim** onto the destination branch
- write a **fresh** destination `<slug>/meta.json`

Carry-forward never merges or synthesizes body text across sources. The body is
always an exact copy of one source. Only the metadata is freshly written on the
destination branch.

For carried-forward metadata:

- `kind` is `snapshot`
- `branch` is the destination branch
- `source_branch` records the resolved source branch when available, otherwise
  `null`
- `parent_branch` is best-effort, otherwise `null`
- `baseline_head_sha` is the destination branch `HEAD` before implementation
- `body_updated_at` is copied from source metadata when available, otherwise
  set to carry-forward time
- `meta_updated_at` is always the carry-forward time

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

```text
dev-memjective-create  →  ( dev-memjective-peek?  →  new slice branch  →
                            dev-memjective-next   →  dev-memjective-update )*
```

- **Create** (`dev-memjective-create`): draft the memjective and store it as
  the master-branch seed + an initial branch snapshot on the current branch.
  Writes both `body.md` and `meta.json` in both places. Runs once per
  memjective.
- **Peek** (`dev-memjective-peek`): optional, read-only, lightweight. Resolve
  the active memjective from the current branch snapshot, the nearest ancestor
  branch snapshot in commit history, or the master seed; report a short status
  summary; and suggest a kebab-case slug for the next slice. Reads `meta.json`
  when present, but continues from `body.md` with a warning if metadata is
  missing.
- **New slice branch**: the user creates a branch for the next slice using
  their preferred tool (`gt create`, `git checkout -b`, etc.), typically named
  with the slug `peek` suggested. Not a skill.
- **Next** (`dev-memjective-next`): runs **on the fresh slice branch**.
  Precondition: the current branch has no memjective body yet and no legacy
  flat keys. It then (a) copies the source body verbatim onto the current
  branch, (b) writes fresh metadata for the destination branch, and (c)
  implements the next slice directly in the session using normal tooling.
- **Update** (`dev-memjective-update`): after a slice lands, conservatively
  rewrite the current branch snapshot to reflect what happened. Rewrite
  `body.md` only when the prose changed; always refresh `meta.json`.

A session may mix these freely: skip `peek` and go straight to `next`, run
`update` without having run `next` in this session (if a snapshot is already
attached), or run neither and just progress the work informally. The hard rules
are the body-based branch invariants and the invalid-state checks.

## Mutation contracts

Each operation skill has a narrow mutation contract that keeps the system
honest. The full table lives in `references/mutation-contract.md`. Summary:

- **`create`** — writes the master seed body + meta and the initial current
  branch body + meta. Does not touch any other branch.
- **`peek`** — writes **nothing**. Advisory only.
- **`next`** — writes exactly two current-branch entries during carry-forward:
  an exact-copy body and a fresh meta file. Never writes the master seed or
  any other branch's entries.
- **`update`** — rewrites the current branch meta on every run and rewrites the
  current branch body only when the prose actually changed. Never rewrites the
  master seed or any other branch's entries.

Within `update`, the body rewrite is **conservative**: completed items may be
checked; the Status Checklist may be split or extended; the Notes section may
grow; `How to Make Progress` may be amended when the recipe actually changed.
Completion Criteria and the master seed body are not rewritten casually. See
the full table for the per-section rules.

## Relation to neighboring concepts

- **`objective`** — the GitHub-backed sibling. Use an `objective` when the
  work is substantial, benefits from external reviewers, or needs to outlive a
  local branch. Graduate a memjective to an objective if it outgrows the
  prototype.
- **`workbr`** — the upper execution frame. A branch may carry both a
  `workbr` plan entry (namespace `workbr`, key `plan/plan.md`) and a memjective
  snapshot (namespace `memjectives`, key `<slug>/body.md` plus sibling
  `meta.json`). The plan scopes the work in-flight; the memjective spans
  multiple slices. They coexist without interacting.
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
- `references/meta-schema.md` — schema for `meta.json`, including field
  meanings and repair rules.

## Operation skill index

- `dev-memjective-create` — draft a new memjective, store the master seed,
  and attach the initial branch snapshot.
- `dev-memjective-peek` — optional, read-only status check. Summarize the
  active memjective and suggest a kebab-case branch slug for the next slice.
  Writes nothing.
- `dev-memjective-next` — run on a fresh slice branch; carry the memjective
  body forward onto the current branch, synthesize fresh metadata, and
  implement the next slice. Errors if the current branch already has a
  memjective body or any legacy flat memjective key.
- `dev-memjective-update` — after a slice lands, rewrite the branch snapshot
  conservatively and refresh its metadata.

## Shared anti-patterns

- Using GitHub issues or comments for memjectives. The prototype is
  deliberately local-first; a GitHub-backed workstream should be an
  `objective`.
- Treating the master seed body as a living document. In the current lifecycle,
  the seed body is written once and not rewritten by `update`.
- Writing a memjective into the working tree. Memjectives live only in brmem.
- Attaching more than one memjective body to a branch. The invariant is
  enforced by every operation skill.
- Treating `meta.json` as authoritative over `body.md`. Metadata is auxiliary
  and repairable.
- Leaving orphaned metadata, multiple bodies, or legacy flat keys in place and
  expecting the skills to recover silently. They should fail fast.
- Synthesizing or merging a memjective body from multiple sources. Carry-forward
  is always an exact copy of a single source body.
- Opening an architectural redesign with framework-only early slices when a
  steelthreaded end-to-end slice is possible.
