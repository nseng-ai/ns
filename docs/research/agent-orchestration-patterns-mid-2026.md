# Agent Orchestration Patterns: State of the Evidence, Mid-2026

**Explored:** 2026-07-09.
**Why it exists:** records a session that started from a circulating "Agentic OS — The
Workflows" diagram (nine folklore-named agent workflows) and asked which orchestration
patterns are actually *proven in production with public content backing the claim*. It
traces the pre-December-2025 canon, then focuses on the December 2025 → July 2026 window
(the Opus 4.5/4.6, GPT-5.5, and Fable/Mythos model generations), and closes with how the
findings apply to ns — specifically the idea of a pattern catalog consulted when analyzing
a saved plan's goals to choose an execution/orchestration shape.
**Staleness warning:** this is a point-in-time snapshot, not a maintained source of truth.
The underlying capability curve is moving fast — METR measured autonomous-task horizons
doubling every ~4–7 months, and its own task suite tops out below current frontier models.
The *rules* recorded here (selector questions, preconditions) should age more slowly than
the *parameters* (safe fan-out widths, unattended durations, model names). Re-verify
parameters against current sources before acting on them.

## Summary

Between December 2025 and July 2026, agent orchestration moved from essay-level pattern
taxonomies to production case studies with hard numbers. The headline findings:

1. **Two coordination topologies won, and one question selects between them.** Parallel
   writers work when work shards are structurally disjoint *and* verification is
   mechanical and near-perfect; otherwise the working shape is single-threaded writes with
   parallel intelligence (advisors, reviewers, researchers) around one writer.
2. **Verification is a precondition, not a pattern.** Every successful large-scale case
   had a near-perfect verifier (test suite, compiler, comparison oracle) as its
   load-bearing element; the safe fan-out width is capped by verifier quality.
3. **The bottleneck moved to human direction-and-review capacity.** Frontier models
   sustain hours-to-days of autonomy; the successful runs paired that with deliberate,
   low-frequency human check-ins rather than either full supervision or full autonomy.
4. **Orchestration is becoming a generated artifact.** Claude Code's dynamic workflows
   have the model write a disposable orchestration script per task. A pattern catalog's
   role is therefore an *applicability rubric consulted by the harness-writer*, not a
   library of hand-built orchestration code.
5. **The pre-December canon remains the right base layer.** Anthropic's five 2024
   workflow patterns and the 2025 multi-agent research system scaling rules are still the
   vocabulary spine; the new era adds cards and resets numeric ceilings rather than
   replacing the taxonomy.

## The question and the evidence bar

The session's evidence bar: a pattern qualifies only if it worked in real production use
and there is public content backing that claim — vendor engineering write-ups with
numbers, public postmortems, or peer-reviewed results. Folklore diagrams, unnumbered blog
enthusiasm, and capabilities asserted in marketing copy do not qualify. Patterns from the
original diagram that never cleared the bar are listed explicitly at the end so the
negative result is preserved too.

## Base layer: the pre-December-2025 canon

Still-valid foundations, all pre-dating the window of interest:

