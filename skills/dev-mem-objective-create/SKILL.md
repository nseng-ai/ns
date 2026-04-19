---
name: dev-mem-objective-create
description: "Create a local-first objective record for the objective-mem prototype. Draft a simple migration-notice-style objective, store it in `/Users/schrockn/code/scratch/objectives/<slug>.md`, and attach the same text to the current branch via `brmem` as `objectives/<slug>.md`. Use when the user wants to start a new local objective, prototype objective-mem, attach an objective to the current branch, or create a branch-scoped objective snapshot without using GitHub."
allowed-tools:
  - "Bash(git rev-parse *)"
  - "Bash(brmem *)"
  - "Read"
  - "Write"
metadata:
  internal: true
---

<!-- INTERNAL SKILL: twerk-only. Local-first objective prototype on top of brmem. -->

# dev-mem-objective-create

Create a new **local-first objective** for the objective-mem prototype.

This skill deliberately does **not** use GitHub. It creates a canonical
objective file in the local scratch store:

- `/Users/schrockn/code/scratch/objectives/<slug>.md`

Then it attaches that exact text to the **current branch** in brmem at:

- `objectives/<slug>.md`

The branch snapshot is the in-flight speculative state. The scratch-store file
is only the initial seed for this prototype.

## Goal

Given a rough objective brief from the user, produce:

1. a migration-notice-style objective document at
   `/Users/schrockn/code/scratch/objectives/<slug>.md`
2. a matching brmem snapshot for the current branch at
   `objectives/<slug>.md`
3. a short report naming the slug, global-store path, branch, and brmem commit

## Core rules

- **This prototype is local-first.** Do not create or edit GitHub issues.
- **One objective per branch.** If the current branch already has a file under
  `objectives/*.md`, abort instead of creating a second one.
- **Use the simple template.** Read `references/objective-template.md` and keep
  the draft close to that shape:
  - title
  - `Status:` line
  - short intro paragraph(s) that explain where the objective comes from, what
    related work is already landed, what remains in scope now, what is out of
    scope, and why the remaining work matters
  - `## Completion Criteria` describing the target end state in re-checkable
    terms
  - `## Status Checklist`, organized by PR-sized slices when the work is
    expected to land incrementally
  - `## How to Make Progress`
  - `## Notes` (expected for architectural / migration objectives; optional for
    simpler objectives)
- **The branch snapshot path must carry the slug.** Do not use bare
  `objective.md`; the branch path is `objectives/<slug>.md`.
- **Attach the exact drafted text.** Write the global-store file first, then use
  `brmem put` to copy that exact file onto the branch.
- **Do not write the objective into the working tree.** The only durable copies
  are the scratch-store file and the brmem snapshot.
- **Do not touch `plan.md`.** If the branch already has a `plan.md`, leave it
  alone. `plan.md` is the upper execution frame; the objective sits below it.

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

### 2. Ensure the branch does not already have an objective

Inspect current-branch brmem:

```bash
brmem list
```

Filter the returned paths to `objectives/*.md`.

Decision rules:

- **0 matches** → continue
- **1 match** → abort and tell the user this branch already has an objective;
  they likely want `dev-mem-objective-progress` instead
- **2+ matches** → abort and tell the user the branch is in an invalid v0 state
  because this prototype allows only one objective snapshot per branch

### 3. Capture the objective from the conversation

Start from the current conversation. If the user references a PR, issue, design
spec, or local markdown document, read it before drafting. Ask only brief
follow-ups when a critical piece is missing.

You need enough to draft:

- a concrete title
- intro paragraph(s) that explain the source proposal / trigger for the
  objective, adjacent work already landed, the remaining scope now, any clearly
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
objective title + intent.

Slug rules:

- lowercase ASCII
- hyphen-separated
- concise, stable, and descriptive of the workstream
- no `.md` suffix
- usually ≤50 characters
- do not add redundant prefixes like `objective-` unless they are part of the
  natural name

Examples:

- `clinkr-migration`
- `objective-mem-prototype`
- `explicit-group-migration`

### 5. Pre-flight the scratch-store path

The canonical scratch-store location is:

```text
/Users/schrockn/code/scratch/objectives/<slug>.md
```

Before writing, try to read that file.

Decision rules:

- if it does **not** exist, continue
- if it **does** exist, abort and tell the user the objective already exists in
  the scratch store; they likely want to progress or explicitly create a new
  slug instead of clobbering it

### 6. Draft the objective document

Read `references/objective-template.md` and fill it in.

Drafting guidance:

- Keep the intro short, but make it load-bearing: it should say what proposal
  or change triggered the objective, what related work is already landed, what
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
- For architectural / migration objectives, keep `## Notes` by default and use
  it to preserve durable findings, constraints, collisions, hidden couplings,
  and open questions discovered during implementation.

### 7. Write the canonical scratch-store file

Use the `Write` tool to create:

```text
/Users/schrockn/code/scratch/objectives/<slug>.md
```

This file is the prototype's global store / system-of-record seed.

### 8. Attach the objective to the current branch

Copy the exact scratch-store file into branch memory:

```bash
brmem put objectives/<slug>.md --file /Users/schrockn/code/scratch/objectives/<slug>.md
```

- The current branch is used implicitly.
- The branch-local path must be `objectives/<slug>.md`.
- This is the initial speculative snapshot for the branch.

Capture the commit SHA reported by `brmem put` for the report.

### 9. Report

Return a short summary including:

- objective title
- slug
- scratch-store path
- current branch name
- branch snapshot path (`objectives/<slug>.md`)
- brmem commit SHA
- next-step hint:

```text
Run /dev-mem-objective-progress on this branch to continue from the
branch-local snapshot. On child branches, the same progress skill can carry the
objective forward when no local snapshot exists yet.
```

## Edge cases

- **Detached HEAD** → abort; brmem attachment needs a branch name.
- **Current branch already has one objective snapshot** → abort; do not clobber.
- **Current branch has multiple objective snapshots** → abort; ask the user to
  clean up the branch state first.
- **Scratch-store slug already exists** → abort; do not overwrite an existing
  canonical seed file.
- **Branch already has `plan.md`** → fine; leave it alone.
- **Objective is too vague to write `How to Make Progress`** → ask a short
  follow-up instead of drafting generic boilerplate.

## Anti-patterns

- Using GitHub issues or comments in this prototype.
- Writing the objective into the repo working tree.
- Creating a second objective on a branch that already has one.
- Attaching the branch snapshot under a generic name like `objective.md`.
- Replacing `How to Make Progress` with vague advice like “keep working on it.”
- Treating the scratch-store file as something that should be rewritten during
  ordinary progress sessions. In v0, progress rewrites the **branch snapshot**,
  not the global seed.
- Opening an architectural redesign with framework-only or abstraction-only
  early slices when a steelthreaded end-to-end slice is possible.
