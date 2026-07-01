# Aretro Smell Remediation

## Summary

Remediated the `aretro` cluster from the code-smell-roaster backlog. The slice extracted shared command-subject truncation, centralized source-ref DTO conversion, added a closed association-confidence type/schema, introduced shared truncatable-output accessors for tool results and command executions, and collapsed duplicated Pi JSONL directory checks.

Validation passed: `pnpm --dir ts --filter @sdl/aretro run check`, `pnpm --dir ts --filter @sdl/aretro run test`, `just ts-format-check`, `just ts-lint`, and `just ts-check`.

## Objective Impact

The `aretro` roadmap row now has fixed dispositions for all 5 recorded findings, reducing the open cluster count by one while preserving existing package behavior and compatibility with current tests/fixtures.

## Follow-Ups

None for this cluster.
