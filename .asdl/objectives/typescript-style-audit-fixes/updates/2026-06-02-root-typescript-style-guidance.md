# Root TypeScript Style Guidance Added

## Summary

The current branch adds repo-root agent guidance so TypeScript implementation, review, and refactoring work is systematically routed through the `typescript-style` skill.

- `AGENTS.md` now has a `TypeScript Style` section requiring agents to load `.agents/skills/typescript-style/SKILL.md`, read `core-rules.md` before implementation, use `idioms.md` and `checklist.md`, and load relevant `references/` documents before designing covered TypeScript abstractions.
- `CLAUDE.md` mirrors concise TypeScript guidance for Claude-oriented agent contexts.

Evidence came from local committed branch diff against Graphite parent `master` on `require-typescript-style-skill-root-instructions`, plus PR #817, covering `AGENTS.md` and `CLAUDE.md`.

## Objective Impact

This strengthens the already completed roadmap row "Add lightweight TypeScript style guardrails and contributor guidance for `typescript-style` compliance." The Roaster reviewer added earlier covers active diff-visible Tier A checks; the root guidance reduces the risk that future agents skip the skill before TypeScript work.

This does not change TypeScript product behavior and does not advance the remaining semantic remediation rows for expected failure APIs, dependency-injection/adapter ownership, or final exception capture.

## Follow-Ups

- Continue with the remaining TypeScript style audit rows: expected failure APIs, dependency-injection/adapter ownership, and final exception capture.
- Treat `erasableSyntaxOnly` or another compiler/lint guard as an optional supplement only if the Roaster reviewer plus root agent guidance prove insufficient.
