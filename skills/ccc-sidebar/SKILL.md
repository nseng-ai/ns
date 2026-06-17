---
name: ccc-sidebar
description: Use when /ccc:sidebar:session-summary asks a Pi session to update the caller cmux sidebar/workspace card; generate compact title and one-line Goal description, then run one asdl exec command. /ccc:sidebar:objective-summary is handled directly by deterministic extension code and should not invoke this skill.
metadata:
  internal: true
---

# ccc-sidebar

Update the caller cmux workspace entry so the sidebar distinguishes this Pi session from other workspaces.

## Input contract

The invoking extension prompt provides the target workspace through `CMUX_WORKSPACE_ID` or `CMUX_TAB_ID` and requests the session sidebar summary command.

Do not target the focused workspace unless it is the same environment-provided caller workspace.

## Choose the source to summarize

Summarize this Pi session's current task, progress, and likely next action from the active Pi conversation context. The goal should describe what this session is trying to accomplish, not the cmux update itself.

`/ccc:sidebar:objective-summary` is not skill-driven. It is handled directly by deterministic extension code from an Objective slug/path or UI picker selection; do not use this skill for Objective sidebar work.

## Summarize from current Pi context

Use the active Pi conversation context already available to you. Do not serialize, request, or inspect the full session file. Do not use local cmux source under `~/code/githubs/manaflow-ai/cmux`; if cmux command behavior is unclear, inspect the installed CLI help.

Do not summarize this control prompt as the subject of the session. Summarize the requested session work.

## Required fields

Produce these two fields and self-check the character limits before running commands:

- `title`: exactly `summary:<slug>`, where `<slug>` is a concise lowercase hyphen slug for the session topic. Keep the full title at max 45 chars.
- `description`: exactly one short line with the `Goal:` prefix.

If any field is too long, rewrite it shorter before running `asdl exec`. If possible, avoid apostrophes in generated fields so single-quote shell quoting stays simple; rewrite contractions rather than escaping them.

## Apply immediately when the source is resolved

Run exactly one deterministic `asdl exec cmux-workspace-summary` command with careful quoting. Do not assign shell variables. Do not write an env prelude. Do not pass `--workspace`; the CLI resolves `CMUX_WORKSPACE_ID` / `CMUX_TAB_ID` itself. Do not run raw `cmux` commands. If command execution fails, report the exact failure and stop rather than trying unrelated workarounds.

Use this command shape:

```bash
asdl exec cmux-workspace-summary \
  --title 'summary:<slug>' \
  --description 'Goal: ...' \
  --format json
```

The command also clears the legacy `pi-summary` cmux status pill so no `cmux ready`-style text remains. The JSON envelope should have `exit_code: 0` and `data.success: true`. After success, respond briefly with the applied title. Do not produce a long session summary in chat.
