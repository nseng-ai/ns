# Branch Context Pi Package Edge Removed

## Summary

The second implementation slice removed the remaining `@sdl/branch-context` → `@sdl/pi` package edge and tightened the dependency-cycle guard. `ts/packages/branch-context/package.json` no longer declares `@sdl/pi`, the pnpm lockfile is in sync, and the deferred Extension Dependency Graph component now excludes `@sdl/branch-context`.

Guard adversarial coverage was updated so Branch Context/Pi cycle inclusion is rejected rather than grandfathered, while the remaining legacy `@sdl/autobranch` / `@sdl/pi` / `@sdl/sdl` cycle tolerance still behaves as intended.

Validation evidence:

- Cancelled runner session inspected before retry: `/var/folders/9r/wfby6pcs4mgbfb_lg0ndgb180000gn/T/pi-runner-subagents/session-hRsO6Y/522af319-021f-4a50-b0a4-5623e98a117a.jsonl`
- Completing runner session: `/var/folders/9r/wfby6pcs4mgbfb_lg0ndgb180000gn/T/pi-runner-subagents/session-6VFqPl/8f987ea3-f72b-4aeb-88e4-fb2a4208636c.jsonl`
- `rg -n "@sdl/pi" ts/packages/branch-context ts/packages/branch-context/package.json` — no matches.
- `just ts-guard` — passed.
- `pnpm --dir ts --filter @sdl/branch-context run check` — passed.
- `pnpm --dir ts --filter @sdl/branch-context run test` — 9 files / 123 tests passed.

## Objective Impact

This completes the manifest-edge and guardrail slice. Together with the command-surface migration, Branch Context no longer imports, exports, or declares Pi-owned command-surface code, and the style guard no longer tolerates Branch Context inside the legacy autobranch/pi/sdl cycle.

## Follow-Ups

- Document the final Branch Context Capability API vs Pi/CCC presentation boundary.
- Run broader validation after documentation and parent tracking are complete.
- Record parent Objective evidence so `sdl-extension-architecture` can treat Branch Context's de-Pi boundary as complete or closure-ready.
