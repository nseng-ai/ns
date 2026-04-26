---
name: dev-memjective-create
description: Command
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

Create the canonical record for a new local-first memjective.

> For shared concepts — vocabulary, storage model, content anatomy, lifecycle,
> carry-forward semantics, and mutation contracts — see
> `../dev-memjective/SKILL.md` and
> `../dev-memjective/references/mutation-contract.md`.

## Goal

Given a memjective brief, draft the initial canonical memjective under
namespace `memjectives` and key prefix `<slug>/`.

`create` writes `body.md` once, and writes `roadmap.md` only when the
conversation already contains a concrete slice plan. It never writes
`notes.md`, never attaches a branch snapshot, and never writes durable
memjective files into the working tree.

## Memjective Content

Until the stack has a repo-wide single source of truth for memjective
contents, this section is the only place in this skill that names the current
content files.

A memjective snapshot is the content stored under `<slug>/` in namespace
`memjectives`. Current content files:

- `body.md` (required): stable workstream spine and progress guidance.
- `roadmap.md` (optional): ordered slice plan and progress surface.
- `notes.md` (optional): durable findings.

`create` may write only `body.md` and, when warranted, `roadmap.md`.
`notes.md` appears later when `dev-memjective-update` records a branch
finding or `dev-memjective-reconcile` folds durable evidence into canonical
state.

## Inputs

- **Brief, required.** Use the current conversation as the source brief. If
  the user references a PR, issue, design spec, or local markdown document,
  read it before drafting.
- **Slug, optional.** Use a user-provided slug when present. Otherwise
  generate one from the title and intent.
- **Concrete slice plan, optional.** Draft `roadmap.md` only when the
  conversation already contains PR-sized slices. If the plan is still vague,
  skip `roadmap.md`; `body.md`'s progress recipe is enough for the initial
  snapshot.

## Core Rules

- **Canonical only.** In the current brmem-backed implementation, write to
  `--branch master`; do not attach to the current branch. Users run
  `dev-memjective-claim <slug>` to attach a branch snapshot.
- **Use canonical templates.** Draft `body.md` from
  `../dev-memjective/templates/body-template.md` and `roadmap.md` from
  `../dev-memjective/templates/roadmap-template.md` when a roadmap is needed.
- **Keys carry the slug.** Write `<slug>/body.md` and optionally
  `<slug>/roadmap.md`; never use bare filenames or another namespace.
- **Do not overwrite.** Abort if master already has any key under `<slug>/`.
- **Stable spine, not a task dump.** Keep `body.md` durable and
  end-state-oriented. Put slice sequencing in `roadmap.md`, not in
  `Description`, `Goals`, or `Status:`.
- **Codified roadmap work only.** Roadmap bullets must describe work that
  lands in a PR: code, tests, docs, config, or deliberate deletion. Manual
  observation and live verification belong in PR test plans.

## Workflow

### 1. Preflight

Confirm the repo and current branch:

```bash
git rev-parse --show-toplevel
git rev-parse --abbrev-ref HEAD
```

Abort if not in a git repo or on detached `HEAD`.

### 2. Capture the Workstream

Gather enough context to draft the stable `body.md` spine:

- concrete title
- durable description of trigger, scope, already-landed adjacent work, and
  out-of-scope adjacent work
- value-oriented goals
- re-checkable completion criteria for the intended end state
- mechanical `How to Make Progress` recipe for future sessions

Ask a short follow-up only when a critical piece is missing. Keep the document
lighter than a full GitHub objective.

### 3. Choose And Check The Slug

Use the explicit slug if provided; otherwise generate one that is lowercase
ASCII, hyphen-separated, concise, stable, descriptive of the workstream,
usually 50 characters or fewer, and has no `/body.md` suffix or redundant
`memjective-` prefix.

Before writing, check master for an existing snapshot:

```bash
brmem list --namespace memjectives --branch master
```

Abort if any returned key starts with `<slug>/`.

### 4. Draft The Files

Read the templates, delete their instructional comments, and fill them in.

For `body.md`:

- keep `Status:` short and categorical
- use `## Description` for durable context and scope
- use `## Goals` for the better state this work should create
- use `## Completion Criteria` for re-checkable end-state criteria
- use `## How to Make Progress` for how to pick, inspect, and record future
  slices
- do not include `## Roadmap` or `## Notes`

For `roadmap.md`, when drafted:

- organize by PR-sized slices
- prefer steelthreaded early slices over framework-only scaffolding
- keep completed-item history visible for later `update`/`reconcile`

### 5. Write The Canonical Record

Write drafts to temporary files, then store them in brmem:

```bash
brmem put <slug>/body.md --namespace memjectives --branch master --file <temp-body>
brmem put <slug>/roadmap.md --namespace memjectives --branch master --file <temp-roadmap>
```

Run the second command only when `roadmap.md` was drafted. Capture the brmem
commit SHA from each write.

### 6. Final Output

Return:

- memjective title
- slug
- files written
- canonical location: namespace `memjectives`, branch `master`, key prefix
  `<slug>/`
- brmem commit SHA or SHAs
- next-step hint:

```text
To attach this memjective to a working branch, run
dev-memjective-claim <slug>. To inspect it and choose a next slice, run
dev-memjective-next <slug>. After implementing a slice, run
dev-memjective-update <slug> to record progress.
```

## Edge Cases And Anti-Patterns

- Detached `HEAD` or missing critical brief details: abort and describe/ask
  briefly.
- Canonical storage already carries `<slug>/`: abort instead of overwriting.
- Vague slice plan: write only `body.md`; do not invent `roadmap.md`
  filler.
- Current branch already carries one or more memjective slugs: not a create
  blocker, because `create` writes only canonical state.
- Never store the memjective in GitHub, write durable files into the working
  tree, attach a branch snapshot, write `notes.md`, use bare keys, rewrite an
  existing canonical memjective, stuff roadmap history into `Status:`, or
  open a multi-PR redesign with framework-only slices when a steelthreaded
  slice is possible.
