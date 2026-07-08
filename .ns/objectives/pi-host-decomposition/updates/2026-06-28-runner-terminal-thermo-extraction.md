# Runner, Terminal, and Thermo Council Extraction

## Summary

This slice extracted the remaining planned Pi-native tool candidate `thermo-council` into `ts/packages/pi-tools/thermo-council/` as private package `@sdl/pi-thermo-council`, and dispositioned the runner/terminal boundary with implementation evidence.

`@sdl/pi-runner-subagents` now owns the model-visible `forked_pi_agent` dispatch tool, curated context preparation, focused widget behavior, and package-local tests. The shared runner runtime/process/JSON-event/presentation helpers remain in `@sdl/pi` as intentional neutral `@sdl/pi/runner-subagents*` helper subpaths because host runtime, investigate, thermo-council, and host runner tests still consume them. `terminal/layout` and `terminal/presentation` remain intentional neutral host helper subpaths because existing workspace consumers already use them through `@sdl/pi/terminal/*` and extracting them would add broad churn without improving acyclicity.

`@sdl/pi-thermo-council` owns the `/thermo-council` command implementation, source, focused tests, and package-local parity metadata. Its package depends on `@sdl/pi-runner-subagents` for runner-facing APIs and on neutral `@sdl/pi/...` helper/runtime subpaths for LM JSON, parity, and runtime type surfaces. The project-local `.pi/extensions/thermo-council.ts` and `.pi/extensions/dispatch-runner-subagent.ts` adapters import package source entrypoints directly, preserving the no host-to-tool dependency direction.

Validation evidence from this slice:

- `pnpm --dir ts --filter @sdl/pi-runner-subagents run check`
- `pnpm --dir ts --filter @sdl/pi-runner-subagents run test`
- `pnpm --dir ts --filter @sdl/pi-thermo-council run check`
- `pnpm --dir ts --filter @sdl/pi-thermo-council run test`
- `pnpm --dir ts exec vitest run packages/hosts/pi/test/parity.test.ts`
- `pnpm --dir ts run check`
- `pnpm --dir ts run test`
- `just ts-deps-check`
- `just ts-guard`
- `just ts-format-check`
- `just ts-lint`
- `just dprint-check`
- `git diff --check`
- `just`

## Objective Impact

This completes the `thermo-council` portion of the row applying the reference Pi-tool extraction recipe, and completes the runner/terminal disposition row:

- `@sdl/pi-thermo-council` proves the recipe still works when a tool composes another extracted Pi-tool package plus neutral host helpers.
- `@sdl/pi-runner-subagents` proves the runner boundary is split rather than all-or-nothing: dispatch behavior can move above the host while runtime primitives remain neutral host surfaces.
- `terminal` is now an evidence-backed neutral host helper surface, not a pending extraction candidate for this Objective.
- `@sdl/pi` does not import `@sdl/pi-runner-subagents` or `@sdl/pi-thermo-council`; package/dependency guards and targeted `rg` inspections found no host-to-tool dependency inversion and no extracted-package deep import of `ts/packages/hosts/pi/src/**`.
- `ts/packages/hosts/pi/CONTEXT.md` and `CONTEXT-MAP.md` now record the new package convention evidence, package inventory, and runner/terminal neutral-surface dispositions.

## Follow-Ups

- Continue the Objective through the capability-mirror thinning lane for Handoff, Branch Context, PR feedback, Objective, Plans-adjacent, and related Pi surfaces.
- Rebaseline remaining `@sdl/pi` exports after capability-mirror thinning; the Pi-tool package convention is updated, but final host export cleanup is not closed.
- Do not further extract runner runtime/process/JSON-event or terminal layout/presentation helpers unless new evidence shows a smaller acyclic support home without broad churn.
