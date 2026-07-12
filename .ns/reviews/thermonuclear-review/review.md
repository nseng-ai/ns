---
# Provenance (vendored-derived): this review is the diff-grounded adversarial
# variant of the vendored `.agents/skills/thermo-nuclear-code-quality-review/`
# skill (upstream `cursor/plugins`, path
# `cursor-team-kit/skills/thermo-nuclear-code-quality-review/`). Commit-level
# provenance is owned by the vendoring records (`skills-lock.json`; an upstream
# instance doc under `docs/agents/` if one lands) — do not duplicate pins here.
# `docs/agents/matt-pocock-skills.md` records a pending melding assessment
# between that vendored skill and the first-party `review-thermonuclear-review`
# stub for when the upstream's first update lands. NS-local adaptations to
# preserve: `.ns/reviews` frontmatter, the diff-grounded scope (no commit
# organization, stack shape, PR process, or VCS hygiene), and the prioritized
# output ordering.
#
# Regeneration instructions: when the vendored source skill changes, re-read
# it, keep this review a per-diff maintainability and simplification review
# (no repo-wide survey behavior), preserve the NS-local adaptations above and
# the frontmatter schema accepted by Reviews, and then run:
#
#   dprint check .ns/reviews/thermonuclear-review/review.md
#   pnpm --dir ts exec vitest run packages/capabilities/reviews/test/unit/review-definition.test.ts
description: |
  Run an extremely strict maintainability and implementation-quality review on
  the supplied diff. Push for structural simplification, code-judo reframings,
  cleaner boundaries, less spaghetti growth, and direct maintainable code.
model_profile: deep
local_only: true
applies_to:
  include:
    - "**/*.ts"
    - "**/*.tsx"
    - "**/*.py"
  exclude:
    - ".agents/skills/**"
    - ".claude/skills/**"
    - "skills/**"
---

Review only the supplied diff/current branch changes plus the minimum nearby
context needed to judge how the implementation would land. Judge code quality,
maintainability, abstraction quality, and codebase health. Do not review commit
organization, stack shape, PR process, or VCS hygiene unless the user explicitly
asks; those are at most brief low-severity asides and should not crowd out code
structure findings.

Be ambitious about structural simplification. Do not stop at local cleanup when
a clearer reframing could delete concepts, branches, helpers, modes, conditionals,
or layers. Prefer the solution that makes the code feel inevitable in hindsight.
If there is a plausible "code judo" move that preserves behavior while making
the implementation much smaller or more direct, flag it.

## Review questions

For every meaningful changed area, ask:

- Is there a reframing that would make this dramatically simpler?
- Did the diff add branching complexity where a clearer model or abstraction
  should exist?
- Did a previously cohesive module become more coupled, more stateful, or harder
  to scan?
- Is this logic living in the right file, package, and layer?
- Did the change enlarge a file or component past a healthy size boundary,
  especially across roughly 1000 lines?
- Are repeated conditionals, nullable modes, booleans, or flags signaling a
  missing model?
- Is the implementation direct and legible, or does it rely on special cases,
  casts, hidden fallbacks, or incidental control flow?
- Does an abstraction earn its keep, or is it just a thin wrapper?
- Did the diff introduce loose object shapes, `any`, unnecessary `unknown`,
  broad casts, or optionality that obscure the real invariant?
- Is the orchestration more sequential or less atomic than it needs to be in a
  way that makes the design harder to reason about?

## Flag aggressively

Escalate findings when changed lines introduce or expose:

- a complicated implementation where a cleaner reframing could delete whole
  categories of complexity;
- refactors that move complexity around without reducing the number of concepts
  a reader must hold;
- files crossing roughly 1000 lines due to the diff, especially when new code
  could be split out;
- ad-hoc conditionals, scattered special cases, or feature checks bolted onto
  unrelated shared flows;
- one-off flags, nullable modes, or state shapes that complicate existing
  control flow;
- feature-specific logic leaking into general-purpose modules;
- magical or generic handling that hides a simple data shape;
- thin wrappers or identity abstractions that add indirection without clarity;
- unnecessary casts, `any`, `unknown`, or optional params that muddy a boundary;
- copy-pasted logic where a narrow helper or canonical abstraction would be a
  clear net win;
- bespoke helpers where the repository already appears to have a canonical one;
- logic added in the wrong layer or package;
- partial-update logic or sequential orchestration that makes the system less
  atomic or harder to reason about.

## Preferred remedies

Prefer actionable remedies that simplify the design:

- delete a layer of indirection rather than polishing it;
- reframe the state model so conditionals disappear;
- move ownership to the module or package that already owns the concept;
- turn special cases into a simpler default flow;
- extract a focused helper or pure function when that reduces cognitive load;
- split a sprawling file into focused modules;
- place feature-specific logic behind a dedicated seam;
- replace condition chains with an explicit typed model or dispatcher;
- separate orchestration from business logic;
- collapse duplicate branches into one clearer flow;
- reuse a canonical helper instead of introducing a near-duplicate;
- make type boundaries explicit so control flow becomes simpler;
- parallelize independent work when it also clarifies the orchestration;
- make related updates atomic when partial state is harder to reason about.

## Output expectations

Prioritize findings in this order:

1. Structural code-quality regressions.
2. Missed opportunities for dramatic simplification.
3. Spaghetti or branching-complexity growth.
4. Boundary, abstraction, or type-contract problems that make the code harder to
   reason about.
5. File-size and decomposition concerns.
6. Modularity, layering, and canonical-helper concerns.
7. Legibility and maintainability concerns.

Each finding must be grounded in the supplied diff or directly necessary nearby
context. Prefer a smaller number of high-conviction findings over cosmetic nits.
Do not approve merely because behavior seems correct when the implementation
clearly worsens maintainability.
