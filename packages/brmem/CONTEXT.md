# brmem

`brmem` is the generic Branch Memory package: a Git-ref-backed storage primitive for small branch-scoped text context used by skills, agents, and repo-local automation without putting that context in commits, PRs, issues, or the working tree.

## Language

**Branch Memory System** — The `brmem` package, CLI, and Git-ref storage mechanism that manages branch-scoped Entries outside commits, PRs, issues, and the working tree.
_Avoid:_ Branch Memory, hidden state, scratch files, git notes.

**Branch Memory** — The collection of Entries attached to one branch across the Base Namespace and any named Namespaces.
_Avoid:_ Branch Memory System, branch metadata, branch files, working-tree state.

**Namespace** — A Branch Memory scope for Entries on one branch; the Base Namespace has the canonical name `base` and is reserved by `brmem`, while named Namespaces are owned by higher-level workflows.
_Avoid:_ directory, package, branch, brmem-owned schema.

**Base Namespace** — The reserved Namespace whose canonical name is `base`, used for ad-hoc Entries when `--namespace` is omitted; it is stored under `refs/brmem/base/<encoded-branch>`. Where `--namespace base` is accepted, it selects this Base Namespace rather than a workflow-owned named Namespace.
_Avoid:_ Base Branch Memory, base area, root Namespace, scratch directory.

**Entry** — A small UTF-8 text record stored in Branch Memory under one Entry Key, on one branch, in one Namespace.
_Avoid:_ file, blob, note, document unqualified, value.

**Entry Key** — The POSIX-like relative name of one Entry within its Namespace.
_Avoid:_ file path, ref name, locator, slug.

**Snapshot** — The commit-backed view of all Entries in one Namespace on one branch at one point in time.
_Avoid:_ Entry, export, working-tree snapshot, branch snapshot.

**Snapshot Ref** — The real Git ref that points to the current Snapshot for one Namespace on one branch: `refs/brmem/base/<encoded-branch>` for the Base Namespace or `refs/brmem/ns/<namespace>/<encoded-branch>` for a named Namespace.
_Avoid:_ Entry Locator, branch ref, snapshot locator.

**Entry Locator** — The copy-pastable `git show` locator for one Entry, formed as `<snapshot-ref-or-commit>:<entry-key>`.
_Avoid:_ ref name, Entry Ref, file path, branch path.

**Namespace Copy** — A branch-to-branch copy of Entries within the same Namespace.
_Avoid:_ branch copy, merge, export, snapshot restore.

**Copy Conflict** — A destination Entry that would be replaced by a Namespace Copy unless the caller explicitly requests replacement.
_Avoid:_ merge conflict, git conflict, duplicate Entry, copy failure.

**Export** — A filesystem materialization of selected Branch Memory Entries as UTF-8 files under an output directory.
_Avoid:_ checkout, copy, snapshot, restore.

## Relationships

- The **Branch Memory System** keeps Entries out of commits and the working tree, but not hidden: **Snapshot Refs** and **Entry Locators** make stored Entries inspectable through Git.
- **Branch Memory** is attached to exactly one Git branch. CLI commands default to the current branch, but automation should pass an explicit branch when the workflow already knows one.
- **Branch Memory** is keyed by branch name; renaming or recreating a Git branch does not by itself rename existing Branch Memory.
- A **Snapshot Ref** encodes `/` in branch names as `---`; branch names containing `---` are invalid for Branch Memory because they cannot round-trip through this encoding.
- The **Base Namespace** canonical name is `base`, but its **Snapshot Ref** uses `refs/brmem/base/<encoded-branch>`; `refs/brmem/ns/base/<encoded-branch>` is not a valid second storage path.
- Named **Namespaces** are single ref/path segments; `/` is not valid in a Namespace name.
- **Entry Keys** may contain `/` for hierarchy, but they are locator-safe relative names: no leading/trailing slash, `//`, `:`, control characters, glob/ref metacharacters, `..` segment, or `.lock` segment suffix.
- A branch's **Branch Memory** contains Entries across one **Base Namespace** plus zero or more named **Namespaces**.
- Every **Entry** belongs to exactly one **Namespace** and is identified within that Namespace by its **Entry Key**.
- A **Snapshot Ref** points at the current **Snapshot** for one **Namespace** on one branch; an **Entry Locator** addresses one Entry inside that Snapshot.
- A **Snapshot Ref** names the current **Snapshot**; historical **Snapshots** are addressed by commit when reading or checking an **Entry**.
- A **Namespace Copy** can apply to either the **Base Namespace** or a named **Namespace**.
- A whole-namespace **Namespace Copy** makes the destination **Snapshot Ref** point at the source **Snapshot**.
- A key-filtered **Namespace Copy** creates a new destination **Snapshot** from matching source Entries plus preserved destination Entries.
- A **Copy Conflict** exists when the destination already contains an **Entry** that the **Namespace Copy** would replace.
- `put` and `delete` mutate one **Entry** in one **Namespace** on one branch; **Namespace Copy** mutates the destination **Namespace**; **Export** writes files but does not mutate **Branch Memory**.
- Deleting the last **Entry** leaves an empty current **Snapshot** for that **Namespace**; historical Snapshots remain inspectable by commit.
- During **Export**, each **Entry Key** becomes a relative file path under the output directory; unsafe keys must not escape or alias the export root.
- **Entries** are for small UTF-8 text context; generated assets, secrets, binary files, and large datasets are outside Branch Memory's intended use.
- Named **Namespaces** are primarily for higher-level workflows to store workflow-owned records; the schema and lifecycle of those records belong to the workflow, not to `brmem`.

## Example dialogue

> **Dev:** "Can my skill store `summary.md` directly on the branch?"
> **Domain expert:** "Yes, but decide the **Namespace** first. Use the **Base Namespace** for ad-hoc context; use a named **Namespace** when the skill owns the Entry schema and lifecycle."

## Flagged ambiguities

- **Namespace / Base Namespace** — resolved: the Base Namespace is the reserved Namespace whose canonical name is `base`; `--namespace base`, where accepted, aliases the Base Namespace rather than creating a named Namespace at `refs/brmem/ns/base/...`.
- **Ref / Entry Locator** — resolved: a Snapshot Ref is a real Git ref; an Entry Locator is a `git show` locator of the form `<snapshot-ref-or-commit>:<entry-key>`.
