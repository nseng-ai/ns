# Land Adapter Helper Promotion

## Summary

Flow's stack landing plan adapter has been split into smaller owner modules while preserving the public Flow command/API boundary:

- `landing-plan.ts` is now a small façade that loads Flow's landing shape, calls `sdl-land` planning through a Flow-created `LandContext`, and maps the result back to Flow's historical `LandingPlan` shape.
- Flow-only command argv helpers moved to `graphite-command-args.ts`; they remain private to Flow and are not exported by `sdl-land`.
- Flow-to-Land gateway construction and shell-backed boundary operations moved to `land-context-adapter.ts`.
- Land-to-Flow plan/failure compatibility mapping moved to `plan-mapping.ts` so user-facing Flow failure text remains owned by Flow.
- The pure submit-restack requirement planner is now exported from `sdl-land/api` as land-domain gateway vocabulary and covered by the Land API boundary test.

## Evidence

Validation run in this slice:

- `pnpm --dir ts --filter sdl-land run check`
- `pnpm --dir ts --filter sdl-land run test`
- `pnpm --dir ts --filter sdl-flow run check`
- `pnpm --dir ts --filter sdl-flow run test`
- `pnpm --dir ts --filter @sdl/ccc run test -- land-command`
- `just ts-format-check`
- `just ts-lint`
- `just ts-check`

Boundary searches:

- `rg -n "sdl-land" ts/packages/ccc -g '*.ts'` returned no results.
- `rg -n "capabilities/flow/src/land|capabilities/flow/src/land-stack" ts/packages/ccc ts/packages/capabilities/flow/src/api.ts ts/packages/capabilities/flow/package.json` returned no results.
- `rg -n "submitUpdateArgs|restackForSubmitArgs|restackTargetForSubmit|localBranchRef" ts/packages/capabilities/land -g '*.ts'` returned no results.

## Objective Impact

This advances the Flow land decomposition row by shrinking the Flow land-stack adapter and clarifying ownership around domain planning, Flow compatibility mapping, and command-shell helpers. The major roadmap rows remain open: merge execution, broader land command shell decomposition, and final Flow API/export cleanliness still need follow-up evidence before closure.
