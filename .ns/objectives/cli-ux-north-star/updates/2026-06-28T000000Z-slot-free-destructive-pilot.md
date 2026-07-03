# Slot Free Destructive Pilot

## Summary

Current branch evidence shows the destructive preview/confirmation/result row has begun with `sdl slot free`:

- `ts/packages/capabilities/slot/src/operations/destructive-presentation.ts` adds a Slot-local destructive result-block wrapper over the shared `@sdl/cli-theme` finite result block.
- `ts/packages/capabilities/slot/src/operations/free.ts` routes dry-run, success, cancellation/refusal, and cleanup-error outcomes through that destructive block while preserving JSON behavior for negative results.
- `ts/packages/capabilities/slot/test/scenario/free-cli.test.ts` adds coverage for dry-run human rendering and cleanup-failure human/JSON behavior.

This update records material current-branch progress detected during `objective-next`; it does not claim the destructive row is complete.

## Objective Impact

The destructive preview/confirmation/result migration now has a first Slot pilot. The reusable shape is still Slot-local and intentionally narrower than the prior navigation row: it proves the finite destructive result block for `slot free`, but the row still needs the remaining eligible Slot/Handoff destructive surfaces before the primitive/policy can be called stable.

The next Objective work should continue this row, using `slot free` as the pilot and checking whether the same grammar fits adjacent Slot destructive commands (`slot gc`, `slot gt free-stack`, `slot resize`) before crossing into Handoff delete/gc.

## Follow-Ups

- Verify the `slot free` pilot covers cancellation and actual destructive success paths as well as dry-run and cleanup failure.
- Migrate the next adjacent Slot destructive surface using the same Slot-local helper, preserving machine/JSON behavior and existing confirmation semantics.
- Keep shared extraction deferred until multiple destructive consumers prove the grammar without command-specific hacks.
