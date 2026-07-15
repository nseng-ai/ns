# @nseng-ai/herdr Agent Notes

Use the repository's Pi extension command checklist for command registration, acknowledgement, progress, and transcript/status presentation:

- [`docs/pi/extension-command-checklist.md`](../../../../docs/pi/extension-command-checklist.md)

## Label-only behavior reminder

The `/ns:herdr:sidebar:objective-summary` command currently applies only a workspace label (via `herdr workspace rename`) because the installed Herdr CLI lacks `workspace report-metadata`. Do not add metadata reporting, a public generic workspace-summary command, or a substitute transport. This remains parked in the herdr-capability-parity Objective roadmap until the installed binary supports it.

## Herdr caller targeting

Always use `HERDR_WORKSPACE_ID` from `getCallerWorkspaceId()` for explicit caller workspace targeting. Do not fall back to UI focus or `--current` without explicit documentation of the specific Herdr command's semantics.
