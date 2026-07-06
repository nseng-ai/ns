# Park Optional Follow-Ons

## Summary

The two remaining open roadmap rows are intentionally parked rather than implemented in this Objective:

- Fleet widget and transcript viewer: park as a future monitoring/UX layer. The completed inline progress widget plus child session-file pointers satisfy this Objective's current live-monitoring and overflow/debug requirements.
- In-process runtime adapter: park as a future runtime-adapter exploration. Subprocess execution through the runner-subagent substrate remains the completed/default runtime for this Objective; a `createAgentSession` adapter should wait for a concrete context-forking use case that justifies the SDK coupling and Gateway-style seam.

## Objective Impact

This converts both non-blocking follow-on rows from open work into explicit parked decisions. No feature requirements or completion criteria are added.

The Objective's required scope remains the delivered `explore` fan-out capability, read-only explorer enforcement, bounded parent-context findings, live inline progress, `ns-pi-subagents` packaging, adopt-vs-build decision, dogfood evidence, and consolidation assessment. With the optional monitoring and runtime rows parked, no substantive roadmap work remains in this Objective.

## Follow-Ups

- If operator visibility beyond inline progress becomes a concrete product requirement, create a new focused Objective or roadmap slice for fleet/transcript UX.
- If a real context-forking use case appears, create a new focused Objective or roadmap slice for a subprocess/in-process runtime seam.
- Consider closing `pi-parallel-subagents` after verifying the existing completion criteria remain satisfied.