- **Anthropic, "Building Effective AI Agents"** (Dec 2024,
  <https://www.anthropic.com/research/building-effective-agents>): the five composable
  workflow patterns — prompt chaining, routing, parallelization, orchestrator-workers,
  evaluator-optimizer — plus the standing advice to start simple and add orchestration
  only when simpler solutions demonstrably fall short.
- **Anthropic, "How we built our multi-agent research system"** (Jun 2025,
  <https://www.anthropic.com/engineering/multi-agent-research-system>): the first public
  production write-up with both quantified benefit (90%+ improvement over single-agent on
  an internal research eval) and quantified cost (~15× token usage). Contributed the
  first public *selection heuristic* mapping task complexity to fan-out width (1 agent for
  fact-finding, 2–4 for comparisons, 10+ for open-ended research). The heuristic's shape
  survives; its numeric ceilings were reset by the 2026 generation (see below).
- **Cognition, "Don't Build Multi-Agents"** (Jun 2025,
  <https://cognition.com/blog/dont-build-multi-agents>): the canonical skeptical
  position — parallel agents writing to shared context make conflicting implicit
  decisions. Partially reversed by its own authors in April 2026 (see below); the part
  that survives is the danger of *non-disjoint parallel writes*.
- **Multi-agent debate skepticism** ("If Multi-Agent Debate is the Answer, What is the
  Question?", <https://arxiv.org/html/2502.08788v1>): free-form debate between agents
  often fails to beat single-agent chain-of-thought or self-consistency at equal compute.
  Important boundary: this indicts *open debate for reasoning accuracy*, not
  *independent verification of concrete artifacts against rubrics*, which the 2026
  production evidence strongly supports. The two are constantly conflated and any pattern
  catalog should separate them explicitly.
- **Claude Code best practices** (<https://code.claude.com/docs/en/best-practices>):
  plan-then-execute gating, subagents for context isolation, worktrees for parallel work.

## The December 2025 → July 2026 production corpus

### Anthropic: a C compiler from a leaderless agent pool (Feb 2026)

<https://www.anthropic.com/engineering/building-c-compiler> — 16 parallel Claude agents
(Opus 4.5, then 4.6) built a 100K-line Rust C compiler over ~2,000 Claude Code sessions
and ~$20K of API cost, reaching a 99% pass rate on compiler test suites and compiling
real projects (SQLite, Redis, FFmpeg, Doom). Pattern content:

- **Decentralized task-locking, no central orchestrator.** Agents ran in loops, claimed
  work by writing lock files to a shared `current_tasks/` directory, pulled/merged/pushed
  autonomously, and released locks. Specialization (dedup agent, performance agent,
  reviewer, documentarian) emerged from task selection, not assigned roles.
- **Oracle-backed comparative verification.** The Linux-kernel bottleneck broke by using
  GCC as a comparison oracle — compiling portions with each compiler to bisect
  miscompilations into independently fixable per-file bugs.
- **Verifier quality as precondition.** Stated directly: the agent will work autonomously
  on whatever it is given, "so it's important that the task verifier is nearly perfect."
- Failure modes recorded: context pollution, time blindness (agents don't self-interrupt),
  merge conflicts on insufficiently sharded tasks, code-quality drift over iterations.

Shipped productized as **agent teams** in Claude Code alongside Opus 4.6
(<https://code.claude.com/docs/en/agent-teams>,
<https://www.anthropic.com/news/claude-opus-4-6>,
<https://techcrunch.com/2026/02/05/anthropic-releases-opus-4-6-with-new-agent-teams/>):
shared task lists plus inter-agent messaging as a first-class product surface.

### Cognition: the public reversal (Mar–Apr 2026)

**"Multi-Agents: What's Actually Working"** (Apr 2026,
<https://cognition.com/blog/multi-agents-working>) — the authors of "Don't Build
Multi-Agents" publicly narrowed their position: a specific class now works, where
**multiple agents contribute intelligence while writes stay single-threaded** — only one
agent mutates shared artifacts; the rest analyze, advise, and review. Three named
production patterns with evidence:

- **Code-review loop**: a dedicated reviewer with a clean context (no builder context,
  avoiding long-context degradation) catches ~2 bugs per PR, 58% of them severe.
- **Smart friend**: a weaker primary model escalates to a stronger model for *guidance*
  (not takeover) when stuck. Works across frontier vendors (Claude + GPT); fails with
  small-to-large delegation because smaller models don't recognize when they're at their
  capability limit.
- **Manager coordination**: a manager agent decomposes week-scale work and coordinates
  child agents ("Devin can now Manage Devins", Mar 2026,
  <https://cognition.com/blog/devin-can-now-manage-devins>), live in the product but
  described as still needing substantial context engineering.

Explicitly still broken per the same post: unstructured swarms with arbitrary agent
negotiation, and models knowing their own limits without scaffolding.

### Anthropic: dynamic workflows — orchestration as generated artifact (May 2026)

<https://claude.com/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code>
(launch: <https://claude.com/blog/introducing-dynamic-workflows-in-claude-code>; analysis:
<https://www.infoq.com/news/2026/06/claude-code-harnesses/>) — Claude Code writes its own
orchestration script per task and runs it across tens-to-hundreds of subagents. Provides
the current canonical pattern vocabulary, each with applicability guidance:
**classify-and-act**, **fan-out-and-synthesize**, **adversarial verification**,
**generate-and-filter**, **tournament**, **loop-until-done**. The architectural point
outranks the taxonomy: when the orchestrator generates the harness, a pattern catalog's
job is to be the rubric the harness-writer consults.

### Fable-generation case studies (Jun 2026)

- **Bun rewritten from Zig to Rust** (<https://bun.com/blog/bun-in-rust>): 535K lines
  mechanically ported in 11 days by a pre-release Fable 5 — 64 concurrent agents across
  4 git worktrees, 6,502 commits, ~$165K API cost (5.9B input / 690M output tokens),
  estimated at ~3 engineer-years of work. The valuable content is the full pattern stack,
  not the headline: (a) **guide-first** — shared normative artifacts (PORTING.md,
  LIFETIMES.tsv) generated and *adversarially reviewed before any fan-out*; (b) **pilot
  slice** — a 3-file trial before committing scale; (c) **structural sharding** — 4
  worktrees × 16 agents, compiler errors grouped by crate, making parallel writers
  disjoint by construction; (d) **adversarial verification at scale** — each implementer
  paired with 2 reviewers in separate contexts, given only the diff, instructed to assume
  the code is wrong; (e) **human cadence** — monitoring 1–2×/day beat both full autonomy
  and full supervision.
- **Stripe migration** (Fable 5 announcement,
  <https://www.anthropic.com/news/claude-fable-5-mythos-5>): a codebase-wide internal API
  migration across a 50M-line Ruby codebase completed in a day versus an estimated two
  team-months (~60×). Fewer public mechanics than Bun; the shape is the same
  guide-plus-sharded-fan-out.

### The rest of the ecosystem, same window

- **GPT-5.5** (Dec 2025 era): consistently characterized as orchestrator-grade — reliable
  decomposition and structured handoffs to subagents, commonly paired with cheaper models
  for mechanical stages
  (<https://www.mindstudio.ai/blog/gpt-5-5-agentic-workflows-speed-cost-performance>).
  Relevant because Cognition's smart-friend pattern is explicitly cross-vendor.
- **Cursor Composer 2.5** (May 2026): planner agent plus parallel subagents for refactor /
  test / docs shipped as a mainstream IDE feature
  (<https://ai-blogs.org/news/2026-05-21-cursor-composer-2-5-multi-agent.html>);
  **Devin Desktop** (Jun 2026) made an "agent command center" the default surface.
  Orchestration stopped being exotic.
- **METR time horizons** (<https://metr.org/time-horizons/>): 50%-reliability autonomous
  task horizon — Opus 4.6 at 14.5 hours (Feb 2026), Mythos-class ≥16 hours (May 2026, past
  the reliable top of the task suite), doubling every ~4–7 months depending on the fit
  window. This is the quantitative substrate under every qualitative shift above.
- One 2026 survey's framing of the resulting constraint: "The bottleneck is no longer what
  an agent can do. It is how many you can direct and review at once."
  (<https://www.firecrawl.dev/blog/best-ai-coding-agents>)

## Synthesis: the durable insights

### 1. The two-topology selector

The window's apparent contradiction — Anthropic ran 16–64 parallel *writers* while
Cognition insists writes stay single-threaded — resolves into a selection rule, because
the cases differ on exactly two variables:

> **Are the work shards structurally disjoint, and does the plan admit a near-perfect
> mechanical verifier?**
>
> - **Yes to both** → parallel writers (task-locked pool or sharded worktrees), width
>   capped by verifier quality. Evidence: C compiler, Bun, Stripe.
> - **No to either** → single writer, parallel intelligence around it (clean-context
>   reviewers, smart-friend advisors, research fan-out). Evidence: Cognition's three
>   production patterns.

This is the single most actionable finding for a plan-analysis step: it converts "which
pattern fits" from taste into two checkable properties of the plan.

### 2. Verification is the precondition, and its quality caps everything

Every success in the corpus is anchored on a mechanical verifier: compiler + test suites

- GCC oracle (C compiler); 1.4M+ test assertions and CI (Bun); review rubrics
  (Cognition). The C compiler post states it as a requirement; Bun's zero-skipped-tests
  policy enforces it. Corollary for plan analysis: the first question to ask of a plan is
  *what verifier does this plan admit*, because the answer determines the safe topology and
  width. A plan with no mechanical verifier should not fan out writers at all.

### 3. Human attention is the scarce resource; patterns should price it

Successful long runs used deliberate low-frequency human cadence (Bun: 1–2×/day) rather
than continuous supervision. Failure modes (time blindness, context pollution, quality
drift) are exactly the ones that erode unattended runs. A pattern card should therefore
state its human direction-and-review cost alongside its token cost.

### 4. Rules are durable; parameters are era-stamped

The 2025 research-system heuristic's *shape* (task complexity → fan-out width) survives,
but its ceilings (10+ agents as the top tier) were an artifact of that model generation —
2026 runs used 16–64 writers safely under the right preconditions. Any catalog should
date-stamp numeric parameters and expect them to expire on METR's curve, while treating
the selector questions and preconditions as slow-moving.

### 5. Scorecard for the original folklore diagram

Of the nine patterns on the "Agentic OS" board that prompted this session:

- **Validated by the window**: Orchestrator-Workers (02); Executor–Advisor / Oracle (03)
  — now Cognition's smart friend plus Anthropic's advisor strategy; Sparring (07) — now
  the quantified clean-context code-review loop; Ratchet (09) — Bun's pilot-slice and
  measure/re-measure discipline; Heartbeat (01) — cost-tiered triage-and-escalate, standard
  practice.
- **Partially supported**: Quorum (06) — adversarial *verification of artifacts* is
  production-proven (Bun), but quorum-as-*debate/voting for reasoning* still lacks
  production evidence and the academic results are negative.
- **Still folklore** (no public production evidence found in this sweep): Trust Ledger
  (04), Standing Goals (05), Compost (08) — the durable-memory/process-hygiene quadrant.

## Applicability to ns as of 2026-07-09

The motivating idea: after a plan exists, analyze its goals and select an orchestration
pattern for its execution — a pattern catalog applied to the planning process.

### The substrate already exists

ns has every mechanism the corpus patterns require, and already runs two pattern
instances without naming them as such:

- Saved Plans in the enriched-plan store (`@nseng-ai/plans`) and branch attachment
  (`@nseng-ai/branch-context`) — the artifact the analysis step reads.
- Slots (`@nseng-ai/slots`) — structural sharding via worktrees, the exact isolation
  mechanism Bun's 4-worktree fan-out used.
- `ns-pi-subagents` dispatch/fleet and CCC orchestration — the execution surfaces.
- **thermo-council** (multi-runner review council) — an in-repo instance of
  clean-context adversarial review; **refactor-swarm** — an in-repo instance of
  fan-out-plus-adversarial-verify. The catalog is partly *extraction of what already
  works here*, which is the only kind of pattern document worth writing.

### What the catalog should be, given dynamic workflows

Because the current-generation orchestrator writes its own harness per task, the catalog
should be **rubric content consulted at plan-analysis time**, not orchestration code:
pattern cards with intent, applicability signals, evidence citations, failure modes, the
ns mechanism that implements them, and (per insight 4) era-stamped numeric parameters.
The load-bearing connective tissue is the two-topology selector and the
verifier-precondition question from the synthesis above — those are what make "analyze
goals, apply pattern" checkable rather than vibes.

A concretely available first slice, independent of any catalog machinery: apply Bun's
guide-first move to ns plans — **adversarial review of the plan artifact itself before
execution fans out** (thermo-council pointed at a Saved Plan rather than a diff).

### Proposed initial card set (all evidence-cleared)

Base layer (pre-Dec canon): prompt chaining; routing / model tiering; parallelization;
orchestrator-workers with scaling rules; evaluator-optimizer; plan-then-execute gating;
context isolation.

New-era layer (Dec 2025–Jul 2026): the two-topology selector (meta-card);
near-perfect-verifier precondition (meta-card); decentralized task-locking; oracle-backed
comparative verification; clean-context code-review loop; smart friend / advisor
escalation; manager coordination; guide-first with adversarial plan review; pilot slice;
structural sharding; adversarial verification at scale; generated-harness patterns
(classify-and-act, fan-out-and-synthesize, generate-and-filter, tournament,
loop-until-done); human-cadence budgeting.

Deliberately excluded until evidence appears: quorum-as-debate; trust ledger; standing
goals; compost.

### Placement and process

Per `docs/conventions/platform-and-consumer.md`, the catalog starts consumer-side (a
`.ns/*` artifact of Markdown pattern cards, applied manually or by a skill) **with an
explicit promotion path**: if selection heuristics prove deterministic and reused, they
graduate through `packages/internal/*` toward a capability consumable by plans /
branch-context. Building platform machinery first would be the over-engineering failure
mode that convention names.

As of this date, none of the four active orientation objectives (cross-harness parity,
flow-land perf rollout, repo ontology, standing test performance boundaries) covers this
ground, so there is no directional collision — but the work is cross-cutting enough that
it warrants its own Objective (plausibly ideation-first) rather than riding on an
existing one. Vocabulary caution: "pattern" and the plan-analysis step land near the
already-flagged plan / attachment / handoff ambiguity cluster in `CONTEXT-MAP.md`;
naming work should go through the normal context-session process, not this doc.

## Source index

Primary (vendor engineering / first-party):

- Anthropic, Building Effective AI Agents (Dec 2024) — <https://www.anthropic.com/research/building-effective-agents>
- Anthropic, How we built our multi-agent research system (Jun 2025) — <https://www.anthropic.com/engineering/multi-agent-research-system>
- Anthropic, Building a C compiler with a team of parallel Claudes (Feb 2026) — <https://www.anthropic.com/engineering/building-c-compiler>
- Anthropic, Claude Opus 4.6 announcement (Feb 2026) — <https://www.anthropic.com/news/claude-opus-4-6>
- Claude Code agent teams docs — <https://code.claude.com/docs/en/agent-teams>
- Claude Code best practices — <https://code.claude.com/docs/en/best-practices>
- Anthropic, dynamic workflows (May 2026) — <https://claude.com/blog/a-harness-for-every-task-dynamic-workflows-in-claude-code> and <https://claude.com/blog/introducing-dynamic-workflows-in-claude-code>
- Anthropic, Claude Fable 5 / Mythos 5 announcement (Jun 2026) — <https://www.anthropic.com/news/claude-fable-5-mythos-5>
- Cognition, Don't Build Multi-Agents (Jun 2025) — <https://cognition.com/blog/dont-build-multi-agents>
- Cognition, Devin can now Manage Devins (Mar 2026) — <https://cognition.com/blog/devin-can-now-manage-devins>
- Cognition, Multi-Agents: What's Actually Working (Apr 2026) — <https://cognition.com/blog/multi-agents-working>
- Bun, Bun in Rust (Jun 2026) — <https://bun.com/blog/bun-in-rust>
- METR, Task-completion time horizons — <https://metr.org/time-horizons/>

Secondary (used for ecosystem framing only):

- InfoQ on dynamic workflows (Jun 2026) — <https://www.infoq.com/news/2026/06/claude-code-harnesses/>
- TechCrunch on Opus 4.6 agent teams (Feb 2026) — <https://techcrunch.com/2026/02/05/anthropic-releases-opus-4-6-with-new-agent-teams/>
- MindStudio on GPT-5.5 agentic workflows — <https://www.mindstudio.ai/blog/gpt-5-5-agentic-workflows-speed-cost-performance>
- Cursor Composer 2.5 multi-agent coverage (May 2026) — <https://ai-blogs.org/news/2026-05-21-cursor-composer-2-5-multi-agent.html>
- Firecrawl, Best AI coding agents 2026 — <https://www.firecrawl.dev/blog/best-ai-coding-agents>
- If Multi-Agent Debate is the Answer, What is the Question? — <https://arxiv.org/html/2502.08788v1>
