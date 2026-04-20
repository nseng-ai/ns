---
name: dev-memjective-create
description: "Create a local-first memjective record for the memjective prototype. Draft a simple migration-notice-style memjective, store the seed on the `master` branch via `brmem` under namespace `memjectives`, key `<slug>.md`, and attach the same text to the current branch. Use when the user wants to start a new local memjective, prototype memjective, attach a memjective to the current branch, or create a branch-scoped memjective snapshot without using GitHub."
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

This skill deliberately does **not** use GitHub. The canonical seed lives on the
`master` branch in brmem at:

- namespace `memjectives`, key `<slug>.md` (on `master`)

Then the exact seed text is attached to the **current branch** in brmem at:

- namespace `memjectives`, key `<slug>.md` (on the current branch)

The branch snapshot is the in-flight speculative state. The master-branch seed
is the canonical initial seed for this prototype.

## Goal

Given a rough memjective brief from the user, produce:

1. a migration-notice-style memjective document stored as the `master`-branch
   brmem seed under namespace `memjectives`, key `<slug>.md`
2. a matching brmem snapshot for the current branch under
   namespace `memjectives`, key `<slug>.md`
3. a short report naming the slug, branch, and brmem commits

## Core rules

- **This prototype is local-first.** Do not create or edit GitHub issues.
- **One memjective per branch.** If the current branch already has any entry in
  the `memjectives` namespace, abort instead of creating a second one.
- **Use the simple template.** Read `references/memjective-template.md` and keep
  the draft close to that shape:
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
  - `## Notes` (expected for architectural / migration memjectives; optional for
    simpler memjectives)
- **The branch snapshot key must carry the slug.** Do not use bare
  `memjective.md`; the branch key is `<slug>.md` in namespace `memjectives`.
- **Attach the exact drafted text.** Write the master-branch seed first, then
  use `brmem put` to copy that exact content onto the current branch.
- **Do not write the memjective into the working tree.** The only durable copies
  are the master-branch brmem seed and the current-branch brmem snapshot.
- **Do not touch the workbr plan entry.** If the branch already has
  a `plan/plan.md` entry in the `workbr` namespace, leave it alone.
  That plan is the upper execution frame; the memjective sits below it.

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

### 2. Ensure the branch does not already have a memjective

Inspect current-branch brmem for the `memjectives` namespace:

```bash
brmem list --namespace memjectives
```

`--branch` is omitted so the current branch is used implicitly.

Decision rules:

- **0 matches** → continue
- **1 match** → abort and tell the user this branch already has a memjective;
  they likely want `dev-memjective-progress` instead
- **2+ matches** → abort and tell the user the branch is in an invalid v0 state
  because this prototype allows only one memjective snapshot per branch

### 3. Capture the memjective from the conversation

Start from the current conversation. If the user references a PR, issue, design
spec, or local markdown document, read it before drafting. Ask only brief
follow-ups when a critical piece is missing.

You need enough to draft:

- a concrete title
- intro paragraph(s) that explain the source proposal / trigger for the
  memjective, adjacent work already landed, the remaining scope now, any clearly
  out-of-scope adjacent work, and why the remaining work matters
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

### 5. Pre-flight the master-branch seed

Before writing, check whether the seed already exists on master:

```bash
brmem check <slug>.md --namespace memjectives --branch master
```

Decision rules:

- if it returns **non-zero** (no entry) → continue
- if it returns **0** (entry exists) → abort and tell the user the seed already
  exists on master for this slug; they likely want to progress or explicitly
  create a new slug instead of clobbering it

### 6. Draft the memjective document

Read `references/memjective-template.md` and fill it in.

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
  this should usually tell future sessions how to choose the next slice,
  what current behavior to inspect first, and what to update after landing a
  slice.
- For architectural / migration memjectives, keep `## Notes` by default and use
  it to preserve durable findings, constraints, collisions, hidden couplings,
  and open questions discovered during implementation.

### 7. Write the master-branch seed

Write the drafted memjective text to a temp file, then store it on master:

```bash
brmem put <slug>.md --namespace memjectives --branch master --file <temp>
```

This is the prototype's canonical seed entry. Capture the commit SHA.

### 8. Attach the memjective to the current branch

Copy the same content to the current branch in brmem:

```bash
brmem put <slug>.md --namespace memjectives --file <temp>
```

- `--branch` is omitted so the current branch is used implicitly.
- The positional key must be `<slug>.md`; the namespace must be `memjectives`.
- This is the initial speculative snapshot for the branch.

Capture the commit SHA reported by `brmem put` for the report.

### 9. Report

Return a short summary including:

- memjective title
- slug
- master-branch brmem seed location (namespace `memjectives`, key `<slug>.md`, branch `master`)
- current branch name
- branch brmem entry location (namespace `memjectives`, key `<slug>.md`)
- brmem commit SHA (branch snapshot)
- next-step hint:

```text
Run /dev-memjective-progress on this branch to continue from the
branch-local snapshot. On child branches, the same progress skill can carry the
memjective forward when no local snapshot exists yet.
```

## Edge cases

- **Detached HEAD** → abort; brmem attachment needs a branch name.
- **Current branch already has one memjective snapshot** → abort; do not clobber.
- **Current branch has multiple memjective snapshots** → abort; ask the user to
  clean up the branch state first.
- **Seed already exists on master for this slug** → abort; do not overwrite an existing
  canonical seed entry.
- **Branch already has a `workbr` plan entry** → fine; leave it alone.
- **Memjective is too vague to write `How to Make Progress`** → ask a short
  follow-up instead of drafting generic boilerplate.

## Anti-patterns

- Using GitHub issues or comments in this prototype.
- Writing the memjective into the repo working tree.
- Creating a second memjective on a branch that already has one.
- Attaching the branch snapshot under a generic key like `memjective.md` or a
  namespace other than `memjectives`.
- Replacing `How to Make Progress` with vague advice like "keep working on it."
- Treating the master-branch seed as something that should be rewritten during
  ordinary progress sessions. In v0, progress rewrites the **branch snapshot**,
  not the master-branch seed.
- Opening an architectural redesign with framework-only or abstraction-only
  early slices when a steelthreaded end-to-end slice is possible.
