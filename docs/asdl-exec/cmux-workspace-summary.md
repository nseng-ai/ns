# `asdl exec cmux-workspace-summary`

`asdl exec cmux-workspace-summary` is the deterministic command boundary for applying compact cmux sidebar/workspace-card metadata. It exists so Pi skills and agents do not hand-write the cmux mutation sequence.

## Command

Use a direct one-line `Goal:` description:

```bash
asdl exec cmux-workspace-summary \
  --title "$title" \
  --description "Goal: ..." \
  --format json
```

`--workspace` is optional. If omitted, the command resolves the caller workspace from `CMUX_WORKSPACE_ID`, then `CMUX_TAB_ID`. Missing workspace is an expected failure, not a reason to target the focused workspace.

## Summary fields

The current Pi skill enforces these limits by prompt instruction before calling the command:

| Field           | Limit         | Meaning                             |
| --------------- | ------------- | ----------------------------------- |
| `--title`       | 45 characters | Short action/object workspace title |
| `--description` | 1 short line  | Tooltip text: `Goal: ...`           |

The command trusts those fields and applies them. It does not perform deterministic length validation.

If direct `--description` is omitted or blank, the command exits with expected failure `missing_description`.

## cmux effects

On success, the command applies three cmux mutations to the caller workspace:

1. Rename workspace title with `cmux workspace rename <workspace> --title <title>`.
2. Set the description through `cmux workspace-action --action set-description`.
3. Clear the legacy cmux status key `pi-summary` with `cmux clear-status pi-summary`.

## JSON contract

Use `--format json` for skills and agents. Successful output has `exit_code: 0` and `data.success: true`:

```json
{
  "exit_code": 0,
  "data": {
    "success": true,
    "workspace": "workspace-or-uuid",
    "title": "Ship exec-based cmux summary",
    "description": "Goal: ...",
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

The command is covered through root CLI scenario tests in `tests/scenario/test_cli.py` using `FakeCmuxGateway`. The fake lives at `src/asdl_tools/cmux/testing.py`; the real CLI gateway lives at `src/asdl_tools/cmux/gateway.py`.

When extending this command, preserve tests for:

- success with direct `--description`;
- environment fallback to `CMUX_WORKSPACE_ID` / `CMUX_TAB_ID`;
- missing workspace;
- missing description;
- cmux command failure details;
- hidden but invocable root `asdl exec` group.

## Future single-command direction

The current skill still asks the model to call this one command. If the goal is “the agent writes no bash,” move another layer into the Pi extension:

1. Have the extension call a fast model directly for structured JSON fields.
2. Parse/validate the JSON in TypeScript.
3. Invoke `asdl exec cmux-workspace-summary` via `pi.exec("asdl", [...])` with argv, not shell.
4. Render the resulting JSON envelope in the extension.

That keeps semantic summarization in a model while making quoting, cmux targeting, and command execution fully deterministic.
