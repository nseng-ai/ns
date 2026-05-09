---
name: objective-create
description: "Command: objective-create"
allowed-tools:
  - "Bash(objective exec create *)"
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
conversation already contains a concrete numbered plan. It never writes
`notes.md`, never attaches a branch snapshot, and never writes durable
objective files into the working tree.

## Content Files

Snapshots store `<slug>/body.md` (required), with optional `roadmap.md` and
`notes.md`. `create` may write only `body.md` and, when a concrete numbered
plan exists, `roadmap.md`; it never writes `notes.md`.

## Inputs

- **Brief, required.** Use the current conversation as the source brief. The
  user may start with a rough intent rather than a complete objective. Help
  turn that intent into a title, scope, goals, completion criteria, and
  progress recipe. If the user references a PR, issue, design spec, or local
  markdown document, read it before drafting.
- **Slug, optional.** Use a user-provided slug when present and valid.
  Otherwise propose one from the title and intent. The slug is part of the
  create output, not a prerequisite for starting the conversation.
- **Concrete numbered plan, optional.** Draft `roadmap.md` only when the
  conversation already contains ordered entries. If the plan is still vague,
  skip `roadmap.md`; `body.md`'s progress recipe is enough for the initial
  snapshot. Do not pre-label entries as PRs, stacks, docs-only work, or splits.

## Core Rules

- **Canonical only.** The helper writes to canonical `<trunk>`; do not
  attach to the current branch. Users run `objective-attach <slug>` to
  attach a branch snapshot. The current branch is irrelevant — the helper
  only requires it to be a normal (non-detached) branch.
- **Use canonical templates.** Draft `body.md` from
  `../objective/templates/body-template.md` and `roadmap.md` from
  `../objective/templates/roadmap-template.md` when a roadmap is needed.
- **Stable spine, not a task dump.** Keep `body.md` durable and
  end-state-oriented. Put numbered implementation sequencing in `roadmap.md`,
  not in `Description`, `Goals`, or `Status:`.
- **Codified roadmap work only.** Roadmap bullets must describe work that
  lands in a PR: code, tests, docs, config, or deliberate deletion. Manual
  observation and live verification belong in PR test plans.
- **Numbered entries only.** Roadmap entries are numbered (`1.`, `2.`, `3.`). Do not label entries with branch slugs or implementation shapes
  in the roadmap; `objective-next` recommends those when an entry is selected.

## Workflow

The single `objective exec create` helper owns the deterministic mechanics
(repo + branch checks, slug-format validation, collision check on trunk,
and the canonical `brmem put` writes). Skill prose is reserved for the
collaborative pieces: framing, slug naming, and template drafting.

### 1. Frame The Workstream With The User

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

### 2. Pick The Slug

Use the explicit slug if provided; otherwise generate one that is lowercase
ASCII, hyphen-separated, concise, stable, descriptive of the workstream,
usually 50 characters or fewer, with no `/body.md` suffix or redundant
`objective-` prefix.

When generating the slug, surface it as the proposed identifier for the
objective. If the user asked only for creation and the slug is obvious,
proceed. If multiple reasonable slugs imply different scopes, ask the user
to choose before drafting.

### 3. (Optional) Validate The Slug Before Drafting

When the slug is uncertain or expensive prose would otherwise be wasted on a
collision, run validation in dry-run mode first:

```bash
objective exec create <slug> --dry-run --format json
```

The envelope shape matches the write call below. Read `status`:

- `status="ok"` — slug is well-formed and unused on canonical `<trunk>`.
  Proceed to drafting.
- `status="error"` with `reason="invalid_slug_format"` — message names the
  exact rule violated; pick a different slug and re-run.
- `status="error"` with `reason="slug_collision"` — canonical `<trunk>`
  already carries an objective under this slug. Pick a different slug, or
  if the user wants to advance the existing objective, route to
  `objective-update <slug>` instead.

When the slug is obvious and the prose cost is low, skip `--dry-run` and let
step 5 do the same validation as part of the write call.

### 4. Draft The Files

Read the templates, delete their instructional comments, and fill them in to
temporary files (e.g. under `tmp_path` or `/tmp`). Do not write durable
objective files into the working tree.

For `body.md`:

- keep `Status:` short and categorical
- use `## Description` for durable context and scope
- use `## Goals` for the better state this work should create
- use `## Completion Criteria` for re-checkable end-state criteria
- use `## How to Make Progress` for how to pick, inspect, and record future
  numbered entries
- do not include `## Roadmap` or `## Notes`

For `roadmap.md`, when drafted:

- organize by numbered entries, one entry per coherent work item
- keep implementation tasks as child checkboxes under the numbered entry
- do not add branch slugs, PR/stack labels, or visible markers
- prefer early entries that exercise real end-to-end behavior over
  framework-only scaffolding
- keep completed-item history visible for later `update`/`reconcile`

### 5. Write The Canonical Record

Run the create command. It validates the slug (catching any race with
another caller) and performs the canonical `brmem put` writes — `body.md`
first, then `roadmap.md` if supplied:

```bash
objective exec create <slug> \
  --body-file <temp-body> \
  [--roadmap-file <temp-roadmap>] \
  --format json
```

Read the envelope:

- `status="ok"` — every requested file landed. `files_written` carries each
  file's brmem commit SHA in stable order (body.md first).
- `status="error"` with `reason="slug_collision"` — a race against another
  caller occupied the slug after step 3. Pick a different slug and re-run
  step 3 onward, or route the user to `objective-update`.
- `status="error"` with `reason="invalid_slug_format"` — pick a different
  slug and re-run.
- `status="error"` with `reason="body_file_unreadable"` or
  `reason="roadmap_file_unreadable"` — the temp file vanished or is not
  UTF-8 readable. Re-write the temp file and re-run.

If the command exits with `error_type="roadmap_write_failed"` (exit code
2), `body.md` already landed but the roadmap write failed afterward. The
failure message contains the body's commit SHA. Brmem is append-only — do
not retry blindly. Surface the SHA and the failing message and route the
user to `objective-update <slug>` to advance the snapshot from there.

### 6. Final Output

From the create JSON envelope, render:

- objective title (from the conversation, not the JSON)
- slug
- files written (with brmem commit SHAs)
- canonical location: namespace `objectives`, branch `<trunk>`, key prefix
  `<slug>/`
- next-step hint:

```text
To attach this objective to a working branch, run objective-attach from
inside the branch (the slug is inferred from the parent branch's attachment
when unambiguous). To inspect it and choose a next roadmap entry, run
objective-next. After implementing the work, run objective-update <slug>
to record progress.
```

## Edge Cases And Anti-Patterns

- Detached `HEAD` or not in a git repo: `create` exits with the
  `detached_head` or `not_in_repo` error; abort and describe briefly.
- Canonical storage already carries `<slug>/`: `create` returns
  `slug_collision`; pick a different slug or hand off to `objective-update`.
- Vague implementation plan: write only `body.md`; do not invent `roadmap.md`
  filler.
- Current branch already carries one or more objective slugs: not a create
  blocker, because `create` writes only canonical state.
- Never store the objective in GitHub, write durable files into the working
  tree, attach a branch snapshot, write `notes.md`, use bare keys, rewrite an
  existing canonical objective, stuff roadmap history into `Status:`, or
  open a multi-PR redesign with framework-only entries when an end-to-end
  entry is possible.
