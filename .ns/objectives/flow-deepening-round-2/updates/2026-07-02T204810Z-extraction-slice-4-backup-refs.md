# Extraction slice 4 landed — backup refs onto LandGitGateway

## Summary

Fourth autonomous slice of the extraction migration row (runner step,
commit `1df170eb6` on `flow-map-slice4-backup-refs-gateway`, stacked on
`flow-map-slice3-isolated-fast-path-gateway`).

- `snapshotBackupRefs` added to `LandGitGateway` (`land/types.ts`) — the
  one gateway-interface addition the map names for this slice — with the
  in-memory fake extended in `land/testing.ts`.
- Backup-ref rotate/prune/write execution moved from
  `land-stack/backup-refs.ts` into the gateway backend in
  `land-context-adapter.ts`; stack merge preparation now calls
  `context.git`. `backup-refs.ts` retains only the recovery hint.
- Mutation argv freeze held with zero relaxation: neither scenario
  assertion file (flow `land-stack-command-scenarios.test.ts`, ccc
  `land-command.test.ts`) is in the diff — the backend emits identical
  commands and the existing byte-for-byte pins pass unchanged.

Slice gate held: full Definition of Progress suite (including plain
`just`) reported green by the step; parent re-verified flow
(47 files / 421 tests) and `just ts-check`. `sdl-flow/api` untouched.

## Objective Impact

- Slice 4 of 10 done, in map order. `LandGitGateway` now has its first
  ref-mutation operation, closing another of the inventory's
  mutation-side gateway gaps.
- Next is slice 5 (pre-merge submit/restack through the Graphite
  gateway): make the `prepareSubmitUpdate`/`prepareRestackForSubmit`
  no-op stubs real, backed by the operation-shaped command channel per
  the settled progress-reporting decision, removing the second
  mid-execution `LandContext` crossing in `pre-merge-submit.ts`.

## Follow-Ups

- Continue the migration row at map slice 5.
