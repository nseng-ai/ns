# @sdl/graphite

`@sdl/graphite` is the private TypeScript workspace support package for Graphite facts, metadata, and command adapters. It owns direct `gt` binary invocation and Graphite metadata database access/parsing; workflow owners such as CCC, slot, SDL, and branch-context compose these primitives without becoming Graphite adapters themselves.

## Language

**Graphite support package**:
The workspace package `@sdl/graphite`, which owns reusable Graphite command adapters, metadata database parsing, topology facts, submit support, and testing fakes.
*Avoid*: CCC replacement, slot CLI owner, orchestration owner.

**Graphite command adapter**:
A real gateway or helper that invokes the `gt` binary and converts command output into package-owned result shapes. Direct `gt` invocation belongs here.
*Avoid*: workflow policy, command surface, presentation renderer.

**Graphite metadata DB**:
Graphite's local sqlite metadata database and the schema/query/parsing helpers for branch rows, parent/child relationships, trunk markers, and child-list corruption diagnostics.
*Avoid*: Git refs, Branch Memory, authoritative remote state.

**Graphite topology**:
The metadata-derived parent/child graph used for stack walking, fork detection, subtree traversal, and live-ref reconciliation.
*Avoid*: Graphite command output, Graphite UI stack display.

**Graphite stack facts**:
Reusable facts about stack ancestry, descendants, trunk markers, and Graphite branch relationships returned by stack adapters for consumers such as `sdl slot gt` and CCC landing.
*Avoid*: landing policy, slot rendering, PR merge orchestration.

**Passive Graphite status**:
A read-only status lookup derived from Graphite metadata and local refs for worktree-status presentation, including worker lifecycle and diagnostics.
*Avoid*: Graphite mutation, PR status, full stack synchronization.

**Graphite submit support**:
Graphite-specific submit/restack/current-PR/branch-info/metadata-prewrite behavior used by SDL submit flows.
*Avoid*: generic PR description generation, GitHub PR gateway ownership.

**Direct `gt` invocation boundary**:
The rule that source code outside `ts/packages/infra/graphite/src/**` should not execute the `gt` binary directly. Other packages may display `gt` commands as remediation text or invoke higher-level CLI surfaces such as `sdl slot gt exec ...` when that CLI is the explicit contract.
*Avoid*: package-local Graphite subprocess helper, hidden convenience shell-out.
