# Standing Objectives

Load this reference only when the user says standing, ongoing, continuous, no-natural-finish-line, forever/maintenance Objective, autonomous standing goal, autoobjective, or when an Objective record explicitly says it is standing.

## Meaning

- A **standing Objective** is an Objective whose horizon has no natural goal-met finish line.
- Standing does not mean permanent. Close it when retired, superseded, obsolete, no longer worth maintaining, or intentionally abandoned.
- Do not add lifecycle state, type fields, frontmatter, schema, registries, hidden state, queues, ledgers, or task databases.
- `active` / `closed` remains enough. Archive/unarchive remains a location move, not a standing-specific state.

## Horizon vs drive

Keep these axes separate:

- **Bounded vs standing** describes the Objective horizon.
- **Human-driven vs autonomous** describes the runner/drive.
- A standing Objective can be human-driven.
- A bounded Objective can be autonomous or execution-friendly.
- Standing does not imply autonomous; autonomous does not imply standing.
- **Autoobjective** is colloquial shorthand for an Objective designed for autonomous pursuit. Do not formalize it as schema, type, lifecycle state, or required wording.

## Objective record guidance

Standing Objectives use the normal record shape:

```text
.asdl/objectives/<slug>/
  objective.md
  roadmap.md
  updates/
  closed.md  # optional marker
```

Required headings still apply.

For standing Objectives, `## Completion Criteria` should describe retirement / closure criteria, not goal-met criteria. Example shape:

```md
## Completion Criteria

This is a standing Objective. It has no goal-met finish line. Close it when the goal is obsolete, superseded by another Objective, no longer worth maintaining, or intentionally abandoned by a human.
```

`## Assumptions and Risks` remains the home for load-bearing assumptions. When an assumption no longer holds, record an assumption-invalidated finding or update; do not create a new status.

## Roadmap guidance

`roadmap.md` remains required, but for standing Objectives it is operating guidance, not a hidden runner queue.

A standing row may remain `[~]` while the direction remains active:

```md
# Roadmap

## Work

- [~] Keep improving/maintaining <standing direction>.
  - Guidance: ...
  - Evidence: ...

## Parked

- [ ] Direction intentionally not pursued right now because ...
```

Marking a standing row `[x]` means the standing direction ended, not that one runner pass finished the whole Objective.

## Updates and progress

- Semantic Updates are memory, not a run log.
- Write updates only for kept progress, changed assumptions, risk knowledge, reusable learnings, ruled-out approaches future runs should not rediscover, or changed roadmap/progress-rubric understanding.
- Do not write ceremonial launch summaries, iteration counters, rejected-attempt ledgers, or no-op updates.
- Metrics are optional. Qualitative progress rubrics are valid when execution or autonomy is relevant.

If execution-friendly or autonomous behavior is also relevant, read `execution-policy.md`.
