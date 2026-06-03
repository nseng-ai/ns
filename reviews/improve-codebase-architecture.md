---
description: |
  Review the supplied diff for architecture-deepening opportunities using
  module depth, seams, adapters, leverage, locality, the deletion test, and
  the repository's documented domain language and ADR decisions.
default_model: opus
scope: local
---

<!-- Derived from .agents/skills/improve-codebase-architecture/SKILL.md as a roaster-native, diff-based local-only review. The original interactive HTML-report workflow is intentionally not included. -->

Review only architecture issues introduced, worsened, or made newly relevant by
the supplied diff. You may read nearby code, `CONTEXT.md` if present, and
relevant `docs/adr/` records when the touched area appears to have documented
architecture decisions. Use that context as evidence, not as permission to dump
unrelated whole-repo architecture concerns.

Do not write or open HTML reports. Do not ask follow-up questions. Do not edit
`CONTEXT.md`, ADRs, or any source file. This is a read-only, diff-based review.

## Vocabulary to use precisely

- **Module** — a cohesive unit with a meaningful boundary and responsibility.
- **Interface** — the surface callers depend on; the interface is the test
  surface.
- **Implementation** — hidden machinery behind the interface.
- **Depth** — how much useful complexity a module hides behind a simple
  interface.
- **Seam** — a boundary where behavior can vary without infecting callers.
- **Adapter** — a concrete implementation at a seam, often wrapping an external
  system or policy.
- **Leverage** — how much future simplification or reuse a boundary creates.
- **Locality** — how close related decisions, data, and behavior remain to each
  other.

## Review principles

1. **Use the deletion test.** If deleting a new module would barely affect
   callers because it only passes through to another module, it may be shallow.
   Flag shallow pass-throughs when the diff creates them without leverage.
2. **The interface is the test surface.** Prefer seams whose interface captures
   the important behavior so tests can exercise real business logic over fakes
   or adapters, rather than asserting on implementation details.
3. **One adapter = hypothetical seam. Two adapters = real seam.** Do not praise
   speculative abstractions just because they exist. Look for actual variation,
   a near-term second implementation, or a strong reason to isolate an external
   boundary.
4. **Prefer deep modules.** A good module should hide complexity and make
   callers simpler. Flag changes that spread knowledge of an implementation
   across callers.
5. **Protect locality.** Flag changes that scatter one concept across distant
   files, force callers to coordinate state manually, or make a reader chase
   incidental details through several layers.
6. **Respect documented language and decisions.** If `CONTEXT.md` or an ADR
   names the domain boundary differently than the diff does, call out the
   mismatch only when it creates real architecture confusion.

## Output guidance

Prioritize high-conviction structural review over broad brainstorming. In text
mode, use:

- `## Strong findings` for actionable diff-caused architecture problems.
- `## Worth exploring` only for genuinely useful lower-confidence opportunities.
- `## No major architecture concerns` when the diff is clean.

In findings mode, emit only concrete high-confidence findings tied to diff
lines or sections. Do not report unrelated pre-existing architecture debt.
