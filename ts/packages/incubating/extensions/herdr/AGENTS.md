# @nseng-ai/herdr Agent Notes

Use the repository's Pi extension command checklist for command registration, acknowledgement, progress, and transcript/status presentation:

- [`docs/pi/extension-command-checklist.md`](../../../../../docs/pi/extension-command-checklist.md)

## Herdr resource labels

Description-based new resources and goal renames share the Herdr-owned semantic-label policy exported through `@nseng-ai/herdr/api`: action-neutral flat lowercase ASCII kebab labels, at most six words, with useful trailing `space`, `workspace`, and `tab` stripped when another word remains. The policy truncates model input at 8,000 characters, validates Herdr labels, and fails closed for every derivation failure. Pi invokes Extension Kit's deep content-slug operation and converts returned expected failures into host notifications; it does not own prompt/normalization policy or normalize the original goal as a fallback. Unexpected programmer errors continue to reject to the declared host boundary. Goal display labels are distinct from collision-resolved implementation branch labels.

Every ns-authored label for a Herdr space associated with a managed ns Slot uses the compact Slot prefix (`s1:<semantic-label>`); outside Slots the semantic label stands alone. Tab labels never use Slot prefixes. Derive Slot identity only from the canonical managed worktree path, never from an arbitrary directory basename. Objective space labels use `[sN:]obj:<slug>`, Handoff tabs use `handoff:<slug>`, and implementation labels use the collision-resolved branch name. Unlabeled resource creation remains unlabeled. The label-composition policy is provisional and should move behind a Herdr workflow pluggability point when that extension surface is designed.

## Herdr caller targeting

Resolve explicit caller identity through the typed `HerdrGateway.resolveCallerPane()` operation, backed by Herdr's caller-aware `herdr pane current --current` query. The operation returns caller workspace, tab, and pane IDs together from one query; consumers select the identity they need. Caller-targeted workflows fail closed: a failed resolution, malformed response, or missing required ID stops the workflow before dependent interaction or mutation — resolve and capture caller identity at the command boundary, before focus prompting, Git inspection, idle waiting, or other dependent work. Never read caller identity from environment variables, substitute a workspace ID for a tab ID, or fall back to UI focus or unqualified focus queries.
