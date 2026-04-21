---
name: dev-memjective-create
description: "Create a local-first memjective record for the memjective prototype. Draft a simple migration-notice-style memjective body, store the seed on the `master` branch via `brmem` under namespace `memjectives` at `memjectives/<slug>/body.md` with sibling `meta.json`, and attach the same body plus branch-specific metadata to the current branch. Use when the user wants to start a new local memjective, prototype memjective, attach a memjective to the current branch, or create a branch-scoped memjective snapshot without using GitHub."
allowed-tools:
  - "Bash(git rev-parse *)"
  - "Bash(brmem *)"
  - "Read"
  - "Write"
metadata:
  internal: true
---

<!-- INTERNAL SKILL: twerk-only. Local-first memjective prototype on top of brmem. -->

# dev-memjective-create

Create a new **local-first memjective** for the memjective prototype.

This skill deliberately does **not** use GitHub. The canonical seed lives on
the `master` branch in brmem at:

- namespace `memjectives`, key `<slug>/body.md`
- namespace `memjectives`, key `<slug>/meta.json`

Then the drafted body is attached to the **current branch** with matching
branch-specific metadata at the same two keys.

`body.md` is authoritative. `meta.json` is repairable metadata synthesized per
`../dev-memjective/references/meta-schema.md`.

## Goal

Given a rough memjective brief from the user, produce:

1. a migration-notice-style memjective body stored as the master-branch seed at
   `memjectives/<slug>/body.md`
2. a matching master seed metadata file at `memjectives/<slug>/meta.json`
3. a matching current-branch snapshot body at `memjectives/<slug>/body.md`
4. a current-branch snapshot metadata file at `memjectives/<slug>/meta.json`
5. a short report naming the slug, branch, and brmem commits

## Core rules

- **This prototype is local-first.** Do not create or edit GitHub issues.
- **Branch validity is body-based.** Preflight the current branch by looking
  for `*/body.md` entries. A valid branch has zero or one; `create` requires
  zero.
- **Legacy flat keys are unsupported.** If the current branch contains any
  `^[^/]+\.md$` memjective key, abort with a clear unsupported-layout error.
- **Orphaned metadata is invalid.** If the current branch contains
  `*/meta.json` without matching `*/body.md`, abort instead of creating
  alongside broken state.
- **Use the simple template.** Read
  `../dev-memjective/templates/memjective-template.md` and keep the draft close
  to that shape:
  - title
  - `Status:` line
  - short intro paragraph(s) that explain where the memjective comes from, what
    related work is already landed, what remains in scope now, what is out of
    scope, and why the remaining work matters
  - `## Completion Criteria` describing the target end state in re-checkable
    terms
  - `## Status Checklist`, organized by PR-sized slices when the work is
    expected to land incrementally
  - `## How to Make Progress`
  - `## Notes` (expected for architectural / migration memjectives; optional
    for simpler memjectives)
- **Write the body once, then attach it twice.** The master seed body and the
  current-branch snapshot body should be identical at creation time.
- **Write fresh metadata in both places.** The master metadata is a `seed`; the
  branch metadata is a `snapshot`.
- **Do not write the memjective into the working tree.** The durable copies
  live only in brmem.
- **Do not touch the workbr plan entry.** If the branch already has a
  `plan/plan.md` entry in namespace `workbr`, leave it alone.

## Workflow

### 1. Pre-flight: confirm repo + current branch

Run:

```bash
git rev-parse --show-toplevel
git rev-parse --abbrev-ref HEAD
```

Call the branch `<branch>`.

Abort if:

- not in a git repo
- the current branch is detached (`HEAD`)

Also capture:

```bash
git rev-parse HEAD
git rev-parse master
```

Use the first SHA for the current-branch snapshot metadata and the second for
the master seed metadata.

### 2. Ensure the current branch is empty of memjective bodies

Inspect current-branch brmem for the `memjectives` namespace:

```bash
brmem list --namespace memjectives
```

Classify the results into:

- `*/body.md`
- `*/meta.json`
- legacy flat `^[^/]+\.md$`

Decision rules:

- **any legacy flat key** → abort with an unsupported-layout message
- **any `meta.json` without sibling `body.md`** → abort; invalid state
- **0 body matches** → continue
- **1 body match** → abort and tell the user this branch already has a
  memjective; they likely want `dev-memjective-peek` or
  `dev-memjective-update` instead
- **2+ body matches** → abort; invalid state

### 3. Capture the memjective from the conversation

Start from the current conversation. If the user references a PR, issue, design
spec, or local markdown document, read it before drafting. Ask only brief
follow-ups when a critical piece is missing.

You need enough to draft:

- a concrete title
- intro paragraph(s) that explain the source proposal / trigger for the
  memjective, adjacent work already landed, the remaining scope now, any
  clearly out-of-scope adjacent work, and why the remaining work matters
- completion criteria that describe the intended end state rather than just a
  pile of tasks
- a status checklist organized by PR-sized slices when the work is expected to
  land incrementally
- a `How to Make Progress` section that makes future progress sessions fairly
  mechanical
- notes / constraints / collisions / file pointers that future sessions are
  likely to need

Bias toward the **migration-notice level of simplicity**. This is not the full
GitHub objective template.

### 4. Generate the slug

If the user explicitly provides a slug, use it. Otherwise generate one from the
memjective title + intent.

Slug rules:

- lowercase ASCII
- hyphen-separated
- concise, stable, and descriptive of the workstream
- no `.md` suffix
- usually ≤50 characters
- do not add redundant prefixes like `memjective-` unless they are part of the
  natural name

Examples:

