---
name: dev-memjective-create
description: "Draft a new memjective and store it in `brmem` as the master-branch snapshot plus an initial snapshot on the current branch. Use when the user wants to start a new local memjective or attach one to the current branch. See `dev-memjective` for the subsystem overview."
allowed-tools:
  - "Bash(git rev-parse *)"
  - "Bash(brmem *)"
  - "Read"
  - "Write"
metadata:
  internal: true
---

<!-- INTERNAL SKILL: twerk-only. Local-first memjective subsystem on top of brmem. -->

# dev-memjective-create

Create a new local-first memjective: the master-branch snapshot and an initial
per-branch snapshot on the current branch.

> For shared concepts — vocabulary (`snapshot`, `master-branch snapshot`,
> `per-branch snapshot`), the storage model, the one-memjective-per-branch
> invariant, carry-forward semantics, the lifecycle, and the mutation-contract
> summary — see `../dev-memjective/SKILL.md`.

## Goal

Given a rough memjective brief from the user, produce:

1. a memjective document stored as the `master`-branch brmem snapshot under
   namespace `memjectives`, key `<slug>.md`
2. a matching brmem snapshot for the current branch under
   namespace `memjectives`, key `<slug>.md`
3. a short report naming the slug, branch, and brmem commits

## Core rules

- **Use the canonical template.** Read
  `../dev-memjective/templates/memjective-template.md` and keep the draft
  close to that shape:
  - title
  - short, categorical `Status:` line
  - `## Description` for durable context and scope
  - `## Goals` for the higher-level value this work should deliver
  - `## Completion Criteria` describing the target end state in re-checkable
    terms
  - `## Roadmap`, organized by PR-sized slices when the work is expected to
    land incrementally
  - `## How to Make Progress`
  - `## Notes` (expected for architectural or multi-PR memjectives; optional
    for simpler memjectives)
- **The branch snapshot key must carry the slug.** Do not use bare
  `memjective.md`; the branch key is `<slug>.md` in namespace `memjectives`.
- **Attach the exact drafted text.** Write the master-branch snapshot first,
  then use `brmem put` to copy that exact content onto the current branch.
- **Do not write the memjective into the working tree.** The only durable
  copies are the master-branch brmem snapshot and the current-branch brmem
  snapshot.
- **Do not touch the workbr plan entry.** If the branch already has a
  `plan/plan.md` entry in the `workbr` namespace, leave it alone. That plan
  is the upper execution frame; the memjective sits below it.

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
  they likely want `dev-memjective-peek` (to inspect the state and get a
  slug for the next slice) or `dev-memjective-update` (to record a landed
  slice) instead. `dev-memjective-next` explicitly refuses to run on a
  branch with an existing snapshot.
- **2+ matches** → abort and tell the user the branch is in an invalid state;
  only one memjective snapshot per branch is allowed.

### 3. Capture the memjective from the conversation

Start from the current conversation. If the user references a PR, issue, design
spec, or local markdown document, read it before drafting. Ask only brief
follow-ups when a critical piece is missing.

You need enough to draft:

- a concrete title
- a stable `Description` that explains the source proposal / trigger for the
  memjective, adjacent work already landed, the remaining scope now, and any
  clearly out-of-scope adjacent work
- `Goals` that explain what value or improvement the remaining work should
  deliver
- completion criteria that describe the intended end state rather than just a
  pile of tasks
- a roadmap organized by PR-sized slices when the work is expected to land
  incrementally
- a `How to Make Progress` section that makes future progress sessions fairly
  mechanical
- notes / constraints / collisions / file pointers that future sessions are
  likely to need

Bias toward a **simple, durable workstream note**. This is not the full GitHub
objective template.

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

- `clinkr-followups`
- `memjective-subsystem`
- `explicit-group-cleanup`

### 5. Pre-flight the master-branch snapshot

Before writing, check whether a snapshot already exists on master:

```bash
brmem check <slug>.md --namespace memjectives --branch master
```

Decision rules:

