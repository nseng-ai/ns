# Capability Pi CCC Remediation

## Summary

Completed the `capability-pi/ccc` sub-slice of the code-smell backlog. The four duplicated CCC progress-notifier closures now use `makeCommandProgressNotifier` from `@sdl/pi/commands/ack`, preserving the existing `sendCommandProgressOrNotify` defaults from one shared helper. The duplicate `slotClient` optional spreads in dispatch-from-trunk and dispatch-prompt now use `optionalEntry("slotClient", options.slotClient)`.

Validation passed on 2026-07-01: `pnpm --dir ts --filter @sdl/pi run check`, `pnpm --dir ts --filter @sdl/pi run test`, `pnpm --dir ts --filter @sdl/ccc-pi run check`, `pnpm --dir ts --filter @sdl/ccc-pi run test`, `just ts-format-check`, `just ts-lint`, `just ts-check`, and `just dprint-check`.

## Objective Impact

Two capability-pi findings now have fixed dispositions in `roadmap.md`: the duplicated progress-notifier closures and duplicated optional `slotClient` spreads in the CCC Pi adapter. This reduces the remaining open capability-pi work to the flow, handoff, and objective sub-slices.

## Follow-Ups

Continue the partially open **capability-pi** cluster with one coherent remaining sub-slice at a time: `flow`, `handoff`, or `objective`.
