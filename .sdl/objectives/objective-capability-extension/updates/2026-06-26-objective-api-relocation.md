# Relocated Objective Pi domain helpers into @sdl/objective/api

## Summary

The Objective API relocation slice is complete as an independently reviewable branch.

Implementation evidence:

- New Objective-owned modules hold the relocated domain surface:
  - `ts/packages/objective/src/objective-list-json.ts` for Objective list JSON data parsing.
  - `ts/packages/objective/src/objective-picker.ts` for changed-objective path parsing, changed-first ordering, choice labels, and picker title policy.
  - `ts/packages/objective/src/objective-selection.ts` for Objective skill prompt construction and changed-selection notification basis.
  - `ts/packages/objective/src/objective-cli-args.ts` for `/objective:list` argument parsing and completion policy.
  - `ts/packages/objective/src/objective-candidates.ts` for Objective candidate JSON parsing and completion item construction.
  - `ts/packages/objective/src/objective-command-specs.ts` for Objective command specs consumed by the Pi shell.
- `ts/packages/objective/src/api.ts` now exports these named helpers from the curated `@sdl/objective/api` Capability API.
- Pi remains the runtime/presentation shell:
  - `ts/packages/pi/src/objectives/list.ts` unwraps the existing Pi machine envelope and delegates Objective list data parsing to `@sdl/objective/api`.
  - `ts/packages/pi/src/objectives/picker.ts` is a compatibility re-export for the existing Pi helper subpath.
  - `ts/packages/pi/src/objectives/selection.ts` keeps Pi `CommandContext`, `waitForIdle`, host command execution, and UI selection/notification adaptation while consuming Objective-owned prompt/policy helpers.
  - `ts/packages/pi/src/objectives/extension.ts` keeps command registration, immediate acknowledgement, notifications, `sendMessage`, skill expansion, autocomplete wiring, and presentation while consuming Objective-owned command specs, list-arg policy, and candidate parsing.
- Pure/domain tests moved from Pi into Objective unit tests; Pi tests now focus on envelope parsing and Pi behavior. `sdlcc` and `ccc` test fixtures were updated for the current Objective list record shape, without repointing production consumer imports yet.
- `ts/packages/pi/package.json` now depends on `@sdl/objective` because Pi compatibility shells consume the Capability API; `@sdl/objective` still does not depend on `@sdl/pi`.

Stale-edge gates and boundary checks:

```bash
rg "@sdl/pi" ts/packages/objective/src ts/packages/objective/package.json
```

Result: no matches.

No Pi `runtime/machine-envelope` module was moved or re-exported into Objective; machine-envelope unwrapping remains in Pi.

Validation passed:

```bash
pnpm --dir ts --filter @sdl/objective test
pnpm --dir ts --filter @sdl/pi test
pnpm --dir ts --filter sdlcc test
pnpm --dir ts --filter @sdl/ccc test
pnpm --dir ts run check
just ts-format-check
just ts-lint
just ts-deps-check
just ts-guard
just ts-test
```

## Objective Impact

- Marks the roadmap row "Objective API relocation slice" complete.
- Establishes the Objective-owned helper exports that the next consumer-repoint slice can import directly from `@sdl/objective/api`.
- Keeps the dependency direction acyclic for this part of the graph: Pi may consume Objective's Capability API for its compatibility shells, while Objective has no Pi import or manifest dependency.
- Narrows the remaining open Objective work to the consumer repoint slice, the later Pi→CCC cycle break, and parked acyclicity-guard/context-documentation follow-ups.

## Follow-Ups

- Continue with the consumer repoint slice: change `ccc` and `sdlcc` production/test imports from `@sdl/pi/objectives/*` to `@sdl/objective/api`, then clean package manifests.
- Gate that slice with `rg "@sdl/pi/objectives" ts/packages` and relevant `ccc`/`sdlcc`/Pi/Objective validation.
- Keep Pi→CCC cycle-break work out of the consumer repoint branch unless a narrowly necessary import move is required only to preserve the repoint.
