# @asdl/handoff

`@asdl/handoff` owns directed Handoff Artifact vocabulary and user-facing handoff inventory over Branch Memory storage for the TypeScript standalone `handoff` CLI.

## Language

**Handoff Artifact**:
A directed, durable Markdown work-context artifact for a future session to continue a specific Continuation Focus.
*Avoid*: saved handoff, Branch Memory Entry as the user model, session transcript, generic summary, task database, Objective record, worker protocol handoff.

**Continuation Focus**:
The explicit future work, decision, verification, or implementation target that a Handoff Artifact is meant to resume.
*Avoid*: title-only summary, status ping, owner, due date.

**Create a Handoff**:
The public action that produces a directed Handoff Artifact for a specific Continuation Focus.
*Avoid*: save a handoff, Branch Memory write as the user model, undirected session summary.

**Pick Up a Handoff**:
The public action that selects an existing Handoff Artifact and makes it active context for continuing work.
*Avoid*: load a handoff, read a Branch Memory Entry as the user model, separate resume lifecycle term.

**Handoff Slug**:
The user-facing semantic name for a handoff, derived from the flat Markdown **Handoff Key** by removing the `.md` suffix.
*Avoid*: Entry Locator, branch name, hidden id.

**Handoff Key**:
The flat Branch Memory Entry Key for a **Handoff Artifact** in the **Handoff Namespace**, shaped as `<handoff-slug>.md` in the v1 contract.
*Avoid*: Entry Locator, branch name, manifest record, nested path.

**Handoff Namespace**:
The workflow-owned Branch Memory Namespace named `handoff` where Handoff Artifacts live.
*Avoid*: `handoffs`, Base Namespace, ad-hoc Branch Memory, all handoff state.

**Handoff Summary**:
The inventory record for a Handoff Artifact, including its branch, Branch State, Handoff Slug, Handoff Key, Entry Locator, and updated timestamp.
*Avoid*: artifact body, manifest, task record.

**List Handoffs**:
The public action that presents Handoff Artifacts in a List Scope so the user can choose what to Pick Up, inspect, or clean up.
*Avoid*: global registry, search query, storage-key-first inventory.

**Handoff Technical Locator**:
Storage evidence for a Handoff Artifact: branch plus **Handoff Namespace**, Entry Key, Entry Locator, and commit when available.
*Avoid*: public handoff name, picker label, default success copy.

**Branch State**:
Whether the local Git branch named by a Handoff Summary is currently `active` or `deleted`.
*Avoid*: Git status, Objective status, workflow state.

**List Scope**:
The branch range used when listing Handoff Artifacts: one branch, all active local branches, or all branches including deleted local branches.
*Avoid*: search query, namespace, lifecycle state.

**All-Branches Inventory**:
A handoff listing across branches that groups Handoff Summaries by branch and can optionally include deleted local branches.
*Avoid*: global registry, hidden index, remote branch scan.

**Delete a Handoff**:
The public CLI-only action that removes one named Handoff Artifact from the current handoff inventory by exact Handoff Slug.
*Avoid*: fuzzy pickup selection, archive, tombstone, soft delete, garbage collection.

**Handoff Garbage Collection**:
The explicit operation that previews or deletes Handoff Artifacts whose local branch is deleted.
*Avoid*: automatic cleanup, archive, Objective Close.
