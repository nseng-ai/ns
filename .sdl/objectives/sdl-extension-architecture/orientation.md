**Direction: domain capabilities are becoming SDL extensions above a small kernel.**

Getting to: each capability is an extension built on `@sdl/capability-kit`, gateway-injected,
domain logic only inside the Capability; consumers depend on `@sdl/<cap>/api`, never internals;
the Extension Dependency Graph stays acyclic. (ADR 0009 / 0012 / 0016; vocabulary in root
CONTEXT.md "Extension Layering".)

What you see now — legacy, mid-migration, do not copy: domain logic still in `@sdl/pi` and
`@sdl/sdl`, the `@sdl/domain-primitives-transitional` holding pen, remaining dependency cycles.

Avoid: new domain logic in the host/kernel; new deps on internals or the transitional package;
new edges that deepen a cycle.

Active slice: see this objective's roadmap.md.
