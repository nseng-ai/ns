# @nseng-ai/capability-kit/graphite

`@nseng-ai/capability-kit/graphite` is the private TypeScript workspace support package for Graphite facts, metadata, and command adapters. It owns direct `gt` binary invocation and Graphite metadata database access/parsing; workflow owners compose these primitives without becoming Graphite adapters themselves.

## Language

**Graphite support package**:
The workspace package `@nseng-ai/capability-kit/graphite`, which owns reusable Graphite command adapters, metadata database parsing, topology facts, and testing fakes. Workflow policy belongs to the consuming capability; Graphite provides only neutral Graphite mechanics for those workflows.
*Avoid*: workflow replacement, command-face owner, workflow orchestration owner.

**Graphite command adapter**:
A real gateway or helper that invokes the `gt` binary and converts command output into package-owned result shapes. Direct `gt` invocation belongs here.
*Avoid*: workflow policy, command surface, presentation renderer.

**Graphite metadata DB**:
Graphite's local sqlite metadata database and the schema/query/parsing helpers for branch rows, parent/child relationships, trunk markers, and child-list corruption diagnostics. Source code must not ad-hoc shell out to `sqlite3` against this database from workflow logic; route reads through code the workspace controls, such as `@nseng-ai/capability-kit/graphite` metadata helpers or a capability-owned operation that owns the exact query and output contract.
*Avoid*: Git refs, Branch Memory, authoritative remote state, command-local raw sqlite query.

**Graphite topology**:
The metadata-derived parent/child graph used for stack walking, fork detection, subtree traversal, and live-ref reconciliation.
*Avoid*: Graphite command output, Graphite UI stack display.

**Graphite stack facts**:
Reusable facts about stack ancestry, descendants, trunk markers, and Graphite branch relationships returned by stack adapters for workflow consumers.
*Avoid*: landing policy, command rendering, PR merge orchestration.

**Passive Graphite status**:
A read-only status lookup derived from Graphite metadata and local refs for worktree-status presentation, including worker lifecycle and diagnostics.
*Avoid*: Graphite mutation, PR status, full stack synchronization.

**Graphite workflow mechanics**:
Graphite-specific command and metadata mechanics such as branch-info reads, stack facts, and neutral command execution helpers that workflow owners may compose.
*Avoid*: submit/restack orchestration policy, PR metadata prewrite policy, generic PR description generation, GitHub PR gateway ownership.

**Direct `gt` invocation boundary**:
The rule that source code outside `ts/packages/capability-kit/src/graphite/**` should not execute the `gt` binary directly. Other packages may display `gt` commands as remediation text or invoke higher-level capability CLI surfaces when that CLI is the explicit contract.
*Avoid*: package-local Graphite subprocess helper, hidden convenience shell-out.
