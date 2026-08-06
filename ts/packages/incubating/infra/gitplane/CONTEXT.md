# Gitplane

Gitplane is a Git-backed artifact control plane. This context defines the language for reconciliation planning and artifact materialization in `@nseng-ai/gitplane` and its SQLite adapter.

## Language

**Reconciliation Plan**:
The durable description of one complete reconciliation from an expected cursor to a target commit. It contains zero or more Planned Artifact Materializations and all shared facts required for retry.
*Avoid*: frozen plan, frozen attempt, replay DTO, reconciliation attempt

**Attempt ID**:
The stable identity of one Reconciliation Plan and its retry series. A retry keeps the same Attempt ID, while a later reconciliation to the same target has a different Attempt ID.
*Avoid*: plan ID, run ID, retry ID

**Planned Artifact Materialization**:
The part of a Reconciliation Plan that describes the required state transition for one artifact. A Reconciliation Plan contains zero or more Planned Artifact Materializations in canonical artifact-ID order.
*Avoid*: artifact work, frozen artifact work, write plan

**Prepared Artifact Materialization**:
The Gateway-ready form of one Planned Artifact Materialization. It is temporary application data and is not a second durable authority.
*Avoid*: derived artifact writes, artifact materialization record set, write bundle

**Pending Plan**:
The sole unresolved Reconciliation Plan for a source. A matching retry reuses it, and conflicting work cannot replace it.
*Avoid*: pending attempt, frozen attempt, active plan

**Resulting Cursor**:
The cursor that marks successful completion of a Reconciliation Plan. Its commit is the target commit, and its generation immediately follows the expected generation.
*Avoid*: next cursor, derived cursor, output cursor
