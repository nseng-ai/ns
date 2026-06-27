# Remove Objective stack registration Pi to CCC edge

## Summary

Moved `/objective:stack-impl` registration into the Pi Objective extension and removed the stale CCC-owned command-registration surface.

Files changed:

- `ts/packages/hosts/pi/src/objectives/extension.ts` now owns `/objective:stack-impl` registration directly, still using `registerCommandWithImmediateAck`, Objective-owned selection helpers, and the same skill/fallback prompt behavior.
- `ts/packages/ccc/package.json` no longer exports `./objective-stack-impl`.
- Deleted `ts/packages/ccc/src/objective-stack-impl.ts` and `ts/packages/ccc/test/objective-stack-impl.test.ts`.
- Updated this Objective roadmap to record the slice and remove Objective stack registration from remaining Pi→CCC work.

## Objective Impact

This completes the Objective stack registration portion of the Pi→CCC cycle-break row without changing the public command name or intended command behavior. Explicit `/objective:stack-impl <slug-or-path>` still bypasses Objective list/git evidence; empty args still use the active-Objective picker; missing `objective-stack-impl` skill still falls back to the same fallback prompt.

The stale CCC subpath was removed outright by design instead of being kept as a compatibility shim.

Post-change stale-edge grep:

```text
$ rg "@sdl/ccc" ts/packages/hosts/pi/src ts/packages/hosts/pi/package.json || true
ts/packages/hosts/pi/package.json:    "@sdl/ccc": "workspace:*",
ts/packages/hosts/pi/src/cmux/focused-terminal-tab.ts:// Compatibility shim: @sdl/ccc owns focused cmux terminal-tab orchestration.
ts/packages/hosts/pi/src/cmux/focused-terminal-tab.ts:} from "@sdl/ccc/cmux/focused-terminal-tab";
ts/packages/hosts/pi/src/cmux/focused-terminal-tab.ts:} from "@sdl/ccc/cmux/focused-terminal-tab";
ts/packages/hosts/pi/src/parity/extension.ts: * package cycles. Direct @sdl/ccc command surfaces are not enforced here unless
ts/packages/hosts/pi/src/branch-context/from-plan-commands.ts:} from "@sdl/ccc/branch-context-up-and-impl";
ts/packages/hosts/pi/src/handoff/tab.ts:} from "@sdl/ccc/handoff-tab";
```

Deleted-surface search:

```text
$ rg "./objective-stack-impl|@sdl/ccc/objective-stack-impl|registerObjectiveStackImplCommand" ts/packages/ccc ts/packages/hosts/pi ts/packages/objective || true
# no output
```

Validation run:

- `pnpm --dir ts --filter @sdl/pi test` — passed, 70 files / 902 tests.
- `pnpm --dir ts --filter @sdl/pi check` — passed.
- `pnpm --dir ts --filter @sdl/ccc test` — passed, 16 files / 263 tests.
- `pnpm --dir ts --filter @sdl/ccc check` — passed.
- `just ts-format-check` — passed.
- `just ts-lint` — passed.
- `just ts-check` — passed.
- `just ts-guard` — passed.
- `just ts-deps-check` — passed.
- `just ts-test` — passed, 353 files / 3404 tests.
- `just dprint-check` — passed.

## Follow-Ups

The Pi→CCC row remains `[~]`. Remaining known edges are focused cmux terminal-tab, handoff-tab, branch-context upstack, parity prose, and the Pi package manifest dependency on `@sdl/ccc` until those imports are removed.
