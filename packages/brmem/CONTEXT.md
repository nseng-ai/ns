# brmem

`brmem` is the generic Branch Memory package: a Git-ref-backed storage primitive for small branch-scoped text context used by skills, agents, and repo-local automation without putting that context in commits, PRs, issues, or the working tree.

## Language

**Branch Memory System**:
The `brmem` package, CLI, and Git-ref storage mechanism that manages branch-scoped Entries outside commits, PRs, issues, and the working tree.
_Avoid_: Branch Memory, hidden state, scratch files, git notes.

**Branch Memory**:
The collection of Entries attached to one branch across the Base Namespace and any named Namespaces.
_Avoid_: Branch Memory System, branch metadata, branch files, working-tree state.

**Namespace**:
A Branch Memory scope for Entries on one branch; the Base Namespace has the canonical name `base` and is reserved by `brmem`, while named Namespaces are owned by higher-level workflows.
_Avoid_: directory, package, branch, brmem-owned schema.

**Base Namespace**:
The reserved Namespace whose canonical name is `base`, used for ad-hoc Entries when `--namespace` is omitted; it is stored under `refs/brmem/base/<encoded-branch>`. Where `--namespace base` is accepted, it selects this Base Namespace rather than a workflow-owned named Namespace.
_Avoid_: Base Branch Memory, base area, root Namespace, scratch directory.

**Entry**:
A small UTF-8 text record stored in Branch Memory under one Entry Key, on one branch, in one Namespace.
_Avoid_: file, blob, note, document unqualified, value.

**Entry Key**:
The POSIX-like relative name of one Entry within its Namespace.
_Avoid_: file path, ref name, locator, slug.

**Snapshot**:
The commit-backed view of all Entries in one Namespace on one branch at one point in time.
_Avoid_: Entry, export, working-tree snapshot, branch snapshot.

**Snapshot Ref**:
The real Git ref that points to the current Snapshot for one Namespace on one branch: `refs/brmem/base/<encoded-branch>` for the Base Namespace or `refs/brmem/ns/<namespace>/<encoded-branch>` for a named Namespace.
_Avoid_: Entry Locator, branch ref, snapshot locator.

**Entry Locator**:
The copy-pastable `git show` locator for one Entry, formed as `<snapshot-ref-or-commit>:<entry-key>`.
_Avoid_: ref name, Entry Ref, file path, branch path.

**Namespace Copy**:
A branch-to-branch copy of Entries within the same Namespace.
_Avoid_: branch copy, merge, export, snapshot restore.

**Copy Conflict**:
A destination Entry that would be replaced by a Namespace Copy unless the caller explicitly requests replacement.
_Avoid_: merge conflict, git conflict, duplicate Entry, copy failure.

**Export**:
A filesystem materialization of selected Branch Memory Entries as UTF-8 files under an output directory.
_Avoid_: checkout, copy, snapshot, restore.
