# ASDL Tools

This context captures project language for durable planning workflows in this repository.

## Language

**Objective**:
A checked-in documentation workstream for durable multi-session, multi-branch, or multi-PR work.
_Avoid_: hidden agent state, ticket

**Synthesis Objective**:
A prose-only **Objective** pattern that coordinates a family of narrower child Objectives while remaining the durable place for cross-child lessons, migration guides, and synthesized closure evidence.
_Avoid_: Fire-and-forget umbrella, mirrored task tracker, hidden parent state, Objective CLI feature

**Child Objective**:
A narrower **Objective** created from a parent **Synthesis Objective** to own one implementation, research, or migration slice; the child remains `open` until its own **Objective Close**, while the parent roadmap may use `[~]` to show that the child exists and is in progress.
_Avoid_: Subticket, hidden task, third Objective status

**Durable Narrative Roadmap Record**:
The role of an **Objective** as human-readable context and ordered work guidance, without owning workflow-control semantics.
_Avoid_: Workflow controller, state machine, task database

**Active Objective Root**:
The checked-in repository directory `.asdl/objectives/` that contains Objective records considered by normal Objective discovery, listing, reading, update, next-work, and close workflows.
_Avoid_: open objectives directory, hidden local cache, archive root

**Objective Archive Root**:
The checked-in repository directory `.asdl/objective-archive/` that parks Objective records outside normal active discovery without changing their slug, prose, updates, or closure marker.
_Avoid_: deletion, closed objective root, hidden cache

**Archived Objective**:
An **Objective** record located under the **Objective Archive Root**. Archive state is a location choice, not a replacement for open/closed state.
_Avoid_: closed objective, deleted objective, stale update

**Objective Slug**:
The directory name under an Objective root that is the stable identity for one **Objective**.
_Avoid_: title, branch name, PR name, package name

**Objective Slug Migration**:
An explicit move of an **Objective** from one slug directory to another after the user chooses a new canonical identity.
_Avoid_: rename cleanup, path normalization, hidden remap

**Semantic Update**:
An update file that records meaningful objective information such as a finding, decision, blocker, completion evidence, changed plan, or follow-up.
_Avoid_: Ceremonial update, status ping, branch changelog

**Tracking Gate**:
A read-only check that blocks next-work recommendations when branch or worktree evidence suggests objective progress has not been recorded, until an explicit **Objective Update** handoff is confirmed.
_Avoid_: Auto-refresh, auto-update, hidden reconciliation

**Objective Update**:
The explicit mutation workflow that updates objective tracking by editing durable files and, when there is meaningful semantic information, writing a **Semantic Update**.
_Avoid_: Progress log, automatic refresh, hidden reconciliation

**Objective Close**:
The explicit mutation workflow that records an objective as complete or intentionally abandoned while preserving its checked-in history and writing a **Closure Marker**.
_Avoid_: Deletion, archive, archival state machine

**Objective Archive**:
The explicit directory-move workflow that moves an Objective record between the **Active Objective Root** and the **Objective Archive Root** without editing Objective prose or changing closed/open state.
_Avoid_: Objective Close, slug migration, deletion

**Closure Marker**:
A lightweight `closed.md` file whose existence lets tools identify closed objectives without language-model interpretation.
_Avoid_: Hidden status, archive state, deletion
