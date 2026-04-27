---
name: objective-create
description: "Command: objective-create"
allowed-tools:
  - "Bash(git rev-parse *)"
  - "Bash(brmem *)"
  - "Read"
  - "Write"
---

# objective-create

Collaboratively define a new local-first objective, choose its slug, and
create the canonical record.

> For shared concepts — vocabulary, storage model, content anatomy, lifecycle,
> carry-forward semantics, and mutation contracts — see
> `../objective/SKILL.md` and
> `../objective/references/mutation-contract.md`.

## Goal

Given a workstream brief from the conversation, help frame the objective,
choose or propose a stable slug, and draft the initial canonical objective
under namespace `objectives` and key prefix `<slug>/`.

`create` writes `body.md` once, and writes `roadmap.md` only when the
conversation already contains a concrete slice plan. It never writes
`notes.md`, never attaches a branch snapshot, and never writes durable
objective files into the working tree.

## Content Files

Snapshots store `<slug>/body.md` (required), with optional `roadmap.md` and
`notes.md`. `create` may write only `body.md` and, when a concrete slice plan
exists, `roadmap.md`; it never writes `notes.md`.

## Inputs

- **Brief, required.** Use the current conversation as the source brief. The
  user may start with a rough intent rather than a complete objective. Help
  turn that intent into a title, scope, goals, completion criteria, and
  progress recipe. If the user references a PR, issue, design spec, or local
  markdown document, read it before drafting.
- **Slug, optional.** Use a user-provided slug when present and valid.
  Otherwise propose one from the title and intent. The slug is part of the
  create output, not a prerequisite for starting the conversation.
- **Concrete slice plan, optional.** Draft `roadmap.md` only when the
  conversation already contains PR-sized slices. If the plan is still vague,
  skip `roadmap.md`; `body.md`'s progress recipe is enough for the initial
  snapshot.

## Core Rules

- **Canonical only.** In the current brmem-backed implementation, write to
  `--branch master`; do not attach to the current branch. Users run
  `objective-claim <slug>` to attach a branch snapshot.
- **Use canonical templates.** Draft `body.md` from
  `../objective/templates/body-template.md` and `roadmap.md` from
  `../objective/templates/roadmap-template.md` when a roadmap is needed.
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

### 2. Frame The Workstream With The User

Gather enough context to draft the stable `body.md` spine and identify the
slug. Treat this as a brief collaborative framing pass, not a mechanical form
fill.

- concrete title
- durable description of trigger, scope, already-landed adjacent work, and
  out-of-scope adjacent work
- value-oriented goals
- re-checkable completion criteria for the intended end state
- mechanical `How to Make Progress` recipe for future sessions
- candidate slug

Ask a short follow-up when a critical piece is missing or when the proposed
slug/scope would be ambiguous. Keep the document lighter than a full GitHub
issue.

### 3. Choose And Check The Slug

Use the explicit slug if provided; otherwise generate one that is lowercase
ASCII, hyphen-separated, concise, stable, descriptive of the workstream,
usually 50 characters or fewer, and has no `/body.md` suffix or redundant
`objective-` prefix.

When generating the slug, surface it as the proposed identifier for the
objective. If the user asked only for creation and the slug is obvious,
proceed after checking for collisions. If multiple reasonable slugs imply
different scopes, ask the user to choose before writing.

Before writing, check master for an existing snapshot:

```bash
brmem list --namespace objectives --branch master
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
brmem put <slug>/body.md --namespace objectives --branch master --file <temp-body>
brmem put <slug>/roadmap.md --namespace objectives --branch master --file <temp-roadmap>
```

Run the second command only when `roadmap.md` was drafted. Capture the brmem
commit SHA from each write.

### 6. Final Output

Return:

- objective title
- slug
- files written
- canonical location: namespace `objectives`, branch `master`, key prefix
  `<slug>/`
- brmem commit SHA or SHAs
- next-step hint:

```text
To attach this objective to a working branch, run objective-claim from
inside the branch (the slug is inferred from the parent branch's claim
when unambiguous). To inspect it and choose a next slice, run
objective-next. After implementing a slice, run objective-update <slug>
to record progress.
```

## Edge Cases And Anti-Patterns

- Detached `HEAD` or missing critical brief details: abort and describe/ask
  briefly.
- Canonical storage already carries `<slug>/`: abort instead of overwriting.
- Vague slice plan: write only `body.md`; do not invent `roadmap.md`
  filler.
- Current branch already carries one or more objective slugs: not a create
  blocker, because `create` writes only canonical state.
- Never store the objective in GitHub, write durable files into the working
  tree, attach a branch snapshot, write `notes.md`, use bare keys, rewrite an
  existing canonical objective, stuff roadmap history into `Status:`, or
  open a multi-PR redesign with framework-only slices when a steelthreaded
  slice is possible.
