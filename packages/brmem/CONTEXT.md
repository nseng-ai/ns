# Branch Memory

Branch Memory is branch-attached text state managed outside commits, PR comments, issues, and working-tree files. It gives tools and agents durable per-branch memory without turning that memory into reviewed source history.

## Language

**Branch Memory System**:
The repo-wide storage substrate that manages **Branch Memory** across branches.
_Avoid_: brmem, Branch Memory Store

**Branch Memory**:
Durable, branch-attached text state carried outside commits, PR comments, issues, and working-tree files.
_Avoid_: repo-wide Branch Memory System, branch snapshot, current branch's Branch Memory

**Entry**:
One keyed text artifact stored in a branch's **Branch Memory**.
_Avoid_: Blob, tree entry, file, record

**Entry Key**:
The slash-separated name that identifies an **Entry** within a branch's **Branch Memory**.
_Avoid_: Path, file path, ref path

**Namespace**:
A tool-owned partition of **Branch Memory** whose **Entry Keys** have meaning only to that owning tool.
_Avoid_: Domain, bucket, folder, base namespace

## Relationships

- The **Branch Memory System** manages **Branch Memory** for zero or more branches.
- A branch may have **Branch Memory**.
- The **current Branch Memory** is the **Branch Memory** attached to the currently checked-out branch.
- **Branch Memory** contains zero or more **Entries**.
- Each **Entry** has exactly one **Entry Key** within its containing branch memory area.
- A **Namespace** contains zero or more **Entries** for a branch.
- An **Entry** may also be unnamespaced for ad-hoc use.

## Example dialogue

> **Dev:** "Where should the implementation plan live while the branch is in progress?"
> **Domain expert:** "Put it in an **Entry** in the **current Branch Memory**, not in the commit history or PR comments."
>
> **Dev:** "Should objective state define what a Branch Memory snapshot means?"
> **Domain expert:** "No. Snapshot semantics belong to Objectives; Branch Memory only stores **Entries** grouped by **Namespace**."

## Flagged ambiguities

- "branch snapshot" was used both for objective state and lower-level branch-memory storage. Resolved: use **Objective Snapshot** in the Objectives context; avoid using "snapshot" as the canonical domain term for generic Branch Memory.
- "brmem" names the tool/package, not the ontology-level **Branch Memory System**.
