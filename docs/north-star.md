# SDL North Star

This is the product north star for SDL — the destination the work points at, and the
language for talking about it. It is deliberately aspirational: it states where the system
is going, not a claim about what is finished today. Where a line is a promise we have not
yet built, it is marked as such. Design lives in ADRs; vocabulary lives in `CONTEXT.md`;
current status lives in each objective's `roadmap.md`. This document owns the *why* and the
*shape*.

## The opposition: the meta-harness

A meta-harness (Databricks' Omnigent and its kind) sits **above** the harnesses developers
already use, behind a uniform API. That altitude has a fixed, structural cost:

- It can only export the **intersection** of what the wrapped harnesses share.
- It can enforce policy only over sessions that opted into the wrapper.
- It flattens each harness's native surface into one lowest common denominator.

The more harnesses it spans, the less of any one it can express. It is a race to the bottom
by construction.

## The inversion: embed, don't wrap

SDL goes the other way. It is a **framework and a set of embeddable building blocks** for the
source development lifecycle that you **inject into** the harnesses developers already use. A
capability is not reached through a wrapper — it becomes part of the harness. Because
injection adds rather than abstracts, SDL expresses the **union** of the harnesses, not their
intersection: the best of each, in its own native idiom.

> Meta-harnesses unify the surface. SDL unifies the lifecycle.

### Injection composes; wrapping doesn't

This is the strongest structural consequence of embed-don't-wrap. Two wrappers-above fight
over who owns the session and the surface — they collide. An injected library is
altitude-agnostic: it rides inside whatever runs the agent, so it composes with anything
harness-shaped, **including a wrapper**.

> SDL + Claude Code works. SDL + Codex works. SDL + (a meta-harness wrapping Claude Code)
> works. Two meta-harnesses are a turf war.

So SDL is not, fundamentally, *anti* meta-harness. From SDL's vantage a meta-harness is just
one more embedding target — another harness. The honest relationship is **orthogonal and
subsuming**: SDL is *substrate*, a meta-harness is *orchestration*, the real harness sits in
the middle. They stack. Even a team that fully bought the meta-harness thesis is still an SDL
customer, because SDL adds the lifecycle and context layer beneath the agents the meta-harness
orchestrates.

One precision: SDL embeds into a meta-harness at whatever fidelity that meta-harness exposes —
which, by the intersection argument, is lower than the underlying harness offers. The better
mechanism is to embed into the underlying agent runtime the meta-harness launches (still
Claude Code or Codex underneath) at full fidelity, while the meta-harness orchestrates above.
The meta-harness is a valid but lower-fidelity embedding target; direct embedding is better;
SDL supports both. This restates *why direct embedding wins* while staying fully inclusive.

## The altitude bet

The thing actually shared across all your agents was never the harness — harnesses churn
monthly. It is the **lifecycle**: the objective, the branch, the plan, the handoff, the
commit, the PR. SDL unifies at that layer, and that layer is durable because it lives in
**git**. Bet on the substrate, not the surface.

> Don't unify the harnesses. Unify the lifecycle — in git.

## Context engineering is the point

Context engineering is the high-order bit of agentic programming: getting the right context to
the right agent and model at the right time. The hard part is not *storing* context — it is
*bounding* it: knowing what is in scope now and what is not.

The organizing insight of SDL is that **the lifecycle already supplies the boundaries.** Every
phase of the SDLC has a natural lifetime, and that lifetime *is* a context scope. SDL's
building blocks are not an arbitrary toolbox; they are the lifecycle's context scopes, each
with a git-native lifetime:

| Scope                 | Lifetime              | SDL mechanism                                 | Storage (derived from lifetime)                     |
| --------------------- | --------------------- | --------------------------------------------- | --------------------------------------------------- |
| **Repo**              | permanent             | `AGENTS.md` / `CONTEXT.md` / `CONTEXT-MAP.md` | committed files                                     |
| **Goal**              | life of the objective | objective orientation + roadmap               | `.sdl/objectives/<slug>`, auto-drops on `closed.md` |
| **Branch**            | life of the branch    | brmem, branch-context                         | `refs/brmem/*`                                      |
| **Session → session** | the handoff baton     | handoff                                       | `refs/brmem/ns/handoff/*`                           |
| **Working / draft**   | the session           | enriched plan                                 | local scratch (XDG)                                 |

The storage substrate is **derived from the context's lifetime**: permanent context is
committed, branch-lived context is a ref, session-draft context is local scratch. That is a
principle, not a pile of decisions — and it explains why a draft plan correctly stays local
rather than in git. It is the shortest-lived scope.

`sdl objective exec load-orientations` is the working proof: it loads exactly the *live*
goals' context, and a file **leaves the active set automatically when its objective closes**.
That is lifecycle-scoped context management in production — goal-lifetime context that evicts
itself on goal completion.

### Why a meta-harness cannot make this cut

A wrapper above the harness has exactly **one** context lifetime: the session. It cannot
express "this fact is valid for the life of this branch" or "this orientation is valid for the
life of this goal," because it does not model branches or goals — it sits above the harness,
not in the lifecycle. SDL has a whole spectrum of lifetimes precisely because it is built on
the git-native lifecycle.

> A meta-harness manages context per session. SDL scopes context per lifecycle phase — because
> only the lifecycle knows when context is born and when it dies.

And the dependency runs in SDL's favor: the more agents a meta-harness orchestrates, the more
it needs a shared, scoped context substrate underneath, not less. Sharing a live session by
URL is shallow without a durable, lifecycle-scoped memory beneath it. SDL is that memory.

## The building blocks

A coherent developer workflow, decomposed into composable, git-native capabilities — each
usable alone, stronger together, each anchored to a context scope:

- **Plan** — objectives, branch-context, enriched plans: durable intent that outlives a session.
- **Place** — worktree slots: a pool of isolated workspaces, native git worktrees, no registry.
- **Remember** — brmem and handoffs: branch-scoped durable context carried across sessions and
  agents, stored as git refs.
- **Ship** — Graphite-backed change lifecycle: checkpoint, branch, stack, submit, land.
- **Review & govern** — roasters, PR-feedback triage, and policy expressed once and honored
  everywhere.

These are the primitive building blocks of the Source Development Lifecycle — hence SDL —
embeddable in any harness.

## The four commitments

What SDL promises to be true as it matures. Each is stated precisely so the aspiration is one
reality can actually cash.

**1. Git-native durable substrate, deliberately tiered by lifetime.**
Collaboration-warranting state is git-native — refs, branches, committed records — so it
travels with the repo and survives any harness. Working scratch stays local on purpose. The
discipline is not "everything in git"; it is *drawing the line between durable-shared and
working-local deliberately, and deriving storage from lifetime.*

**2. Reachable in any harness; richly skinned where it pays.**
Every capability is **reachable** in every harness — the plumbing (registration, invocation
policy, argument passing) is compiled, not hand-maintained, so reachability targets 100%. The
**rich native skin** — pickers, TUIs, commit-cards — is a deliberate per-harness investment,
never owed, because polish bottoms out in each harness's own UI primitives. Say "reachable in
any harness, richly native where it pays," never "fully native in every harness." The latter
is a check the architecture cannot cash even in principle; the former is just as strong and
stays true at the destination.

**3. Policy at the chokepoint.** *(Aspirational — substrate exists, the gate does not yet.)*
Policy is enforced at the **durable-state boundary** — git — not at a wrapper above the
harness. Everything that matters has to cross git to become real, so a gate there cannot be
routed around regardless of which harness ran. This is the structural advantage over the
meta-harness, which governs only its own sessions. The two planes stack cleanly: a meta-harness
gates the *session* (cost, permissions, tool calls); SDL gates *durable state* (what lands in
git). SDL's git gate covers exactly the hole the wrapper leaves — any session that did not go
through the wrapper still has to cross git.

**4. Bring your own harness; keep the whole lifecycle.**
Because the lifecycle lives in git, switching harnesses is free — start the next session
anywhere and the objective, branch, memory, and handoff are already there. SDL delivers the
meta-harness's headline feature (harness portability) as a *side effect* of git-native state,
without paying the abstraction tax to get it.

## The hard center: from storage to assembly

Two halves, honestly stated:

- **Storage — largely solved.** Each scope has a durable, git-native home (brmem, objectives,
  handoffs).
- **Assembly — the frontier, and where "context engineering" actually lives.** At any moment an
  agent sits inside several live scopes at once (repo + goal + branch + session). The work is
  the **resolver** that, given *who am I, what phase am I in, what is my token budget*,
  assembles the working set from the live scopes and drops the rest.

Storage is the noun; assembly is the verb; the verb is the product. The resolver has three
sub-problems to name and build:

- **Composition & precedence** — when branch context and goal orientation conflict, which wins?
  Scopes need a precedence order (likely narrowest-live-scope wins, repo as backstop).
- **Eviction** — a lifetime is only real if expiry actually happens. The objective system nails
  it (`closed.md` auto-drops); branch-scoped state must be GC'd when its branch dies, or
  "branch-lifetime" is just a label on an accumulating pile.
- **Budget** — "right context at the right time" eventually means *fitting a budget*. Scope is
  the input to prioritization: this phase's branch context outranks a sibling branch's.

A meta-harness cannot even attempt the verb, because it has no scopes to assemble from.

## Messaging

- **One-liner:** SDL scopes context to the lifecycle — repo, goal, branch, session — so the
  right agent gets the right context at the right time, git-native.
- **The thesis:** Context engineering is the high-order bit of agentic programming. The
  lifecycle is where context's boundaries already live — SDL binds them.
- **Against the enemy:** A meta-harness sees one context lifetime: the session. SDL sees the
  whole lifecycle's worth.
- **The judo:** We think the meta-harness is the wrong primary tool — but it's also just
  another harness to us. SDL makes it better from underneath.
- **The wedge:** Capabilities you embed — not a harness you adopt.
- **The verb:** Storage is solved. SDL is building the resolver — the right working set,
  assembled per phase, evicted on exit.

## What to claim today vs. at the destination

The north star is a destination. Three commitments are safe to aspire to loudly — the
architecture already bends that way: the git-native substrate, harness portability, and the
embed/compose story. Two need a precision guardrail even in aspiration:

- **Reachability vs. richness** (commitment 2) — promise universal *reach*, not universal
  *polish*. Today the rich native surface is delivered for one harness (Pi); others get the
  neutral CLIs plus shared skills. The compiler that makes reachability universal is partly
  built (skill invocation policy) and partly ahead.
- **Policy enforcement** (commitment 3) — today this is convention in `AGENTS.md` and skills,
  with no git-boundary gate. The substrate to enforce on exists; the gate is roadmap.

Stated this way, the framing kills the meta-harness on the altitude and context arguments
without writing a check the repo cannot yet cash.
