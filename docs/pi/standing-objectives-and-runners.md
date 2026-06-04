# Standing Objectives & Objective Runners — Design Brief

**Status:** Updated disposition on 2026-06-04. The separate prototype/general Objective implementation runner direction has been superseded by folding confirmed execution into `objective-next` as the user-facing front door.

**Context:** Comparison of `aigorahub/elves`, Karpathy's `autoresearch`, Sakana AI Scientist, and Ralph against asdl's Objective system surfaced a missing capability: Objectives that can be advanced autonomously or continuously without turning the Objective record into a workflow controller.

This document is a design brief, not the canonical Objective spec. The canonical checked-in Objective mechanics remain in [`docs/objective-system.md`](../objective-system.md).

---

## 1. Core model

There are two orthogonal axes:

| Axis        | Question                        | Property of              | Values                     |
| ----------- | ------------------------------- | ------------------------ | -------------------------- |
| **Horizon** | Does the goal naturally finish? | the **Objective** (noun) | **bounded** ↔ **standing** |
| **Drive**   | Who advances it?                | the **Runner** (verb)    | **human** ↔ **autonomous** |

The Objective/Runner split is load-bearing:

- The **Objective** is the durable narrative spec: goal, boundaries, assumptions, progress rubric, and reusable learnings.
- The **Runner** is the harness that advances the Objective: it chooses moves, manages branches when requested, validates, keeps or rejects work, and stops.

Today's system mostly lives in the bounded/human quadrant, with `objective-stack-impl` occupying a bounded/autonomous-ish specialized stack runner role. General Objective advancement now enters through `objective-next`, which can recommend, steer, or offer confirmed execution when durable policy permits it.

|                       | **Bounded**                                             | **Standing**                                            |
| --------------------- | ------------------------------------------------------- | ------------------------------------------------------- |
| **Human-driven**      | Human works a finite Objective to closure               | Human tends an ongoing goal over time                   |
| **Autonomous-driven** | Runner advances as far as it can under a bounded launch | Runner repeatedly improves or maintains a standing goal |

### Standing, not permanent

Use **standing Objective** for the horizon term. It means the Objective has no natural goal-met finish line, but it can still be closed when it is retired, superseded, obsolete, or intentionally abandoned.

Avoid adding lifecycle states up front. The Objective system remains `active / closed`; assumption divergence and review needs are events or findings, not new statuses.

### Autoobjective is colloquial

**Autoobjective** is useful shorthand for “an Objective designed for autonomous pursuit.” It is not a formal third noun in the ontology.

- A bounded Objective can be an autoobjective.
- A standing Objective can be human-driven and therefore not an autoobjective.
- A standing autoobjective is the autoresearch/Ralph-like quadrant.

Do not call every execution-friendly Objective autonomous. Human-assisted execution after preview is weaker than autonomous pursuit and can be enabled by narrower policy.

---

## 2. Prior-art loop shape

- **Karpathy `autoresearch`**: human writes `program.md`; agent rewrites `train.py`; a fixed job reports `val_bpb`; keep if metric improves, otherwise roll back. Principle: if there is a real objective metric, the human should not be in the inner loop.
- **Sakana AI Scientist**: similar loop shape, plus idea archive and novelty checks so later iterations do not rediscover earlier attempts.
- **Ralph**: generic `while true` loop with fresh context per pass and memory in durable text/git artifacts.

The useful transplant is not “make Objectives into programs.” It is:

1. start each pass from durable intent plus current repo state;
2. attempt one candidate move;
3. keep only clearly evidenced progress;
4. preserve only reusable semantic learnings;
5. keep loop control state outside the Objective.

---

## 3. Objective record convention

Standing Objectives and execution-friendly Objectives remain normal Objective records:

```text
.asdl/objectives/<slug>/
  objective.md
  roadmap.md
  updates/
  closed.md  # optional; existence means closed
```

No alternate record shape, YAML schema, registry, hidden state, or task database is introduced.

### Required Objective sections still apply

The existing required headings stay valid:

- `## Thesis`
- `## Scope`
- `## Non-Goals`
- `## Completion Criteria`
- `## Assumptions and Risks`
- `## Open Questions`

For a **standing Objective**, `## Completion Criteria` should describe **retirement / closure criteria**, not a natural finish line. Example:

```md
## Completion Criteria

This is a standing Objective. It has no goal-met finish line. Close it when the goal is obsolete, superseded by another Objective, no longer worth maintaining, or intentionally abandoned by a human.
```

`## Assumptions and Risks` is the durable home for load-bearing assumptions. When an assumption no longer holds, record that as an **assumption invalidated** event/finding, not as a new Objective status.

### Optional execution policy sections

Execution-friendly Objectives may add optional top-level prose sections:

```md
## Definition of Progress

Progress is keepable when:

- ...

Do not keep changes that:

- ...

Useful evidence includes:

- ...

## Runner Policy

This Objective is execution-friendly for `objective-next` under the boundaries below.

- Direct execution is allowed when: ...
- Steer or ask first when: ...
- Materialization: ...
- Validation: ...
- External side effects: ...
```

The `## Runner Policy` signal is prose, not a key-value permission bit. If policy is absent or ambiguous, `objective-next` must not infer execution permission from a concrete roadmap row alone. It should recommend only and explain that durable policy enables future execution offers.

Minimum durable content before treating an Objective as autonomy-designed is stronger than ordinary execution-friendliness:

1. a North Star or equivalent durable goal;
2. a Definition of Progress;
3. load-bearing assumptions in `## Assumptions and Risks`;
4. runner boundaries / escalation guidance.

Metrics are optional. When present, a metric is part of the Definition of Progress, not a replacement for the qualitative rubric and boundaries.

