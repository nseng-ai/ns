# Plans Store Slug Remediation

## Summary

The `plans` cluster is now remediated. The package no longer repeats plan-store repository evidence derivation between repo-wide and branch-specific resolution, CLI handlers share one plan-store option builder, and saved-plan slug word-count policy is centralized in exported constants used by both prompt/repair and validation paths.

Validation passed: `pnpm --dir ts --filter @sdl/plans run check`, `pnpm --dir ts --filter @sdl/plans run test`, `just ts-format-check`, `just ts-lint`, and `just ts-check`.

## Objective Impact

This reduces the open backlog by the 3 findings in `references/plans.md`, all recorded as fixed in `roadmap.md`. The changes preserve existing CLI/API behavior, including the detached-HEAD saved-plan error ordering covered by the package tests.

## Follow-Ups

None.
