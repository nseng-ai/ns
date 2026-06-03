# `asdl exec cmux-workspace-summary`

`asdl exec cmux-workspace-summary` is the deterministic command boundary for applying a compact cmux workspace
summary. It exists so Pi skills and agents do not hand-write the cmux mutation sequence.

## Command

```bash
asdl exec cmux-workspace-summary \
  --workspace "$workspace" \
  --title "$title" \
  --goal "$goal" \
  --current-state "$current_state" \
  --next-action "$next_action" \
  --status "$status" \
  --format json
```

`--workspace` is optional. If omitted, the command resolves the caller workspace from `CMUX_WORKSPACE_ID`, then
`CMUX_TAB_ID`. Missing workspace is an expected failure, not a reason to target the focused workspace.

## Summary fields

The current Pi skill enforces these limits by prompt instruction before calling the command:

| Field             | Limit          | Meaning                             |
| ----------------- | -------------- | ----------------------------------- |
| `--title`         | 45 characters  | Short action/object workspace title |
| `--goal`          | 100 characters | Goal line in the workspace tooltip  |
| `--current-state` | 100 characters | Current state line in the tooltip   |
| `--next-action`   | 100 characters | Next action line in the tooltip     |
| `--status`        | 20 characters  | Compact sidebar status pill text    |

The command currently trusts those fields and applies them. It does not perform deterministic length validation.

## cmux effects

On success, the command applies three cmux mutations to the caller workspace:

1. Rename workspace title with `cmux workspace rename <workspace> --title <title>`.
2. Set a multiline description through `cmux workspace-action --action set-description`.
3. Set/update the `pi-summary` sidebar status pill with icon `sparkle`, color `#7c3aed`, and priority `80`.

Description shape:

```text
Goal: <goal>
State: <current-state>
Next: <next-action>
```

## JSON contract

Use `--format json` for skills and agents. Successful output has `exit_code: 0` and `data.success: true`:

```json
{
  "exit_code": 0,
  "data": {
    "success": true,
    "workspace": "workspace-or-uuid",
    "title": "Ship exec-based cmux summary",
    "status": "fast path",
    "description": "Goal: ...\nState: ...\nNext: ...",
    "status_key": "pi-summary",
    "error": null
  }
}
```

Expected non-ideal states exit `1` and include `data.success: false`:

```json
{
  "exit_code": 1,
  "message": "Not running inside a cmux caller workspace (CMUX_WORKSPACE_ID/CMUX_TAB_ID missing).",
  "data": {
    "success": false,
    "workspace": null,
    "title": "No workspace",
    "status": "blocked",
    "description": null,
    "status_key": "pi-summary",
    "error": {
      "code": "missing_workspace",
      "message": "Not running inside a cmux caller workspace (CMUX_WORKSPACE_ID/CMUX_TAB_ID missing).",
      "command_failure": null
    }
  }
}
```

For cmux command failures, `error.command_failure` records the command argv, exit code, stdout, and stderr.

## Test surface

The command is covered through root CLI scenario tests in `tests/scenario/test_cli.py` using `FakeCmuxGateway`.
The fake lives at `src/asdl_tools/cmux/testing.py`; the real CLI gateway lives at
`src/asdl_tools/cmux/gateway.py`.

When extending this command, preserve tests for:

- success with explicit `--workspace`;
- environment fallback to `CMUX_WORKSPACE_ID` / `CMUX_TAB_ID`;
- missing workspace;
- cmux command failure details;
- hidden but invocable root `asdl exec` group.

## Future single-command direction

The current skill still asks the model to call a small shell snippet around this command so it can bind generated fields
to variables safely. If the goal is “the agent writes no bash,” move another layer into the Pi extension:

1. Have the extension call a fast model directly for structured JSON fields.
2. Parse/validate the JSON in TypeScript.
3. Invoke `asdl exec cmux-workspace-summary` via `pi.exec("asdl", [...])` with argv, not shell.
4. Render the resulting JSON envelope in the extension.

That keeps semantic summarization in a model while making all cmux mutation and quoting deterministic.
