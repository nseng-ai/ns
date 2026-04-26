---
name: dev-memjective-create
description: Command
# Original description (preserved for reference):
# Draft a new memjective and store it in `brmem` as the master-branch snapshot plus an initial snapshot on the current branch. Use when the user wants to start a new local memjective or attach one to the current branch. See `dev-memjective` for the subsystem overview.
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

Create a new local-first memjective: the master-branch snapshot.

> For shared concepts — vocabulary (`snapshot`, `master-branch snapshot`,
> `per-branch snapshot`), the storage model, the one-memjective-per-branch
> invariant, carry-forward semantics, the lifecycle, and the mutation-contract
> summary — see `../dev-memjective/SKILL.md`.

## Goal

Given a rough memjective brief from the user, produce:

1. a memjective `body.md` stored as the `master`-branch brmem snapshot under
   namespace `memjectives`, key `<slug>/body.md`
2. when the conversation already contains a concrete slice plan, a matching
   `roadmap.md` written to the master snapshot at key `<slug>/roadmap.md`
3. a short report naming the slug and the brmem commits on master

A memjective is a directory of files under `<slug>/`; this skill writes
`body.md` (and optionally `roadmap.md`). `notes.md` is never written by
`create` — it appears the first time `dev-memjective-update` records a
durable finding.

## Core rules

- **Use the canonical templates.** Read
  `../dev-memjective/templates/body-template.md` and keep the `body.md`
  draft close to that shape:
  - title
  - short, categorical `Status:` line
  - `## Description` for durable context and scope
  - `## Goals` for the higher-level value this work should deliver
  - `## Completion Criteria` describing the target end state in re-checkable
    terms
  - `## How to Make Progress`

  When a concrete slice plan already exists in the conversation, also draft
  `roadmap.md` per `../dev-memjective/templates/roadmap-template.md`:
  - `# Roadmap` heading
  - ordered slices, organized by PR-sized chunks
  - codified PR work only — no manual-only or observation-only bullets
- **Keys must carry the slug.** Do not use bare filenames; the keys are
  `<slug>/body.md` and `<slug>/roadmap.md` in namespace `memjectives`.
- **Do not write the memjective into the working tree.** The only durable
  copies are the master-branch brmem files.

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

You need enough to draft the stable spine (`body.md`):

- a concrete title
- a stable `Description` that explains the source proposal / trigger for the
  memjective, adjacent work already landed, the remaining scope now, and any
  clearly out-of-scope adjacent work
- `Goals` that explain what value or improvement the remaining work should
  deliver
- completion criteria that describe the intended end state rather than just a
  pile of tasks
- a `How to Make Progress` section that makes future progress sessions fairly
  mechanical

If the conversation already contains a concrete slice plan, also draft
`roadmap.md` with PR-sized slices. If the slice plan is still vague, skip
`roadmap.md` for now — the first `update` session can write it later.

Bias toward a **simple, durable workstream note**. This is not the full GitHub
objective template.

### 4. Generate the slug

If the user explicitly provides a slug, use it. Otherwise generate one from the
memjective title + intent.

Slug rules:

- lowercase ASCII
- hyphen-separated
- concise, stable, and descriptive of the workstream
- no `/body.md` suffix
- usually ≤50 characters
- do not add redundant prefixes like `memjective-` unless they are part of the
  natural name

Examples:

- `clinkr-followups`
- `memjective-subsystem`
- `explicit-group-cleanup`

### 5. Pre-flight the master-branch snapshot

Before writing, check whether any file for this slug already exists on
master:

```bash
brmem list --namespace memjectives --branch master
```

Filter the output for keys starting with `<slug>/`.

Decision rules:

- **no matching keys** → continue
- **any matching key** (`<slug>/body.md`, `<slug>/roadmap.md`, or
  `<slug>/notes.md`) → abort and tell the user the master-branch snapshot
  already exists for this slug; they likely want to run
  `dev-memjective-peek` against the existing snapshot, or create a new
  slice branch and run `dev-memjective-next` inside it instead of
  clobbering the master-branch snapshot

