# Neutralized Objective runner-usage dependency

## Summary

The runner-usage neutralization slice is complete as an independently reviewable branch.

Implementation evidence:

- `ts/packages/sdl-core/src/runner-usage.ts` now owns the runner-subagent JSONL parser/totals primitive and `ts/packages/sdl-core/package.json` exposes it as `@sdl/core/runner-usage`.
- `ts/packages/sdl-core/test/runner-usage.test.ts` now owns the parser/totals tests that previously lived under Pi.
- `ts/packages/objective/src/operations/runner-subagent-usage.ts` and `ts/packages/pi/src/runner-subagents/extension-usage.ts` import parser/totals helpers from `@sdl/core/runner-usage`.
- `ts/packages/pi/src/runner-subagents/usage.ts` remains only as a compatibility re-export for the existing neutral Pi helper subpath.
- `ts/packages/objective/package.json` no longer declares `@sdl/pi`.
- `ts/pnpm-lock.yaml` was refreshed after the manifest dependency removal.

Stale-edge gate:

```bash
rg "@sdl/pi" ts/packages/objective/src ts/packages/objective/package.json
```

Result: no matches.

Validation passed:

```bash
pnpm --dir ts --filter @sdl/core test
pnpm --dir ts --filter @sdl/pi test
pnpm --dir ts --filter @sdl/objective test
pnpm --dir ts run check
just ts-deps-check
just ts-guard
```

## Objective Impact

- Marks the roadmap row "Bottom slice: runner-usage neutralization" complete.
- Removes the concrete `@sdl/objective` → `@sdl/pi` dependency that would otherwise block later Pi imports of the expanded Objective Capability API.
- De-risks the runner-usage ownership ambiguity by making the primitive neutral infrastructure under `@sdl/core`, while preserving a Pi compatibility re-export for existing helper consumers.
- Leaves the Objective API relocation, consumer repoint, and Pi→CCC cycle-break slices open and separately reviewable.

## Follow-Ups

- Continue with the Objective API relocation slice: move Objective list/picker/selection/prompt domain logic out of `@sdl/pi/objectives/*` into `@sdl/objective/api` while keeping Pi command/presentation shells thin.
- During relocation, keep the stale gate `rg "@sdl/pi" ts/packages/objective/src ts/packages/objective/package.json` clean so the Objective capability does not regain a Presentation Host dependency.
- Repoint `ccc` and `sdlcc` only after the Objective API exports the selection/list helpers they need.