- if it returns **non-zero** (no entry) → continue
- if it returns **0** (entry exists) → abort and tell the user the
  master-branch snapshot already exists for this slug; they likely want to
  run `dev-memjective-peek` against the existing snapshot, or create a new
  slice branch and run `dev-memjective-next` inside it instead of
  clobbering the master-branch snapshot

### 6. Draft the memjective document

Read `../dev-memjective/templates/memjective-template.md` and fill it in.

Drafting guidance:

- Keep `Description` stable and load-bearing: it should say what proposal or
  change triggered the memjective, what related work is already landed, what
  remains in scope now, and what is out of scope.
- Make `Goals` value-oriented. Capture what better state the work should
  create, not the implementation slices required to get there.
- Make completion criteria re-checkable and end-state oriented. For redesigns
  and other long-running work, prefer criteria that describe the final
  contract / public surface / cleanup state, not just intermediate
  implementation steps.
- Use `Roadmap` as the single main progress surface. When the work will land
  over multiple PRs, organize it by PR-sized slices.
- Keep `Status:` short and categorical. Do not stuff PR-by-PR history into it.
- For architectural redesigns and other long-running work, prefer
  **steelthreaded** early slices: combine the smallest necessary core plumbing
  with one real surface so the design is exercised end-to-end as early as
  possible.
- Put the durable work recipe in `## How to Make Progress`. For multi-PR work,
  this should usually tell future sessions how to choose the next slice, what
  current behavior to inspect first, and what to update after landing a slice.
- For architectural or multi-PR memjectives, keep `## Notes` by default and use
  it to preserve durable findings, constraints, collisions, hidden couplings,
  and open questions discovered during implementation.

### 7. Write the master-branch snapshot

Write the drafted memjective text to a temp file, then store it on master:

```bash
brmem put <slug>.md --namespace memjectives --branch master --file <temp>
```

This is the initial snapshot. Capture the commit SHA.

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
- master-branch brmem snapshot location (namespace `memjectives`, key
  `<slug>.md`, branch `master`)
- current branch name
- branch brmem entry location (namespace `memjectives`, key `<slug>.md`)
- brmem commit SHA (branch snapshot)
- next-step hint:

```text
Run /dev-memjective-peek on this branch (or any descendant branch) for a
lightweight status check and a kebab-case slug suggestion for the next
slice — it reads the memjective without writing anything.

When you are ready to work the next slice, create a new branch with the
suggested slug and run /dev-memjective-next inside it. That skill carries
the memjective snapshot forward onto the new branch and then implements the
slice in-session.

After the slice lands, run /dev-memjective-update on that branch to rewrite
the snapshot conservatively.
```

## Edge cases

- **Detached HEAD** → abort; brmem attachment needs a branch name.
- **Current branch already has one memjective snapshot** → abort; do not
  clobber.
- **Current branch has multiple memjective snapshots** → abort; ask the user to
  clean up the branch state first.
- **Master-branch snapshot already exists for this slug** → abort; do not
  overwrite the existing snapshot.
- **Branch already has a `workbr` plan entry** → fine; leave it alone.
- **Memjective is too vague to write `How to Make Progress`** → ask a short
  follow-up instead of drafting generic boilerplate.

## Anti-patterns

- Storing the memjective document in a GitHub issue, comment, or PR body.
  (Reading GitHub for context is fine; the rule is about where the
  memjective record lives.)
- Writing the memjective into the repo working tree.
- Creating a second memjective on a branch that already has one.
- Attaching the branch snapshot under a generic key like `memjective.md` or a
  namespace other than `memjectives`.
- Replacing `How to Make Progress` with vague advice like "keep working on it."
- Treating the master-branch snapshot as something that should be rewritten
  during ordinary update sessions. `dev-memjective-update` rewrites the
  **branch snapshot**, not the master-branch snapshot.
- Stuffing roadmap history into the `Status:` line.
- Opening an architectural redesign with framework-only or abstraction-only
  early slices when a steelthreaded end-to-end slice is possible.
