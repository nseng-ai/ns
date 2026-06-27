# Remove focused cmux terminal-tab Pi to CCC edge

## Summary

Moved the focused cmux terminal-tab support helpers out of `@sdl/ccc` and into neutral `@sdl/pi/cmux/*` helper subpaths:

- Added `ts/packages/hosts/pi/src/cmux/command.ts` and exported it as `@sdl/pi/cmux/command`.
- Added `ts/packages/hosts/pi/src/cmux/gateway.ts` and exported it as `@sdl/pi/cmux/gateway`.
- Replaced the Pi focused-terminal-tab compatibility shim with the real implementation in `ts/packages/hosts/pi/src/cmux/focused-terminal-tab.ts`, exported as `@sdl/pi/cmux/focused-terminal-tab`.
- Repointed CCC consumers (`slot.ts`, `workspace-summary.ts`, `handoff-tab.ts`, `claude-plan-tab.ts`, and `slot-dispatch-plan.ts`) to import the neutral Pi cmux helper subpaths.
- Removed the old `@sdl/ccc/cmux/focused-terminal-tab` package export and deleted the former CCC-owned helper files: `command.ts`, `gateway.ts`, and `focused-terminal-tab.ts`.
- Moved cmux gateway tests from `ts/packages/ccc/test/cmux-gateway.test.ts` to `ts/packages/hosts/pi/test/cmux-gateway.test.ts` and deleted the obsolete Pi shim compatibility test.

The old CCC focused-terminal-tab subpath was removed outright by design rather than kept as a compatibility shim.

## Objective Impact

This completes the focused cmux terminal-tab portion of the Pi→CCC cycle-break slice. The stale-edge gate no longer reports `ts/packages/hosts/pi/src/cmux/focused-terminal-tab.ts`:

```text
$ rg "@sdl/ccc" ts/packages/hosts/pi/src ts/packages/hosts/pi/package.json || true
ts/packages/hosts/pi/package.json:    "@sdl/ccc": "workspace:*",
ts/packages/hosts/pi/src/parity/extension.ts: * package cycles. Direct @sdl/ccc command surfaces are not enforced here unless
ts/packages/hosts/pi/src/branch-context/from-plan-commands.ts:} from "@sdl/ccc/branch-context-up-and-impl";
ts/packages/hosts/pi/src/handoff/tab.ts:} from "@sdl/ccc/handoff-tab";
```

Deleted-surface checks confirm no remaining old CCC focused-terminal-tab import/export or CCC-local command/gateway imports:

```text
$ rg "@sdl/ccc/cmux/focused-terminal-tab|\"\./cmux/focused-terminal-tab\"" ts/packages/ccc/package.json ts/packages/ccc/src ts/packages/ccc/test ts/packages/hosts/pi/src ts/packages/hosts/pi/test || true

$ rg "from \"\./gateway\.ts\"|from \"\./command\.ts\"" ts/packages/ccc/src ts/packages/ccc/test || true
```

Validation passed:

- `pnpm --dir ts --filter @sdl/pi test` — 70 files / 911 tests passed.
- `pnpm --dir ts --filter @sdl/pi check` — passed.
- `pnpm --dir ts --filter @sdl/ccc test` — 15 files / 253 tests passed.
- `pnpm --dir ts --filter @sdl/ccc check` — passed.
- `just ts-format-check` — passed.
- `just ts-lint` — passed.
- `just ts-check` — passed.
- `just ts-guard` — passed.
- `just ts-deps-check` — passed.
- `just ts-test` — 352 files / 3403 tests passed.
- `just dprint-check` — passed.

## Follow-Ups

The broader Pi→CCC cycle-break row remains `[~]`. Remaining active `@sdl/pi` → `@sdl/ccc` work is handoff-tab, branch-context upstack implementation, parity prose/accounting, and final removal of the `@sdl/ccc` dependency from `ts/packages/hosts/pi/package.json` once runtime imports are gone.
