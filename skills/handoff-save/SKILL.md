---
name: handoff-save
description: "Save a directed handoff artifact for a future continuation. Use when the user asks to save, create, write, or stash a durable handoff, including future-you or future-agent resume context; use brmem only as the storage command."
allowed-tools:
  - "Bash(git branch *)"
  - "Bash(git status *)"
  - "Bash(brmem *)"
---

# handoff-save

Use this skill to save a concise, directed Markdown handoff artifact for a future continuation. A handoff is saved work context for future-you, a future agent, a future worktree, or a teammate. It is not in-session compaction and not a generic session summary.

This is the save/create step in the `handoff` skill family. Use the `handoff` umbrella for shared terminology, lifecycle, storage contract, diagnostics, cleanup, and branch-to-branch admin flows; keep this skill focused on writing one artifact.

Normal user language is save/pick up/resume a handoff. Branch Memory is the storage command behind this skill; mention namespace, key, ref, or commit only as technical locator evidence, recovery detail, or error context.

## Direction first

A handoff must answer:

> Given this requested focus, what does the next session need to know to proceed correctly?

If the user gave a meaningful continuation focus, use it. If they only asked for "a handoff" with no focus/title/resume goal, ask this question and stop until they answer:

```text
What should the future session continue from this handoff?
```

Do not write an undirected session summary.

## Storage contract

- Namespace: `handoffs`
- Entry key shape: `<semantic-slug>.md`
- Store final Markdown directly from stdin through a file descriptor; do not create
  a hidden temp or draft file:

```bash
brmem put <semantic-slug>.md --namespace handoffs --branch <branch> --file /dev/stdin <<'HANDOFF_EOF'
<final Markdown handoff content>
HANDOFF_EOF
```

Use Branch Memory only for UTF-8 text that is safe to keep with branch-local project context. Do not store secrets, credentials, binary data, generated build output, or large logs.

## Choose the branch and slug

1. If the user names a branch, use it explicitly with `--branch <branch>`.
2. Otherwise confirm the current branch before writing:

```bash
git branch --show-current
```

Stop if the repo is in detached HEAD.

For `<semantic-slug>`:

- Use an explicit slug if the user provides one and it is specific enough to recognize later.
- Otherwise derive it from the continuation focus or title. The slug is the future pickup hint, so include the subject and likely resume action when possible.
- Format it as:
  - lowercase
  - replace punctuation and whitespace with `-`
  - remove remaining non-alphanumeric characters except `-`
  - collapse repeated `-`
  - trim leading/trailing `-`
  - keep it concise, usually 3-8 words
- Avoid generic slugs like `handoff`, `session`, `work`, `follow-up`, or `continue`.
- Prefer semantic slugs like `address-review-feedback`, `add-pickup-handoff-command`, or `resume-plan-implementation`.
- Do not include `/` in the key; flat `<semantic-slug>.md` keys are the handoff contract.

## Prevent accidental overwrites

Before writing, check for an existing artifact:

```bash
brmem check <semantic-slug>.md --namespace handoffs --branch <branch>
```

Interpret the result:

- Exit `0`: an artifact already exists. Stop unless the user explicitly asked to replace it.
- Exit `1`: no artifact exists. Continue.
- Exit `2`: the request is invalid or the command failed. Surface the error and stop.

Only overwrite when replacement intent is explicit, then use the same `brmem put` command.

## Handoff artifact template

Compose concise, future-continuation-oriented Markdown content directly in the command input or a visible review response:

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

Do not create hidden temp/draft files for handoff-save. If the user needs review or editing before saving, present the proposed Markdown in chat or a structured UI and iterate there; then save the final content through `brmem put ... --file /dev/stdin`. If the user explicitly asks for a real file or path, treat that as a separate explicit file-writing request, not the default handoff-save path. If durable review state is needed, use a clearly named Branch Memory draft only with explicit user intent.

## Store and report

Store the final artifact directly without an intermediate file. Use a quoted here-doc delimiter that does not appear in the handoff content:

```bash
brmem put <semantic-slug>.md --namespace handoffs --branch <branch> --file /dev/stdin <<'HANDOFF_EOF'
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
HANDOFF_EOF
```

Report the result in handoff vocabulary first:

```text
Saved handoff `<semantic-slug>` on branch `<branch>`.
```

Then include a compact technical locator when useful:

- Namespace: `handoffs`
- Entry: `<semantic-slug>.md`
- Locator/ref and commit printed by `brmem`

## Pick up later

When a user asks to resume from an existing handoff, prefer the `handoff-load` skill. Picking up relies on the semantic slug rather than a separate summary or index.

For handoff lifecycle vocabulary and non-save admin flows such as copy, move, delete, or garbage collection, load the `handoff` umbrella and its references rather than duplicating those recipes here.
