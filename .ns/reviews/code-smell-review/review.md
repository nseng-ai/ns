---
# Provenance (vendored-derived): this is an NS-local review prompt derived from
# the code-smell baseline in the vendored Matt Pocock `pocock-review` skill
# (`.agents/skills/pocock-review/SKILL.md`). Upstream source of truth for that
# vendored skill is `mattpocock/skills`, where the skill is named `code-review`
# (renamed upstream from `review`; path `skills/engineering/code-review/`). The
# single canonical commit-level pin lives in `docs/agents/matt-pocock-skills.md`;
# do not duplicate the hash here. NS-local adaptations to preserve:
# code-smell-only scope, review tone, `.ns/reviews` frontmatter, explicit
# exclusions for spec/standards/tests/formatting, and the NS-coined
# "Confusable Siblings" smell.
#
# Regeneration instructions: when refreshing Matt-sourced skills, compare the
# upstream smell baseline and apply relevant changes here manually, preserving
# the NS-local adaptations above and the frontmatter schema accepted by
# Reviews, and then run:
#
#   dprint check .ns/reviews/code-smell-review/review.md
#   pnpm --dir ts exec vitest run packages/incubator/reviews/test/unit/review-definition.test.ts
description: |
  Code-smell-only review: inspect the supplied diff for Fowler-style
  code smells, with blunt but evidence-based feedback and small refactor fixes.
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
context needed to judge design smell. This is intentionally narrow: do not review
spec correctness, repo coding standards, formatting, lint issues, test coverage,
commit organization, stack shape, PR process, or VCS hygiene.

The tone should be blunt, memorable, and useful. Critique the design smell, not the
author. Every finding is a judgement call and must be grounded in changed hunks
or directly necessary nearby context. If there are no meaningful smell findings,
say so plainly and do not invent a finding.

## Smell baseline

Only emit findings that match one of these smells:

- **Mysterious Name** — a function, variable, or type whose name does not reveal
  what it does or holds. Rename it; if no honest name comes, the design is murky.
- **Duplicated Code** — the same logic shape appears in more than one hunk or
  file in the change. Extract the shared shape, call it from both.
- **Feature Envy** — a method reaches into another object's data more than its
  own. Move the method onto the data it envies.
- **Data Clumps** — the same few fields or params keep travelling together.
  Bundle them into one type, pass that.
- **Primitive Obsession** — a primitive or string stands in for a domain concept
  that deserves its own type. Give the concept its own small type.
- **Repeated Switches** — the same `switch`/`if` cascade on the same type recurs
  across the change in a way that encodes one shared policy in multiple places.
  Flag this only when the repetition is systematic: usually three or more
  sites, or two sites whose cases duplicate the same decisions, derived facts,
  labels, metadata, validation, or behavioral policy. Replace real repeated
  switches with polymorphism, or one table/helper both
  sites share.
- **Shotgun Surgery** — one logical change forces scattered edits across many
  files in the diff. Gather what changes together into one module.
- **Divergent Change** — one file or module is edited for several unrelated
  reasons. Split so each module changes for one reason.
- **Speculative Generality** — abstraction, parameters, or hooks added for needs
  the change does not demonstrate. Delete it; inline back until a real need
  shows.
- **Message Chains** — long `a.b().c().d()` navigation the caller should not
  depend on. Hide the walk behind one method on the first object.
- **Middle Man** — a class or function mostly just delegates onward. Cut it, call
  the real target direct.
- **Refused Bequest** — a subclass or implementer ignores or overrides most of
  what it inherits. Drop the inheritance, use composition.
- **Confusable Siblings** — two exported names in the same API family differ
  only by a near-synonym (`create`/`define`, `get`/`fetch`, `make`/`build`)
  while their semantics differ on some other axis. Rename so the axis that
  actually distinguishes them is in the name.
  <!-- NS-local invention (2026-07-07): "Confusable Siblings" is our own coinage,
       not a term of art from Fowler's Refactoring or established online usage.
       Do not assume model weights know this term — the definition above is the
       entire spec. Preserve this smell across upstream pocock-review refreshes. -->

## Procedure

1. Start from changed hunks only.
2. Read enough nearby context to confirm whether the suspected smell is real.
3. Suppress anything that is merely a style preference, formatting issue, missing
   test, spec gap, or tooling-enforced concern.
4. For a Repeated Switches finding, first state the shared policy being repeated.
   If the only commonality is "both sites exhaustively handle the same union"
   and the outputs are adapter-specific, suppress the finding.
5. Prefer a smaller number of high-conviction smell findings over a long list of
   weak jokes.
6. For each finding, provide the smallest concrete refactor that would remove or
   reduce the smell.

## Output expectations

Use this structure:

```md
## Code-Smell Review

### Findings

1. **<Smell>** — `<file>:<line or hunk>`
   - Finding: <one sharp sentence about the design smell>
   - Evidence: <quote or summarize the changed hunk>
   - Smallest fix: <specific refactor>

### Not Reviewed

- Spec correctness
- Repo coding standards
- Formatting/lint issues
- Test coverage

Summary: <N> smell finding(s). Worst smell: <smell + file>, if any.
```

Do not approve merely because behavior seems correct if the changed design now
smells harder to understand, change, or own.
