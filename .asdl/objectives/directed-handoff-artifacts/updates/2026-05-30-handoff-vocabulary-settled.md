# Handoff Vocabulary Settled

## Summary

Settled the public vocabulary around directed handoff artifacts: users save a handoff, pick up a handoff, list handoffs, and resume from a handoff. Added `docs/pi/handoff-artifacts.md` to define the artifact model, distinguish handoffs from Pi compaction and generic session summaries, and record the Branch Memory boundary as a technical storage locator rather than the normal user model.

Updated `docs/pi/README.md`, `docs/agent-resource-catalog.md`, and `ts/packages/pi-extensions/CONTEXT.md` to point at the artifact vocabulary. Updated the existing `brmem-handoff` and `brmem-pickup-handoff` skill surfaces to teach save/pickup handoff language while keeping `brmem` as the storage command. Updated the current Pi handoff extension descriptions, prompts, picker title, and notifications to use handoff save/pickup vocabulary without renaming the commands yet.

Validation: targeted `bun test ts/packages/pi-extensions/test/brmem-handoff.test.ts` passed; full `just ts-test` passed; `just ts-check` passed; `just dprint-check` passed after `just dprint-fix` formatted Markdown.

## Objective Impact

The first roadmap item is complete. The work partially advances the user-facing copy, Codex/Claude skill surface, and docs/catalog rows, but leaves the public command-name transition, focus behavior hardening, listing behavior, and final command inventory for later slices.

The "handoff" noun assumption is now more concrete: docs and skills tie it to directed future-you/future-agent/future-worktree continuation rather than a final interpersonal transfer. The Branch Memory recovery-detail question is narrowed: Branch Memory details should appear as compact technical locators after success, on error, or in recovery docs, with exact expanded/error formatting still to implement.

## Follow-Ups

- Choose exact non-`brmem` names and rename the handoff commands and skills, with explicit transition policy for old `brmem`-named handoff surfaces.
- Make the save flow enforce or prompt for a meaningful continuation focus when missing.
- Add current-branch and all-branch handoff listing with branch-visible output for all-branch mode.
- Run fresh Pi command and skill/instruction inventory after command-surface changes, not just this vocabulary slice.
