# Recorded partial Pi to CCC cycle-break progress

## Summary

The current branch `pi-ccc-package-edge-break` contains material Objective progress above Graphite parent `ccc-objective-selection-adapter-repoint`, but the Pi→CCC cycle break is not complete.

Current-branch commits considered:

- `276a7b270` `Move worktree status lifecycle into the Pi host`
- `7532074f8` `Simplify Pi worktree status wiring`

Durable tracking changes:

- Marked the `Separate risky slice: Pi→CCC cycle break` roadmap row in-progress (`[~]`) instead of untouched.
- Recorded that the worktree-status edge is the first partial cycle-break target: `ts/packages/hosts/pi/src/worktree-status/extension.ts` now owns Pi host lifecycle/refresh wiring and exports `WORKTREE_STATUS_UI_KEY`; `ts/packages/hosts/pi/src/worktree-status/types.ts` owns host-local status/renderer contracts; `.pi/extensions/worktree-status.ts` re-exports the Pi host adapter directly.
- Recorded the remaining stale edge: `ts/packages/hosts/pi/src/worktree-status/{extension,footer-format}.ts` still import `@sdl/ccc/worktree-status`, so worktree-status is only partially reduced.
- Corrected the consumer-repoint narrative for current checkout ground truth: `objectiveSelectionContextFromCommandContext` is now exported from `@sdl/objective/api` with `ts/packages/objective/test/unit/selection-context.test.ts`, and CCC imports Objective selection helpers from the Capability API rather than from `@sdl/pi/objectives/*` or a CCC-local adapter.

Stale-edge evidence gathered during this update:

```bash
rg "@sdl/pi/objectives" ts/packages
```

Result: no matches.

```bash
rg "@sdl/pi" ts/packages/objective/src ts/packages/objective/package.json
```

Result: no matches.

```bash
rg "@sdl/ccc" ts/packages/hosts/pi/src ts/packages/hosts/pi/package.json
```

Result: still reports `@sdl/ccc` in `ts/packages/hosts/pi/package.json`, worktree-status, focused cmux terminal-tab, land/trunk-pull, handoff-tab, branch-context upstack, and Objective stack registration.

No package validation was rerun during this tracking update; the update records local committed branch evidence and stale-edge greps only.

## Objective Impact

- The Objective remains open: the Pi→CCC cycle-break completion criterion is not satisfied because `@sdl/pi` still imports and declares `@sdl/ccc`.
- The next semantic slice should continue the Pi→CCC cycle break from the partially reduced worktree-status edge, preferably finishing or relocating the remaining `@sdl/ccc/worktree-status` imports before moving to unrelated CCC imports.
- Parked acyclicity guard and final context documentation remain parked until the package graph is actually acyclic.

## Follow-Ups

- Finish the worktree-status edge by removing `@sdl/ccc/worktree-status` imports from `ts/packages/hosts/pi/src/worktree-status/extension.ts` and `footer-format.ts`, or explicitly choose a different Pi-owned/neutral home if the remaining helpers should not live in Pi.
- Re-run the stale gate `rg "@sdl/ccc" ts/packages/hosts/pi/src ts/packages/hosts/pi/package.json` after each edge removal and record the reduced match set.
- Run targeted Pi/CCC tests and TypeScript validation before treating the slice as keepable.
