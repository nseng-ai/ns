# Made Objective executable by objective-stack-impl

## Summary

The Objective now includes durable execution-friendly prose for `@.agents/skills/objective-stack-impl/` without adding hidden state or a task database.

Changes made:

- Added `## Definition of Progress` to `objective.md` describing what work is keepable, what changes should not be kept, and which evidence is useful for each slice.
- Added `## Runner Policy` to `objective.md` authorizing `objective-stack-impl` execution after preview/confirmation, with explicit boundaries for branch count, slice order, escalation conditions, validation expectations, and prohibited actions.
- Added row-level `Policy:` and `Evidence:` notes to the four open roadmap slices so a parent `objective-stack-impl` session can build concrete preview branches directly from the roadmap:
  - runner-usage neutralization;
  - Objective API relocation;
  - consumer repoint;
  - Pi→CCC cycle break.

The policy intentionally preserves the prior split-plan decision: future runner sessions should not collapse the four slices back into one oversized implementation branch without explicit renewed user approval.

## Objective Impact

- The Objective is now execution-friendly for `objective-stack-impl`: a future parent session may propose a one-to-three-branch stack, ask for confirmation, delegate one focused slice at a time to runner subagents, validate independently, and update Objective tracking after material progress.
- The preferred first executable slice is the bottom runner-usage neutralization work, because it removes the `@sdl/objective` → `@sdl/pi` dependency before Pi imports the expanded Objective API.
- The high-risk Pi→CCC cycle break remains explicitly separated and should receive its own preview after the lower Objective relocation/repoint slices.
- Parked work remains parked: the topological `ts-guard` acyclicity check and final `ts/packages/objective/CONTEXT.md` documentation are not implicitly authorized by the execution policy until the real graph is ready or the user confirms that scope.

## Follow-Ups

- Invoke `objective-stack-impl objective-capability-extension` or the Pi `/objective:stack-impl` picker when ready to execute; the parent session should preview the first slice before creating branches or dispatching a runner subagent.
- After each implemented slice, run `objective-update` to record changed edges, validation, stale-edge grep evidence, and remaining work.
- Keep PR submission and GitHub mutation outside the automated stack implementation unless the user explicitly asks for them.
