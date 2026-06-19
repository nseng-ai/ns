# ASDL Tools

This context captures project language for durable planning workflows in this repository.

## Language

**Objective**:
A checked-in documentation workstream for durable multi-session, multi-branch, or multi-PR work.
*Avoid*: hidden agent state, ticket

**Synthesis Objective**:
A prose-only **Objective** pattern that coordinates a family of narrower child Objectives while remaining the durable place for cross-child lessons, migration guides, and synthesized closure evidence.
*Avoid*: Fire-and-forget umbrella, mirrored task tracker, hidden parent state, Objective CLI feature

**Child Objective**:
A narrower **Objective** created from a parent **Synthesis Objective** to own one implementation, research, or migration slice; the child remains `open` until its own **Objective Close**, while the parent roadmap may use `[~]` to show that the child exists and is in progress.
*Avoid*: Subticket, hidden task, third Objective status

**Durable Narrative Roadmap Record**:
The role of an **Objective** as human-readable context and ordered work guidance, without owning workflow-control semantics.
*Avoid*: Workflow controller, state machine, task database

**Active Objective Root**:
The checked-in repository directory `.asdl/objectives/` that contains Objective records considered by normal Objective discovery, listing, reading, update, next-work, and close workflows.
*Avoid*: open objectives directory, hidden local cache, archive root

**Objective Archive Root**:
The checked-in repository directory `.asdl/objective-archive/` that parks Objective records outside normal active discovery without changing their slug, prose, updates, or closure marker.
*Avoid*: deletion, closed objective root, hidden cache

**Archived Objective**:
An **Objective** record located under the **Objective Archive Root**. Archive state is a location choice, not a replacement for open/closed state.
*Avoid*: closed objective, deleted objective, stale update

**Objective Slug**:
The directory name under an Objective root that is the stable identity for one **Objective**.
*Avoid*: title, branch name, PR name, package name

**Objective Slug Migration**:
An explicit move of an **Objective** from one slug directory to another after the user chooses a new canonical identity.
*Avoid*: rename cleanup, path normalization, hidden remap

**Semantic Update**:
An update file that records meaningful objective information such as a finding, decision, blocker, completion evidence, changed plan, or follow-up.
*Avoid*: Ceremonial update, status ping, branch changelog

**Tracking Gate**:
A read-only check that blocks next-work recommendations when branch or worktree evidence suggests objective progress has not been recorded, until an explicit **Objective Update** handoff is confirmed.
*Avoid*: Auto-refresh, auto-update, hidden reconciliation

**Objective Update**:
The explicit mutation workflow that updates objective tracking by editing durable files and, when there is meaningful semantic information, writing a **Semantic Update**.
*Avoid*: Progress log, automatic refresh, hidden reconciliation

**Objective Close**:
The explicit mutation workflow that records an objective as complete or intentionally abandoned while preserving its checked-in history and writing a **Closure Marker**.
*Avoid*: Deletion, archive, archival state machine

**Objective Archive**:
The explicit directory-move workflow that moves an Objective record between the **Active Objective Root** and the **Objective Archive Root** without editing Objective prose or changing closed/open state.
*Avoid*: Objective Close, slug migration, deletion

**Closure Marker**:
A lightweight `closed.md` file whose existence lets tools identify closed objectives without language-model interpretation.
*Avoid*: Hidden status, archive state, deletion

## Architecture Boundaries

These terms are general across the codebase. The canonical definitions are replicated here for discoverability; the `typescript-fake-driven-testing` skill carries the fuller mechanics.

**Gateway**:
The canonical interface to an external or non-deterministic capability — process execution, Git, GitHub, filesystem, network, the system clock, and timers. Business logic depends on a Gateway rather than on the raw capability, so the Gateway is the single seam where real I/O is replaced by an in-memory fake in tests. External-service boundaries carry the `Gateway` suffix (`ExecGateway`, `GitGateway`, `PRGateway`); small runtime primitives are Gateways by category but named bare (`Clock`, `TimerScheduler`).
*Avoid*: port, generic service locator, dependency-injection bag

**Domain logic**:
Deterministic code that consumes one or more **Gateways** to produce or transform domain values, such as assembling a worktree's status from several `ExecGateway` calls. It is not a seam to the outside world: substituting domain logic in a test fakes logic you own, so prefer faking the **Gateway** beneath it. Name domain logic with a domain-specific verb (`load`, `read`, `resolve`, `assemble`, …, chosen for the domain action, not a mandated prefix); do not mint `…Loader` noun-types or a `loaders`/`…Dependencies` collection that dresses stateless functions up as a stateful collaborator.
*Avoid*: business logic, application logic, loader, `…Loader` type, `…Dependencies` injection bag
