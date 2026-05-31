---
name: brmem-handoff
description: "Save a directed handoff artifact for a future continuation. Use when the user asks to save, create, write, or stash a durable handoff, including future-you or future-agent resume context; use brmem only as the storage command."
allowed-tools:
  - "Bash(git branch *)"
  - "Bash(git status *)"
  - "Bash(brmem *)"
  - "Write"
---

# Save a handoff

Use this skill to save a concise, directed Markdown handoff artifact for a future continuation. A handoff is saved work context for future-you, a future agent, a future worktree, or a teammate. It is not in-session compaction and not a generic session summary.

Normal user language is save/load/resume a handoff. Branch Memory is the storage command behind this skill; mention namespace, key, ref, or commit only as technical locator evidence, recovery detail, or error context.

## Direction first

A handoff must answer:

> Given this requested focus, what does the next session need to know to proceed correctly?

If the user gave a meaningful continuation focus, use it. If they only asked for "a handoff" with no focus/title/resume goal, ask a cheap clarifying question before writing:

```text
What should the future session continue from this handoff?
```

## Storage contract

- Namespace: `session-artifacts`
- Entry key shape: `handoffs/<semantic-slug>.md`
- Store from a file:

```bash
brmem put handoffs/<semantic-slug>.md --namespace session-artifacts --branch <branch> --file <artifact.md>
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
- Otherwise derive it from the continuation focus or title. The slug is the future load hint, so include the subject and likely resume action when possible.
- Format it as:
  - lowercase
  - replace punctuation and whitespace with `-`
  - remove remaining non-alphanumeric characters except `-`
  - collapse repeated `-`
  - trim leading/trailing `-`
  - keep it concise, usually 3-8 words
- Avoid generic slugs like `handoff`, `session`, `work`, `follow-up`, or `continue`.
- Prefer semantic slugs like `address-review-feedback`, `add-load-handoff-command`, or `resume-plan-implementation`.

## Prevent accidental overwrites

Before writing, check for an existing artifact:

```bash
brmem check handoffs/<semantic-slug>.md --namespace session-artifacts --branch <branch>
```

Interpret the result:

- Exit `0`: an artifact already exists. Stop unless the user explicitly asked to replace it.
- Exit `1`: no artifact exists. Continue.
- Exit `2`: the request is invalid or the command failed. Surface the error and stop.

Only overwrite when replacement intent is explicit, then use the same `brmem put` command.

## Handoff artifact template

Create a temporary Markdown file with concise, future-continuation-oriented content:

```markdown
# Handoff: <title>

## Continuation Focus

<What the future session should continue, decide, verify, or implement.>

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

## Store and report

Store the artifact:

```bash
brmem put handoffs/<semantic-slug>.md --namespace session-artifacts --branch <branch> --file <artifact.md>
```

Report the result in handoff vocabulary first:

```text
Saved handoff `<semantic-slug>` on branch `<branch>`.
```

Then include a compact technical locator when useful:

- Namespace: `session-artifacts`
- Entry: `handoffs/<semantic-slug>.md`
- Locator/ref and commit printed by `brmem`

## Load later

When a user asks to resume from an existing handoff, prefer the `brmem-pickup-handoff` skill. Loading relies on the semantic slug rather than a separate summary or index.
