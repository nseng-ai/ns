---
name: brmem-handoff
description: "Create and store branch/session handoff artifacts in Branch Memory. Use when the user asks to create, write, save, or stash a durable handoff artifact for a future session."
allowed-tools:
  - "Bash(git branch *)"
  - "Bash(git status *)"
  - "Bash(brmem *)"
  - "Write"
---

# brmem-handoff

Use this skill to create and store concise Markdown handoff artifacts in Branch
Memory for the current branch. This is the write-side complement to
`brmem-pickup-handoff`, and it is an artifact workflow, not a task system.

## Storage contract

- Namespace: `session-artifacts`
- Entry key shape: `handoffs/<semantic-slug>.md`
- Store from a file:

```bash
brmem put handoffs/<semantic-slug>.md --namespace session-artifacts --branch <branch> --file <artifact.md>
```

Use Branch Memory only for UTF-8 text that is safe to keep with branch-local
project context. Do not store secrets, credentials, binary data, generated build
output, or large logs.

## Choose the branch and semantic slug

1. If the user names a branch, use it explicitly with `--branch <branch>`.
2. Otherwise confirm the current branch before writing:

```bash
git branch --show-current
```

Stop if the repo is in detached HEAD.

For `<semantic-slug>`:

- Use an explicit slug if the user provides one and it is specific enough to
  recognize later.
- Otherwise derive it from the requested handoff focus or title. The slug is the
  future pickup hint, so include the subject and likely resume action when
  possible.
- Format it as:
  - lowercase
  - replace punctuation and whitespace with `-`
  - remove remaining non-alphanumeric characters except `-`
  - collapse repeated `-`
  - trim leading/trailing `-`
  - keep it concise, usually 3-8 words
- Avoid generic slugs like `handoff`, `session`, `work`, `follow-up`, or
  `continue`.
- Prefer semantic slugs like `address-review-feedback`,
  `add-pickup-handoff-skill`, or `resume-brmem-plan-impl`.
- If there is no meaningful focus or title, ask the user for one.

## Prevent accidental overwrites

Before writing, check for an existing artifact:

```bash
brmem check handoffs/<semantic-slug>.md --namespace session-artifacts --branch <branch>
```

Interpret the result:

- Exit `0`: an artifact already exists. Stop unless the user explicitly asked to
  replace it.
- Exit `1`: no artifact exists. Continue.
- Exit `2`: the request is invalid or the command failed. Surface the error and
  stop.

Only overwrite when replacement intent is explicit, then use the same `brmem put`
command.

## Handoff artifact template

Create a temporary Markdown file with concise, session-oriented content:

```markdown
# Handoff: <title>

## Context

<Why this handoff exists and what branch/work it concerns.>

## Current State

<What is already done, what changed, and what is not yet done.>

## Decisions / Findings

<Key decisions, constraints, useful discoveries, or gotchas.>

## Next Steps

<Concrete next actions for a future session.>

## Useful Commands / Files

<Commands, files, Branch Memory entries, PRs, issues, or docs that help resume.>
```

Keep the artifact brief and factual. Avoid owners, due dates, task databases,
hidden metadata, or workflow-state machinery.

## Store and report

Store the artifact:

```bash
brmem put handoffs/<semantic-slug>.md --namespace session-artifacts --branch <branch> --file <artifact.md>
```

Report the mutation to the user, including:

- Branch
- Namespace: `session-artifacts`
- Entry: `handoffs/<semantic-slug>.md`
- Locator/ref and commit printed by `brmem`

## Pick up handoffs in a later session

When a user asks to resume from an existing Branch Memory handoff, prefer the
`brmem-pickup-handoff` skill. Pickup relies on the semantic slug rather than a
separate summary or index.
