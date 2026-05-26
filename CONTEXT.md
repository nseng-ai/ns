# ASDL Tools

This context captures project language for durable planning workflows in this repository.

## Language

**Objective**:
A checked-in documentation workstream for durable multi-session, multi-branch, or multi-PR work.
_Avoid_: hidden agent state, ticket

**Durable Narrative Roadmap Record**:
The role of an **Objective** as human-readable context and ordered work guidance, without owning workflow-control semantics.
_Avoid_: Workflow controller, state machine, task database

**Active Objective Root**:
The checked-in repository directory `.asdl/objectives/` that contains Objective records considered by normal Objective discovery, listing, reading, update, next-work, and close workflows.
_Avoid_: open objectives directory, hidden local cache, archive root

**Objective Archive Root**:
The checked-in repository directory `.asdl/objective-archive/` that parks Objective records outside normal active discovery without changing their slug, prose, updates, or closure marker.
_Avoid_: deletion, closed objective root, hidden cache

**Archived Objective**:
An **Objective** record located under the **Objective Archive Root**. Archive state is a location choice, not a replacement for open/closed state.
_Avoid_: closed objective, deleted objective, stale update

**Objective Slug**:
The directory name under an Objective root that is the stable identity for one **Objective**.
_Avoid_: title, branch name, PR name, package name

**Objective Slug Migration**:
An explicit move of an **Objective** from one slug directory to another after the user chooses a new canonical identity.
_Avoid_: rename cleanup, path normalization, hidden remap

**Semantic Update**:
An update file that records meaningful objective information such as a finding, decision, blocker, completion evidence, changed plan, or follow-up.
_Avoid_: Ceremonial update, status ping, branch changelog

**Tracking Gate**:
A read-only check that blocks next-work recommendations when branch or worktree evidence suggests objective progress has not been recorded, until an explicit **Objective Update** handoff is confirmed.
_Avoid_: Auto-refresh, auto-update, hidden reconciliation

**Objective Update**:
The explicit mutation workflow that updates objective tracking by editing durable files and, when there is meaningful semantic information, writing a **Semantic Update**.
_Avoid_: Progress log, automatic refresh, hidden reconciliation

**Objective Close**:
The explicit mutation workflow that records an objective as complete or intentionally abandoned while preserving its checked-in history and writing a **Closure Marker**.
_Avoid_: Deletion, archive, archival state machine

**Objective Archive**:
The explicit directory-move workflow that moves an Objective record between the **Active Objective Root** and the **Objective Archive Root** without editing Objective prose or changing closed/open state.
_Avoid_: Objective Close, slug migration, deletion

**Closure Marker**:
A lightweight `closed.md` file whose existence lets tools identify closed objectives without language-model interpretation.
_Avoid_: Hidden status, archive state, deletion

## Relationships

- An **Objective** lives as checked-in durable markdown under `.asdl/objectives/<slug>/` while active, or `.asdl/objective-archive/<slug>/` while archived.
- The **Objective Slug** is the stable identity for an **Objective**; the markdown title may change.
- Normal Objective workflows stop on possible **Objective Slug Migration** evidence rather than moving, deleting, recreating, or normalizing slug directories as cleanup.
- `.asdl/objectives/` and `.asdl/objective-archive/` are first-class repository content, not local cache state.
- `docs/objective-system.md` is the canonical operational specification for objective mechanics.
- An **Objective** may span multiple branches or pull requests.
- An **Objective** has three core documentation surfaces: `objective.md`, `roadmap.md`, and `updates/`.
- A pull request that materially advances an **Objective** should include the corresponding `objective.md`, `roadmap.md`, or `updates/` change before it lands.
- A **Semantic Update** should communicate why `objective.md` or `roadmap.md` changed, or why they intentionally did not need to change after meaningful evidence was considered.
- Maintenance edits to `objective.md` or `roadmap.md` do not require an update file when they add no new semantic information.
- **Objective Update** is the explicit mutation workflow for objective tracking.
- **Objective Close** preserves the objective record, updates `objective.md` with closure context, and writes a **Closure Marker** for non-LM filtering.
- **Objective Close** does not archive; **Objective Archive** is a separate explicit move between roots.
- Open/closed and active/archived are orthogonal axes: `closed.md` records closure state, while root location records whether normal active workflows discover the record.
- `objective list` is deterministic read tooling over active-root Objective status, current-branch status mode, and work-branch update facts; it uses git facts, does not parse Objective prose, does not depend on Graphite, and does not scan the **Objective Archive Root**.
- `objective exec read-objective` reads active-root records; archived records require direct file inspection or explicit unarchive before active Objective workflows update them.
- Closed active **Objectives** are readable by `objective-current` but are not eligible for `objective-next` by default.
- Archived **Objectives** are outside normal Objective discovery regardless of whether they contain `closed.md`.
- `objective-next` may apply a **Tracking Gate**; it does not silently mutate objective files, and any files changed after a gate block must be through an explicit **Objective Update** handoff.
- When no **Objective** is explicit, objective operations should list active-root candidates and ask the user to choose rather than infer ownership from branch or worktree evidence.
- `objective-update` has a narrow one-active-objective confirmation path, but it still asks before collecting evidence or mutating files.
- An **Objective** does not have a branch attachment mechanism in v1.
- V1 starts fresh from `.asdl/objectives/`; `docs/objectives/` is not a canonical objective root.

## Example dialogue

> **Dev:** "Should this multi-PR cleanup be tracked as an **Objective**?"
> **Domain expert:** "Yes — it needs durable context and sequencing across sessions. Keep it active under `.asdl/objectives/` while normal workflows should find it; archive it only when you explicitly want it out of active discovery."

## Flagged ambiguities

- **Active** can mean "active status filter" (`open` + `in-flight`) or "active root" (`.asdl/objectives/`, which can also contain closed records). Prefer **Active Objective Root** for the location and spell out status filters separately.
- Enforcement of the rule that objective-affecting PRs update objective docs before landing is unresolved.
