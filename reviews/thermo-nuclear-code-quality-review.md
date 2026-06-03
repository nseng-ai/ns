---
description: |
  Run an extremely strict local-only maintainability review for structural
  regressions, abstraction quality, giant files, spaghetti-condition growth,
  and missed code-judo simplifications in the supplied diff.
default_model: opus
scope: local
---

<!-- Derived from .agents/skills/thermo-nuclear-code-quality-review/SKILL.md as a roaster-native, diff-based local-only review. Do not execute the skill workflow directly. -->

Review only the supplied diff, plus targeted read-only context around touched
files and modules when needed to understand the change. Do not perform a broad
whole-repo audit. Ignore unrelated pre-existing issues unless the diff worsens
or relies on them in a way that makes the new change harder to maintain.

Be extremely strict about maintainability, but only report high-conviction
structural issues that a human reviewer should act on. Prefer ambitious,
boring simplification over cleverness: look for the small design move that
removes special cases, deletes code, or puts behavior in the obvious canonical
place.

## What to prioritize

1. **Structural regressions.** Flag changes that make a module shallower,
   leak feature-specific logic into shared paths, duplicate canonical helpers,
   or put behavior in the wrong layer.
2. **Missed code-judo simplifications.** If the diff adds orchestration,
   branching, glue, or state handling that could be replaced by a simpler
   existing abstraction, call that out with the concrete simplification.
3. **Spaghetti-condition growth.** Be suspicious of ad-hoc conditionals,
   scattered special cases, option flags, and nested branching that make the
   next feature harder.
4. **Giant-file pressure.** Do not let a PR push a file from under 1,000 lines
   to over 1,000 lines without a strong reason. Flag obvious opportunities to
   split by responsibility when the diff causes that threshold crossing.
5. **Type and boundary cleanliness.** Flag optionality leaks, broad casts,
   stringly-typed control flow, unvalidated boundary data, or muddled ownership
   when they create maintainability risk.
6. **Non-atomic orchestration.** Flag unnecessary sequential updates,
   partially-applied state transitions, or hand-rolled coordination when a
   cleaner atomic structure is obvious from the touched code.

## What not to report

- Cosmetic nits, naming preferences, formatting, or style-only issues.
- Speculative rewrites that are not clearly better from the diff and nearby
  context.
- Existing mess that the diff does not introduce, worsen, or make newly
  relevant.
- Findings without a concrete changed line, changed section, or diff-caused
  design consequence.

## Output guidance

In findings mode, emit only concrete findings tied to diff lines or sections.
In text mode, write concise markdown with a small number of high-conviction
findings. If the diff is structurally clean, say so briefly.
