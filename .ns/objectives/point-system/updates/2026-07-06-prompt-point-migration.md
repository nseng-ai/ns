# Prompt Point Migration

## Summary

Local branch `point-system-prompt-points-FRHJRE` commit `efa6745a2` migrated the two named prompt readers onto point definitions and the kernel point catalog. The flow and branch-context extension manifests now declare override prompt points for `flow.submit.pr-description` and `branch-context.plans-write`, with manifest default markdown files. The branch-context repo prompt file was renamed from `.ns/prompts/plans-write.md` to `.ns/prompts/branch-context.plans-write.md`, and both readers resolve prompt content through the kernel point catalog.

The existing `NS_DEV_PR_DESCRIPTION_PROMPT` override behavior was preserved, but it was not generalized or reported by the catalog in this slice.

## Objective Impact

This materially advances the prompt-points roadmap row: the point definitions, manifest defaults, id-based branch-context prompt filename, and reader cutovers are landed. The row remains in progress until the PR-description dev env override is generalized/reported through the catalog as specified by the roadmap.

Validation evidence from the runner step: prompt-related kernel, Flow, and branch-context Vitest suites passed; `just ts-check`, `just ts-format-check`, `just ts-lint`, `just dprint-check`, and `git diff --check` passed. Full `just` still reaches the known unrelated `@nseng-ai/objectives` topology-circle style-guard failure recorded in earlier updates.

## Follow-Ups

- Generalize/report prompt dev env overrides in the point catalog, including the PR-description override currently named `NS_DEV_PR_DESCRIPTION_PROMPT`.
- Then mark the prompt-points roadmap row complete if no further prompt-reader compatibility ladders remain.
