# Remove handoff-tab Pi to CCC edge

## Summary

Moved handoff-tab launch orchestration out of `@sdl/ccc` and into Pi-owned handoff code:

- Added `ts/packages/hosts/pi/src/handoff/tab-launch.ts` as the Pi-owned home for `launchHandoffTab`, `formatHandoffTabLaunchSuccess`, launch result/types, progress updates, status clearing, cmux focused-tab launch composition, and Pi command construction.
- Repointed `ts/packages/hosts/pi/src/handoff/tab.ts` to import the launch helper from `./tab-launch.ts` instead of `@sdl/ccc/handoff-tab` while preserving `/ccc:handoff-tab` and `handoff_tab_launch` behavior.
- Moved direct launch-helper coverage into `ts/packages/hosts/pi/test/handoff-tab-launch.test.ts`, including successful launch, `surface_ref` / `workspace_ref` output, rename/send manual recovery, provider/model propagation, explicit high thinking propagation, and host-without-`getThinkingLevel` defaulting to `medium`.
- Updated `ts/packages/hosts/pi/test/handoff-test-fakes.ts` so the Pi fake can store a mutable thinking level for launch-command assertions.
- Removed the old `@sdl/ccc/handoff-tab` package export and deleted `ts/packages/ccc/src/handoff-tab.ts` plus `ts/packages/ccc/test/handoff-tab-launch.test.ts`.

The stale CCC handoff-tab subpath was deleted outright by design rather than kept as a CCC→Pi compatibility shim; SDL is private/unreleased and the only production consumer was Pi handoff code.

## Objective Impact

This completes the handoff-tab portion of the Pi→CCC cycle-break row without changing the public `/ccc:handoff-tab` command name or the model-visible `handoff_tab_launch` tool contract. Verification ordering, pickup command shape, focused cmux tab title, progress/status text, manual recovery wording, and provider/model/thinking propagation remain covered in Pi-owned tests.

Post-change stale-edge grep:

```text
$ rg "@sdl/ccc" ts/packages/hosts/pi/src ts/packages/hosts/pi/package.json || true
ts/packages/hosts/pi/package.json:    "@sdl/ccc": "workspace:*",
ts/packages/hosts/pi/src/branch-context/from-plan-commands.ts:} from "@sdl/ccc/branch-context-up-and-impl";
ts/packages/hosts/pi/src/parity/extension.ts: * package cycles. Direct @sdl/ccc command surfaces are not enforced here unless
```

Deleted-surface search:

```text
$ rg "@sdl/ccc/handoff-tab|\"\./handoff-tab\"" ts/packages/ccc ts/packages/hosts/pi || true
# no output
```

Validation passed:

- `pnpm --dir ts --filter @sdl/pi test` — passed, 71 files / 916 tests.
- `pnpm --dir ts --filter @sdl/pi check` — passed.
- `pnpm --dir ts --filter @sdl/ccc test` — passed, 14 files / 248 tests.
- `pnpm --dir ts --filter @sdl/ccc check` — passed.
- `just ts-format-check` — initially found formatting in the new Pi test; `just ts-format-fix` was run and the rerun passed.
- `just ts-lint` — passed.
- `just ts-check` — passed.
- `just ts-guard` — passed.
- `just ts-deps-check` — passed.
- `just ts-test` — passed, 352 files / 3403 tests.
- `just dprint-check` — passed.

## Follow-Ups

The broader Pi→CCC cycle-break row remains `[~]`. Remaining active `@sdl/pi` → `@sdl/ccc` work is branch-context upstack implementation, parity prose/accounting, and final removal of the `@sdl/ccc` dependency from `ts/packages/hosts/pi/package.json` once runtime imports are gone.