### `roadmap.md` for standing Objectives and row policy

`roadmap.md` remains required. Standing Objectives should use it as **standing operating guidance**, not as a durable queue of next moves.

Recommended standing shape:

```md
# Roadmap

## Work

- [~] Keep improving/maintaining <standing direction>.
  - Guidance: ...
  - Evidence: ...

## Parked

- [ ] Direction intentionally not pursued right now because ...
```

A standing row may remain `[~]` until the direction is retired, replaced, or the Objective is closed. Marking it `[x]` means the standing direction ended, not that one runner pass finished the whole Objective.

Rows may carry slice-local policy:

```md
- [ ] Example semantic slice.
  - Policy: direct execution after preview.
  - Evidence: targeted tests and relevant repo checks pass.
- [ ] Resolve the terminology boundary.
  - Policy: steer first; ask the human to choose the canonical term before editing docs.
```

The runner may use `roadmap.md` case-by-case, based on the Objective's prose. For standing Objectives, it must not treat roadmap entries as a hidden pass queue. The next move is re-derived from:

```text
(goal, current repo state, durable learnings, current launch scope)
```

### `updates/` as semantic memory, not a run log

The existing Semantic Update log is sufficient durable history. Do not add a separate run ledger.

Write updates only when there is meaningful Objective impact:

- kept progress;
- changed assumptions or risk knowledge;
- reusable learnings;
- ruled-out approaches future runs should not rediscover;
- changed roadmap or progress-rubric understanding.

Do not write ceremonial launch summaries, iteration counters, or rejected-attempt ledgers.

---

## 4. Current runner disposition: `objective-next`

The general runner path is folded into **`objective-next`**, not a separate development/prototype command. The prior prototype surfaces' useful safety contract now belongs in the `objective-next` skill and canonical Objective docs.

`objective-next` is the single front door for one selected active Objective:

1. resolve exactly one explicit Objective or ask the user to choose;
2. read `objective.md`, `roadmap.md`, and relevant `updates/`;
3. apply the read-only Tracking Gate before recommendation or execution;
4. recommend the next semantic step by default;
5. when policy says to steer first, ask or recommend planning instead of executing;
6. when explicit durable policy permits direct execution, present an inline execution preview and wait for human confirmation;
7. run only within the confirmed scope;
8. keep only evidenced progress;
9. stop with a prose explanation.

The preview should include:

- selected Objective slug;
- policy basis, including Runner Policy and row-level `Policy:` when relevant;
- proposed bounded scope;
- likely materialization shape;
- expected validation;
- external access and side-effect expectations;
- when the runner should stop or ask;
- whether Objective updates are expected;
- PR submission status.

Default PR wording is: `PR submission is out of scope for this launch.`

There is no fixed default pass count. The runner proposes a bounded scope in the preview, and the human confirms it.

### Relationship to `objective-stack-impl`

Keep `objective-stack-impl` as the specialized planned-stack runner. It remains useful when the user explicitly wants one Objective implemented as a small Graphite stack. General recommend/steer/confirmed-execution behavior belongs to `objective-next`.

---

## 5. Keep, reject, and materialize

A runner pass is kept only when it can cite concrete evidence against the Objective's Definition of Progress or equivalent policy and pass evidence-appropriate validation.

Validation is artifact-specific:

- code changes should run relevant tests/checks;
- docs/Markdown changes should run relevant formatting or docs checks when available;
- research-only outputs should cite sources/evidence;
- skipped validation must be explicitly justified.

Ambiguous changes are not kept.

For v1, materialization defaults to local edits unless the confirmed preview includes branch or commit work. If branch creation, commit amendment, restacking, or submission is in scope in this repo, consult the Graphite workflow first.

Rejected candidates should be discarded: reset/delete the candidate branch or dirty state, and preserve only reusable semantic learnings when they matter.

A launch can still be successful with no branch or Objective update when the runner credibly checks the Objective and finds no safe/useful progress to keep. That is especially important for maintain-forever standing Objectives, where healthy steady state should not create churn.

### Objective updates in kept work

When a kept pass materially advances the Objective, include concise Objective tracking changes in the same materialized work:

- edit `objective.md` or `roadmap.md` when durable narrative/guidance changes;
- add a Semantic Update when there is meaningful Objective impact;
- update assumptions/risks when assumptions are invalidated or risk knowledge changes.

Do not write Objective updates solely to memorialize a no-op launch.

---

## 6. Anti-goals and guardrails

Do not turn Objectives into:

- workflow controllers;
- state machines;
- task databases;
- hidden agent stores;
- run ledgers;
- branch attachment systems;
- automation registries.

Do not add new lifecycle states for standing or autonomy-designed Objectives in v1. `active` and `closed` remain sufficient.

Do not formalize “autoobjective” as schema or a required type field. It is colloquial language for an Objective whose prose is shaped well enough for autonomous pursuit.

Do not require metrics. Numeric metrics are powerful when available, but qualitative Definitions of Progress are valid.

External side effects are not allowed by default. Publishing, deploying, mutating GitHub issues/PRs, calling write APIs, or changing external systems requires explicit Runner Policy or confirmed preview scope.

---

## 7. Deferred decisions

These remain intentionally deferred until real use clarifies them:

- exact execution-preview format;
- branch naming and candidate-branch cleanup mechanics when branch materialization is confirmed;
- how much `objective-next` and `objective-stack-impl` should share implementation guidance;
- whether stable runner behavior should eventually move from skill prose into deterministic CLI fact helpers;
- whether `## Runner Policy` should gain more standard example bullets after real use.

The direction is no longer to create or keep a separate proto/general runner surface. The first slice is skill/docs/Pi-surface consolidation around `objective-next`.
