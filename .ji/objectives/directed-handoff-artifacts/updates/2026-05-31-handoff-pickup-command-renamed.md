# Handoff Pickup Command Renamed

## Summary

Renamed the project-local Pi pickup surface from `/handoff:load` to `/handoff:pickup` while retaining the portable `handoff-load` skill name for non-Pi agents. Updated source, tests, docs, skills, and Objective tracking to use save/pickup/list language for normal handoff UX.

## Evidence

Fresh Pi RPC `get_commands` evidence reported `handoff:create`, `handoff:pickup`, and `handoff:list` from `.pi/extensions/handoff.ts`. It reported no `handoff:load`, `brmem-handoff`, or `brmem-pickup-handoff` command.

## Validation

- `bun test ts/packages/pi-extensions/test/handoff.test.ts` passed.
- `just ts-check` passed.
- `just dprint-check` passed after `just dprint-fix` formatted Markdown tables.
- `just ts-test` passed.
- `git diff --check` passed.
