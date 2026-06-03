---
name: cmux-set-workspace-summary
description: Use when a Pi session should update the caller cmux workspace title, description, and sidebar status from the current session context. Triggered by /cmux:set-workspace-summary; generate compact fields and run one asdl exec command.
metadata:
  internal: true
---

# cmux-set-workspace-summary

Update the caller cmux workspace entry so the left nav distinguishes this Pi session from other workspaces.

## Input contract

The invoking extension prompt provides the target workspace through `CMUX_WORKSPACE_ID` or `CMUX_TAB_ID`. Do not target the focused workspace unless it is the same environment-provided caller workspace.

## Summarize from current Pi context

Use the active Pi conversation context already available to you. Do not serialize, request, or inspect the full session file. Do not use local cmux source under `~/code/githubs/manaflow-ai/cmux`; if cmux command behavior is unclear, inspect the installed CLI help.

Do not summarize this control prompt as the subject of the session. Summarize the surrounding active work.

## Required fields

Produce these three fields and self-check the character limits before running commands:

- `title`: max 45 chars; short action/object phrase.
- `description`: compact multiline description, preferably exactly three lines with `Goal:`, `State:`, and `Next:` prefixes. Keep each semantic line short enough for cmux sidebar/description display.
- `status`: max 20 chars; compact sidebar pill text.

If any field is too long, rewrite it shorter before running `asdl exec`. If possible, avoid apostrophes in generated fields so single-quote shell quoting stays simple; rewrite contractions rather than escaping them.

## Apply immediately

Run exactly one deterministic `asdl exec cmux-workspace-summary` command with careful quoting. Do not assign shell variables. Do not write an env prelude. Do not pass `--workspace`; the CLI resolves `CMUX_WORKSPACE_ID` / `CMUX_TAB_ID` itself. Do not run raw `cmux` commands. If command execution fails, report the exact failure and stop rather than trying unrelated workarounds.

Use this command shape:

```bash
asdl exec cmux-workspace-summary \
  --title '...' \
  --description 'Goal: ...
State: ...
Next: ...' \
  --status '...' \
  --format json
```

The JSON envelope should have `exit_code: 0` and `data.success: true`. After success, respond briefly with the applied title and status. Do not produce a long session summary in chat.
