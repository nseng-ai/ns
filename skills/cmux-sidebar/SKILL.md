---
name: cmux-sidebar
description: Use when a Pi session should update the caller cmux sidebar/workspace card from either the current PR work or an explicit asdl Objective. Triggered by /cmux:pr-sidebar and /cmux:objective-sidebar; generate compact title and one-line Goal description, then run one asdl exec command.
metadata:
  internal: true
---

# cmux-sidebar

Update the caller cmux workspace entry so the sidebar distinguishes this Pi session from other workspaces.

## Input contract

The invoking extension prompt provides:

- the target workspace through `CMUX_WORKSPACE_ID` or `CMUX_TAB_ID`;
- the requested variant: PR sidebar or Objective sidebar;
- for Objective sidebar, an optional Objective slug or path from the command arguments.

Do not target the focused workspace unless it is the same environment-provided caller workspace.

## Choose the source to summarize

Use the requested variant from the invoking prompt.

### PR sidebar

Summarize the current PR, branch, or active implementation work. Use PR/branch/session evidence already visible in the active Pi conversation context. The goal should describe the PR outcome, not the cmux update itself.

### Objective sidebar

Summarize the selected asdl Objective, not the current PR.

- If the invoking prompt provides an Objective slug or path, use that Objective.
- If no Objective slug or path is provided, do not infer from branch name, PR title, or hidden context. Ask the user to provide or choose an Objective slug/path, then stop without running `asdl exec`.

## Summarize from current Pi context

Use the active Pi conversation context already available to you. Do not serialize, request, or inspect the full session file. Do not use local cmux source under `~/code/githubs/manaflow-ai/cmux`; if cmux command behavior is unclear, inspect the installed CLI help.

Do not summarize this control prompt as the subject of the session. Summarize the requested source: PR work for PR sidebar, Objective purpose for Objective sidebar.

## Required fields

Produce these two fields and self-check the character limits before running commands:

- `title`: max 45 chars; short action/object phrase.
- `description`: exactly one short line with the `Goal:` prefix.

If any field is too long, rewrite it shorter before running `asdl exec`. If possible, avoid apostrophes in generated fields so single-quote shell quoting stays simple; rewrite contractions rather than escaping them.

## Apply immediately when the source is resolved

Run exactly one deterministic `asdl exec cmux-workspace-summary` command with careful quoting. Do not assign shell variables. Do not write an env prelude. Do not pass `--workspace`; the CLI resolves `CMUX_WORKSPACE_ID` / `CMUX_TAB_ID` itself. Do not run raw `cmux` commands. If command execution fails, report the exact failure and stop rather than trying unrelated workarounds.

Use this command shape:

```bash
asdl exec cmux-workspace-summary \
  --title '...' \
  --description 'Goal: ...' \
  --format json
```

The command also clears the old `pi-summary` cmux status pill so no `cmux ready`-style text remains. The JSON envelope should have `exit_code: 0` and `data.success: true`. After success, respond briefly with the applied title. Do not produce a long session summary in chat.
