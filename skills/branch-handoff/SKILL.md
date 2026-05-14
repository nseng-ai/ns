---
name: branch-handoff
description: "Create, store, list, or recover branch/session handoff artifacts in Branch Memory. Use when the user asks for a branch handoff, session handoff, Branch Memory handoff, durable handoff artifact, or to continue from a stored handoff."
allowed-tools:
  - "Bash(git branch *)"
  - "Bash(git status *)"
  - "Bash(brmem *)"
  - "Write"
---

# branch-handoff

Use this skill to create or recover concise Markdown handoff artifacts stored in
Branch Memory for the current branch. This is an artifact workflow, not a task
system.

## Storage contract

- Namespace: `session-artifacts`
- Entry key shape: `handoffs/<slug>.md`
- Store from a file:

```bash
brmem put handoffs/<slug>.md --namespace session-artifacts --branch <branch> --file <artifact.md>
```

Use Branch Memory only for UTF-8 text that is safe to keep with branch-local
project context. Do not store secrets, credentials, binary data, generated build
output, or large logs.

## Choose the branch and slug

1. If the user names a branch, use it explicitly with `--branch <branch>`.
2. Otherwise confirm the current branch before writing:

```bash
git branch --show-current
```

Stop if the repo is in detached HEAD.

For `<slug>`:

- Use an explicit slug if the user provides one.
- Otherwise derive it from the requested handoff focus or title:
  - lowercase
  - replace punctuation and whitespace with `-`
  - remove remaining non-alphanumeric characters except `-`
  - collapse repeated `-`
  - trim leading/trailing `-`
  - keep it concise, usually 3-8 words
- If there is no meaningful focus or title, ask the user for one.

## Prevent accidental overwrites

Before writing, check for an existing artifact:

```bash
brmem check handoffs/<slug>.md --namespace session-artifacts --branch <branch>
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
brmem put handoffs/<slug>.md --namespace session-artifacts --branch <branch> --file <artifact.md>
```

Report the mutation to the user, including:

- Branch
- Namespace: `session-artifacts`
- Entry: `handoffs/<slug>.md`
- Locator/ref and commit printed by `brmem`

## Recover handoffs in a later session

Discover stored artifacts:

```bash
brmem list --namespace session-artifacts --branch <branch>
```

Read one artifact:

```bash
brmem get handoffs/<slug>.md --namespace session-artifacts --branch <branch>
```

When a user asks to continue from handoffs and does not provide a slug, list the
namespace first, pick the relevant `handoffs/*.md` entry if unambiguous, then read
it. If several entries could apply, ask which one to load.
