---
name: cmux-set-workspace-summary
description: Use when a Pi session should update the caller cmux workspace title, description, and sidebar status from the current session context. Triggered by /cmux:set-workspace-summary; generate compact fields and run cmux commands directly.
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

Produce these five fields and self-check the character limits before running commands:

- `title`: max 45 chars; short action/object phrase.
- `goal`: max 100 chars.
- `currentState`: max 100 chars.
- `nextAction`: max 100 chars.
- `status`: max 20 chars; compact sidebar pill text.

If any field is too long, rewrite it shorter before running `cmux`.

## Apply immediately

Run one deterministic exec command with careful quoting. Use the caller workspace from `$CMUX_WORKSPACE_ID` or `$CMUX_TAB_ID` and fail if neither is set. Do not run raw `cmux` commands directly unless the exec command itself is unavailable. If command execution fails, report the exact failure and stop rather than trying unrelated workarounds.

Use this command shape:

```bash
workspace="${CMUX_WORKSPACE_ID:-${CMUX_TAB_ID:-}}"
if [ -z "$workspace" ]; then
  echo "Not running inside a cmux caller workspace (CMUX_WORKSPACE_ID/CMUX_TAB_ID missing)." >&2
  exit 1
fi

TITLE='...'
GOAL='...'
CURRENT_STATE='...'
NEXT_ACTION='...'
STATUS='...'

asdl exec cmux-workspace-summary \
  --workspace "$workspace" \
  --title "$TITLE" \
  --goal "$GOAL" \
  --current-state "$CURRENT_STATE" \
  --next-action "$NEXT_ACTION" \
  --status "$STATUS" \
  --format json
```

The JSON envelope should have `exit_code: 0` and `data.success: true`. After success, respond briefly with the applied title and status. Do not produce a long session summary in chat.
