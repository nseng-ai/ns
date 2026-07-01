# Hosts sdlcc Smell Remediation

## Summary

Remediated the `ts/packages/hosts/sdlcc` sub-slice from `references/hosts.md`:

- `command-runner.ts` now exports `formatCommandFailure`, centralizing exit-code/stdout/stderr summaries for cmux reporting, stack-map cmux effects, cmux inventory loading, and the objectives tab.
- `stack-map.ts` now exports `openNewCmuxTarget`, so stack-map planning, chooser choices, and choice activation share the same optional-slot open-new cmux target shape.
- `tabs/list-navigation.ts` now owns `wrapIndex`, shared by stack-map row movement, objective-tab row movement, and tab-host tab switching.

Validation passed on 2026-07-01:

- `pnpm --dir ts --filter sdlcc run check`
- `pnpm --dir ts --filter sdlcc run test`
- `just ts-format-check`
- `just ts-lint`
- `just ts-check`
- `just dprint-check`

## Objective Impact

Three `hosts` findings now have fixed dispositions in `roadmap.md`: sdlcc command-failure formatting Shotgun Surgery, duplicated open-new cmux construction, and duplicated wrap-index navigation. The broader `hosts` row remains open because the `ts/packages/hosts/pi` findings, including the large `cli-extension.ts` Divergent Change finding, are still undispositioned.

## Follow-Ups

Continue the `hosts` cluster with a separate `hosts/pi` sub-slice, or select another open cluster (`infra`, `capabilities`, `local-pi-tools`, or `tools`) after checking overlap notes.
