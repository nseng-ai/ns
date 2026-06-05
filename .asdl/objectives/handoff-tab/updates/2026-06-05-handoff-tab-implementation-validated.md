# Handoff Tab Implementation Validated

## Summary

Implemented and validated the `/handoff-tab` v1 flow in the project-local Pi handoff extension.

The extension now registers:

- `/handoff-tab <continuation focus>`
- model-visible deterministic tool `handoff_tab_launch`

The command side resolves the continuation focus, current branch, derived slug, Branch Memory collision status, and cmux caller context before queueing an exact handoff-save prompt. The prompt pins the branch, namespace, key, slug, and requires the current Pi to call `handoff_tab_launch` only after `brmem put` succeeds.

The tool side verifies the saved handoff exists before touching cmux, then creates a focused terminal surface, renames the tab to `handoff: <slug>`, and sends a Pi launch command for:

```text
/handoff:pickup --branch <branch> <slug>
```

## Validation

Focused handoff tests:

```bash
bun test ts/packages/pi-extensions/test/handoff.test.ts
```

Result: 38 pass, 0 fail.

Package typecheck:

```bash
bun run --cwd ts/packages/pi-extensions check
```

Result: `tsc --noEmit -p tsconfig.json` passed.

Full package tests:

```bash
bun run --cwd ts/packages/pi-extensions test
```

Result: 625 pass, 0 fail.

## Behavior Covered

Regression tests now cover:

- registration of `/handoff-tab` and `handoff_tab_launch` alongside existing handoff commands;
- concise flat semantic slug derivation;
- exact handoff-tab prompt branch/key/slug/tool-call identity;
- slug collision stopping before cmux or save prompt;
- outside-cmux failure stopping before save prompt;
- launch tool happy path through `brmem check`, `cmux identify`, `cmux --json new-surface`, `cmux rename-tab`, and `cmux send`;
- missing saved handoff stopping before cmux;
- rename failure recovery copy after surface creation;
- send/Pi-launch-request failure recovery copy after surface creation.

## Notes

The implementation keeps v1 as the accepted two-phase command/tool flow. It does not supervise the launched Pi process after `cmux send`; successful send is treated as “launch requested,” matching the Objective scope.
