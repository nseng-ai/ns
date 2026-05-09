# Slots

A **Slot** is a managed git worktree dedicated to one branch at a time, so a developer (or agent) can have multiple branches checked out in parallel without stashing, branch switching, or losing the running state of editors, terminals, and processes.

## Language

**Slot**:
A managed git worktree at `~/.slots/repos/<repo>/worktrees/slot-XX/` with a stable numbered name and a known on-disk path. A Slot has a state (**Assigned** or **Available**) and may carry a branch.
_Avoid_: Worktree (a Slot is a worktree, but the domain term is "Slot"); workspace; shelf

**Pool**:
The set of all Slots for a repository. The Pool has no persisted state — its size and contents are derived from `git worktree list` on every command. Pool-level operations include `init`, `resize`, `list`, and `gc`.
_Avoid_: Inventory (used internally for the derived data structure, but the domain noun is "Pool"); workspace; queue

**Assigned (Slot)**:
A Slot whose worktree has a branch checked out. The branch is the Slot's current assignment.
_Avoid_: occupied, taken, in-use, busy

**Available (Slot)**:
A Slot whose worktree is detached (no branch checked out). An Available Slot is a candidate for allocation, but allocation requires it to also be clean (no uncommitted changes).
_Avoid_: free, idle, open, empty, detached

_(Glossary in progress — being filled out via grilling sessions.)_

## Relationships

- A repository's **Pool** contains zero or more **Slots**.
- A **Slot** is in exactly one of two states: **Assigned** or **Available**.
- Pool size and Slot membership are derived from `git worktree list`; nothing is persisted by asdl-slots.
