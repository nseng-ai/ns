# Renamed CCC Public Command Prefix From `cmux:` to `ccc:`

## Summary

The CCC public Pi command prefix was renamed from `cmux:` to `ccc:` across the whole command surface, and the `@asdl/pi-extensions` cmux command-suite compatibility shims were removed. `ccc` now names the CCC orchestration layer's command surface, while `cmux` is reserved for the external workspace tool/domain.

Landed changes (commit `10892ce4` on `master`):

- Slash commands renamed: `/cmux:workspace:dispatch-plan|dispatch-prompt|open-branch` → `/ccc:workspace:*`, and `/cmux:sidebar:pr-summary|objective-summary` → `/ccc:sidebar:*`.
- The `cmux-sidebar` skill (and its `.agents`/`.claude`/`skills` symlinks) became `ccc-sidebar`.
- The `.pi/extensions/cmux.ts` discovery adapter became `.pi/extensions/ccc.ts`, exporting `registerCccExtension`; `ts/packages/ccc/src/cmux.ts` became `src/ccc.ts`, with exported `Cmux*` function/type names renamed to `Ccc*`.
- The `ASDL_CMUX_SIDEBAR_MODEL` environment variable became `ASDL_CCC_SIDEBAR_MODEL`, and the `pi:cmux-sidebar` status key became `pi:ccc-sidebar`.
- The `@asdl/pi-extensions` cmux command-suite compatibility shim modules and their covering test (`cmux-shims.test.ts`) were removed, along with the `./cmux/slot-open-branch` package export from `@asdl/ccc`. The handoff-tab `focused-terminal-tab.ts` shim and the lower `pi-launch.ts`/`primitives.ts`/`types.ts` modules under `ts/packages/pi-extensions/src/cmux/` remain.
- Context docs (`CONTEXT-MAP.md`, `ts/packages/ccc/CONTEXT.md`, `ts/packages/pi-extensions/CONTEXT.md`, `ts/packages/pi-extension-runtime/CONTEXT.md`) were updated to state that CCC-owned command surfaces use the `ccc` prefix and that `cmux` wording is reserved for the external tool.

## Objective Impact

This is a deliberate namespace decision that supersedes earlier durable guidance in this Objective:

- The previous Settled Default to "keep existing public slash-command namespaces for now" and treat a public `/ccc:*` namespace as a deferred future decision is superseded; the `/ccc:*` namespace is now adopted for the CCC workspace/sidebar suite.
- The earlier roadmap evidence that the cmux suite move "preserved public `/cmux:*` command names" remains historically accurate for that slice but no longer describes the current command surface.
- The parked "Public `/ccc:*` slash-command namespace or aliases" possibility has landed and is now recorded as completed Work.
- The assumption that public command stability outranked exposing a `/ccc:*` namespace has been revised accordingly.

The rename did not move any lower-package ownership into CCC and did not change the dependency direction: lower packages still do not import `@asdl/ccc`. It also removed cmux command-suite compatibility shims, advancing the earlier follow-up to retire `@asdl/pi-extensions` compatibility re-exports once legacy imports moved.

Evidence: landed on `master` in commit `10892ce4`; no `cmux:` command registrations remain (`rg "'cmux:(workspace|sidebar)'"` over `ts/` is empty); current registrations are `ccc:workspace:dispatch-plan|dispatch-prompt|open-branch` and `ccc:sidebar:pr-summary|objective-summary`; `.pi/extensions/ccc.ts` and `skills/ccc-sidebar/` are present and the `cmux` adapter/skill are gone. The rename's TypeScript/test validation rode with the landed commit; this Objective update only touched Markdown.

## Follow-Ups

- Retire the remaining `@asdl/pi-extensions` compatibility shims (`focused-terminal-tab.ts` and the lower `cmux/` primitives/types) when their last legacy importers move.
- Keep the remaining cross-domain orchestration moves (planned-branch up-and-impl, Objective stack implementation), source-control command/control, and worktree-status splitting on the existing roadmap; the rename does not change their scope.
