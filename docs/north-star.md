# ns north star

This is the product north star for ns — the destination the work points at, and the
language for talking about it. It is deliberately aspirational: it states where the system
is going, not a claim about what is finished today. Where a line is a promise we have not
yet built, it is marked as such. Design lives in ADRs; vocabulary lives in `CONTEXT.md`;
current status lives in each objective's `roadmap.md`. This document owns the *why* and the
*shape*.

On the name: **ns** is short for **nonslop**; **nseng** — nonslop engineering — is the
site and public shell (`nseng.ai`). Always lowercase. The CLI shipping today is `ji`,
itself mid-cutover from `sdl`; this document is written for the destination name, and
concrete paths/commands are quoted as they exist today.

## The enemy: the software factory

The prevailing industry story casts the engineer as a manager of AI workers — fleets,
throughput, supervision dashboards. Software becomes a factory floor: spin up more
workers, watch the burndown, ship whatever comes off the line.

What factories optimize is volume, and what volume without boundaries produces is
**slop**: agent output with no durable intent behind it, no memory of why, and no gate
between "generated" and "real." Slop is not a model problem — models improve monthly. It
is a **boundary problem**: nothing scopes what the agent knows, nothing owns what the work
is for, and nothing stands between the output and your repository.

**Engineers are not factory managers; they are sorcerers.** The power is in knowing what
to invoke and how to phrase it — a principal engineer casting well-bounded work, not a
shift supervisor watching a dashboard.

ns is the counter-position, and the name is the thesis: **nonslop engineering** — slop
removed by construction, not by review-after-the-fact.

### Exhibit A: the meta-harness

The factory's flagship tooling is the meta-harness (Databricks' Omnigent and its kind): a
wrapper that sits **above** the harnesses developers already use, behind a uniform API —
the supervision dashboard over the worker fleet. That altitude has a fixed, structural
cost:

- It can only export the **intersection** of what the wrapped harnesses share.
- It can enforce policy only over sessions that opted into the wrapper.
- It flattens each harness's native surface into one lowest common denominator.

The more harnesses it spans, the less of any one it can express — a race to the bottom by
construction. And it cannot fix slop, because slop is not a session problem: a wrapper
above the harness has exactly **one** context lifetime, the session. It cannot say "this
fact is valid for the life of this branch" or "this orientation is valid for the life of
this goal," because it does not model branches or goals.

## The inversion: embed, don't wrap

ns goes the other way. It is a **substrate of embeddable building blocks** that you
**inject into** the harnesses developers already use. A capability is not reached through a
wrapper — it becomes part of the harness. Because injection adds rather than abstracts,
ns expresses the **union** of the harnesses, not their intersection: the best of each, in
its own native idiom.

> The factory unifies the surface. ns bounds the work.

### Injection composes; wrapping doesn't

This is the strongest structural consequence of embed-don't-wrap. Two wrappers-above
fight over who owns the session and the surface — they collide. An injected substrate is
altitude-agnostic: it rides inside whatever runs the agent, so it composes with anything
harness-shaped, **including a wrapper**.

> ns + Claude Code works. ns + Codex works. ns + (a meta-harness wrapping Claude Code)
> works. Two meta-harnesses are a turf war.

So ns is not, fundamentally, *anti* meta-harness. From ns's vantage a meta-harness is
just one more embedding target — another harness. The honest relationship is **orthogonal
and subsuming**: ns is *substrate*, a meta-harness is *orchestration*, the real harness
sits in the middle. They stack. Even a team that fully bought the factory thesis is still
a ns customer, because ns adds the context-and-intent layer beneath the agents the
factory orchestrates.

One precision: ns embeds into a meta-harness at whatever fidelity that meta-harness
exposes — which, by the intersection argument, is lower than the underlying harness
offers. The better mechanism is to embed into the underlying agent runtime the
meta-harness launches (still Claude Code or Codex underneath) at full fidelity, while the
meta-harness orchestrates above. The meta-harness is a valid but lower-fidelity embedding
target; direct embedding is better; ns supports both.

## The altitude bet

The thing actually shared across all your agents was never the harness — harnesses churn
monthly. It is the work itself: the objective, the branch, the plan, the handoff, the
commit, the PR. ns unifies at that layer, and that layer is durable because it lives in
**git**. Bet on the substrate, not the surface.

