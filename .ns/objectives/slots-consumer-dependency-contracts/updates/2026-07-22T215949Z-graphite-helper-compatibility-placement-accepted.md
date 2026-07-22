# Graphite Helper Compatibility Placement Accepted

## Summary

`stack-branches`, `descendants-report`, and `backup-refs` will remain under `ns slot gt exec` for command-surface compatibility. Their command registrations now carry code-adjacent comments stating that placement does not imply Slot semantics: the first two use Graphite topology and related evidence, while `backup-refs` uses Git recovery mechanics for Graphite workflows. None depends on Slot inventory, placement, assignment, occupancy, freeing, or lifecycle behavior.

This is a deliberate lightweight boundary decision, not an incomplete migration. Portable callers remain operationally dependent on `@nseng-ai/slots` while that extension hosts the commands, and their prerequisite contracts remain accurate. A new package, command group, alias set, or migration Objective would add churn without current consumer demand.

## Objective Impact

The generic-helper ownership roadmap row is complete by recording compatibility placement and semantic non-ownership rather than assigning speculative migration work. The Objective scope, completion criteria, risks, and open questions now reflect that command ownership should be revisited only when concrete consumer demand justifies moving the interface.

Slots continues to own genuinely Slot-aware behavior, including occupancy, assignment, freeing, quiescence, stack-map safety, and restack preflight. Flow remains a workflow-policy consumer rather than becoming the owner of neutral Graphite facts.

## Follow-Ups

- Preserve the current command and JSON contracts.
- Revisit ownership only if a concrete non-Slots consumer or migration slice makes compatibility placement materially costly.
- Keep durable consumer accounting, `flow-slots-opt-in`, and final synthesis open.
