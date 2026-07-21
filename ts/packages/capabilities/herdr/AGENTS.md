# @nseng-ai/herdr Agent Notes

Use the repository's Pi extension command checklist for command registration, acknowledgement, progress, and transcript/status presentation:

- [`docs/pi/extension-command-checklist.md`](../../../../docs/pi/extension-command-checklist.md)

## Optional Slot label enrichment

The `/ns:herdr:space:goal`, `/ns:herdr:tab:goal`, and `/ns:herdr:space:objective-summary` commands add a compact Slot prefix only when both canonical managed-Slot path identity and effective `@nseng-ai/slots` presence hold. Every Herdr Pi host must pass a complete ns extension API factory directly to `registerHerdrPiExtension(pi, factory, options?)`; there is no generic-host or unavailable fallback.

Each relevant Pi command handler must construct the complete API from its exact `ctx.cwd` before entering Herdr core—before caller targeting, validation, prompting, model work, or early returns—and at most once per invocation. `hasSlotsExtension(factory, cwd)` calls `hasExtension("@nseng-ai/slots")` without catching failures: factory, configuration, and programming failures propagate and prevent the core operation and rename, while extension absence is the normal `false` result. Herdr core receives only the resolved required boolean and narrow genuine collaborators, never a predicate, callback, runtime context, API factory, or API. Registration and unrelated commands remain lazy; do not cache at registration/global scope or infer presence from path shape, package resolution, or Pi command registration.

The Objective summary remains label-only; do not add metadata reporting or a public generic workspace-summary command. The label-composition policy is provisional and should move behind a Herdr workflow pluggability point when that extension surface is designed.

## Herdr caller targeting

Use `HERDR_WORKSPACE_ID` from `getCallerWorkspaceId()` for explicit caller space targeting, including tab creation and dispatch into the caller space. Use `HERDR_TAB_ID` from `getCallerTabId()` when a command must mutate the exact caller tab, such as `/ns:herdr:tab:goal`; never substitute the workspace ID. Do not fall back to UI focus or `--current` without explicit documentation of the specific Herdr command's semantics.
