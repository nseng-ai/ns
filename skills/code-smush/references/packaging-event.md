# code-smush — packaging-event manifest

Filename convention, manifest template, and content rules for the Phase 7
packaging-event Semantic Update. Read alongside `SKILL.md` Phase 7.

## Filename

Timestamped, human-readable, collision-checked; an existing event is immutable,
so a collision means a new filename, never an overwrite or amend:

```text
.ns/objectives/<slug>/updates/YYYY-MM-DDTHHMMSSZ-packaging-event-<safe-run>.md
```

## Template

The event uses the Objective Semantic Update headings and this focused manifest:

```markdown
# Packaging event: <run>

## Summary

Owning Objective: `<slug>`
Source run: `<branch>`
Trunk: `<trunk>`
Construction: <initial in-place | replacement>
Generation: <initial | st2 | st3 | ...>

| Order | Branch     | Classification |
| ----- | ---------- | -------------- |
| 01    | `<branch>` | Decision       |
| 02    | `<branch>` | Span           |

Validation: <candidate-tree repository gate and final topology/restack checks>

## Objective Impact

The packaged stack is bound to this Objective. Later Decision-PR decision records
belong in this Objective's update stream. This event is historical evidence; current
topology must be re-derived from Git/Graphite and branch grammar.

## Follow-Ups

- Submission remains user-owned.
- Decision branches, bottom-up: `<ordered Decision branches>`.
- Replacement close candidates: `<complete old-stack branch list, or not applicable>`.
- Previous packaging event: `<path, or unavailable without guessing>`.
- PR closure and feedback carry-forward remain outside local-only smush.
```

## Content rules

The event records only what stays true after it is committed. Exclude: final tip
SHAs (the event commit/squash would invalidate them), the full command
transcript, backup inventory, cut-analysis conversation, mutable status fields,
and claims about remote CI/PR state.

Previous packaging event: for replacement runs, inspect immutable updates under
the selected Objective for a confidently identifiable previous packaging event;
otherwise write `unavailable` rather than guessing.
