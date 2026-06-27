# Remove Pi flow wrapper edges

## Summary

Removed the obsolete Pi-owned flow wrapper modules for `sdl:flow:land` and `sdl:flow:pull-trunk`:

- Deleted `ts/packages/hosts/pi/src/flow/land.ts`.
- Deleted `ts/packages/hosts/pi/src/flow/trunk-pull.ts`.
- Deleted the Pi-only wrapper test `ts/packages/hosts/pi/test/trunk-pull.test.ts`.
- Added `ts/packages/ccc/test/trunk-pull.test.ts` so `@sdl/ccc` owns the `runTrunkPull` and `runTrunkPullCli` behavior coverage.

The user-visible flow commands remain available through `ts/packages/hosts/pi/src/flow/sdl-extension.ts`, which registers the `land` and `pull-trunk` entries through the SDL CLI extension path backed by project-local `.sdl/extensions/flow` command adapters.

Stale wrapper reference search after the change returns only Objective prose (this update's changed-file list plus a historical planning update); no code or test references to the deleted wrapper modules or exported Pi wrapper symbols remain.

Reduced Pi→CCC stale-edge grep after the change:

```bash
rg "@sdl/ccc" ts/packages/hosts/pi/src ts/packages/hosts/pi/package.json || true
```

Output no longer includes `flow/land.ts` or `flow/trunk-pull.ts`; remaining expected edges are:

```text
ts/packages/hosts/pi/package.json:    "@sdl/ccc": "workspace:*",
ts/packages/hosts/pi/src/cmux/focused-terminal-tab.ts:// Compatibility shim: @sdl/ccc owns focused cmux terminal-tab orchestration.
ts/packages/hosts/pi/src/cmux/focused-terminal-tab.ts:} from "@sdl/ccc/cmux/focused-terminal-tab";
ts/packages/hosts/pi/src/cmux/focused-terminal-tab.ts:} from "@sdl/ccc/cmux/focused-terminal-tab";
ts/packages/hosts/pi/src/objectives/extension.ts:import { registerObjectiveStackImplCommand } from "@sdl/ccc/objective-stack-impl";
ts/packages/hosts/pi/src/objectives/extension.ts:			"The public command is registered through @sdl/ccc, but exposed by the @sdl/pi Objective adapter.",
ts/packages/hosts/pi/src/parity/extension.ts: * package cycles. Direct @sdl/ccc command surfaces are not enforced here unless
ts/packages/hosts/pi/src/handoff/tab.ts:} from "@sdl/ccc/handoff-tab";
ts/packages/hosts/pi/src/branch-context/from-plan-commands.ts:} from "@sdl/ccc/branch-context-up-and-impl";
```

Validation run for this update:

```bash
pnpm --dir ts --filter @sdl/ccc test
pnpm --dir ts --filter @sdl/ccc check
pnpm --dir ts --filter @sdl/pi test
pnpm --dir ts --filter @sdl/pi check
pnpm --dir ts --filter sdl-flow test
pnpm --dir ts --filter sdl-flow check
just ts-format-check
just ts-lint
just ts-check
just ts-guard
just ts-deps-check
just ts-test
```

Results: all passed. `just ts-format-check` initially found formatting issues in the new CCC test file; `just ts-format-fix` was run, and the rerun passed.

## Objective Impact

This reduces the open Pi→CCC cycle-break stale-edge set by removing the old flow wrapper imports while preserving the public `/sdl:flow:*` command path through the active SDL flow extension registration.

The roadmap row `Separate risky slice: Pi→CCC cycle break` remains `[~]`, not complete. The expected remaining Pi→CCC edges are focused cmux terminal-tab, handoff-tab, branch-context upstack implementation, Objective stack registration, parity prose, and the `@sdl/ccc` manifest dependency in `@sdl/pi`.

No `@sdl/ccc` dependency was removed from `ts/packages/hosts/pi/package.json` in this slice because the remaining Pi→CCC imports still require it.

## Follow-Ups

- Continue the Pi→CCC cycle-break with focused cmux terminal-tab, handoff-tab, branch-context upstack implementation, and Objective stack registration as separate risk-managed slices.
- Do not mark the Pi→CCC row complete until `rg "@sdl/ccc" ts/packages/hosts/pi/src ts/packages/hosts/pi/package.json` is clean or only contains intentionally non-edge documentation outside the gate scope.
