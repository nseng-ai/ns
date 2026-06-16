# CLI Parity and Workflow Cutover Landed

## Summary

The current roaster TypeScript stack now wires the user-facing CLI parity surfaces and the hidden automation commands. `roaster review list` / `ls` expose discovery with human and JSON output, applicable filtering, base-ref input, and the CI JSON fields. `roaster review run <key>` loads a review definition, resolves the model, loads the local diff, invokes the harness gateway, and emits the structured findings run envelope. The hidden `exec` subgroup wires `post-inline-findings`, `format-findings-comment`, and `post-findings-comment` through the roaster-local GitHub gateway and pure publication/inline modules.

The GitHub Actions workflow has also been flipped from the Python `uv run roaster` path to the TS runtime: discovery now calls `pnpm --dir ts exec roaster review list`, and review jobs call `roaster review run` plus the hidden `roaster exec` posting commands.

Evidence: current branch source contains `ts/packages/roaster/src/cli.ts`, `ts/packages/roaster/src/operations/cli-operations.ts`, scenario coverage in `ts/packages/roaster/test/scenario/review-cli.test.ts` and `ts/packages/roaster/test/scenario/exec-cli.test.ts`, and the updated `.github/workflows/roaster.yml`. Verification: `pnpm --dir ts --filter @asdl/roaster run test` and `pnpm --dir ts --filter @asdl/roaster run check` passed.

## Objective Impact

This completes the remaining local TS CLI parity roadmap rows for discovery, review execution, and hidden exec posting commands. The workflow cutover row is now in progress rather than not started: the YAML uses the TS CLI path, but the Objective still needs a green real-PR roaster CI run before considering the cutover proven.

The Objective is not ready to close because Python deletion remains gated on that green TS CI run, and the broader GitHub gateway risk remains open until changed-file loading, inline review creation, and summary-comment create/update are exercised by CI on a real PR.

## Follow-Ups

- Watch or trigger a real PR roaster workflow run and record whether discovery, per-review execution, inline posting, and summary-comment posting are green.
- If the TS workflow is green, update the Objective with that evidence and proceed to the gated Python package deletion slice.
- If the TS workflow fails, fix the cutover/runtime drift before deleting `packages/roaster`.
