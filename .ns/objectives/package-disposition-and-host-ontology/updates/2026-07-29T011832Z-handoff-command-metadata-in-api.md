# Handoff Command-Backed Skill Metadata Moves Behind `/api`

## Summary

Step 1 of the Handoffs extraction sequence in `references/handoffs-launch-boundary.md` is implemented. The stable create/pickup command-name derivation and `handoffCommandBackedSkillRegistrations` now live under Handoffs core ownership (`handoffs/src/core/command-metadata.ts`) and are exported from `@nseng-ai/handoffs/api`. Skill Exposure's replacement registry imports the metadata from `/api` instead of `@nseng-ai/handoffs/pi`.

Additive discipline (implementation stack order 5) is honored: the `./pi` barrel still re-exports `handoffCommandBackedSkillRegistrations`, `CREATE_HANDOFF_COMMAND_NAME`, and `PICKUP_HANDOFF_COMMAND_NAME` unchanged; the Pi subpackage's list/self command names and other runtime presentation constants remain Pi-owned; no Pi types entered `/api`.

## Evidence

- Focused API tests in `handoffs/test/unit/api.test.ts` cover the command-backed metadata contract (stable `ns:handoff:create`/`ns:handoff:pickup` surfaces and the two `specialized-command` registrations).
- `rg '@nseng-ai/handoffs/pi'` shows no Skill Exposure consumer; remaining importers are Pi host surfaces (pi-runtime parity, Herdr's Pi adapter, Handoffs' own Pi modules) addressed by later extraction steps.
- `just` passes (typecheck, full Vitest suite, objective edge sweep).

## Objective Impact

This anchors the Skill Exposure runtime edge on the harness-independent API before the Handoffs Pi surface leaves the package, unblocking step 2 (create `@nseng-ai/pi-ns-handoffs`) without a cross-package `/pi` dependency to migrate.

## Follow-Ups

- Step 2: move `handoffs/src/pi/` and its Pi tests into `@nseng-ai/pi-ns-handoffs`, repointing relative domain imports to `/api`.
- Steps 3–4: repoint discovery/parity ownership, then cut the Handoffs `./pi*` exports and Pi Runtime coupling.
