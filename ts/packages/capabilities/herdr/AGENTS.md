# @nseng-ai/herdr Agent Notes

Use the repository's Pi extension command checklist for command registration, acknowledgement, progress, and transcript/status presentation:

- [`docs/pi/extension-command-checklist.md`](../../../../docs/pi/extension-command-checklist.md)

## Herdr caller targeting

Always use `HERDR_WORKSPACE_ID` from `getCallerWorkspaceId()` for explicit caller workspace targeting. Do not fall back to UI focus or `--current` without explicit documentation of the specific Herdr command's semantics.
