# asdl-handoff

`asdl-handoff` owns directed handoff artifact vocabulary and user-facing handoff inventory over Branch Memory storage.

## Language

**Handoff Artifact**:
A directed Markdown resume note stored as a Branch Memory Entry for a future session to continue a specific focus.
_Avoid_: session transcript, generic summary, task database, Objective record, worker protocol handoff.

**Continuation Focus**:
The explicit future work, decision, verification, or implementation target that a Handoff Artifact is meant to resume.
_Avoid_: title-only summary, status ping, owner, due date.

**Handoff Slug**:
The user-facing semantic name for a handoff, currently derived from the recognized Markdown Entry Key by removing the `.md` suffix.
_Avoid_: Entry Locator, branch name, hidden id.

**Handoff Key**:
The Branch Memory Entry Key for a Handoff Artifact in the `handoffs` Namespace.
_Avoid_: Entry Locator, branch name, manifest record.

**Handoffs Namespace**:
The workflow-owned Branch Memory Namespace named `handoffs` where Handoff Artifacts live.
_Avoid_: Base Namespace, ad-hoc Branch Memory, all handoff state.

**Handoff Summary**:
The inventory record for a Handoff Artifact, including its branch, Branch State, Handoff Slug, Handoff Key, Entry Locator, and updated timestamp.
_Avoid_: artifact body, manifest, task record.

**Handoff Technical Locator**:
Storage evidence for a Handoff Artifact: branch plus Branch Memory Namespace, Entry Key, Entry Locator, and commit when available.
_Avoid_: public handoff name, picker label, default success copy.

**Branch State**:
Whether the local Git branch named by a Handoff Summary is currently `active` or `deleted`.
_Avoid_: Git status, Objective status, workflow state.

**List Scope**:
The branch range used when listing Handoff Artifacts: one branch, all active local branches, or all branches including deleted local branches.
_Avoid_: search query, namespace, lifecycle state.

**All-Branches Inventory**:
A handoff listing across branches that groups Handoff Summaries by branch and can optionally include deleted local branches.
_Avoid_: global registry, hidden index, remote branch scan.

**Handoff Deletion**:
The explicit operation that removes one named Handoff Artifact from the current handoff inventory by exact Handoff Slug.
_Avoid_: fuzzy pickup selection, archive, tombstone, soft delete, garbage collection.

**Handoff Garbage Collection**:
The explicit operation that previews or deletes Handoff Artifacts whose local branch is deleted.
_Avoid_: automatic cleanup, archive, Objective Close.
