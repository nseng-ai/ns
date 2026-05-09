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

**Allocation**:
The rule for picking a Slot when checking out a branch: asdl-slots selects the lowest-numbered **Available** Slot that is also clean, and refuses if the requested branch is already checked out in another Slot or the user's primary worktree. `slot checkout --current` is also Allocation — it redirects the currently-checked-out branch into a Slot rather than allocating from a branch name.
_Avoid_: Assignment (collides with the **Assigned** state); claim; reservation

**Free**:
The operation that detaches an **Assigned** Slot back to trunk while keeping the worktree directory in place. Free refuses on a dirty worktree. A Freed Slot transitions from **Assigned** to **Available**; its on-disk state — editor sessions, terminal `cwd`, running processes — survives.
_Avoid_: Release, deallocate, return, evict

**GC**:
A Pool-level sweep that Frees **Assigned** Slots whose branches are no longer worth holding open — typically those whose PR has been merged or closed on the remote. GC is conservative: it refuses to Free dirty Slots and reports them instead of forcing.
_Avoid_: Cleanup, prune, reclaim, sweep

## Relationships

- A repository's **Pool** contains zero or more **Slots**.
- A **Slot** is in exactly one of two states: **Assigned** or **Available**.
- Pool size and Slot membership are derived from `git worktree list`; nothing is persisted by asdl-slots.
- **Allocation** consumes an **Available** Slot and produces an **Assigned** one.
- **Free** consumes an **Assigned** Slot and produces an **Available** one.
- **GC** is a batch of Frees driven by remote PR state.

## Example dialogue

> **Dev:** "I ran `slot checkout my-branch` and it picked `slot-03` even though `slot-01` is empty. Why?"
> **Domain expert:** "`slot-01` must not be **Available** — it is probably **Assigned** to another branch, or detached but dirty. **Allocation** picks the lowest-numbered Slot that is both Available and clean. Run `slot list` and you'll see why slot-01 was skipped."
>
> **Dev:** "Can I `slot free` a Slot that has uncommitted changes if I don't care about them?"
> **Domain expert:** "No — **Free** refuses on dirty worktrees by design. You either commit, stash, or clean the worktree yourself, and then Free. The Slot ontology does not include a forced-Free; that is intentional."
>
> **Dev:** "After `slot gc`, `slot-02` is still Assigned to a merged branch. Bug?"
> **Domain expert:** "Probably not. **GC** Frees only **Assigned** Slots that are also clean — if slot-02's worktree is dirty, GC reports it and skips it. Check `slot list` for the dirty marker."
>
> **Dev:** "Is `slot resize` an **Allocation**?"
> **Domain expert:** "No — Resize changes the size of the **Pool**, it does not pick a Slot for a branch. Only `slot checkout` performs Allocation."

## Flagged ambiguities

- "worktree" is generic git vocabulary and is also what a Slot _is_ on disk. Resolved: the domain noun is **Slot**; "worktree" is used only when describing the underlying git mechanism (e.g. "Pool size derives from `git worktree list`").
- "detached" is a git state that maps onto **Available**, but Available also requires the worktree to be clean to be a valid Allocation candidate. Resolved: use **Available** in domain discussion; "detached" is fine when narrowly describing git HEAD state.
- "free" is overloaded — both the verb (**Free** an Assigned Slot) and a candidate adjective for Available (rejected). Resolved: **Free** is the verb only; the state is **Available**.
- "assignment" is rejected as a name for Allocation because it collides with the **Assigned** state. Resolved: **Allocation** is the rule, **Assigned** is the resulting Slot state.