> Don't unify the harnesses. Bound the work — in git.

## Context engineering is the point

Context engineering is the high-order bit of agentic programming: getting the right
context to the right agent and model at the right time. The hard part is not *storing*
context — it is *bounding* it: knowing what is in scope now and what is not.

The organizing insight of ns is that **the work already supplies the boundaries.** Every
unit of engineering work has a natural lifetime — a repo, a goal, a branch, a session —
and that lifetime *is* a context scope. The core's building blocks are not an arbitrary
toolbox; they are the work's context scopes, each with a git-native lifetime:

| Scope                 | Lifetime              | Core mechanism                                | Storage (derived from lifetime)                    |
| --------------------- | --------------------- | --------------------------------------------- | -------------------------------------------------- |
| **Repo**              | permanent             | `AGENTS.md` / `CONTEXT.md` / `CONTEXT-MAP.md` | committed files                                    |
| **Goal**              | life of the objective | objective orientation + roadmap               | `.ns/objectives/<slug>`, auto-drops on `closed.md` |
| **Branch**            | life of the branch    | branch memory, branch-context                 | `refs/brmem/*`                                     |
| **Session → session** | the handoff baton     | handoff                                       | `refs/brmem/ns/handoff/*`                          |
| **Working / draft**   | the session           | enriched plan                                 | local scratch (XDG)                                |

The storage substrate is **derived from the context's lifetime**: permanent context is
committed, branch-lived context is a ref, session-draft context is local scratch. That is
a principle, not a pile of decisions — and it explains why a draft plan correctly stays
local rather than in git. It is the shortest-lived scope.

`ns objective exec load-orientations` is the working proof: it loads exactly the *live*
goals' context, and a file **leaves the active set automatically when its objective closes**.
That is scope-bounded context management in production — goal-lifetime context that evicts
itself on goal completion.

### Why the factory cannot make this cut

The factory's tooling sees one context lifetime: the session. ns has a whole spectrum of
lifetimes precisely because it is built on the git-native shape of the work. And the
dependency runs in ns's favor: the more agents a factory orchestrates, the more it needs
a shared, scoped context substrate underneath, not less. Sharing a live session by URL is
shallow without a durable, scoped memory beneath it. ns is that memory.

> A meta-harness manages context per session. ns scopes context per unit of work —
> because only the work knows when context is born and when it dies.

## The ns core

A coherent developer workflow, decomposed into composable, git-native capabilities — each
usable alone, stronger together, each anchored to a context scope. This is the
**core**: the part of the system that everything else is built on.

- **Plan** — objectives, branch-context, enriched plans: durable intent that outlives a
  session.
- **Place** — worktree slots: a pool of isolated workspaces, native git worktrees, no
  registry.
- **Remember** — branch memory and handoffs: branch-scoped durable context carried across
  sessions and agents, stored as git refs. (brmem is core-internal plumbing, not a
  user-facing tool.)
- **Ship** — Graphite-backed change flow: checkpoint, branch, stack, submit, land.
- **Gate** — policy at the durable-state boundary: what crosses into git is what becomes
  real. *(Aspirational — substrate exists, the gate does not yet; see commitment 3.)*

## The extension ecosystem

Everything that is not the core is an **extension** built on it. Today's slate:
**retros** (retrospectives), **reviews** (code reviews), and **pr-address** (PR-feedback
triage). Extensions get the core's scopes, memory, places, and gate for free; skills —
the harness-facing instructions that let agents drive a capability — ship as part of
their extension, not as a separate surface. The core stays small on purpose; the
ecosystem is where surface area grows. Extensions are the proof the core is a platform,
not a toolbox.

## The four commitments

What ns promises to be true as it matures. Each is stated precisely so the aspiration is
one reality can actually cash.

**1. Git-native durable substrate, deliberately tiered by lifetime.**
Collaboration-warranting state is git-native — refs, branches, committed records — so it
travels with the repo and survives any harness. Working scratch stays local on purpose.
The discipline is not "everything in git"; it is *drawing the line between durable-shared
and working-local deliberately, and deriving storage from lifetime.*