- `clinkr-migration`
- `memjective-prototype`
- `explicit-group-migration`

### 5. Pre-flight the master seed location

Before writing, check the target seed keys on `master`:

```bash
brmem check <slug>/body.md --namespace memjectives --branch master
brmem check <slug>/meta.json --namespace memjectives --branch master
brmem check <slug>.md --namespace memjectives --branch master
```

Decision rules:

- **legacy `<slug>.md` exists on master** → abort with an unsupported-layout
  error; do not create a mixed-layout seed
- **`<slug>/body.md` exists on master** → abort; that seed already exists
- **`<slug>/meta.json` exists without `<slug>/body.md`** → abort; invalid
  master state
- otherwise → continue

### 6. Draft the memjective body

Read `../dev-memjective/templates/memjective-template.md` and fill it in.

Drafting guidance:

- Keep the intro short, but make it load-bearing: it should say what proposal
  or change triggered the memjective, what related work is already landed, what
  remains in scope now, and why the remaining work matters.
- Make completion criteria re-checkable and end-state oriented. For migrations
  and redesigns, prefer criteria that describe the final contract / public
  surface / cleanup state, not just intermediate implementation steps.
- Use the checklist as the main roadmap / progress surface. When the work will
  land over multiple PRs, organize it by PR-sized slices.
- For architectural redesigns and migrations, prefer **steelthreaded** early
  slices: combine the smallest necessary core plumbing with one real migrated
  command or package so the design is exercised end-to-end as early as
  possible.
- Put the durable work recipe in `## How to Make Progress`. For multi-PR work,
  this should usually tell future sessions how to choose the next slice, what
  current behavior to inspect first, and what to update after landing a slice.
- For architectural / migration memjectives, keep `## Notes` by default and
  use it to preserve durable findings, constraints, collisions, hidden
  couplings, and open questions discovered during implementation.

### 7. Synthesize the metadata

Write the body to a temp file and synthesize two metadata files per
`../dev-memjective/references/meta-schema.md`.

Master seed metadata:

```json
{
  "schema_version": 1,
  "slug": "<slug>",
  "kind": "seed",
  "branch": "master",
  "parent_branch": null,
  "source_branch": null,
  "baseline_head_sha": "<git rev-parse master>",
  "body_updated_at": "<now>",
  "meta_updated_at": "<now>"
}
```

Current-branch snapshot metadata:

```json
{
  "schema_version": 1,
  "slug": "<slug>",
  "kind": "snapshot",
  "branch": "<branch>",
  "parent_branch": null,
  "source_branch": null,
  "baseline_head_sha": "<git rev-parse HEAD>",
  "body_updated_at": "<same now>",
  "meta_updated_at": "<same now>"
}
```

Use the same timestamp for both `body_updated_at` and `meta_updated_at` during
initial creation.

### 8. Write the master seed

Store the drafted body and metadata on `master`:

```bash
brmem put <slug>/body.md --namespace memjectives --branch master --file <body-temp>
brmem put <slug>/meta.json --namespace memjectives --branch master --file <master-meta-temp>
```

Capture both commit SHAs.

### 9. Attach the memjective to the current branch

Store the same body plus the branch metadata on the current branch:

```bash
brmem put <slug>/body.md --namespace memjectives --file <body-temp>
brmem put <slug>/meta.json --namespace memjectives --file <branch-meta-temp>
```

Capture both commit SHAs.

### 10. Report

Return a short summary including:

- memjective title
- slug
- master seed locations:
  - namespace `memjectives`, key `<slug>/body.md`, branch `master`
  - namespace `memjectives`, key `<slug>/meta.json`, branch `master`
- current branch name
- current-branch locations:
  - namespace `memjectives`, key `<slug>/body.md`
  - namespace `memjectives`, key `<slug>/meta.json`
- brmem commit SHAs for all four writes
- next-step hint:

```text
Run /dev-memjective-peek on this branch (or any descendant branch) for a
lightweight status check and a kebab-case slug suggestion for the next slice.

When you are ready to work the next slice, create a new branch with the
suggested slug and run /dev-memjective-next inside it. That skill exact-copies
the memjective body forward onto the new branch, synthesizes fresh metadata,
and then implements the slice in-session.

After the slice lands, run /dev-memjective-update on that branch to rewrite the
body conservatively and refresh the metadata.
```

## Edge cases

- **Detached HEAD** → abort; brmem attachment needs a branch name.
- **Current branch already has one memjective body** → abort; do not clobber.
- **Current branch has multiple memjective bodies** → abort; invalid state.
- **Current branch has orphaned metadata** → abort; invalid state.
- **Current branch has legacy flat keys** → abort; unsupported layout.
- **Seed already exists on master for this slug** → abort; do not overwrite an
  existing canonical seed entry.
- **Master has orphaned metadata for this slug** → abort; invalid state.
- **Branch already has a `workbr` plan entry** → fine; leave it alone.
- **Memjective is too vague to write `How to Make Progress`** → ask a short
  follow-up instead of drafting generic boilerplate.

## Anti-patterns

- Using GitHub issues or comments in this prototype.
- Writing the memjective into the repo working tree.
- Creating a second memjective body on a branch that already has one.
- Writing only `body.md` or only `meta.json` during creation. Create both.
- Treating legacy flat keys as an alias for the new layout.
- Replacing `How to Make Progress` with vague advice like "keep working on it."
- Treating the master seed as something that should be rewritten during
  ordinary update sessions. In v0, `dev-memjective-update` rewrites the branch
  snapshot body and metadata, not the master seed.
- Opening an architectural redesign with framework-only or abstraction-only
  early slices when a steelthreaded end-to-end slice is possible.
