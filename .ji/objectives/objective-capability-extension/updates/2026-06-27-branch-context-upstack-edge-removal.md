# Branch Context Upstack Edge Removal

## Summary

The current branch `move-branch-context-launch-helper-to-pi` moves the `/sdl:branch-context:upstack-impl-from-plan` launch orchestration out of `@sdl/ccc` and into Pi-owned branch-context code. The local branch diff against Graphite parent `handoff-tab-pi-orchestration-move` renames `ts/packages/ccc/src/branch-context-up-and-impl.ts` to `ts/packages/hosts/pi/src/branch-context/gt/upstack-impl-launch.ts`, moves the related test to `ts/packages/hosts/pi/test/branch-context-gt-upstack-impl-launch.test.ts`, repoints Pi branch-context command registration to the host-local module, and removes the `./branch-context-up-and-impl` export from `ts/packages/ccc/package.json`.

Stale-edge grep after the change:

```text
rg "@sdl/ccc" ts/packages/hosts/pi/src ts/packages/hosts/pi/package.json
```

reports only `ts/packages/hosts/pi/package.json` and parity prose in `ts/packages/hosts/pi/src/parity/extension.ts`; no Pi source module imports a CCC subpath for branch-context upstack after this slice. This update records local branch evidence only; no PR evidence or fresh validation run was needed for the tracking update itself.

## Objective Impact

The Pi→CCC cycle-break roadmap row remains `[~]`, but the final named source-import edge is now accounted for: worktree-status, land/trunk-pull flow wrappers, Objective stack registration, focused cmux terminal-tab, handoff-tab, and branch-context upstack have all moved away from Pi importing `@sdl/ccc` subpaths. The remaining Objective work for that row is narrower: remove the stale `@sdl/ccc` declaration from `ts/packages/hosts/pi/package.json` and clean up/settle parity prose or accounting that still mentions the package boundary, while preserving the existing user-visible command registrations and behavior.

## Follow-Ups

- Run the final Pi→CCC cleanup slice: remove the Pi manifest dependency on `@sdl/ccc`, settle parity/accounting references, and verify `rg "@sdl/ccc" ts/packages/hosts/pi/src ts/packages/hosts/pi/package.json` has no matches.
- After the package graph is actually acyclic, resume the parked `just ts-guard` topological acyclicity check and final context documentation work.
