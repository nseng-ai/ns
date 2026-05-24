# ASDL Tools

This context captures project language for durable planning workflows in this repository.

## Language

**Objective**:
A checked-in documentation workstream for durable multi-session, multi-branch, or multi-PR work.
_Avoid_: hidden agent state, ticket

**Durable Narrative Roadmap Record**:
The role of an **Objective** as human-readable context and ordered work guidance, without owning workflow-control semantics.
_Avoid_: Workflow controller, state machine, task database

**Objective Root**:
The checked-in repository directory `.asdl/objectives/` that contains objective records keyed by directory slug.
_Avoid_: `docs/objectives/`, hidden local cache, branch attachment registry

**Objective Slug**:
The directory name under the **Objective Root** that is the stable identity for one **Objective**.
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
The explicit mutation workflow that records an objective as complete or intentionally abandoned while preserving its checked-in history.
_Avoid_: Deletion, archival state machine

**Closure Marker**:
A lightweight `closed.md` file whose existence lets tools identify closed objectives without language-model interpretation.
_Avoid_: Hidden status, archive directory, deletion

## Relationships

- An **Objective** lives under `.asdl/objectives/<slug>/` as checked-in durable markdown.
- The **Objective Slug** is the stable identity for an **Objective**; the markdown title may change.
- Normal Objective workflows stop on possible **Objective Slug Migration** evidence rather than moving, deleting, recreating, or normalizing slug directories as cleanup.
- `.asdl/objectives/` is first-class repository content, not local cache state.
- `docs/objective-system.md` is the canonical operational specification for objective mechanics.
- An **Objective** may span multiple branches or pull requests.
- An **Objective** has three documentation surfaces: `objective.md`, `roadmap.md`, and `updates/`.
- A pull request that materially advances an **Objective** should include the corresponding `objective.md`, `roadmap.md`, or `updates/` change before it lands.
- A **Semantic Update** should communicate why `objective.md` or `roadmap.md` changed, or why they intentionally did not need to change after meaningful evidence was considered.
- Maintenance edits to `objective.md` or `roadmap.md` do not require an update file when they add no new semantic information.
- **Objective Update** is the explicit mutation workflow for objective tracking.
- **Objective Close** preserves the objective directory in place, updates `objective.md` with closure context, and writes a **Closure Marker** for non-LM filtering.
- Closed **Objectives** are readable by `objective-current` but are not eligible for `objective-next` by default.
- `objective-next` may apply a **Tracking Gate**; it does not silently mutate objective files, and any files changed after a gate block must be through an explicit **Objective Update** handoff.
- When no **Objective** is explicit, objective operations should list candidates and ask the user to choose rather than infer ownership from branch or worktree evidence.
- `objective-update` has a narrow one-open-objective confirmation path, but it still asks before collecting evidence or mutating files.
- `objective list` is deterministic read tooling over local branch tips; it uses git facts, does not parse Objective prose, and does not depend on Graphite.
- An **Objective** does not have a branch attachment mechanism in v1.
- V1 starts fresh from `.asdl/objectives/`; `docs/objectives/` is not a canonical objective root.

## Example dialogue

> **Dev:** "Should this multi-PR cleanup be tracked as an **Objective**?"
> **Domain expert:** "Yes — it needs durable context and sequencing across sessions."

## Flagged ambiguities

- Enforcement of the rule that objective-affecting PRs update objective docs before landing is unresolved.
