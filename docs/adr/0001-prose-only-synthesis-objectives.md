# ADR 0001: Umbrella Objectives

## Status

Accepted

## Context

Some Objectives coordinate family of narrower Subobjectives. Parent must keep cross-child lessons, migration guidance, synthesized outcomes, closure evidence — without becoming task database or duplicating every child roadmap.

## Decision

**Umbrella Objective** is prose-only Objective pattern. Its Subobjectives are ordinary Objectives owning implementation or research slices. Parent stays durable synthesis point, closes only after children closed or explicitly parked and outcomes synthesized.

Umbrella Objective is not CLI feature, lifecycle status, registry, or hidden metadata model. Objective lifecycle stays set by ordinary Objective record and Closure Marker.

Synthesis duty mandatory. Parent that only creates children then stops tracking outcomes is **fire-and-forget umbrella**, not Umbrella Objective. **Synthesis Objective** is retired name for this pattern.

## Consequences

- Large initiatives can delegate narrow ownership, keep one coherent account of whole.
- Parent roadmaps may summarize child progress without mirroring child task detail.
- Closure needs synthesized evidence, not mere existence of child records.

## Alternatives

- **Fire-and-forget umbrella:** rejected; loses cross-child learning and closure evidence.
- **Machine-level Objective category:** rejected; pattern needs prose discipline, not new workflow-control state.