**2. Reachable in any harness; richly skinned where it pays.**
Every capability is **reachable** in every harness — the plumbing (registration,
invocation policy, argument passing) is compiled, not hand-maintained, so reachability
targets 100%. The **rich native skin** — pickers, TUIs, commit-cards — is a deliberate
per-harness investment, never owed, because polish bottoms out in each harness's own UI
primitives. Say "reachable in any harness, richly native where it pays," never "fully
native in every harness." The latter is a check the architecture cannot cash even in
principle; the former is just as strong and stays true at the destination.

**3. Policy at the chokepoint.** *(Aspirational — substrate exists, the gate does not yet.)*
Policy is enforced at the **durable-state boundary** — git — not at a wrapper above the
harness. Everything that matters has to cross git to become real, so a gate there cannot
be routed around regardless of which harness ran. This is the structural advantage over
the factory, which governs only its own sessions. The two planes stack cleanly: a
meta-harness gates the *session* (cost, permissions, tool calls); ns gates *durable
state* (what lands in git). The git gate covers exactly the hole the wrapper leaves — any
session that did not go through the wrapper still has to cross git. This is where
"nonslop by construction" is eventually enforced, not just encouraged.

**4. Bring your own harness; keep the whole substrate.**
Because intent, memory, and history live in git, switching harnesses is free — start the
next session anywhere and the objective, branch, memory, and handoff are already there.
ns delivers the factory's headline feature (harness portability) as a *side effect* of
git-native state, without paying the abstraction tax to get it.

## The hard center: from storage to assembly

Two halves, honestly stated:

- **Storage — largely solved.** Each scope has a durable, git-native home (branch memory,
  objectives, handoffs).
- **Assembly — the frontier, and where "context engineering" actually lives.** At any
  moment an agent sits inside several live scopes at once (repo + goal + branch +
  session). The work is the **resolver** that, given *who am I, what phase am I in, what
  is my token budget*, assembles the working set from the live scopes and drops the rest.

Storage is the noun; assembly is the verb; the verb is the product. The resolver has
three sub-problems to name and build:

- **Composition & precedence** — when branch context and goal orientation conflict, which
  wins? Scopes need a precedence order (likely narrowest-live-scope wins, repo as
  backstop).
- **Eviction** — a lifetime is only real if expiry actually happens. The objective system
  nails it (`closed.md` auto-drops); branch-scoped state must be GC'd when its branch
  dies, or "branch-lifetime" is just a label on an accumulating pile.
- **Budget** — "right context at the right time" eventually means *fitting a budget*.
  Scope is the input to prioritization: this phase's branch context outranks a sibling
  branch's.

The factory cannot even attempt the verb, because it has no scopes to assemble from.

## Messaging

- **The spine:** Engineers are not factory managers; they are sorcerers.
- **One-liner:** ns is the substrate for nonslop engineering — durable intent, scoped
  memory, and a gate at git, so agents ship engineering instead of slop.
- **The name:** Slop is unbounded agent output. nonslop engineering removes it by
  construction, not by review-after-the-fact.
- **Against the enemy:** The software factory optimizes throughput and ships slop. Its
  dashboards manage the session; ns governs what becomes real.
- **The judo:** The more agents the factory runs, the more it needs ns underneath. We
  make the factory better from beneath it — and make it unnecessary.
- **The wedge:** A substrate you embed — not a harness you adopt.
- **The verb:** Storage is solved. ns is building the resolver — the right working set,
  assembled per scope, evicted on exit.

## What to claim today vs. at the destination

The north star is a destination. Three commitments are safe to aspire to loudly — the
architecture already bends that way: the git-native substrate, harness portability, and
the embed/compose story. Two need a precision guardrail even in aspiration:

- **Reachability vs. richness** (commitment 2) — promise universal *reach*, not universal
  *polish*. Today the rich native surface is delivered for one harness (Pi); others get
  the neutral CLIs plus shared skills. The compiler that makes reachability universal is
  partly built (skill invocation policy) and partly ahead.
- **Nonslop by construction** (commitment 3) — today the gate is convention in
  `AGENTS.md` and skills, with no git-boundary enforcement. The substrate to enforce on
  exists; the gate is roadmap. Claim *boundaries* today; claim *enforcement* as
  destination.

Stated this way, the framing kills the factory on the boundary and context arguments
without writing a check the repo cannot yet cash.
