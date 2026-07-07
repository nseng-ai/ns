# Prompt Env Override Catalog Reporting

## Summary

Local branch `point-system-prompt-env-catalog-zAmaUa` commit `3826a285f` completed the remaining prompt-point migration requirement by adding catalog-level prompt env override support. The existing `NS_DEV_PR_DESCRIPTION_PROMPT` behavior for `flow.submit.pr-description` now flows through the kernel point catalog as env prompt source information and emits a catalog diagnostic when active.

The slice preserved the existing env var name and behavior rather than inventing a renamed product surface.

## Objective Impact

This completes the prompt-points roadmap row: both named prompt points are declared and resolved through the point catalog, their file/default migrations are cut over, and the PR-description dev env override is now catalog-visible.

Validation evidence from the runner step: prompt env override unit coverage passed for kernel and Flow; `just dprint-check`, `just ts-format-check`, `just ts-lint`, `just ts-check`, targeted Vitest suites, and `git diff --check` passed. Full `just` still reaches the known unrelated `@nseng-ai/objectives` topology-circle style-guard failure recorded in earlier updates.

## Follow-Ups

- Continue with declared settings migration for roaster, areg, and ns-init.
