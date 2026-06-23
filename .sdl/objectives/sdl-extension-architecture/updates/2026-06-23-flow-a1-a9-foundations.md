# Flow A1+A9 foundations

## Semantic Update

The first flow capability-area consolidation row is implemented: exec failure-formatting and scratch/temp-file foundations now have project-local shared ownership without widening `@sdl/sdl/sdk`.

Changes landed:

- Added `@sdl/sdl/temp-files` as a narrow internal-migration export over `@sdl/core/temp-files`; it is not public SDK author API.
- Added `.sdl/extensions/flow/src/shared/scratch.ts` so flow commands route scratch/temp-file lifecycle through a project-local helper.
- Added `.sdl/extensions/flow/src/shared/command-output.ts` for the shared command-failure/details formatting used by `regenerate-pr` and the existing worktree/autobranch helper path.
- Updated `regenerate-pr` and `worktree.ts` to use those helpers while preserving existing failure-message shapes.
- Surgically cleaned the checked-in submit bundle: removed the local `node:child_process` / `spawn` runner, required injected runners for bundled real gateways, and routed feasible PR-body/checkpoint temporary files through `withFlowTemporaryFile`.
- Left `writeSubmitFailureRawLog()` local because it writes durable submit failure logs, not scratch files.

Validation evidence:

- `pnpm --dir ts run lint`
- `pnpm --dir ts/packages/sdl run check`
- `pnpm --dir ts run test -- packages/sdl/test/unit/extension-shared-flow-foundations.test.ts packages/sdl/test/scenario/submit-cli.test.ts packages/sdl/test/scenario/regenerate-pr-cli.test.ts packages/sdl/test/scenario/autobranch-cli.test.ts packages/sdl-core/test/temp-files.test.ts` (Vitest selected the workspace suite; all passed)

Roadmap state:

- Marked A1+A9 complete.
- Updated the readiness matrix to record submit's spawn removal, the flow-shared formatter, and scratch lifecycle's internal-export + flow-shared rung.
- No follow-up is needed for this row beyond later planned rows that make submit readable and may fold its remaining specialized error rendering into shared seams when that is semantically safe.
