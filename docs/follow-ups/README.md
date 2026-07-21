# Follow-ups

This directory holds point-in-time opportunity notes: ideas that appeared promising enough to preserve, with the evidence and reasoning available at the time, but were not yet formed into an Objective.

A follow-up records:

- when and where the idea arose;
- the observed problem and supporting evidence;
- why the idea may be worth pursuing;
- candidate features, work items, constraints, and unresolved design choices;
- what should be reverified before acting; and
- what would justify promoting the note into an Objective.

Follow-ups are historical planning inputs, not commitments, canonical system specifications, architecture decisions, roadmaps, or task queues. They may become stale. Before implementation, revalidate their evidence and reconcile them with current docs, code, active Objectives, and decisions. If the work becomes coherent enough to require multi-session or multi-PR execution, create an Objective rather than treating this directory as a parallel Objective system.

## Notes

- [Delegation-first parent orchestration](delegation-first-parent-orchestration.md) — keep parent orchestrator sessions inside their context budget by delegating diff/log/status inspection to subagents and injecting a compact contract into multi-subagent plans.
- [Objective context management and compaction](objective-context-management-and-compaction.md) — reduce routine context consumption by large, long-lived Objectives while preserving provenance and routing.
- [Local feedback resolution](local-feedback-resolution.md) — local pre-PR review-to-fix loop: multi-reviewer roster runs over an explicit revision range, LM-proposed engineer-corrected finding clusters, disposition triage, and planned-PR steering; captured from a closed unmerged stack and its branch-only Objective.
- [Composable command core](composable-command-core.md) — settled design doctrine for rebuilding SDK command definition around catalog-only context, combinator overlays, services-as-libraries, and semantic events; captured with port evidence when the stack was deferred ahead of a bottoms-up command-layer reorganization.
