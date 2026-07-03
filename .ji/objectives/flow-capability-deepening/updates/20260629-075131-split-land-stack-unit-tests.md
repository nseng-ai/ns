# Split Land-Stack Unit Tests

## Summary

The relocated Flow land-stack unit coverage was split out of the oversized catch-all `land-stack.test.ts` file into focused Flow-owned unit test files:

- `land-stack-helpers.test.ts`
- `land-stack-pr-facts.test.ts`
- `land-stack-command-scenarios.test.ts`
- `land-stack-topology-guards.test.ts`
- `land-stack-snapshot.test.ts`

The split was intentionally mechanical: existing assertions and command scripts were preserved, runtime source and `sdl-flow/api` were not widened, and the real Graphite integration test stayed in the integration lane.

Validation evidence recorded for this slice:

- `pnpm --dir ts --filter sdl-flow run test` passed.
- `pnpm --dir ts --filter sdl-flow run check` passed.
- `just ts-format-check` passed after `just ts-format-fix` formatted moved files.
- `just ts-lint` passed.
- `just ts-check` passed.
- Boundary searches showed CCC still imports Flow through `sdl-flow/api` and did not gain private Flow land-stack imports.

## Objective Impact

This completes the first roadmap row, “Split relocated land-stack tests into Flow-owned focused files.” The row is now marked complete in `roadmap.md` with the file split and validation/search evidence.

The larger command-scenario cluster remains intentionally broad after the mechanical split. That is acceptable for this row and gives the later fake-driven land-stack domain seam a clearer, Flow-local test cluster to mine.

## Follow-Ups

- Use the still-large `land-stack-command-scenarios.test.ts` cluster to shape the next domain seam instead of extracting broad abstractions up front.
- Continue to keep `sdl-flow/api` narrow and Flow-private land-stack imports confined to Flow tests while decomposing runtime orchestration.
