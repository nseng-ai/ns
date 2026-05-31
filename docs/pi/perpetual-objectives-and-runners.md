# Standing Objectives & Objective Impl Runners — Design Brief

**Status:** Consolidated design direction after grill on 2026-05-31.
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
- The **Runner** is the harness that advances the Objective: it chooses moves, manages branches, validates, keeps or rejects work, and stops.

Today's system mostly lives in the bounded/human quadrant, with `objective-stack-impl` occupying a bounded/autonomous-ish specialized runner role.

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

### Standing flavors

Standing Objectives can have different textures without adding a third axis:

- **Optimize-forever**: no fixed ceiling; keep pushing when evidence shows improvement.
- **Maintain-forever**: hold a system within a healthy band; act on drift; escalate when assumptions fail.

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

Standing Objectives and autoobjectives remain normal Objective records:

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

### Optional autoobjective sections

Autoobjectives may add optional top-level prose sections to make autonomous pursuit safe and legible:

```md
## North Star

The stable goal the runner should optimize or maintain over time.

## Definition of Progress

Light rubric for deciding whether a pass should be kept.

Progress looks like:

- ...

Do not keep changes that:

- ...

Useful evidence includes:

- ...

## Runner Policy

This Objective is designed for autonomous pursuit under the boundaries below.

- Launch shape: ...
- Materialization: ...
- External access: ...
- Ask or stop when: ...
```

The `## Runner Policy` signal is prose, not a key-value permission bit. Prefer wording like:

> This Objective is designed for autonomous pursuit under the boundaries below.

If this signal is absent or ambiguous, a runner must not assume the Objective is autonomy-designed. It may still operate in human-assisted mode when a human confirms an explicit execution preview.

Minimum durable content before treating an Objective as autonomy-designed:

1. a North Star;
2. a Definition of Progress;
3. load-bearing assumptions in `## Assumptions and Risks`;
4. runner boundaries / escalation guidance.

Metrics are optional. When present, a metric is part of the Definition of Progress, not a replacement for the qualitative rubric and boundaries.

### `roadmap.md` for standing Objectives

`roadmap.md` remains required, but standing Objectives should use it as **standing operating guidance**, not as a durable queue of next moves.

Recommended shape:

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

## 4. `dev-objective-impl`: first runner direction

Prototype the general runner as a dogfood-only skill/command named **`dev-objective-impl`**.

Here, **impl** is broad: making durable progress on an Objective. It can include code, docs, tests, research artifacts, maintenance work, or Objective-only semantic learnings when those are the correct output.

### Relationship to `objective-stack-impl`

Keep the existing `objective-stack-impl` runner as the specialized planned-stack runner for now.

`dev-objective-impl` is the more general emergent runner:

- explicit Objective selection;
- derive the next move from Objective + repo + learnings;
- proceed as far as the confirmed launch scope allows;
- materialize kept progress as reviewable git changes.

Later, `objective-stack-impl` may become a mode or wrapper of the broader runner if dogfooding proves the abstraction.

### Launch contract

A `dev-objective-impl` launch should:

1. resolve exactly one explicit Objective;
2. read `objective.md`, `roadmap.md`, and relevant `updates/`;
3. determine whether the Objective is clearly designed for autonomous pursuit;
4. present a concise execution preview;
5. wait for human confirmation;
6. run only within the confirmed scope;
7. stop with a prose explanation.

The preview should include:

- selected Objective;
- whether the run is autonomous or human-assisted;
- proposed bounded budget/scope;
- likely materialization shape;
- expected validation;
- external access expectations;
- when the runner should stop or ask;
- whether Objective updates are expected.

There is no fixed default pass count. The runner proposes a bounded scope in the preview, and the human confirms it.

### Autonomy-designed vs. human-assisted mode

If the Objective is clearly designed for autonomous pursuit, the runner may proceed inside the confirmed launch scope without asking after every pass.

If the Objective is not clearly designed for autonomous pursuit, the runner may still help in **human-assisted mode**. Human-assisted mode uses an upfront confirmed plan/preview, similar to `objective-stack-impl`; the preview must carry more human-authored specificity because the Objective itself does not provide the autonomy-ready rubric.

### Execution architecture

Use a parent orchestrator with fresh serial runner subagents:

- The parent owns Objective selection, preview, branch control, subagent prompts, keep/reject judgment, Objective updates, commits, and stop decisions.
- Each candidate pass runs in a fresh focused subagent when delegation is useful.
- Run one pass/subagent at a time in the current worktree.
- Do not run parallel implementation passes in v1.

Loop state such as counters, candidate notes, and rejected-attempt ledgers stays in-session and in ephemeral git state. Durable state is limited to kept repo changes and meaningful Objective updates.

### External access

Read-only external research is allowed by default for assumption checks and move derivation.

External side effects are not allowed by default. Publishing, deploying, mutating GitHub issues/PRs, calling write APIs, or changing external systems requires explicit launch scope or Runner Policy guidance.

---

## 5. Keep, reject, and materialize

A runner pass is kept only when it can cite concrete evidence against the Objective's Definition of Progress and pass evidence-appropriate validation.

Validation is artifact-specific:

- code changes should run relevant tests/checks;
- docs/Markdown changes should run relevant formatting or docs checks when available;
- research-only outputs should cite sources/evidence;
- skipped validation must be explicitly justified.

Ambiguous changes are not kept.

### Git materialization

For v1, materialize each kept pass as one small local Graphite branch/commit. PR submission remains a separate explicit human request.

Rejected candidates should be discarded: reset/delete the candidate branch or dirty state, and preserve only reusable semantic learnings when they matter.

A launch can still be successful with no branch or Objective update when the runner credibly checks the Objective and finds no safe/useful progress to keep. That is especially important for maintain-forever standing Objectives, where healthy steady state should not create churn.

### Objective updates in kept branches

When a kept pass materially advances the Objective, include concise Objective tracking changes in the same branch:

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

---

## 7. Deferred decisions

These are intentionally left for prototype dogfooding:

- exact `dev-objective-impl` skill text and launch flags;
- exact execution-preview format;
- branch naming and candidate-branch cleanup mechanics;
- how much `dev-objective-impl` should reuse `objective-stack-impl` internals;
- whether `objective-stack-impl` eventually becomes a mode of `objective-impl`;
- whether stable parts of this brief should be promoted into `docs/objective-system.md`;
- whether `## Runner Policy` should gain more standard example bullets after real use.

---

## 8. Next concrete slice

A credible first implementation slice is documentation and skill scaffolding only:

1. keep this design brief as the dogfood reference;
2. create a `dev-objective-impl` skill that implements the v1 launch contract;
3. dogfood it on one bounded Objective and one standing Objective;
4. only then decide which conventions belong in the canonical Objective system spec.
