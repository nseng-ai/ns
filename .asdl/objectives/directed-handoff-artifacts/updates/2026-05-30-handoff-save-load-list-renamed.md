# Handoff Create/Load/List Renamed

## Summary

Implemented the final directed handoff artifact surface: `/handoff:create`, `/handoff:load`, `/handoff:list`, `handoff-save`, and `handoff-load`. Removed the old first-party `brmem`-named handoff commands, skills, and symlink mirrors rather than keeping aliases or migration shims.

Changed the active handoff storage contract to Branch Memory namespace `handoffs` with flat keys `<semantic-slug>.md`. The old `session-artifacts` plus `handoffs/<slug>.md` contract is no longer used by active handoff UX. Save now requires a meaningful continuation focus, prompts for one when UI input exists, and otherwise instructs the assistant to ask the exact focus question before saving.

Added current-branch and all-branches handoff listing. The Pi list output shows slug/preview columns, adds a branch column for all-branches mode, and keeps storage keys out of normal copy. The low-level `brmem list --all-branches` recovery affordance now lists entries across branches without resolving the current branch.

## Objective Impact

All active roadmap work is now marked complete. The final decisions are durable:

- Commands: `/handoff:create`, `/handoff:load`, `/handoff:list`.
- Skills: `handoff-save`, `handoff-load`.
- Compatibility: no old handoff aliases, no deprecated shims, no migration.
- Storage: namespace `handoffs`, key `<semantic-slug>.md`.
- Save behavior: continuation focus is required; omitted focus is clarified before any save workflow runs.
- Listing behavior: current branch by default; all branches only with `--all-branches`; all-branches output includes branch.

Inventory evidence:

- Pi RPC `get_commands` reported project extension commands `handoff:create`, `handoff:load`, and `handoff:list` from `.pi/extensions/handoff.ts` with the expected descriptions, and no `/brmem-handoff` or `/brmem-pickup-handoff` commands.
- The project Pi extension command count in `docs/agent-resource-catalog.md` is now 18.
- `npx skills list --json` reported `handoff-save` and `handoff-load` installed from `.agents/skills/...`; no `brmem-handoff` or `brmem-pickup-handoff` entries were present.
- Symlink checks resolved `.agents/skills/handoff-save -> ../../skills/handoff-save`, `.agents/skills/handoff-load -> ../../skills/handoff-load`, `.claude/skills/handoff-save -> ../../.agents/skills/handoff-save`, and `.claude/skills/handoff-load -> ../../.agents/skills/handoff-load`.

Validation evidence:

- `bun test ts/packages/pi-extensions/test/handoff.test.ts` passed.
- `uv run pytest packages/brmem/tests/scenario/test_brmem_cli.py -k "brmem_list or list_all_branches"` passed.
- `just ts-check` passed.
- `just ts-test` passed.
- `just dprint-check` passed after Markdown formatting was applied with `just dprint-fix`.
- Full `just` passed after formatting and final doc edits.
- `git diff --check` passed.

Repo evidence: current branch `handoff-save-load-list-rename`; Graphite parent `update-handoff-artifact-vocabulary-docs`; no PR existed for the branch at update time, so PR evidence was not required.

## Follow-Ups

- Closure appears ready because every non-parked roadmap row is complete and validation/inventory evidence is recorded; close the Objective only after explicit user confirmation.
- Watch for user feedback on focus-required save friction and all-branch listing noise, but no further implementation blocker remains in this Objective.
