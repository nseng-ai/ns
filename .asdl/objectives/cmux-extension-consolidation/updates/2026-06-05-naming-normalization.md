# cmux naming normalization complete

## Summary

Completed the final naming-normalization slice for the cmux extension consolidation Objective.

- Replaced `/cmux-dispatch` with `/cmux-slot:dispatch-prompt` without registering a legacy alias.
- Renamed the TypeScript prompt-dispatch module to `dispatch-prompt.ts` and the manual sidebar controller module to `sidebar.ts`.
- Renamed TypeScript sidebar symbols and model configuration from workspace-summary/summary language to sidebar language, including `createCmuxSidebarController`, `CmuxSidebarController`, `SIDEBAR_MODEL_ENV`, and `ASDL_CMUX_SIDEBAR_MODEL`.
- Normalized scoped user-facing standalone `CMUX` prose to lowercase `cmux`; env vars such as `CMUX_WORKSPACE_ID` and `CMUX_TAB_ID` remain uppercase identifiers.
- Made status-key ownership explicit: the Pi transient sidebar status key is now `pi:cmux-sidebar`; the Python exec command continues to clear legacy cmux status key `pi-summary`.
- Updated tests, docs, package context, and `skills/cmux-sidebar/SKILL.md` for the final command names and terminology.

## Objective Impact

All non-parked roadmap rows are now complete. The cmux command suite is consistently registered through `.pi/extensions/cmux.ts` and `ts/packages/pi-extensions/src/cmux.ts` as:

- `/cmux:pr-sidebar`
- `/cmux:objective-sidebar`
- `/cmux-slot:dispatch-plan`
- `/cmux-slot:open-branch`
- `/cmux-slot:dispatch-prompt`

Validation evidence collected for this slice:

- `just ts-check` passed.
- `just ts-test` passed.
- `just dprint-check` passed after `just dprint-fix` formatted Markdown table changes.
- `git diff --check` passed after Objective tracking updates.
- Targeted `rg -n "cmux-dispatch" ...` over the scoped cmux suite/docs/skill produced no output.
- Targeted `rg -n "\bCMUX\b" ...` over the scoped cmux suite/docs/skill produced no output.
- Status-key review shows `pi:cmux-sidebar` is the TypeScript Pi transient UI key, while `pi-summary` remains the documented legacy cmux status key cleared by `asdl exec cmux-workspace-summary`.

## Follow-Ups

- Run the normal Objective closure gate before creating `closed.md` or adding closure metadata.
- If local developer config used `ASDL_CMUX_SUMMARY_MODEL`, migrate it to `ASDL_CMUX_SIDEBAR_MODEL`.
- Future work to make sidebar application fully deterministic should keep using `asdl exec cmux-workspace-summary` as the apply boundary unless the Python CLI contract is deliberately renamed in a separate slice.
