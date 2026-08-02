# @nseng-ai/herdr Agent Notes

Use the repository's Pi extension command checklist for command registration, acknowledgement, progress, and transcript/status presentation:

- [`docs/pi/extension-command-checklist.md`](../../../../../docs/pi/extension-command-checklist.md)

## Herdr resource labels

Every ns-authored label for a Herdr space associated with a managed ns Slot uses the compact Slot prefix (`s1:<semantic-label>`); outside Slots the semantic label stands alone. Tab labels never use Slot prefixes. Derive Slot identity only from the canonical managed worktree path, never from an arbitrary directory basename. Objective space labels use `[sN:]obj:<slug>`, Handoff tabs use `handoff:<slug>`, and implementation labels use the collision-resolved branch name. Unlabeled resource creation remains unlabeled. The label-composition policy is provisional and should move behind a Herdr workflow pluggability point when that extension surface is designed.

## Herdr caller targeting

Resolve the explicit caller space through the typed `HerdrGateway.resolveCallerContext()` operation, backed by Herdr's caller-aware `herdr pane current --current` query, for caller space targeting — including tab creation and launch into the caller space. Caller-space workflows fail closed: a failed resolution, malformed response, or missing workspace ID stops the workflow before dependent interaction or mutation. Never read caller-space identity from environment variables and never fall back to UI focus or unqualified focus queries. Use `HERDR_TAB_ID` from `getCallerTabId()` when a command must mutate the exact caller tab, such as `/ns:herdr:tab:goal`; never substitute the caller space ID.
