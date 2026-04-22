---
name: objective-list
description: "Display the user's twerk objectives — GitHub issues labeled `objective` that anchor multi-session workstreams. Use whenever the user asks 'what are my objectives?', 'show my open objectives', 'list twerk objectives', wants to pick the next workstream to progress, or asks for details on a specific objective by number. Lists via `twerk objective list` (alias `ls`, default state `open`, supports `--state {open|closed|all}`); on follow-up, drills into a specific issue with `gh issue view <num>` and summarizes outcome / roadmap / assumptions / risks. Suggests `objective-progress`, `objective-reconcile`, and `objective-create` as follow-on actions. Read-only — never mutates state."
allowed-tools:
  - "Bash(twerk objective list*)"
  - "Bash(twerk objective ls*)"
  - "Bash(twerk objective list --format json*)"
  - "Bash(gh issue view*)"
  - "Bash(gh auth status)"
---

<!-- PUBLIC SKILL: Do not reference twerk-internal module paths or class names in this file. Describe CLI operations, not implementation. See AGENTS.md § "Public Skill Authoring". -->

# objective-list

Display the user's current twerk objectives inside a coding-agent session.
This is the read-only sibling of `objective-create`,
`objective-progress`, and `objective-reconcile` — the "what's on my
plate?" entry point.

See the `objective` skill for what an objective is and the broader lifecycle.

## When to use

Trigger this skill when the user:

- asks "what are my objectives?", "show my open objectives", "list twerk
  objectives", or any equivalent phrasing
- wants to pick which workstream to progress next
- asks for details on a specific objective by number ("tell me about #34")
- wants to confirm whether a given objective is still open before starting
  work

If the user instead wants to _advance_ an objective, hand off to
`objective-progress`. If they want to _create_ one, hand off to
`objective-create`. If they want to _close one out_ after a merged PR,
hand off to `objective-reconcile`.

## Core rules

- Default to `--state open`. Only widen to `closed` or `all` when the user
  explicitly asks for closed, done, or historical objectives.
- Use `twerk objective list` — not raw `gh issue list --label objective`.
  The CLI is the supported interface and may evolve.
- Render results compactly in chat. For each objective show: number, title,
  last-updated date. Do not paste raw shell output verbatim if the list is
  long — summarize or table-format.
- Drill into a specific issue with `gh issue view <num>` only when the user
  asks about that objective. Do not pre-fetch every body.
- When drilling in, **summarize** the body in 5–10 lines (outcome, current
  next step, key risks). Do not dump the full markdown back at the user.
- Read-only. Never run `gh issue edit`, `gh issue close`, `gh issue comment`,
  or any mutating `twerk objective` subcommand. All mutations belong to
  `objective-progress`, `objective-reconcile`, or
  `objective-create`.

## Workflow

### 1. List

Run the CLI:

```bash
twerk objective list
```

Add `--state all` or `--state closed` only when the user explicitly asked
for closed or historical objectives. The alias `twerk objective ls` is
equivalent.

If the command fails (typically a `subprocess.CalledProcessError` from `gh`),
surface the error message and suggest `gh auth status` as the next debugging
step. Do not silently fall back to `gh issue list`.

### 2. Render

The CLI prints a Rich-formatted table with columns `#`, `Status`, `Title`,
and `Updated` (relative time, e.g. `2h ago`):

```
   #   Status     Title                                                Updated
──────────────────────────────────────────────────────────────────────────────
 #40   ● open     Implement workbranch primitive: branch-embedded c…    2h ago
 #34   ● open     Explore using pluggy                                   1d ago
```

In a chat reply, reproduce the same shape (number, status, title, relative
updated time) — either as a compact markdown table or as a tight bulleted
list. Do not strip the status badge; it's how the user tells open from
closed when they asked for `--state all`. If the list is empty, say so
plainly and suggest `objective-create` if the user wants to start
one. If there are more than ~10 entries, group them (e.g. by recency) or
trim to the most recent and tell the user how to widen.

### 3. Drill in (only when asked)

If the user asks about a specific number — "tell me about #34", "what's the
status of objective 24", etc. — fetch that one issue:

```bash
gh issue view <num>
```

Then **summarize** in 5–10 lines:

- target outcome
- the most relevant completion criterion or current next step
- any open risks or invalidated assumptions worth flagging
- the issue URL

Do not paste the raw body. Do not fetch `--comments` unless the user asks
about history — the body is the current snapshot.

### 4. Suggest follow-on actions

After listing or drilling in, offer the relevant next skill in one short
line:

- to advance an objective → `objective-progress`
- to wrap one up after a merged PR → `objective-reconcile`
- to start a new one → `objective-create`

Pick at most the one or two that fit the user's apparent intent. Don't
recite all three every turn.

## Anti-patterns

- Pasting raw `gh issue view` output verbatim instead of summarizing.
- Calling `gh issue list --label objective` instead of using
  `twerk objective list`.
- Auto-drilling into every objective on the list (context bloat).
- Mutating state — closing, editing, commenting. Read-only skill only.
- Fetching `--comments` unprompted. The body is the current snapshot;
  comments are history and only matter when the user asks for them.
- Defaulting to `--state all` on a casual "show me my objectives" — start
  with open only.
- Reciting all three follow-on skills every turn instead of picking the one
  that fits.
