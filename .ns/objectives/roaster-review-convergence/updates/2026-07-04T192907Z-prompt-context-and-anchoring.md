# Prompt Context and Anchoring Guard

## Summary

The prompt-layer convergence slice landed on local branch `roaster-review-convergence/prompt-context`.

Roaster now has an optional Prior-findings prompt context contract threaded through review runner prompt assembly without adding GitHub reads to the default core review path. When context is supplied, the prompt includes Last-reviewed head/base merge-base data, range-diff/Graphite restack guidance, prior finding records with resolution status, instructions not to re-raise prior findings absent material worsening, and an anchoring guard for genuinely new nearby issues. Without context, prompt assembly preserves the prior no-context behavior.

Prompt v1 treats unresolved prior findings as already-known feedback and resolved prior findings as addressed for unchanged code; neither is repeated unless the same underlying issue materially worsened.

## Objective Impact

Two prompt roadmap rows are complete in the landed-state model: optional Prior-findings context and changed-since-Last-reviewed-head guidance are threaded into the prompt path, and convergence instructions with the anchoring guard are unit-tested.

The Objective remains open. CI still needs to gather/supply PR context to review jobs, and empirical validation still needs representative real PRs with human-steered GitHub writes/LLM runs.

## Follow-Ups

- Wire PR context gathering into the CI matrix review jobs using existing `PR_NUMBER`, `GH_TOKEN`, and `pull-requests: write` permissions only.
- Preserve `ns roaster review run`'s PR-free default unless a human decides the remaining local default-fetch question.
- Run the human-steered empirical validation slice after CI wiring lands.
