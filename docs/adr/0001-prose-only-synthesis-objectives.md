# ADR 0001: Umbrella Objectives

## Status

Accepted

## Context

Some Objectives coordinate a family of narrower Subobjectives. The parent must preserve cross-child lessons, migration guidance, synthesized outcomes, and closure evidence without becoming a task database or duplicating every child roadmap.

## Decision

An **Umbrella Objective** is a prose-only Objective pattern. Its Subobjectives are ordinary Objectives that own their implementation or research slices. The parent remains the durable synthesis point and closes only after its children have closed or been explicitly parked and their outcomes have been synthesized.

Umbrella Objective is not a CLI feature, lifecycle status, registry, or hidden metadata model. Objective lifecycle remains determined by the ordinary Objective record and Closure Marker.

The synthesis duty is mandatory. A parent that merely creates children and stops tracking their outcomes is a **fire-and-forget umbrella**, not an Umbrella Objective. **Synthesis Objective** is the retired name for this pattern.

## Consequences

- Large initiatives can delegate narrow ownership while retaining one coherent account of the whole.
- Parent roadmaps may summarize child progress without mirroring child task detail.
- Closure requires synthesized evidence, not merely the existence of child records.

## Alternatives

- **Fire-and-forget umbrella:** rejected because it loses cross-child learning and closure evidence.
- **Machine-level Objective category:** rejected because the pattern needs prose discipline, not new workflow-control state.
