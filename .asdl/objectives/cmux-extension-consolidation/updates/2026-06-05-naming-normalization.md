# cmux naming normalization complete

## Summary

Completed the final non-parked naming normalization slice for the cmux extension consolidation Objective.

- Replaced `/cmux-dispatch` with `/cmux-slot:dispatch-prompt` without registering a legacy alias.
- Renamed the TypeScript prompt dispatch module to `cmux/dispatch-prompt.ts` and the manual sidebar module to `cmux/sidebar.ts`.
- Standardized TypeScript sidebar symbols around the sidebar noun, including `createCmuxSidebarController` and `ASDL_CMUX_SIDEBAR_MODEL`.
- Normalized user-facing standalone `CMUX` prose to lowercase `cmux` across the scoped cmux suite, docs, and skill while preserving uppercase env vars such as `CMUX_WORKSPACE_ID` and `CMUX_TAB_ID`.
- Made status ownership explicit: the Pi transient sidebar status key is now `pi:cmux-sidebar`, while the deterministic `asdl exec cmux-workspace-summary` command still clears the legacy `pi-summary` cmux status pill.

## Objective Impact

The Objective's final active roadmap row is complete. The project-local cmux command suite is now documented and tested as:

- `/cmux:pr-sidebar`
- `/cmux:objective-sidebar [objective-slug-or-path]`
- `/cmux-slot:dispatch-plan`
- `/cmux-slot:open-branch`
- `/cmux-slot:dispatch-prompt`

Updated surfaces include `ts/packages/pi-extensions/src/cmux.ts`, `ts/packages/pi-extensions/src/cmux/`, `ts/packages/pi-extensions/test/cmux.test.ts`, `ts/packages/pi-extensions/CONTEXT.md`, `docs/pi/cmux-extension-pattern.md`, `docs/pi/README.md`, `docs/asdl-exec/cmux-workspace-summary.md`, and `skills/cmux-sidebar/SKILL.md`.

Validation evidence:

- `just ts-check` passed.
- `just ts-test` passed.
- `just dprint-check` passed after the prescribed `just dprint-fix` Markdown autofix.
- `git diff --check` passed.
- Scoped `rg -n "cmux-dispatch" ...` produced no output outside Objective history.
- Scoped `rg -n "\bCMUX\b" ...` produced no output outside literal env var/identifier cases excluded by the word-boundary grep.
- Status-key review showed `pi:cmux-sidebar` in the TypeScript sidebar controller and `pi-summary` only in the Python exec/docs/tests path that clears the legacy cmux status pill.

## Follow-Ups

All non-parked roadmap rows now appear complete. The Objective looks ready for the normal closure gate, but this update does not create `closed.md` or add closure text.

Parked follow-ups remain unchanged:

- Package-wide `isRecord`/guards consolidation.
- Reconcile the two slug-from-content strategies.