### 6. Draft the memjective documents

Read `../dev-memjective/templates/body-template.md` and fill it in as
`body.md`.

Drafting guidance for `body.md`:

- Keep `Description` stable and load-bearing: it should say what proposal or
  change triggered the memjective, what related work is already landed, what
  remains in scope now, and what is out of scope.
- Make `Goals` value-oriented. Capture what better state the work should
  create, not the implementation slices required to get there.
- Make completion criteria re-checkable and end-state oriented. For redesigns
  and other long-running work, prefer criteria that describe the final
  contract / public surface / cleanup state, not just intermediate
  implementation steps.
- Keep `Status:` short and categorical. Do not stuff PR-by-PR history into it.
- Put the durable work recipe in `## How to Make Progress`. For multi-PR work,
  this should usually tell future sessions how to choose the next slice, what
  current behavior to inspect first, and what to update after landing a slice.
- Do not include a `## Roadmap` or `## Notes` heading in `body.md` — those
  live in sibling files.

If a concrete slice plan exists, also read
`../dev-memjective/templates/roadmap-template.md` and draft `roadmap.md`:

- Use it as the single main progress surface. When the work will land over
  multiple PRs, organize it by PR-sized slices.
- Bullets must be codified work that lands in a PR (code, tests, docs,
  config, or a deliberate delete). Do not draft manual-only or
  observation-only bullets like "live testing session", "smoke-test in
  prod", or "watch for regressions"; verification belongs in the PR's test
  plan, not as a standalone roadmap item.
- For architectural redesigns and other long-running work, prefer
  **steelthreaded** early slices: combine the smallest necessary core plumbing
  with one real surface so the design is exercised end-to-end as early as
  possible.

Do not write `notes.md` yet — it appears the first time `update` records a
durable finding.

### 7. Write the master-branch snapshot

Write the drafted `body.md` text to a temp file, then store it on master:

```bash
brmem put <slug>/body.md --namespace memjectives --branch master --file <temp-body>
```

If a `roadmap.md` was drafted in step 6, write it too:

```bash
brmem put <slug>/roadmap.md --namespace memjectives --branch master --file <temp-roadmap>
```

This is the initial snapshot. Capture the commit SHAs.

### 8. Report

Return a short summary including:

- memjective title
- slug
- files written (`body.md`, and `roadmap.md` if drafted)
- master-branch brmem snapshot location (namespace `memjectives`, key
  prefix `<slug>/`, branch `master`)
- brmem commit SHA(s) for the master-branch writes
- next-step hint:

```text
To attach this memjective to your current working branch, run
`dev-memjective-claim <slug>`. The master-branch snapshot is the durable
starting point for future slice branches.

Run /dev-memjective-peek on any branch for a lightweight status check and a
kebab-case slug suggestion for the next slice — it reads the memjective
without writing anything.

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
- **Memjective is too vague to write `How to Make Progress`** → ask a short
  follow-up instead of drafting generic boilerplate.

## Anti-patterns

- Storing the memjective document in a GitHub issue, comment, or PR body.
  (Reading GitHub for context is fine; the rule is about where the
  memjective record lives.)
- Writing the memjective into the repo working tree.
- Writing the initial branch snapshot from `create` (use
  `dev-memjective-claim` instead).
- Creating a second memjective on a branch that already has one.
- Attaching the branch snapshot under a generic key like `memjective/body.md`
  or a namespace other than `memjectives`.
- Replacing `How to Make Progress` with vague advice like "keep working on it."
- Treating the master-branch snapshot as something that should be rewritten
  during ordinary update sessions. `dev-memjective-update` rewrites the
  **branch snapshot**, not the master-branch snapshot.
- Stuffing roadmap history into the `Status:` line.
- Opening an architectural redesign with framework-only or abstraction-only
  early slices when a steelthreaded end-to-end slice is possible.
