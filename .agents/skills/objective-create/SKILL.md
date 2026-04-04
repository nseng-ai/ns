---
name: objective-create
description: "Create a GitHub issue for a new twerk objective. Use whenever the user wants to start an objective, capture a multi-session workstream in GitHub, turn a rough project brief into an issue-backed objective, or create something that should later appear in `twerk objective list`. Keep it prompt-driven, use plain markdown, apply the `twerk-objective` label, and create the issue with `gh`."
allowed-tools:
  - "Bash(gh issue *)"
  - "Bash(gh label *)"
  - "Bash(git remote *)"
  - "Bash(mktemp)"
---

# objective-create

Use this skill to create a lightweight, issue-backed objective for `twerk`.

Keep the design simple:

- Do not generate roadmap metadata blocks.
- Do not split content between the issue body and a first comment.
- Do not require a formal phase structure unless the user already wants one.

A good GitHub issue plus the `twerk-objective` label is all you need.

## Goal

Create one GitHub issue that:

- clearly states the objective
- preserves useful context for future implementation
- is labeled `twerk-objective`
- can later be discovered by `twerk objective list`

## Core Rules

- Start from the current conversation. Ask follow-up questions only when the
  issue would otherwise be ambiguous or misleading.
- Keep the issue body readable by humans first. Plain markdown is enough.
- Preserve real constraints, non-goals, and exploration notes when they matter.
- Prefer a concise issue with clear sections over a giant planning document.
- Always ensure the `twerk-objective` label exists before creating the issue.

## When To Ask Questions

Ask at most 1-3 short questions only when a critical detail is missing:

- the outcome is not clear enough to title the issue
- the scope has multiple plausible interpretations
- the user has not given any success condition and that omission matters
- there are important constraints or non-goals that need confirmation

If the conversation already gives you enough context, draft and create the issue
directly.

## Workflow

### 1. Capture the objective

Pull the following from the conversation and any lightweight codebase
exploration:

- target outcome
- completion criteria (concrete, verifiable against the codebase)
- why it matters
- constraints or non-goals
- relevant implementation context
- optional initial next steps

Only explore the codebase when it improves the issue. Do not do broad research
just to make the issue look more formal.

### 2. Draft the issue

Use `references/body-template.md` as the default shape.

Title guidance:

- Lead with the concrete outcome.
- Make the title readable as a future list entry.
- Avoid vague titles like "Investigate objective stuff" unless the objective is
  explicitly exploratory.

Body guidance:

- Prefer short prose plus bullets.
- Omit empty sections instead of leaving placeholders.
- Include exploration context only if it would help a future implementer.
- If the user already described phases or milestones, include a brief `## Initial
  Plan` or `## Initial Next Steps` section. Otherwise keep it simpler.

If the user explicitly wants to review the draft before issue creation, show the
draft and wait. Otherwise, create the issue once the objective is clear.

### 3. Ensure the label exists

Before creating the issue, verify that the repository has a
`twerk-objective` label. If it is missing, create it.

Recommended commands:

```bash
gh label list --limit 200
gh label create twerk-objective --color 0e8a16 --description "Objective tracked by twerk"
```

If you need to confirm the target repository first, inspect the current repo:

```bash
git remote get-url origin
```

### 4. Create the issue

Prefer `--body-file` over inline shell quoting.

```bash
gh issue create --title "<title>" --body-file <temp-file> --label twerk-objective
```

The issue body should be the full objective record for now. Do not create a
follow-up metadata comment.

### 5. Report the result

Always return:

- issue number and URL
- final title
- confirmation that `twerk-objective` was applied
- a one-line summary of what the issue captures

If you created the label during this run, mention that explicitly.

## Anti-Patterns

- Generating metadata blocks or comment-backed storage models
- Forcing a roadmap or node graph when the user only needs an objective issue
- Creating the issue without the `twerk-objective` label
- Asking a long interview sequence before drafting anything
- Dumping raw research into the issue without synthesis
