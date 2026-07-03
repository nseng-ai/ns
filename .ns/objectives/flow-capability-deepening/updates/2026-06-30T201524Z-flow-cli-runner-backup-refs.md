# Flow CLI Runner and Backup Ref Namespace Renamed

## Summary

Flow's remaining CCC-era helper and backup-ref names were removed from current Flow code/tests:

- Renamed `ts/packages/capabilities/flow/src/shared/ccc-cli.ts` to `ts/packages/capabilities/flow/src/shared/flow-cli-runner.ts`.
- Renamed helper symbols from `FlowCcc*`, `runFlowCcc*`, and `createFlowCcc*` to Flow-owned `FlowCli*`, `runFlowCli*`, and `createFlowCli*` names.
- Updated Flow command callers and helper tests to use the new Flow CLI runner path and names.
- Renamed land backup refs from `refs/ccc/land-backup*` to `refs/sdl/flow-land-backup*` in constants and test expectations.
- Applied the breaking persisted-ref rename without compatibility aliases, migration, fallback reads, or dual-write behavior by explicit plan decision.
- Corrected stale comments that described Flow autoslot/land behavior as CCC-owned while preserving still-true CCC consumer-boundary language around `sdl-flow/api`.

Validation evidence:

- `pnpm --dir ts exec vitest run packages/capabilities/flow/test/unit/extension-shared-flow-cli-runner.test.ts packages/capabilities/flow/test/unit/land-stack-command-scenarios.test.ts packages/capabilities/flow/test/unit/land-stack-topology-guards.test.ts` passed.
- `pnpm --dir ts --filter sdl-flow run check` passed.
- `pnpm --dir ts --filter sdl-flow run test` passed.
- `pnpm --dir ts run check` passed.
- `pnpm --dir ts run lint` passed.
- `dprint check .sdl/objectives/flow-capability-deepening/roadmap.md .sdl/objectives/flow-capability-deepening/orientation.md .sdl/objectives/flow-capability-deepening/updates/2026-06-30T201524Z-flow-cli-runner-backup-refs.md` passed.
- Boundary search for stale `refs/ccc`, `ccc-cli`, `FlowCcc`, `runFlowCcc`, `createFlowCcc`, and ownership phrases found no matches in current Flow/Land code/tests/docs.

## Objective Impact

This completes the roadmap row “Resolve CCC-era naming residue in Flow” for current code/tests/docs. Remaining CCC mentions are intentional compatibility-consumer or boundary references: CCC may consume `sdl-flow/api`, but it does not own/import Flow private internals or direct `sdl-land` presentation.

## Follow-Ups

- Keep final API/export cleanliness rebaseline open; verify no helper leaks through `sdl-flow/api` or package exports.
- Do not reintroduce fallback behavior for the old `refs/ccc/...` backup namespace unless a future explicit compatibility decision reverses this breaking cleanup.
