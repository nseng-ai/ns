# @nseng-ai/herdr Agent Notes

Use the repository's Pi extension command checklist for command registration, acknowledgement, progress, and transcript/status presentation:

- [`docs/pi/extension-command-checklist.md`](../../../../docs/pi/extension-command-checklist.md)

## Objective workspace label

The `/ns:herdr:objective:sidebar-summary` command applies one workspace label via `herdr workspace rename`. In a managed ns slot, the label prefixes the Objective with the compact slot (`s1:obj:<slug>`); outside slots it remains `obj:<slug>`. Do not infer slot use from a directory basename alone, add metadata reporting, or add a public generic workspace-summary command. The label-composition policy is provisional and should move behind a Herdr workflow pluggability point when that extension surface is designed.

## Herdr caller targeting

Always use `HERDR_WORKSPACE_ID` from `getCallerWorkspaceId()` for explicit caller workspace targeting. Do not fall back to UI focus or `--current` without explicit documentation of the specific Herdr command's semantics.
