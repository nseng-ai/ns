# Non-Brmem Handoff Names Required

## Summary

Recorded the user decision that renaming handoff-related skills and commands away from the `brmem` prefix is part of this Objective, not an optional follow-up. The requirement applies to the public handoff artifact UX surfaces: the current `/brmem-handoff`, `/brmem-pickup-handoff`, `brmem-handoff`, and `brmem-pickup-handoff` names should be replaced with non-`brmem` handoff names.

The generic low-level `brmem` CLI and `brmem` skill remain valid storage/recovery surfaces. Branch Memory can still be the implementation detail, but the normal save/pickup/list/resume handoff surface should not advertise that storage layer in its name.

## Objective Impact

The command/skill naming work is now stronger than the original "replace, deprecate, or explicitly retain" framing. Normal public handoff names must become non-`brmem` names. Any old `brmem`-named handoff entrypoints, if kept at all, should be explicitly deprecated compatibility or recovery shims rather than primary UX.

The open question narrows from whether Codex/Claude skills should be renamed to which non-`brmem` names and transition strategy should be used.

## Follow-Ups

- Choose exact non-`brmem` names for Pi commands and portable skills.
- Rename the checked-in skill directories, `.agents/skills` and `.claude/skills` symlinks, and `skills-lock.json` entries using the repo skill-management workflow.
- Rename or replace the Pi extension command registrations and update tests, docs, resource catalog rows, and command inventory evidence.
- Decide whether old `brmem`-named handoff surfaces are removed immediately or retained only as hidden/deprecated compatibility shims.
