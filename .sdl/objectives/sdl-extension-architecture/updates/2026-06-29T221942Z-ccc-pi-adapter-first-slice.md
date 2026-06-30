# CCC Pi adapter first extraction slice

Implemented the first bounded CCC Pi adapter extraction slice.

- Added `ts/packages/capability-pi/ccc` as private workspace package `@sdl/ccc-pi` with `sdl.tier = "capability-pi"`, package exports for `.` and `./extension`, and a thin `registerCccPiExtension` adapter.
- Rewired `.pi/extensions/ccc.ts` to import the new project-local adapter path instead of importing `ts/packages/ccc/src/index.ts` directly.
- Stopped presenting Pi extension registration as the root `@sdl/ccc` package identity: `ts/packages/ccc/src/index.ts` no longer exports `registerCccExtension`, and `CCC_PACKAGE_IDENTITY.ownedConcerns` no longer claims `pi-command-composition`.
- Added a small `@sdl/ccc/api` export currently limited to Pi-free package identity, plus a deliberately named temporary `@sdl/ccc/legacy-pi-extension` export for the old registration aggregator while individual command wrappers are extracted.

Current remaining direct CCC -> Pi imports from `rg -n "@sdl/pi" ts/packages/ccc/src ts/packages/ccc/package.json`:

```text
ts/packages/ccc/package.json:33:    "@sdl/pi": "workspace:*",
ts/packages/ccc/src/cmux/sidebar.ts:7:import { registerCommandWithImmediateAck } from "@sdl/pi/commands/ack";
ts/packages/ccc/src/cmux/sidebar.ts:8:import { expandRepoSkillBlock } from "@sdl/pi/skills/expansion";
ts/packages/ccc/src/cmux/dispatch-from-trunk.ts:1:import { registerCommandWithImmediateAck } from "@sdl/pi/commands/ack";
ts/packages/ccc/src/cmux/dispatch-from-trunk.ts:14:import { sendCommandProgressOrNotify } from "@sdl/pi/commands/ack";
ts/packages/ccc/src/cmux/slot-open-branch.ts:5:import { registerCommandWithImmediateAck, sendCommandProgressOrNotify } from "@sdl/pi/commands/ack";
ts/packages/ccc/src/cmux/dispatch-prompt.ts:1:import { registerCommandWithImmediateAck } from "@sdl/pi/commands/ack";
ts/packages/ccc/src/cmux/dispatch-prompt.ts:22:import { sendCommandProgressOrNotify } from "@sdl/pi/commands/ack";
ts/packages/ccc/src/cmux/slot-dispatch-plan.ts:1:import { sendCommandProgressOrNotify, registerCommandWithImmediateAck } from "@sdl/pi/commands/ack";
ts/packages/ccc/src/cmux/slot-dispatch-plan.ts:2:import { formatImplBranchContextCommand } from "@sdl/pi/commands";
ts/packages/ccc/src/cmux/claude-plan-tab.ts:1:import { registerCommandWithImmediateAck } from "@sdl/pi/commands/ack";
ts/packages/ccc/src/cmux/objective-sidebar.ts:4:import { parseMachineEnvelopeData } from "@sdl/pi/runtime/machine-envelope";
```

Follow-up work: move individual command registration/ack/progress wrappers from `ts/packages/ccc/src/cmux/*` into `@sdl/ccc-pi`, introduce Pi-free handler/controller exports from `@sdl/ccc/api`, then remove `@sdl/ccc/legacy-pi-extension` and the `@sdl/pi` dependency from `@sdl/ccc` once `rg "@sdl/pi" ts/packages/ccc` is clean.
