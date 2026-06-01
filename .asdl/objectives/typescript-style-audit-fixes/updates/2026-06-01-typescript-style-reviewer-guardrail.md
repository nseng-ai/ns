# TypeScript Style Reviewer Guardrail Added

## Summary

The current branch adds `reviews/typescript-style.md`, a markdown-defined Roaster reviewer for active Tier A TypeScript style checks. The reviewer uses `default_model: haiku`, reviews only supplied diffs, limits findings to TypeScript-family files unless a TypeScript rule is clearly relevant elsewhere, and reports structured findings without proposing fixes.

Evidence came from the branch diff against Graphite parent `update-typescript-style-zod-boundary-schemas` and PR #788, covering the new review definition and the real reviewer parse test in `packages/roaster/tests/unit/test_review_definition.py`. Validation passed with `uv run pytest packages/roaster/tests/unit/test_review_definition.py`, `just dprint-check`, and full `just check`.

## Objective Impact

The roadmap item for lightweight TypeScript style guardrails is complete. The guardrail is intentionally low-context and diff-visible: it catches active Tier A rules such as non-erasable TypeScript, ordinary explicit `any`, broad and double casts, top-level arrow module logic, direct parameter mutation, naming hygiene, suppression hygiene, empty catches, and mega-barrels.

This de-risks future regressions without choosing a brittle compiler or lint gate for the whole guide. The reviewer deliberately does not flag package-manager, formatter, linter, test-runner, or import-suffix choices because the current `typescript-style` guide is toolchain-neutral there.

## Follow-Ups

- Continue with the next semantic remediation row: convert existing object-shape and contract aliases to interfaces while preserving unions and function aliases as `type`.
- Treat `erasableSyntaxOnly` or another compiler/lint guard as an optional supplement only if the Roaster reviewer proves insufficient.
