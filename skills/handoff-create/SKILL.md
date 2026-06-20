---
name: handoff-create
description: "Create a directed handoff artifact for a future continuation. Use when the user asks to create, write, or stash a durable handoff, including future-you or future-agent resume context; use brmem only as the storage command."
allowed-tools:
  - "Bash(git branch *)"
  - "Bash(git status *)"
  - "Bash(brmem *)"
---

# handoff-create

Create one concise, directed Markdown handoff artifact for a future continuation. This is the create step in the `handoff` skill family; pickup/resume/list intent belongs to `handoff-pickup`, and lifecycle/admin flows belong to the `handoff` umbrella.

## Create contract

A handoff is durable work context for future-you, a future agent, a future worktree, or a teammate. It is not in-session compaction, a generic transcript/session summary, a temp-file note, or a task database.

A handoff must answer:

> Given this requested focus, what does the next session need to know to proceed correctly?

If the user gave a meaningful continuation focus, use it. If they only asked for "a handoff" with no focus/title/resume goal, ask exactly this and stop until they answer:

```text
What should the future session continue from this handoff?
```

Use handoff vocabulary first: handoff artifact, continuation focus, create a handoff, handoff slug. Branch Memory is only the storage command behind this skill; mention namespace, key, ref, or commit only as technical locator evidence, recovery detail, or error context.

Do not store secrets, credentials, binary data, generated build output, or large logs.

## Resolve branch and slug

Branch:

1. If the user names a branch, use it explicitly with `--branch <branch>`.
2. Otherwise confirm the current branch before writing:

```bash
git branch --show-current
```

Stop if the repo is in detached HEAD. Use `git status --short` when branch/worktree state is needed to write accurate current-state context.

Handoff slug:

- Storage namespace: `handoff`.
- Entry key shape: flat `<semantic-slug>.md`; do not include `/`.
- Use an explicit slug/key if the user provides one and it is specific enough to recognize later.
- Otherwise compose the final directed Markdown handoff artifact first, then derive the slug from that final content.
- Use the continuation focus/title as context inside the artifact, not as the direct slug source.
- Make the slug summarize the future continuation action and subject apparent in the artifact body.
- Format: lowercase; punctuation/whitespace to `-`; remove remaining non-alphanumerics except `-`; collapse repeated `-`; trim leading/trailing `-`; usually 3-8 words.
- Avoid generic-only slugs like `handoff`, `session`, `work`, `task`, `follow-up`, or `continue`, and raw request preambles like `i-want-to-handoff`.
- Prefer semantic slugs like `address-review-feedback`, `add-pickup-handoff-command`, `associate-sessions-with-branches`, or `resume-plan-implementation`.

## Compose artifact

Compose concise, future-continuation-oriented Markdown content directly in the command input or in a visible review response. Use this canonical shape:

```markdown
# Handoff: <title>

Continuation focus: <What the future session should continue, decide, verify, or implement.>

## Context

<Why this handoff exists and what branch/work it concerns.>

## Current State

<What is already done, what changed, and what is not yet done.>

## Decisions / Findings

<Key decisions, constraints, useful discoveries, or gotchas.>

## Next Steps

<Concrete next actions for a future session.>

## Useful Commands / Files

<Commands, files, PRs, issues, docs, or technical locators that help resume.>
```

Keep the artifact brief and factual. Avoid owners, due dates, task databases, hidden metadata, or workflow-state machinery.

Do not create hidden temp/draft files for handoff-create. If the user needs review or editing before creation, present the proposed Markdown in chat or a structured UI and iterate there; then create the final artifact through the canonical storage command below. If the user explicitly asks for a real file or path, treat that as a separate file-writing request. If durable review state is needed, use a clearly named Branch Memory draft only with explicit user intent.

## Store safely

Before writing, check for an existing artifact:

```bash
brmem check <semantic-slug>.md --namespace handoff --branch <branch>
```

Interpret the result:

- Exit `0`: an artifact already exists. Stop unless the user explicitly asked to replace it.
- Exit `1`: no artifact exists. Continue.
- Exit `2`: the request is invalid or the command failed. Surface the error and stop.

Store the final artifact directly from stdin without an intermediate file. Use a quoted here-doc delimiter that does not appear in the handoff content:

```bash
brmem put <semantic-slug>.md --namespace handoff --branch <branch> --file /dev/stdin <<'HANDOFF_EOF'
<final Markdown handoff content>
HANDOFF_EOF
```

Only overwrite when replacement intent is explicit, then use the same `brmem put` command.

## Report and route follow-up

Report the result in handoff vocabulary first:

```text
Created handoff `<semantic-slug>` on branch `<branch>`.
```

Then include a compact technical locator when useful:

- Namespace: `handoff`
- Entry: `<semantic-slug>.md`
- Locator/ref and commit printed by `brmem`

When a user asks to resume from an existing handoff, prefer `handoff-pickup`. Picking up relies on the semantic slug rather than a separate summary or index.

For handoff lifecycle vocabulary and non-create admin flows such as copy, move, delete, or garbage collection, load the `handoff` umbrella and its references rather than duplicating those recipes here.
