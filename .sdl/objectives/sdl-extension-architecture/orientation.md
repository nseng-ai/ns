**Direction: domain capabilities are becoming SDL extensions above a small kernel.**

Getting to: each capability is an extension built on `@sdl/capability-kit`, gateway-injected,
domain logic only inside the Capability; consumers depend on `@sdl/<cap>/api`, never internals;
the Extension Dependency Graph stays acyclic. (ADR 0009 / 0012 / 0016; vocabulary in root
CONTEXT.md "Extension Layering".)

What you see now: the migration is complete and the Objective is closed; former transitional
primitives live under precise `@sdl/capability-kit/*` subpaths.

Avoid: new domain logic in the host/kernel; reintroducing transitional packages/tiers; new deps on
capability internals; new edges that deepen a cycle.

Closure evidence: see this objective's roadmap.md and closed.md.
