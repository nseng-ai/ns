# @nseng-ai/herdr Agent Notes

Use the repository's Pi extension command checklist for command registration, acknowledgement, progress, and transcript/status presentation:

- [`docs/pi/extension-command-checklist.md`](../../../../docs/pi/extension-command-checklist.md)

## Objective sidebar behavior

The `/ns:herdr:sidebar:objective-summary` command applies the Objective slug as the workspace label and the current slot as the caller pane's metadata title. Use `herdr pane report-metadata` with an explicit `HERDR_PANE_ID`; do not add a public generic workspace-summary command or target a focused pane implicitly.

## Herdr caller targeting

Always use `HERDR_WORKSPACE_ID` from `getCallerWorkspaceId()` for explicit caller workspace targeting. Do not fall back to UI focus or `--current` without explicit documentation of the specific Herdr command's semantics.
