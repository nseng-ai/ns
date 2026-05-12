# ASDL Tools

This context captures project language for durable planning workflows in this repository.

## Language

**Initiative**:
A checked-in documentation workstream for durable multi-session, multi-branch, or multi-PR work.
_Avoid_: Objective, hidden agent state, ticket

**Durable Narrative Roadmap Record**:
The role of an **Initiative** as human-readable context and ordered work guidance, without owning workflow-control semantics.
_Avoid_: Workflow controller, state machine, task database

**Semantic Update**:
An update file that records meaningful initiative information such as a finding, decision, blocker, completion evidence, changed plan, or follow-up.
_Avoid_: Ceremonial update, status ping, branch changelog

**Tracking Gate**:
A read-only check that blocks next-work recommendations when branch or worktree evidence suggests initiative progress has not been recorded.
_Avoid_: Auto-refresh, auto-update, hidden reconciliation

**Initiative Update**:
The explicit mutation workflow that updates initiative tracking by editing durable files and, when there is meaningful semantic information, writing a **Semantic Update**.
_Avoid_: Progress log, automatic refresh, hidden reconciliation

**Initiative Close**:
The explicit mutation workflow that records an initiative as complete or intentionally abandoned while preserving its checked-in history.
_Avoid_: Deletion, archival state machine

**Closure Marker**:
A lightweight `closed.md` file whose existence lets tools identify closed initiatives without language-model interpretation.
_Avoid_: Hidden status, archive directory, deletion

## Relationships

- An **Initiative** lives in the repository as durable markdown.
- An **Initiative** may span multiple branches or pull requests.
- An **Initiative** has three documentation surfaces: `initiative.md`, `roadmap.md`, and `updates/`.
- A pull request that materially advances an **Initiative** should include the corresponding `initiative.md`, `roadmap.md`, or `updates/` change before it lands.
- A **Semantic Update** should communicate why `initiative.md` or `roadmap.md` changed, or why they intentionally did not need to change after meaningful evidence was considered.
- Maintenance edits to `initiative.md` or `roadmap.md` do not require an update file when they add no new semantic information.
- **Initiative Update** is the explicit mutation workflow for initiative tracking.
- **Initiative Close** preserves the initiative directory in place, updates `initiative.md` with closure context, and writes a **Closure Marker** for non-LM filtering.
- Closed **Initiatives** are readable by `initiative-current` but are not eligible for `initiative-next` by default.
- `initiative-next` may apply a **Tracking Gate** but must not mutate initiative files.
- When multiple **Initiatives** exist and none is explicit or already touched by the branch, initiative operations should ask the user to choose rather than infer ownership.
- An **Initiative** does not have a branch attachment mechanism in v1.

## Example dialogue

> **Dev:** "Should this multi-PR cleanup be tracked as an **Initiative**?"
> **Domain expert:** "Yes — it needs durable context and sequencing across sessions."

## Flagged ambiguities

- "initiative" is distinct from any objective workflow; design discussion here should not use objective-system mechanics as precedent.
- Enforcement of the rule that initiative-affecting PRs update initiative docs before landing is unresolved.
