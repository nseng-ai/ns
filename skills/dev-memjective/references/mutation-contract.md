# Memjective Mutation Contract

Per-operation table of what each memjective skill may and may not change. Each
operation skill defers to this file rather than restating the rules inline.

## Overview

`body.md` is authoritative. `meta.json` is repairable. Invalid structural state
must be surfaced immediately instead of silently normalized.

| Operation               | Master `body.md`      | Master `meta.json`    | Current-branch `body.md`          | Current-branch `meta.json` | Other-branch entries |
| ----------------------- | --------------------- | --------------------- | --------------------------------- | -------------------------- | -------------------- |
| `dev-memjective-create` | **Writes** (one-time) | **Writes** (one-time) | **Writes** (one-time)             | **Writes** (one-time)      | Never touches        |
| `dev-memjective-peek`   | Never writes          | Never writes          | Never writes                      | Never writes               | Never touches        |
| `dev-memjective-next`   | Never writes          | Never writes          | **Writes** (exact-copy attach)    | **Writes** (fresh)         | Never touches        |
| `dev-memjective-update` | Never writes          | Never writes          | **Rewrites** only if text changed | **Rewrites** every run     | Never touches        |

Carry-forward belongs to `dev-memjective-next` and is deliberately split:

- `body.md` is copied exactly from one source
- `meta.json` is written fresh for the destination branch

No skill is allowed to:

- accept a legacy flat `^[^/]+\.md$` memjective key as valid state
- accept `meta.json` without a sibling `body.md`
- accept multiple `*/body.md` entries on a single branch

## Section-by-section rules for `dev-memjective-update`

`update` is the only operation that rewrites an existing memjective body. The
rules below keep those rewrites honest. They apply to the current-branch
snapshot body only; the master seed body is never touched during `update`.

| Section              | Allowed                                                                                                                     | Forbidden                                                         |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Title                | Leave as-is                                                                                                                 | Rename unless the user explicitly asks                            |
| Status               | Update (`in progress` / `blocked` / `done`)                                                                                 | —                                                                 |
| Intro                | Clarify, append small updates                                                                                               | Replace wholesale; rewrite the origin story                       |
| Completion Criteria  | Check items; add brief evidence notes                                                                                       | Delete criteria; rewrite criteria casually; renumber              |
| Status Checklist     | Check completed items; add follow-ups near the affected slice; split items when work turned out more granular than expected | Erase completed items; drop progress history; wholesale reshuffle |
| How to Make Progress | Edit when the actual recipe changed                                                                                         | Edit just because one checklist item finished                     |
| Notes                | Append findings, constraints, pointers; annotate obsolete notes                                                             | Silently delete notes; strip context                              |

Metadata-specific rules for `update`:

- always rewrite `meta.json`
- always refresh `baseline_head_sha`, `branch`, `parent_branch`, and
  `meta_updated_at`
- refresh `body_updated_at` only when the body text actually changed
- preserve `source_branch` when it exists and remains credible; otherwise
  repair it conservatively to `null`
- never bump `body_updated_at` just because `meta.json` was rewritten

## Section-by-section rules for `dev-memjective-peek`

`peek` writes nothing. It resolves the active memjective from `*/body.md`,
optionally reads sibling `meta.json`, warns when metadata is missing, and
reports a status summary plus a candidate slug for the next slice.

`peek` is allowed to treat missing or stale metadata as repairable advisory
context. It is not allowed to treat orphaned metadata, legacy flat keys, or
multiple body entries as normal state.

## Section-by-section rules for `dev-memjective-next`

`next` writes exactly two current-branch entries:

- `<slug>/body.md` — exact copy of the resolved source body
- `<slug>/meta.json` — fresh destination metadata

`next` may not edit, reshape, or annotate the body while attaching it. Any
reshaping of the document body is `update`'s responsibility after a slice lands.

`next` does not rewrite the snapshot body a second time after implementation;
the post-implementation rewrite is `update`'s job. `next` also never touches
the master seed or any other branch's entries.

`next` refuses to run if the current branch already has a `*/body.md` entry, a
legacy flat key, or orphaned metadata. The precondition exists because `next`
is the "fresh slice branch" skill.

## Section-by-section rules for `dev-memjective-create`

`create` writes the full memjective body twice (master seed + initial branch
snapshot) and writes matching metadata twice. It is responsible for drafting
every body section per the template at `../templates/memjective-template.md`
and for synthesizing metadata per `meta-schema.md`.

After `create` runs, the master seed body is effectively frozen for the
lifetime of the prototype. Snapshot metadata remains repairable; snapshot body
remains the working document.

## Anti-patterns

- Letting `update` edit Completion Criteria because the plan drifted. If the
  completion criteria no longer match the work, the memjective has outgrown the
  prototype — graduate to an `objective` or start a new memjective.
- Using `update` to rewrite the master seed body. Not allowed in v0.
- Letting `next` edit the memjective body while carrying it forward.
  Carry-forward is always an exact copy of a single source body.
- Having `peek` write to brmem "just this once" as a convenience. Breaks the
  advisory-only contract.
- Running `next` on a branch that already has a memjective body. The
  precondition exists on purpose.
- Treating `meta.json` as a substitute for `body.md` when the body is missing.
- Repairing invalid structural state silently instead of surfacing it.
