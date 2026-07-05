# Consolidation Assessment: Park Shared Orchestration

## Summary

The consolidation assessment is complete. Decision: **do not subsume `dispatchRunnerSubagent`, and park consolidation of thermo-council orchestration onto the explore substrate.**

Evidence reviewed:

- `@nseng-ai/ns-pi-subagents` explore dispatch is already a consumer of the runner-subagent primitive: `dispatchExplorerSubagent` defaults to `dispatchRunnerSubagent`, passes `returnMode: "final-text"`, `READ_ONLY_SUBAGENT_TOOLS`, cheap-model/failover policy, and caller progress callbacks.
- The shared substrate worth keeping shared is already factored in `@internal/pi-tools/runner-subagents`: `dispatchRunnerSubagent`, the result taxonomy, activity/progress reporting, `mapWithConcurrency`, read-only tool constants, and the widget helper.
- Explore orchestration has explore-specific product policy: breadth profiles, 2+ task schema, agent-definition validation, wall-clock abort, direct scout-result shaping, and `ns.explore.progress` rendering.
- Thermo-council orchestration has review-specific policy: scope collection, configurable model seats, terminal capture tools, structured review/block schemas, payload/session recovery, deterministic report rendering, final synthesis, and review-specific progress text.

The useful consolidation already happened at the right layer: both explore and thermo-council can share the runner-subagent primitive and the small neutral `mapWithConcurrency` helper. Extracting a higher-level “parallel subagent pool” now would mostly move capability-specific policy behind a generic abstraction with only two callers and divergent contracts.

## Objective Impact

The roadmap consolidation-assessment row is complete with a park decision rather than an implementation slice.

`dispatchRunnerSubagent` remains the canonical low-level subprocess substrate; explore should not try to subsume it. Thermo-council should remain locally orchestrated unless a future third caller demonstrates a stable shared abstraction that preserves terminal-capture workflows, final-text scout workflows, capability-specific progress rendering, and recovery/reporting policy without coupling the capabilities together.

This confirms the Objective's earlier risk assessment that consolidation was likely to park and avoids broadening the completed explore/package work into unnecessary structural cleanup.

## Follow-Ups

- No immediate implementation follow-up.
- If another capability needs a bounded parallel subagent pool, reassess after three real callers and extract only the neutral scheduler/progress seam that all callers actually share.
- Keep fleet widget/transcript viewer and in-process runtime adapter as independent non-blocking choices; they do not depend on this consolidation decision.
