# Objectives

Objectives are local-first planning records for multi-session workstreams. They maintain an authoritative shared planning record while allowing branch-local Objective Snapshots to drift as work proceeds.

## Language

**Objective**:
A local-first planning record for a multi-session workstream.
_Avoid_: Initiative, issue, project, task

**Objective Slug**:
The stable human-readable identifier shared by a **Canonical Objective** and its **Objective Snapshots**.
_Avoid_: Objective ID, key, name

**Canonical Objective**:
The authoritative shared planning record for an **Objective**, independent of where it is physically stored.
_Avoid_: Trunk Objective, Objective on trunk, Canonical Branch Memory

**Objective Snapshot**:
A working copy of an **Objective** stored in Branch Memory whose contents may drift while objective work is in flight.
_Avoid_: Objective Branch Snapshot, branch snapshot

**Up-to-date Objective Snapshot**:
An **Objective Snapshot** that reflects the **Durable Evidence** available for its branch.
_Avoid_: Fresh Objective Snapshot

**Stale Objective Snapshot**:
An **Objective Snapshot** that has not yet absorbed some relevant **Durable Evidence** available for its branch.
_Avoid_: Incomplete Objective Snapshot

**Objective Snapshot Update**:
A revision that makes an **Objective Snapshot** reflect available **Durable Evidence**.
_Avoid_: Refresh, absorb

**Objective Reconciliation**:
The process of updating a **Canonical Objective** from **Durable Evidence**, usually including completed **Units of Work** and their **Objective Snapshots**.
_Avoid_: Canonical update, merge, sync

**Objective Attachment**:
The act of attaching an **Objective Snapshot** to a branch by copying it from a source snapshot or **Canonical Objective**.
_Avoid_: Claim, assignment, checkout, ownership claim

**Objective Closure**:
The decision that an **Objective** is no longer active because it is complete or no longer relevant.
_Avoid_: Archive, completion

**Open Objective**:
An **Objective** that is still active.
_Avoid_: Active objective

**Closed Objective**:
An **Objective** that has gone through **Objective Closure**.
_Avoid_: Archived objective, completed objective

**Objective Document**:
A human-authored markdown Branch Memory Entry that forms part of an **Objective**.
_Avoid_: Objective file, working-tree file

**Objective Marker**:
A machine-owned metadata Branch Memory Entry attached to an **Objective**.
_Avoid_: Objective file, document

**Objective Body**:
The stable **Objective Document** that describes scope, goals, completion criteria, and how to make progress.
_Avoid_: body file

**Objective Roadmap**:
The **Objective Document** that tracks ordered **Units of Work** for an **Objective**.
_Avoid_: roadmap file

**Unit of Work**:
A planned unit of objective work tracked in an **Objective Roadmap** whose completion is determined by **Durable Evidence** of progress.
_Avoid_: Slice, Roadmap Item, task, ticket, node

**Durable Evidence**:
Inspectable proof that objective progress happened, such as a commit, merged PR, stored Branch Memory Entry, updated **Objective Document**, **Objective Marker**, recorded decision, or documented external action.
_Avoid_: ephemeral observation, unchecked assertion

**Objective Notes**:
The **Objective Document** that records durable findings discovered while implementing an **Objective**.
_Avoid_: notes file

## Relationships

- An **Objective** has exactly one **Objective Slug**.
- An **Objective** is either an **Open Objective** or a **Closed Objective**.
- An **Objective** may have one **Canonical Objective** and zero or more **Objective Snapshots**.
- A **Canonical Objective** is the shared authority for one **Objective**.
- An **Objective Snapshot** belongs to one **Objective Slug** and is attached to one branch through Branch Memory.
- An **Objective Snapshot** can be copied forward, updated from branch work, and reconciled into the **Canonical Objective** after work lands.
- An **Objective Snapshot** is either **up-to-date** or **stale** relative to available **Durable Evidence**.
- An **Objective Snapshot Update** turns a stale **Objective Snapshot** into an up-to-date one.
- **Objective Reconciliation** updates a **Canonical Objective** from **Durable Evidence**.
- **Objective Attachment** creates an **Objective Snapshot** for a branch.
- **Objective Closure** changes an **Open Objective** into a **Closed Objective**.
- An **Objective** is composed of **Objective Documents** and may include **Objective Markers**.
- The core **Objective Documents** are the **Objective Body**, **Objective Roadmap**, and **Objective Notes**.
- An **Objective Roadmap** contains zero or more ordered **Units of Work**.
- `objective-next` recommends the next **Unit of Work**.
- A **Unit of Work** may be split into smaller **Units of Work** when the work turns out to be more granular than expected.
- A **Unit of Work** is complete when **Durable Evidence** shows that its intended objective progress happened.

## Example dialogue

> **Dev:** "Should this branch update the objective directly?"
> **Domain expert:** "Update the **Objective Snapshot** on the branch; only **Objective Reconciliation** updates the **Canonical Objective**."
>
> **Dev:** "Is this Unit of Work complete because the checklist says so?"
> **Domain expert:** "No. A **Unit of Work** is complete when there is **Durable Evidence** that the intended progress happened."
>
> **Dev:** "Should we archive this objective now?"
> **Domain expert:** "Call it **Objective Closure**: the **Objective** becomes closed because it is complete or no longer relevant. Archive mechanics are storage details."

## Flagged ambiguities

- "branch snapshot" was used both for objective state and lower-level Branch Memory storage. Resolved: use **Objective Snapshot** for objective semantics.
- "slice" and "roadmap item" were used for planned objective work. Resolved: use **Unit of Work** instead.
- "claim" was used for attaching objective state to a branch. Resolved: use **Objective Attachment** in the ontology.
- "fresh" was used for objective snapshot state. Resolved: use **up-to-date** relative to **Durable Evidence**.
