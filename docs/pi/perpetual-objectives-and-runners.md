# Perpetual Objectives & Runners — Design Brief (WIP)

**Status:** Draft / in-progress. Captured mid-grill on 2026-05-31.
**Context:** Comparison of `aigorahub/elves` and Karpathy's `autoresearch` against asdl's Objective system surfaced a new capability: objectives that pursue a goal continuously rather than draining a predefined plan to closure.

---

## 1. The core idea

There are **two orthogonal axes**, and they map cleanly onto the two nouns we already separated (the durable record vs. the harness that advances it):

| Axis        | Question                | Property of              | Values                              |
| ----------- | ----------------------- | ------------------------ | ----------------------------------- |
| **Horizon** | Does the goal ever end? | the **Objective** (noun) | **bounded** (today) ↔ **permanent** |
| **Drive**   | Who advances it?        | the **Runner** (verb)    | **human** ↔ **autonomous**          |

The runner/objective split is _why_ the axes are orthogonal: the objective never needs to know who is driving; the runner never needs to know whether the goal terminates.

|                       | **Bounded** (defined end)                                        | **Permanent** (may never hit it)                            |
| --------------------- | ---------------------------------------------------------------- | ----------------------------------------------------------- |
| **Human-driven**      | Today's default — work a plan objective to closure               | Person pursues a standing goal over time                    |
| **Autonomous-driven** | `objective-stack-impl` / elves run a finite objective to its end | autoresearch / Ralph — perpetual optimization toward a goal |

Today's entire system lives in the **left column**. The right column and the autonomous row are _independent_ unlocks.

### Two flavors inside "permanent" (texture, not a third axis)

- **Optimize-forever** (autoresearch): no ceiling, monotone push; _keep-iff-improved_ is the engine.
- **Maintain-forever** (SRE setpoint): hold within a band; act on drift; escalate on breach.

---

## 2. Prior art (researched)

- **Karpathy `autoresearch`** (released 2026-03-07, ~630 LOC). Loop: human writes `program.md` (a "super-lightweight skill" = goal + process); agent rewrites `train.py`; objective metric is `val_bpb`; each pass runs a fixed 5-min job, **keep if metric improved else roll back**; ~12 experiments/hr. Principle: **"if you have an objective metric, you should not be in the loop."**
- **Sakana AI Scientist**: same loop shape + an explicit **idea archive + novelty check** so iteration N doesn't re-derive N−1; LLM reviewer as soft metric.
- **Ralph** (Huntley, 2025-07): the generic `while true`, fresh context per pass, memory in `progress.txt` / `prd.json` / git, stop when "all PRD items complete." Direct ancestor of elves.

Sources: github.com/karpathy/autoresearch, sakana.ai/ai-scientist, ghuntley.com/ralph.

---

## 3. Architectural boundary (carried from the elves comparison)

> **The Objective owns the _spec_ of the loop. The harness owns the _state_ of the loop.**

- **In the Objective record (durable, semantic, markdown):** the goal, the process/policy, the learnings archive. Describes the loop the way `program.md` describes the research org — it never _is_ the loop.
- **Outside the Objective (branch-local, ephemeral, regenerable):** iteration counters, keep/rollback ledger, candidate-move queue, stop gate, continuation guard. Throwaway run-state.

This preserves the existing invariant: **"An Objective is not a workflow controller, state machine, hidden agent store, or task database."**

### Emergent-roadmap rule (load-bearing)

A permanent objective _discovers_ its next move; it must not store a checklist (that would become the banned task DB). The agent may append **learnings** ("tried X, regressed, ruled out"), but the **next move is always re-derived from `(goal, current repo state, learnings)` at the top of each pass** — never read from a stored queue.

---

## 4. Settled decisions (from the grill)

1. **Architecture: B-with-a-thin-slice-of-A.** A new _runner_ skill (the continuous sibling of `objective-stack-impl`) carries the novelty. We bless only a thin slice of objective schema: `{North Star, process/definition-of-progress}` (+ an optional metric when one happens to exist). The durable record stays nearly untouched. Prototype as a `dev-`-prefixed skill, dogfood, then graduate.

2. **No new closure vocabulary.** "Retiring" a permanent objective is just **closing** it. We do not invent a separate term; a permanent objective is closed by human decision rather than by goal-met evidence, but it's still `closed`.

3. **Metric NOT required** — even for autonomous runners. A permanent objective may be purely qualitative. _Consequence:_ without a metric there's no automatic keep/rollback signal, so the loop leans on a qualitative rubric (see #4).

4. **Progress rubric lives IN the objective.** `objective.md` carries a qualitative _definition-of-progress_ in its process section. **Every** runner — human on Monday, autonomous overnight — applies the same bar. The bar is durable intent (noun); the _act_ of judging (subagent, checklist, adversarial verify) is execution (verb), and stays in the runner.

5. **Staleness is reframed as assumption-divergence, not recency.** A permanent objective sitting quiet in steady state is **healthy**. It becomes stale only when **the assumptions undergirding it have changed** — new external facts or code changes. (Implies the objective should record its load-bearing assumptions; detection mechanism TBD — see open questions.)

6. **Lifecycle: `active / closed` only — for now.** Default to simplicity. We explicitly rejected adding `paused` / `dormant` states up front. States will be added iteratively as we experiment if the need proves real. (Human pause/resume is treated as an ephemeral per-session runner choice, not recorded on the objective.)

---

## 5. Open questions (interrupted — NOT yet answered)

These were asked in a bad batch (grill-me malfunction, see below) and were **not** truly answered; treat them as open:

1. **Stale-detection mechanism.** Explicit `Assumptions` section that a runner re-checks each pass (recommended) vs. human-only marking vs. assumptions + automated tripwire commands. _(Strong simplicity signal from the user suggests: explicit assumptions + agent re-check, no daemon.)_
2. **Validity term** for "assumptions no longer hold," distinct from time-stale: `out-of-date` / `invalidated` / `needs-review` / `drifted`. _(May be moot given #6's simplicity stance — possibly defer until we have the state.)_
3. **Autonomous gate.** How does "leave this objective to humans" persist so an autonomous runner skips it? Candidate: a durable **drive-policy** in the objective's spec section (`autonomous: yes|no`), defaulting to human-only (opt-in to autonomy) vs. scoping it at runner launch vs. overloading `needs-review`.
4. **Stop condition** for one autonomous launch: budget + no-progress escalation (recommended) vs. budget-only vs. progress-stall-only.
5. **Pass output / git materialization:** one small PR per kept pass (recommended, reuses gt/PR review surface) vs. long-lived branch + batch review vs. bounded Graphite stack then recycle.

---

## 6. Next steps

- Resume the grill **one question at a time** to close §5.
- Then draft: (a) the concrete `objective.md` shape for a permanent objective (North Star + process/definition-of-progress + Assumptions), and (b) the `objective-pursue` (working name) runner loop contract.
