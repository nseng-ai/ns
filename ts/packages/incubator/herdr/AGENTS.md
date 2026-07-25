# @nseng-ai/herdr Agent Notes

Use the repository's Pi extension command checklist for command registration, acknowledgement, progress, and transcript/status presentation:

- [`docs/pi/extension-command-checklist.md`](../../../../docs/pi/extension-command-checklist.md)

## Herdr resource labels

Every ns-authored label for a Herdr space associated with a managed ns Slot uses the compact Slot prefix (`s1:<semantic-label>`); outside Slots the semantic label stands alone. Tab labels never use Slot prefixes. Derive Slot identity only from the canonical managed worktree path, never from an arbitrary directory basename. Objective space labels use `[sN:]obj:<slug>`, Handoff tabs use `handoff:<slug>`, and implementation labels preserve the semantic slug rather than a collision-resolved branch name. Unlabeled resource creation remains unlabeled. The label-composition policy is provisional and should move behind a Herdr workflow pluggability point when that extension surface is designed.

## Herdr caller targeting

Use `HERDR_WORKSPACE_ID` from `getCallerWorkspaceId()` for explicit caller space targeting, including tab creation and launch into the caller space. Use `HERDR_TAB_ID` from `getCallerTabId()` when a command must mutate the exact caller tab, such as `/ns:herdr:tab:goal`; never substitute the workspace ID. Do not fall back to UI focus or `--current` without explicit documentation of the specific Herdr command's semantics.
